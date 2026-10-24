// The Watchtower ("night guard"): on "Re-check now", re-fetches the sources of the
// items already in a plan (through the Gatekeeper, cache bypassed), re-reads each item's
// date with the same parser that found it, and reports only real differences.
// Raw page text is not compared: listings change counters and banners all the time,
// which is not a change for the student. No schedules, no webhooks, no background jobs.

import { normalize } from '../verify/verifier.js';
import { parseAllScholarships } from '../parse/nsp.js';
import { parseBuddy4Study } from '../parse/buddy4study.js';
import { parseDevpost, parseHackerEarth } from '../parse/opps.js';

/** Hosts the Watchtower may re-fetch (it is not an open proxy for arbitrary URLs). */
export const KNOWN_HOSTS = new Set([
  'scholarships.gov.in',
  'mahadbt.maharashtra.gov.in',
  'www.buddy4study.com',
  'devpost.com',
  'www.hackerearth.com',
]);

export function isKnownSource(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && KNOWN_HOSTS.has(u.host);
  } catch {
    return false;
  }
}

const sameName = (a, b) => normalize(a) === normalize(b);

/**
 * Re-reads the item's date from fresh page text with its source's parser.
 * @returns {{ found: boolean, deadline: string|null }} found=false: the item is no longer listed
 */
export function readItem(item, text, today) {
  switch (item.source) {
    case 'nsp': {
      const s = parseAllScholarships(text).find((x) => sameName(x.name, item.title));
      return s ? { found: true, deadline: s.applyTill } : { found: false, deadline: null };
    }
    case 'buddy4study': {
      const p = parseBuddy4Study(text, today);
      const found = normalize(text).includes(normalize(item.title)) || (p.title && sameName(p.title, item.title));
      return { found: !!found, deadline: p.deadline };
    }
    case 'devpost':
    case 'hackerearth': {
      const list = item.source === 'devpost' ? parseDevpost(text) : parseHackerEarth(text);
      const e = list.find((x) => sameName(x.title, item.title));
      return e ? { found: true, deadline: e.end } : { found: false, deadline: null };
    }
    default: {
      // pages that publish no deadline (MahaDBT scheme pages): only the name is checked
      return { found: normalize(text).includes(normalize(item.title)), deadline: null };
    }
  }
}

/**
 * @returns {{ status: 'no-change'|'changed', reason: string, from?: string|null, to?: string|null }}
 */
export function diffItem(item, text, today) {
  const now = readItem(item, text, today);
  if (!now.found) return { status: 'changed', reason: 'No longer listed on the source page.', from: item.deadline, to: null };
  if ((now.deadline ?? null) !== (item.deadline ?? null)) {
    return {
      status: 'changed',
      reason: `Deadline changed from ${item.deadline ?? 'not published'} to ${now.deadline ?? 'not published'}.`,
      from: item.deadline ?? null,
      to: now.deadline ?? null,
    };
  }
  return { status: 'no-change', reason: item.deadline ? `Still ${item.deadline}.` : 'Still listed; still no published deadline.' };
}

/**
 * @param {Array<{opportunityId, title, deadline, source, sourceUrl}>} items
 * @param {{ fetchPages: Function }} gatekeeper
 */
export async function recheck(items, gatekeeper, { today, now = () => new Date().toISOString() }) {
  const usable = items.filter((i) => isKnownSource(i.sourceUrl));
  const urls = [...new Set(usable.map((i) => i.sourceUrl))];
  const pages = new Map();
  const failed = new Map();
  for (let i = 0; i < urls.length; i += 10) {
    const batch = urls.slice(i, i + 10);
    try {
      const { results, errors } = await gatekeeper.fetchPages({ urls: batch, format: 'markdown', per_url_timeout_ms: 45_000, ttl: 0 });
      for (const r of results) if (!r.stale) pages.set(r.url, r);
      for (const r of results) if (r.stale) failed.set(r.url, 'only an older cached copy was available');
      for (const e of errors) failed.set(e.url, `${e.error}${e.status ? ` (${e.status})` : ''}`);
    } catch (err) {
      for (const u of batch) failed.set(u, `${err.code ?? 'error'}: ${err.message}`);
    }
  }
  const results = items.map((item) => {
    const base = { opportunityId: item.opportunityId, title: item.title, sourceUrl: item.sourceUrl };
    if (!isKnownSource(item.sourceUrl)) return { ...base, status: 'unchecked', reason: 'Not a known source host; not fetched.' };
    const page = pages.get(item.sourceUrl);
    if (!page?.text) return { ...base, status: 'unchecked', reason: `Could not re-fetch: ${failed.get(item.sourceUrl) ?? 'no text'}.` };
    return { ...base, ...diffItem(item, page.text, today), checkedAt: page.fetchedAt ?? now() };
  });
  const summary = {
    checkedAt: now(),
    sources: urls.length,
    changed: results.filter((r) => r.status === 'changed').length,
    noChange: results.filter((r) => r.status === 'no-change').length,
    unchecked: results.filter((r) => r.status === 'unchecked').length,
  };
  return { summary, results };
}
