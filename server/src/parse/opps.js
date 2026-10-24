// Hackathon sources that passed real tests (opportunities-source-report.md, RECON_FINDINGS §4):
//   Devpost JSON      https://devpost.com/api/hackathons?status[]=upcoming&status[]=open
//   HackerEarth JSON  https://www.hackerearth.com/chrome-extension/events/
// TinyFish Fetch returns the JSON as "markdown", with markdown punctuation escaped.
// Dates come only from the fetched fields; if a date cannot be read it is null.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** JSON.parse that copes with markdown-escaped JSON from Fetch. */
export function parseFetchedJson(text) {
  const attempts = [
    (t) => t,
    (t) => t.replace(/\\([_\-*#+.!()[\]{}<>`|~=&])/g, '$1'), // markdown escapes only
  ];
  for (const fix of attempts) {
    try {
      return JSON.parse(fix(String(text).trim()));
    } catch {
      /* try the next */
    }
  }
  return null;
}

function iso(y, mon, d) {
  const m = MONTHS[String(mon).slice(0, 3).toLowerCase()];
  if (!m) return null;
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.getUTCDate() !== Number(d) ? null : s;
}

/**
 * Devpost "submission_period_dates": "Oct 01 - Nov 12, 2026", "Dec 15, 2026 - Jan 10, 2027" or "Nov 01 - 03, 2026".
 * @returns {{ start: string|null, end: string|null }}
 */
export function parseDevpostPeriod(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  let m = t.match(/^([A-Za-z]{3})\w* (\d{1,2}), (\d{4}) - ([A-Za-z]{3})\w* (\d{1,2}), (\d{4})$/);
  if (m) return { start: iso(m[3], m[1], m[2]), end: iso(m[6], m[4], m[5]) };
  m = t.match(/^([A-Za-z]{3})\w* (\d{1,2}) - ([A-Za-z]{3})\w* (\d{1,2}), (\d{4})$/);
  if (m) {
    // a period that crosses the new year ("Dec 20 - Jan 05, 2027") starts the year before
    const startYear = MONTHS[m[1].slice(0, 3).toLowerCase()] > MONTHS[m[3].slice(0, 3).toLowerCase()] ? Number(m[5]) - 1 : m[5];
    return { start: iso(startYear, m[1], m[2]), end: iso(m[5], m[3], m[4]) };
  }
  m = t.match(/^([A-Za-z]{3})\w* (\d{1,2}) - (\d{1,2}), (\d{4})$/);
  if (m) return { start: iso(m[4], m[1], m[2]), end: iso(m[4], m[1], m[3]) };
  return { start: null, end: null };
}

const stripHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** @returns {Array<{ source, title, url, start, end, mode, location, prize, organiser, evidence, restriction }>} */
export function parseDevpost(text) {
  const json = parseFetchedJson(text);
  const list = json?.hackathons ?? [];
  return list
    .filter((h) => h && h.title && h.url)
    .map((h) => {
      const period = parseDevpostPeriod(h.submission_period_dates);
      const location = h.displayed_location?.location ?? null;
      return {
        source: 'devpost',
        title: String(h.title).trim(),
        url: h.url,
        start: period.start,
        end: period.end,
        mode: /online/i.test(location ?? '') ? 'online' : location ? 'in-person' : null,
        location,
        prize: stripHtml(h.prize_amount) || null,
        organiser: h.organization_name ?? null,
        inviteOnly: !!h.invite_only,
        open: h.open_state !== 'ended',
        evidence: `"submission_period_dates":"${h.submission_period_dates ?? ''}"`,
        restriction: null,
      };
    });
}

/** @returns same shape as parseDevpost */
export function parseHackerEarth(text) {
  const json = parseFetchedJson(text);
  const list = json?.response ?? [];
  return list
    .filter((e) => e && e.title && e.url)
    .map((e) => {
      const desc = stripHtml(e.description);
      return {
        source: 'hackerearth',
        title: String(e.title).trim(),
        url: e.url,
        start: String(e.start_tz ?? '').slice(0, 10) || null,
        end: String(e.end_tz ?? '').slice(0, 10) || null,
        mode: 'online',
        location: 'Online',
        prize: null, // not in this feed; never guessed
        organiser: 'HackerEarth',
        inviteOnly: false,
        open: /ongoing|upcoming/i.test(e.status ?? ''),
        evidence: `"end_tz": "${e.end_tz ?? ''}"`,
        restriction: /\b(women|female|girls?)\b/i.test(`${e.title} ${desc}`) ? 'For women or female developers only (from the event description).' : null,
        kind: /hackathon/i.test(e.challenge_type ?? e.url) ? 'hackathon' : 'event',
      };
    });
}

/**
 * Persona filter for a 2nd-year B.Tech Computer Engineering student in Maharashtra:
 * online events, or in person in Maharashtra / India; still open; not restricted to others.
 * @returns {{ fit: 'match'|'conditional'|'not_applicable', reason: string }}
 */
export function assessEvent(ev, criteria, today) {
  if (ev.restriction && criteria.gender === 'male') return { fit: 'not_applicable', reason: ev.restriction };
  if (ev.inviteOnly) return { fit: 'not_applicable', reason: 'Invite only.' };
  if (!ev.open || (ev.end && ev.end < today)) return { fit: 'not_applicable', reason: `Closed${ev.end ? ` (ended ${ev.end})` : ''}.` };
  if (ev.mode === 'online') return { fit: 'match', reason: 'Online, so location is no barrier · open to students (check the rules page for age or college limits)' };
  if (/maharashtra|mumbai|pune|nagpur|nashik|thane/i.test(ev.location ?? '')) return { fit: 'match', reason: `In person in ${ev.location} (Maharashtra)` };
  if (/india|\bIN\b/i.test(ev.location ?? '')) return { fit: 'conditional', reason: `In person in ${ev.location}: needs travel` };
  return { fit: 'not_applicable', reason: `In person in ${ev.location ?? 'an unknown place'}; only online or India events are kept.` };
}
