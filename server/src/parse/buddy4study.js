// Buddy4Study detail pages (RECON_FINDINGS §3). /page/<slug> pages carry one block
// per sub-scheme with "Deadline Date: 26-Oct-2026" (also "EligibilityDeadline : …"),
// and keep past-year blocks under "Previous Year Scholarships". /scholarship/<slug>
// pages use "Application Deadline: 30th September 2026". Only the current section is read.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function iso(d, mon, y) {
  const m = MONTHS[mon.slice(0, 3).toLowerCase()];
  if (!m) return null;
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.getUTCDate() !== Number(d) ? null : s;
}

const DEADLINE = [
  /Deadline(?:\s+Date)?\s*:\s*(\d{1,2})-([A-Za-z]{3,9})-(\d{4})/,
  /Application Deadline\s*:\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+(\d{4})/,
];

/**
 * @param {string} markdown
 * @param {string} today YYYY-MM-DD
 * @returns {{ title: string|null, deadline: string|null, evidence: string|null, pastDeadline: string|null,
 *   amount: string|null, main: string }}
 */
export function parseBuddy4Study(markdown, today) {
  const text = markdown.replace(/\r\n?/g, '\n');
  // "# Deutsche Bank Engineering Scholarship 2026-27 | [Win up to …]": keep the name only
  const title = text.match(/^#\s+(.+)$/m)?.[1].split(/\s+\|\s+/)[0].trim() ?? null;
  const cut = text.search(/^#{1,3}\s+(Previous Year|Related|Similar)/im);
  const main = cut > 0 ? text.slice(0, cut) : text;

  // earliest deadline in the current section that is not already past
  let best = null;
  let lastPast = null; // the page has deadlines, but all of them have passed
  for (const re of DEADLINE) {
    for (const m of main.matchAll(new RegExp(re.source, 'g'))) {
      const d = iso(m[1], m[2], m[3]);
      if (!d) continue;
      if (d >= today && (!best || d < best.deadline)) best = { deadline: d, evidence: m[0].trim() };
      if (d < today && (!lastPast || d > lastPast)) lastPast = d;
    }
  }

  const amounts = [...main.matchAll(/(?:INR|₹|Rs\.?)\s*\**\s*([\d,]+(?:\.\d+)?)\s*(lakh)?/gi)].map((m) => ({
    value: Number(m[1].replace(/,/g, '')) * (m[2] ? 100_000 : 1),
    text: m[0].replace(/\*/g, '').replace(/\s+/g, ' ').trim(),
  }));
  // income limits also say "INR 2.5 lakh"; amounts on these pages are the award lines
  const award = amounts.filter((a) => a.value >= 1000 && a.value < 200_000).sort((a, b) => b.value - a.value)[0];

  return {
    title,
    deadline: best?.deadline ?? null,
    evidence: best?.evidence ?? null,
    pastDeadline: best ? null : lastPast,
    amount: award ? `up to ${award.text}` : null,
    main,
  };
}
