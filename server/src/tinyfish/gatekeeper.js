// The Gatekeeper ("traffic warden"): the ONLY way agents reach the web. It wraps the
// TinyFish client (which alone holds the key) and adds:
//   - a URL-keyed disk cache with fetchedAt and a TTL (hits are reported, never hidden)
//   - at most 2 TinyFish calls at once, and a minimum interval per target host
//   - polite exponential backoff with jitter for transient failures (TinyFish 429/503,
//     network, timeouts), at most `maxRetries` times
//   - robots.txt respect (read through TinyFish Fetch, cached for a day)
//   - block handling: a target that answers 403/429, "bot_blocked" or captcha text is
//     marked blocked for this host; we stop there and never retry around it
//   - a stale-cache fallback when a live fetch fails, clearly marked as a fallback
// Every decision is an event: cache.hit, cache.miss, rate.limited, blocked, fallback.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_TTL_MS = 30 * 60 * 1000;
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
const BLOCK_PATTERN = /bot_blocked|captcha|forbidden|access denied|blocked/i;
const CAPTCHA_TEXT = /captcha|are you a robot|verify (that )?you are (a )?human|request blocked|cf-chl/i;

// hosts that blocked us stay blocked for this long, across runs in the same server process
const BLOCK_MS = 30 * 60 * 1000;
const blockedHosts = new Map(); // host -> { until, reason }

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};
const key = (s) => createHash('sha1').update(s).digest('hex');

// ---------- robots.txt ----------

/** Rules for "User-agent: *" (and lookoutbot) as [{ allow: bool, path }]. */
export function parseRobots(text) {
  const rules = [];
  let applies = false;
  let lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      const ua = value.toLowerCase();
      applies = (lastWasAgent && applies) || ua === '*' || ua === 'lookoutbot';
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (applies && value) rules.push({ allow: field === 'allow', path: value });
  }
  return rules;
}

function ruleMatches(pattern, path) {
  const re = new RegExp(`^${pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
  return re.test(path);
}

/** Longest matching rule wins; Allow wins a tie; no rule means allowed. */
export function robotsAllows(rules, path) {
  let best = null;
  for (const r of rules) {
    if (!ruleMatches(r.path, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

// ---------- the gatekeeper ----------

/**
 * @param {{ client: {search: Function, fetchPages: Function}, cacheDir?: string|null, ttlMs?: number,
 *   maxConcurrent?: number, hostIntervalMs?: number, maxRetries?: number, baseDelayMs?: number,
 *   robots?: boolean, now?: () => number, sleep?: (ms: number) => Promise<void>, random?: () => number }} opts
 */
export function createGatekeeper(opts) {
  const {
    client,
    cacheDir = null,
    ttlMs = DEFAULT_TTL_MS,
    maxConcurrent = 2,
    hostIntervalMs = 1500,
    maxRetries = 2,
    baseDelayMs = 1000,
    robots = true,
    now = () => Date.now(),
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    random = Math.random,
  } = opts;

  const stats = { calls: 0, ok: 0, failed: 0, cacheHits: 0, cacheMisses: 0, rateLimited: 0, blocked: 0, fallbacks: 0 };
  const robotsRules = new Map(); // host -> rules | null (unavailable)
  const lastAt = new Map();

  // events before attach() (the preflight Search) are held, then flushed in order
  let emitFn = null;
  const pending = [];
  const emit = (kind, payload) => (emitFn ? emitFn(kind, payload) : pending.push([kind, payload]));

  // --- disk cache ---
  if (cacheDir) mkdirSync(cacheDir, { recursive: true });
  const cacheRead = (k) => {
    if (!cacheDir) return null;
    try {
      return JSON.parse(readFileSync(join(cacheDir, `${key(k)}.json`), 'utf8'));
    } catch {
      return null;
    }
  };
  const cacheWrite = (k, value) => {
    if (!cacheDir) return;
    try {
      writeFileSync(join(cacheDir, `${key(k)}.json`), JSON.stringify({ key: k, fetchedAt: now(), value }));
    } catch {
      /* a full disk must not break a run */
    }
  };
  const fresh = (entry, ttl) => entry && now() - entry.fetchedAt < ttl;

  // --- concurrency: at most maxConcurrent TinyFish calls at once ---
  let active = 0;
  const waiting = [];
  async function slot(fn) {
    if (active >= maxConcurrent) await new Promise((r) => waiting.push(r));
    else active++;
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }

  async function politeHosts(hosts) {
    let wait = 0;
    for (const h of hosts) wait = Math.max(wait, (lastAt.get(h) ?? -Infinity) + hostIntervalMs - now());
    if (wait > 0) await sleep(wait);
    for (const h of hosts) lastAt.set(h, now());
  }

  const transient = (err) => err?.status === 429 || err?.status === 503 || ['NETWORK', 'TIMEOUT'].includes(err?.code);

  /** One TinyFish call with the concurrency slot, host spacing and backoff. */
  async function call(label, hosts, fn) {
    return slot(async () => {
      for (let attempt = 0; ; attempt++) {
        await politeHosts(hosts);
        stats.calls++;
        try {
          const out = await fn();
          stats.ok++;
          return out;
        } catch (err) {
          stats.failed++;
          if (!transient(err) || attempt >= maxRetries) throw err;
          // exponential backoff with jitter, but never sooner than TinyFish's own Retry-After (capped at 30 s)
          const retryAfterMs = Math.min(30_000, (Number(err.retryAfter) || 0) * 1000);
          const delay = Math.max(retryAfterMs, Math.round(baseDelayMs * 2 ** attempt + random() * baseDelayMs));
          if (err.status === 429) stats.rateLimited++;
          emit('rate.limited', { call: label, attempt: attempt + 1, retryInMs: delay, reason: `${err.code}${err.status ? ` (${err.status})` : ''}` });
          await sleep(delay);
        }
      }
    });
  }

  function isBlocked(host) {
    const b = blockedHosts.get(host);
    if (b && b.until > now()) return b;
    if (b) blockedHosts.delete(host);
    return null;
  }
  function block(host, url, reason) {
    const already = isBlocked(host);
    blockedHosts.set(host, { until: now() + BLOCK_MS, reason });
    stats.blocked++;
    emit('blocked', { host, url, reason, stoppedForHost: true, ...(already && { alreadyBlocked: true }) });
  }

  async function ensureRobots(hosts) {
    if (!robots) return;
    const missing = [];
    for (const h of hosts) {
      if (robotsRules.has(h)) continue;
      const cached = cacheRead(`robots:${h}`);
      if (fresh(cached, ROBOTS_TTL_MS)) robotsRules.set(h, cached.value);
      else missing.push(h);
    }
    if (!missing.length) return;
    try {
      const urls = missing.map((h) => `https://${h}/robots.txt`);
      const { results } = await call('robots.txt', missing, () => client.fetchPages({ urls, format: 'markdown', per_url_timeout_ms: 20_000 }));
      for (const h of missing) {
        const r = results.find((x) => hostOf(x.url) === h);
        // a missing or unreadable robots.txt means no rules (the usual convention)
        const rules = r?.text && /user-agent/i.test(r.text) ? parseRobots(r.text) : null;
        robotsRules.set(h, rules);
        cacheWrite(`robots:${h}`, rules);
      }
    } catch {
      for (const h of missing) robotsRules.set(h, null);
    }
  }

  function robotsBlocks(url) {
    const h = hostOf(url);
    const rules = robotsRules.get(h);
    if (!rules) return false;
    const u = new URL(url);
    return !robotsAllows(rules, u.pathname + u.search);
  }

  return {
    stats: () => ({ ...stats, cacheHitRate: stats.cacheHits + stats.cacheMisses ? stats.cacheHits / (stats.cacheHits + stats.cacheMisses) : 0 }),

    /** Start delivering events (emit(kind, payload)); flushes anything held so far. */
    attach(fn) {
      emitFn = fn;
      for (const [k, p] of pending.splice(0)) fn(k, p);
    },

    /** TinyFish Search through the cache, the slot limit and backoff. */
    async search(params, { ttl = ttlMs } = {}) {
      const k = `search:${JSON.stringify(params)}`;
      const label = `search ${params.include_domains ?? ''}`.trim();
      const hit = cacheRead(k);
      if (fresh(hit, ttl)) {
        stats.cacheHits++;
        emit('cache.hit', { call: label, query: params.query, ageMs: now() - hit.fetchedAt, fetchedAt: new Date(hit.fetchedAt).toISOString() });
        return { ...hit.value, cached: true, fetchedAt: new Date(hit.fetchedAt).toISOString() };
      }
      stats.cacheMisses++;
      emit('cache.miss', { call: label, query: params.query });
      try {
        const value = await call(label, params.include_domains ? [params.include_domains] : [], () => client.search(params));
        cacheWrite(k, value);
        return { ...value, cached: false, fetchedAt: new Date(now()).toISOString() };
      } catch (err) {
        if (hit && transient(err)) {
          stats.fallbacks++;
          emit('fallback', { call: label, reason: `${err.code}: ${err.message}`, usingCacheFrom: new Date(hit.fetchedAt).toISOString() });
          return { ...hit.value, cached: true, stale: true, fetchedAt: new Date(hit.fetchedAt).toISOString() };
        }
        throw err;
      }
    },

    /**
     * TinyFish Fetch through robots.txt, block list, cache, slot limit and backoff.
     * Returns { results: [{ url, text, title, fetchedAt, cached, stale? }], errors: [{ url, error, status?, blocked? }] }.
     */
    async fetchPages({ urls, ttl = ttlMs, ...options }) {
      const results = [];
      const errors = [];
      const hosts = [...new Set(urls.map(hostOf).filter(Boolean))];
      await ensureRobots(hosts.filter((h) => !isBlocked(h)));

      const misses = [];
      for (const url of urls) {
        const h = hostOf(url);
        const b = isBlocked(h);
        if (b) {
          errors.push({ url, error: 'blocked_host', blocked: true, reason: b.reason });
          emit('blocked', { host: h, url, reason: `skipped: ${b.reason}`, stoppedForHost: true, alreadyBlocked: true });
          continue;
        }
        if (robotsBlocks(url)) {
          stats.blocked++;
          errors.push({ url, error: 'robots_disallow', blocked: true });
          emit('blocked', { host: h, url, reason: 'robots.txt disallows this path; not fetched' });
          continue;
        }
        const hit = cacheRead(`fetch:${url}:${JSON.stringify(options)}`);
        if (fresh(hit, ttl)) {
          stats.cacheHits++;
          emit('cache.hit', { url, ageMs: now() - hit.fetchedAt, fetchedAt: new Date(hit.fetchedAt).toISOString() });
          results.push({ ...hit.value, cached: true, fetchedAt: new Date(hit.fetchedAt).toISOString() });
        } else {
          stats.cacheMisses++;
          emit('cache.miss', { url });
          misses.push({ url, stale: hit });
        }
      }
      if (!misses.length) return { results, errors };

      const staleOr = (m, err) => {
        if (m.stale) {
          stats.fallbacks++;
          emit('fallback', { url: m.url, reason: err, usingCacheFrom: new Date(m.stale.fetchedAt).toISOString() });
          results.push({ ...m.stale.value, cached: true, stale: true, fetchedAt: new Date(m.stale.fetchedAt).toISOString() });
        } else {
          errors.push({ url: m.url, error: err });
        }
      };

      let out;
      try {
        const missHosts = [...new Set(misses.map((m) => hostOf(m.url)))];
        out = await call(`fetch ${missHosts.join(', ')}`, missHosts, () => client.fetchPages({ urls: misses.map((m) => m.url), ...options }));
      } catch (err) {
        if (!transient(err)) throw err; // a bad key etc.: the caller decides
        for (const m of misses) staleOr(m, `${err.code}: ${err.message}`);
        return { results, errors };
      }
      const fetchedAt = new Date(now()).toISOString();
      for (const m of misses) {
        const r = out.results?.find((x) => x.url === m.url);
        const e = out.errors?.find((x) => x.url === m.url);
        const h = hostOf(m.url);
        if (r?.text && !(r.text.length < 6000 && CAPTCHA_TEXT.test(r.text))) {
          const value = { url: r.url, final_url: r.final_url, title: r.title ?? null, text: r.text };
          cacheWrite(`fetch:${m.url}:${JSON.stringify(options)}`, value);
          results.push({ ...value, cached: false, fetchedAt });
        } else if (r?.text || e?.status === 403 || e?.status === 429 || BLOCK_PATTERN.test(e?.error ?? '')) {
          const reason = r?.text ? 'the page answered with a captcha or bot check' : `${e.error}${e.status ? ` (${e.status})` : ''}`;
          block(h, m.url, reason);
          errors.push({ url: m.url, error: r?.text ? 'captcha' : e.error, status: e?.status, blocked: true });
        } else {
          staleOr(m, e ? `${e.error}${e.status ? ` (${e.status})` : ''}` : 'empty page');
        }
      }
      return { results, errors };
    },
  };
}

/** For tests: forget hosts blocked by earlier gatekeepers in this process. */
export function resetBlockedHosts() {
  blockedHosts.clear();
}
