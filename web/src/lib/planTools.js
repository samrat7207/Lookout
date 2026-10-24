// Pure helpers for the plan screen (tested in web/test/planTools.test.js):
// the deadline timeline, the filters, and the .ics export.

export const CLOSING_SOON_DAYS = 7;

const DAY = 86_400_000;
export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY);
}

/**
 * Timeline lanes: dated items placed by days left (0 = today), plus a separate lane for
 * items with no published deadline. Items already past are left out (they are "missed").
 * @returns {{ span: number, dated: Array<{item, daysLeft, pos, soon}>, undated: object[], ticks: number[] }}
 */
export function buildTimeline(items, today) {
  const dated = [];
  const undated = [];
  for (const item of items) {
    if (!item.deadline) {
      undated.push(item);
      continue;
    }
    const d = daysBetween(today, item.deadline);
    if (d < 0) continue;
    dated.push({ item, daysLeft: d, soon: d < CLOSING_SOON_DAYS });
  }
  dated.sort((a, b) => a.daysLeft - b.daysLeft || a.item.title.localeCompare(b.item.title));
  const max = dated.length ? dated.at(-1).daysLeft : 0;
  const span = Math.max(14, Math.ceil((max + 1) / 7) * 7);
  for (const d of dated) d.pos = d.daysLeft / span;
  const ticks = [];
  for (let t = 0; t <= span; t += 7) ticks.push(t);
  return { span, dated, undated, ticks };
}

export const closesInText = (n) => (n === 0 ? 'closes today' : n === 1 ? 'closes in 1 day' : `closes in ${n} days`);

/** central | state | private | hackathon, from the item's source and kind. */
export function typeOf(item) {
  if (item.kind === 'hackathon' || item.kind === 'event') return 'hackathon';
  if (item.source === 'nsp') return 'central';
  if (item.source === 'mahadbt') return 'state';
  return 'private';
}

/**
 * @param {object[]} items plan items
 * @param {{ fits?: string[], types?: string[], verifiedOnly?: boolean, q?: string }} f
 *   empty fits/types mean "all"
 */
export function filterItems(items, f = {}, verification = {}) {
  const q = (f.q ?? '').trim().toLowerCase();
  return items.filter((i) => {
    if (f.fits?.length && !f.fits.includes(i.fit)) return false;
    if (f.types?.length && !f.types.includes(typeOf(i))) return false;
    if (f.verifiedOnly && (i.verification ?? verification[i.opportunityId])?.status !== 'verified') return false;
    if (q && !i.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

const icsEscape = (s) => String(s ?? '').replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\r?\n/g, '\\n');
/** RFC 5545 lines must be at most 75 octets; continuation lines start with a space. */
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

/** Only deadlines read from fetched text (page or search snippet); never "not published" ones. */
export function exportableItems(items) {
  return items.filter((i) => i.deadline && /^\d{4}-\d{2}-\d{2}$/.test(i.deadline) && ['parsed', 'snippet'].includes(i.dateSource ?? 'parsed'));
}

/**
 * An all-day event per fetched deadline.
 * @param {object[]} items plan items
 * @param {{ now?: Date }} [opts]
 */
export function buildIcs(items, { now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lookout//Scholarship Season//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const i of exportableItems(items)) {
    const d = i.deadline.replace(/-/g, '');
    const next = new Date(Date.parse(`${i.deadline}T00:00:00Z`) + DAY).toISOString().slice(0, 10).replace(/-/g, '');
    const desc = [
      `${i.deadlineLabel ?? 'Deadline'} (read from the source page${i.dateSource === 'snippet' ? ' search result' : ''}).`,
      i.evidence ? `Evidence: ${i.evidence}` : null,
      `Source: ${i.sourceUrl}`,
      i.checkedAt ? `Last checked: ${i.checkedAt}` : null,
      'Lookout never submits anything; apply yourself on the official portal.',
    ].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsEscape(i.opportunityId)}-${d}@lookout`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${next}`,
      fold(`SUMMARY:${icsEscape(`Deadline: ${i.title}`)}`),
      fold(`DESCRIPTION:${icsEscape(desc)}`),
      fold(`URL:${i.sourceUrl}`),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
