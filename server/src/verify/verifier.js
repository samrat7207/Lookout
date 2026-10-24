// The Verifier ("inspector"): after ranking, re-fetches each plan item's source page
// through the Gatekeeper (cache bypassed: a real re-check) and confirms that the scheme
// name and the stated deadline still appear in the text.
//   verified         name and date both found (date near the name on list pages)
//   changed          the page loaded, but the name or the date is no longer there
//   could not verify the page did not load (failed or blocked)
// Nothing is dropped: every item keeps its row and gets a visible badge.

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Lowercase letters and digits only, single spaces: "31-Oct-2026" -> "31 oct 2026". */
export function normalize(text) {
  return String(text).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The ways a page may write an ISO date, normalised. */
export function dateForms(iso) {
  const [y, m, d] = iso.split('-');
  const dn = String(Number(d));
  const mn = String(Number(m));
  const month = MONTHS[Number(m) - 1];
  const mon = month.slice(0, 3);
  const suffix = /1[123]$/.test(dn) ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[dn.at(-1)] ?? 'th';
  const forms = new Set();
  for (const dd of [d, dn]) {
    for (const mm of [m, mn]) forms.add(`${dd} ${mm} ${y}`);
    for (const name of [month, mon]) {
      forms.add(`${dd} ${name} ${y}`);
      forms.add(`${name} ${dd} ${y}`);
      forms.add(`${dd}${suffix} ${name} ${y}`);
    }
  }
  forms.add(`${y} ${m} ${d}`);
  return [...forms].map(normalize);
}

const LIST_WINDOW = 900; // on list pages the date must follow the name within this many characters

/**
 * @param {{ title: string, deadline: string|null, source?: string }} item
 * @param {string} pageText
 * @returns {{ status: 'verified'|'changed', reason: string }}
 */
export function checkItem(item, pageText) {
  const page = normalize(pageText);
  const name = normalize(item.title);
  let at = page.indexOf(name);
  if (at < 0) {
    // allow small wording differences: 85% of the name's words, in order of appearance
    const words = name.split(' ').filter((w) => w.length > 2);
    const found = words.filter((w) => page.includes(w));
    if (!words.length || found.length / words.length < 0.85) {
      return { status: 'changed', reason: 'The scheme name no longer appears on the source page.' };
    }
    at = page.indexOf(words[0]);
  }
  if (!item.deadline) return { status: 'verified', reason: 'Name found on the page; no deadline was published to check.' };
  const scope = item.source === 'nsp' ? page.slice(at, at + name.length + LIST_WINDOW) : page;
  const hit = dateForms(item.deadline).find((f) => scope.includes(f));
  if (!hit) return { status: 'changed', reason: `Name found, but the deadline ${item.deadline} is no longer on the page${item.source === 'nsp' ? ' next to it' : ''}.` };
  return { status: 'verified', reason: `Name and deadline (${item.deadline}) found on the page.` };
}

/**
 * Re-fetches every distinct source URL (cache bypassed) and checks each item.
 * @param {Array<{opportunityId: string, title: string, deadline: string|null, source: string, sourceUrl: string}>} items
 * @param {{ fetchPages: Function }} gatekeeper
 * @returns {Promise<Map<string, {status: string, reason: string, checkedAt: string|null, sourceUrl: string}>>}
 */
export async function verifyItems(items, gatekeeper, { onResult = () => {}, now = () => new Date().toISOString() } = {}) {
  const urls = [...new Set(items.map((i) => i.sourceUrl).filter(Boolean))];
  const pages = new Map();
  const failures = new Map();
  for (let i = 0; i < urls.length; i += 10) {
    const batch = urls.slice(i, i + 10);
    try {
      const { results, errors } = await gatekeeper.fetchPages({ urls: batch, format: 'markdown', per_url_timeout_ms: 45_000, ttl: 0 });
      for (const r of results) pages.set(r.url, r);
      for (const e of errors) failures.set(e.url, `${e.error}${e.status ? ` (${e.status})` : ''}${e.blocked ? ', host blocked' : ''}`);
    } catch (err) {
      for (const u of batch) failures.set(u, `${err.code ?? 'error'}: ${err.message}`);
    }
  }
  const out = new Map();
  for (const item of items) {
    const page = pages.get(item.sourceUrl);
    let result;
    if (!page?.text) {
      result = { status: 'unverified', reason: `Could not re-fetch the source page: ${failures.get(item.sourceUrl) ?? 'no text'}.`, checkedAt: now() };
    } else {
      result = { ...checkItem(item, page.text), checkedAt: page.fetchedAt ?? now() };
      if (page.stale) result = { status: 'unverified', reason: `Only an older cached copy was available (${page.fetchedAt}); not a fresh check.`, checkedAt: page.fetchedAt };
    }
    result.sourceUrl = item.sourceUrl;
    out.set(item.opportunityId, result);
    onResult(item, result);
  }
  return out;
}
