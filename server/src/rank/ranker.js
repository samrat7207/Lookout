// Town Hall: merge all kinds into ONE list (EVENT_SCHEMA v2 Plan). Rank is decided by
// exactly two things, in this order:
//   1. deadline urgency: earliest deadline first; "deadline not published" goes last
//   2. fit: match before conditional before unclear
// Ties after that are listed by title only so the order is stable. Nothing else
// (source, amount, date confidence) changes the rank.

import { findConflicts } from './conflicts.js';

export const FIT_ORDER = { match: 0, conditional: 1, unclear: 2 };
export const NO_DEADLINE = 'deadline not published';

const ACTIONS = {
  nsp: 'Apply on NSP (OTR required)',
  mahadbt: 'Apply on MahaDBT 2.0',
  buddy4study: 'Apply on Buddy4Study',
  vidyasaarathi: 'Apply on Vidyasaarathi',
  devfolio: 'Register on Devfolio',
  mlh: 'Register on the event site (listed by MLH)',
  devpost: 'Register on Devpost',
  hackerearth: 'Register on HackerEarth',
  unstop: 'Register on Unstop',
};

/** Today's date in India as YYYY-MM-DD. */
export function istToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

/** match | conditional | unclear. Scouts set opp.fit; older payloads only have scholarship.conditional. */
export function fitOf(opp) {
  if (opp.fit && opp.fit in FIT_ORDER) return opp.fit;
  if (/\bunclear\b/i.test(opp.matchReason ?? '')) return 'unclear';
  return opp.scholarship?.conditional ? 'conditional' : 'match';
}

function bucket(daysLeft) {
  if (daysLeft === null) return 'no-date';
  if (daysLeft <= 7) return 'this-week';
  if (daysLeft <= 30) return 'this-month';
  return 'later';
}

function fmtDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export const daysLeftText = (n) => (n === 0 ? 'closes today' : n === 1 ? '1 day left' : `${n} days left`);

const FIT_WORDS = { match: 'you match', conditional: 'you may match (conditions below)', unclear: 'eligibility is unclear' };

/** The plain-words "Why this ranking" line. */
function rankWhy(item, rank, prev) {
  const when = item.deadline
    ? `Closes ${fmtDate(item.deadline)} (${daysLeftText(item.daysLeft)})`
    : 'No deadline is published, so it is listed after every dated item';
  const tie = prev && prev.deadline === item.deadline && prev.fit !== item.fit
    ? `; same date as #${rank - 1}, placed after it because ${FIT_WORDS[item.fit]}`
    : `; ${FIT_WORDS[item.fit]}`;
  return `#${rank}: ${when}${tie}.`;
}

function toItem(opp, today, kitIds, verification) {
  const daysLeft = opp.deadline ? daysBetween(today, opp.deadline) : null;
  return {
    opportunityId: opp.id,
    kind: opp.kind,
    title: opp.title,
    source: opp.source,
    deadline: opp.deadline ?? null,
    deadlineLabel: opp.deadline ? opp.deadlineLabel : NO_DEADLINE,
    daysLeft,
    bucket: bucket(daysLeft),
    fit: fitOf(opp),
    why: opp.matchReason,
    amount: opp.amount ?? null,
    sourceUrl: opp.sourceUrl,
    eventUrl: opp.eventUrl ?? null,
    checkedAt: opp.checkedAt ?? null,
    // where the date came from: parsed (page text) | snippet (search result) | none; used by the .ics export
    dateSource: opp.deadline ? opp.dateSource ?? 'parsed' : 'none',
    evidence: opp.evidence ?? null,
    needsVerification: opp.needsVerification ?? false,
    action: ACTIONS[opp.source] ?? 'Open the source page',
    ...(kitIds.has(opp.id) && { kitId: kitIds.get(opp.id) }),
    verification: verification.get(opp.id) ?? null, // set by the Verifier; does not affect rank
  };
}

/** Deadline ascending (not published last), then fit, then title. */
export function byRank(a, b) {
  if (a.deadline !== b.deadline) {
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline < b.deadline ? -1 : 1;
  }
  if (a.fit !== b.fit) return FIT_ORDER[a.fit] - FIT_ORDER[b.fit];
  return a.title.localeCompare(b.title);
}

/**
 * @param {object[]} opportunities matched opportunities (fit match | conditional | unclear)
 * @param {{ today: string, headline?: object, notes?: string[], kitIds?: Map, now?: Date,
 *   ruleEvidence?: object, notApplicable?: {title, reason, sourceUrl}[],
 *   sources?: {checked: number, failed: number, lastChecked: string|null, list?: object[]} }} opts
 */
export function buildPlan(opportunities, { today, headline = null, notes = [], kitIds = new Map(), now = new Date(), ruleEvidence = {}, notApplicable = [], sources = null, verification = new Map(), profile = null }) {
  const all = opportunities.map((o) => toItem(o, today, kitIds, verification));
  const items = all.filter((i) => i.daysLeft === null || i.daysLeft >= 0).sort(byRank);
  const missed = all.filter((i) => i.daysLeft !== null && i.daysLeft < 0).sort(byRank);
  items.forEach((item, i) => {
    item.rank = i + 1;
    item.rankWhy = rankWhy(item, item.rank, items[i - 1]);
  });
  // the same order within each kind, for the Scholarships and Opportunities tabs
  for (const kind of new Set(items.map((i) => i.kind))) {
    const own = items.filter((i) => i.kind === kind);
    own.forEach((item, i) => {
      item.kindRank = i + 1;
      item.kindRankWhy = rankWhy(item, i + 1, own[i - 1]);
    });
  }

  const counts = { scholarship: 0, hackathon: 0, event: 0 };
  for (const i of items) counts[i.kind]++;

  return {
    generatedAt: now.toISOString(),
    today,
    headline: headline && { ...headline, daysLeft: daysBetween(today, headline.date) },
    items,
    missed,
    notApplicable,
    counts,
    notes,
    conflicts: findConflicts(items, ruleEvidence),
    profile, // Profiler output: known facts and unknowns (never guessed)
    sources,
  };
}
