import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGatekeeper, parseRobots, resetBlockedHosts, robotsAllows } from '../src/tinyfish/gatekeeper.js';
import { TinyFishError } from '../src/tinyfish/client.js';

beforeEach(() => resetBlockedHosts());

/** A fake clock and sleep, so backoff and TTL are tested without waiting. */
function clock(start = 1_000_000) {
  let t = start;
  const slept = [];
  return {
    now: () => t,
    advance: (ms) => (t += ms),
    sleep: async (ms) => {
      slept.push(ms);
      t += ms;
    },
    slept,
  };
}

/** A mocked TinyFish client: pages by URL; robots.txt allows everything unless given. */
function mockClient({ pages = {}, robots = {}, failures = [] } = {}) {
  const calls = [];
  return {
    calls,
    async search(params) {
      calls.push(['search', params.query]);
      const f = failures.shift();
      if (f) throw new TinyFishError(f);
      return { results: [{ url: 'https://a.example/x', title: 'x', snippet: 'y' }] };
    },
    async fetchPages({ urls }) {
      calls.push(['fetch', ...urls]);
      const f = failures.shift();
      if (f) throw new TinyFishError(f);
      const results = [];
      const errors = [];
      for (const url of urls) {
        if (url.endsWith('/robots.txt')) {
          const host = new URL(url).host;
          if (robots[host]) results.push({ url, text: robots[host] });
          else errors.push({ url, error: 'not_found', status: 404 });
          continue;
        }
        const p = pages[url];
        if (p?.error) errors.push({ url, ...p });
        else if (p) results.push({ url, final_url: url, title: 't', text: p });
        else errors.push({ url, error: 'proxy_error' });
      }
      return { results, errors };
    },
  };
}

function gatekeeper(client, extra = {}) {
  const c = clock();
  const events = [];
  const gk = createGatekeeper({ client, cacheDir: mkdtempSync(join(tmpdir(), 'gk-')), sleep: c.sleep, now: c.now, random: () => 0.5, ...extra });
  gk.attach((kind, payload) => events.push({ kind, ...payload }));
  return { gk, c, events };
}

const URL_A = 'https://a.example/page';

test('cache: a miss fetches and stores; a hit within the TTL is reported; after the TTL it fetches again', async () => {
  const client = mockClient({ pages: { [URL_A]: 'Deadline Date: 31-Oct-2026' } });
  const { gk, c, events } = gatekeeper(client, { ttlMs: 60_000 });

  const first = await gk.fetchPages({ urls: [URL_A] });
  assert.equal(first.results[0].cached, false);
  c.advance(30_000);
  const second = await gk.fetchPages({ urls: [URL_A] });
  assert.equal(second.results[0].cached, true);
  assert.equal(second.results[0].text, 'Deadline Date: 31-Oct-2026');
  assert.equal(second.results[0].fetchedAt, first.results[0].fetchedAt, 'last checked stays the real fetch time');
  c.advance(31_000);
  const third = await gk.fetchPages({ urls: [URL_A] });
  assert.equal(third.results[0].cached, false);

  assert.deepEqual(events.filter((e) => e.kind.startsWith('cache.')).map((e) => e.kind), ['cache.miss', 'cache.hit', 'cache.miss']);
  assert.equal(client.calls.filter((x) => x[0] === 'fetch' && x[1] === URL_A).length, 2);
  assert.equal(gk.stats().cacheHits, 1);
});

test('backoff: transient failures are retried with exponential delay plus jitter; a bad key is not retried', async () => {
  const client = mockClient({
    pages: { [URL_A]: 'ok' },
    failures: [{ code: 'HTTP_503', message: 'busy', status: 503 }, { code: 'HTTP_429', message: 'slow down', status: 429 }],
  });
  const { gk, c, events } = gatekeeper(client, { baseDelayMs: 1000, robots: false });
  const out = await gk.fetchPages({ urls: [URL_A] });
  assert.equal(out.results[0].text, 'ok');
  assert.deepEqual(c.slept.filter((ms) => ms >= 1000), [1500, 2500]); // 1000*2^0 + 500, 1000*2^1 + 500
  assert.deepEqual(events.filter((e) => e.kind === 'rate.limited').map((e) => e.attempt), [1, 2]);

  const bad = mockClient({ failures: [{ code: 'HTTP_401', message: 'unauthorized', status: 401 }] });
  const g2 = gatekeeper(bad, { robots: false });
  await assert.rejects(g2.gk.search({ query: 'q' }), /unauthorized/);
  assert.equal(bad.calls.length, 1, 'no retry on 401');
});

test('blocks: 403 / bot_blocked or captcha text stops that host for the run, with an honest event', async () => {
  const blocked = 'https://b.example/list';
  const other = 'https://b.example/other';
  const cap = 'https://c.example/page';
  const client = mockClient({
    pages: {
      [blocked]: { error: 'bot_blocked', status: 403 },
      [other]: 'would be fine',
      [cap]: 'Please complete the CAPTCHA to continue',
    },
  });
  const { gk, events } = gatekeeper(client, { robots: false });
  const r1 = await gk.fetchPages({ urls: [blocked, cap] });
  assert.equal(r1.results.length, 0);
  assert.ok(r1.errors.every((e) => e.blocked));
  const r2 = await gk.fetchPages({ urls: [other] });
  assert.equal(r2.errors[0].error, 'blocked_host');
  assert.ok(!client.calls.some((x) => x.includes(other)), 'never retried around the block');
  const hosts = events.filter((e) => e.kind === 'blocked').map((e) => e.host);
  assert.deepEqual([...new Set(hosts)].sort(), ['b.example', 'c.example']);
});

test('robots.txt: a disallowed path is not fetched; allowed paths are', async () => {
  const rules = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: BadBot\nDisallow: /');
  assert.equal(robotsAllows(rules, '/private/x'), false);
  assert.equal(robotsAllows(rules, '/private/ok/1'), true);
  assert.equal(robotsAllows(rules, '/public'), true);

  const client = mockClient({ robots: { 'd.example': 'User-agent: *\nDisallow: /private' }, pages: { 'https://d.example/public': 'hi' } });
  const { gk, events } = gatekeeper(client);
  const out = await gk.fetchPages({ urls: ['https://d.example/private/a', 'https://d.example/public'] });
  assert.equal(out.results.length, 1);
  assert.equal(out.errors[0].error, 'robots_disallow');
  assert.ok(events.some((e) => e.kind === 'blocked' && /robots\.txt/.test(e.reason)));
  assert.ok(!client.calls.some((x) => x.includes('https://d.example/private/a')));
});

test('at most 2 TinyFish calls run at once', async () => {
  let inFlight = 0;
  let peak = 0;
  const client = {
    async search() {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      return { results: [] };
    },
    async fetchPages() {
      return { results: [], errors: [] };
    },
  };
  const gk = createGatekeeper({ client, cacheDir: null, robots: false, hostIntervalMs: 0 });
  await Promise.all([1, 2, 3, 4, 5].map((i) => gk.search({ query: `q${i}` })));
  assert.equal(peak, 2);
});

test('fallback: a failed live fetch uses the older cached copy, marked stale, with a fallback event', async () => {
  const flaky = mockClient({ pages: { [URL_A]: 'old text' } });
  const { gk, c, events } = gatekeeper(flaky, { ttlMs: 1000, robots: false });
  await gk.fetchPages({ urls: [URL_A] });
  c.advance(5000); // the cached copy is now past its TTL
  flaky.fetchPages = async ({ urls }) => ({ results: [], errors: urls.map((url) => ({ url, error: 'proxy_error' })) });
  const res = await gk.fetchPages({ urls: [URL_A] });
  assert.equal(res.results[0].stale, true);
  assert.equal(res.results[0].cached, true);
  assert.equal(res.results[0].text, 'old text');
  assert.ok(events.some((e) => e.kind === 'fallback' && /proxy_error/.test(e.reason)));
});

test("backoff: TinyFish's Retry-After is honoured (never retried sooner), capped at 30 s", async () => {
  const client = mockClient({ pages: { [URL_A]: 'ok' }, failures: [{ code: 'HTTP_429', message: 'slow down', status: 429 }] });
  // TinyFishError keeps known fields only; the client sets retryAfter from the header
  const orig = client.fetchPages;
  let first = true;
  client.fetchPages = async (args) => {
    try {
      return await orig(args);
    } catch (err) {
      if (first) err.retryAfter = '7';
      first = false;
      throw err;
    }
  };
  const { gk, c, events } = gatekeeper(client, { baseDelayMs: 1000, robots: false });
  await gk.fetchPages({ urls: [URL_A] });
  assert.ok(c.slept.includes(7000), `slept ${c.slept}`);
  assert.equal(events.find((e) => e.kind === 'rate.limited').retryInMs, 7000);
});
