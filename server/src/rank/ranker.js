// Town Hall: score (APPROACH D5), filter, and merge all kinds into ONE list sorted
// by deadline (EVENT_SCHEMA v2 Plan). M2 adds the keyword eligibility rules (rules.js);
// here eligibility strength comes from the scout's matchedOn / conditional flags.

import { findConflicts } from './conflicts.js';

// Lowest possible score for a scout-matched item is 35 (conditional, no date, no parsed
// date source); the cutoff drops only weaker keyword-only matches from rules.js (M2).
export const MIN_SCORE = 35;

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

export function score(opp, today) {
  const conditional = opp.scholarship?.conditional ?? false;
  const eligibility = conditional ? 0.5 : Math.min(1, 0.5 + 0.25 * (opp.matchedOn?.length ?? 0));
  const days = opp.deadline ? daysBetween(today, opp.deadline) : null;
  const urgency = days === null ? 0.2 : days <= 7 ? 1 : days <= 30 ? 0.7 : 0.4;
  const confidence = { parsed: 1, snippet: 0.5, none: 0.2 }[opp.dateSource] ?? 0.2;
  return Math.round(50 * eligibility + 35 * urgency + 15 * confidence);
}

function bucket(daysLeft) {
  if (daysLeft === null) return 'no-date';
  if (daysLeft <= 7) return 'this-week';
  if (daysLeft <= 30) return 'this-month';
  return 'later';
}

function toItem(opp, today, kitIds) {
  const daysLeft = opp.deadline ? daysBetween(today, opp.deadline) : null;
  return {
    opportunityId: opp.id,
    kind: opp.kind,
    title: opp.title,
    source: opp.source,
    deadline: opp.deadline,
    deadlineLabel: opp.deadlineLabel,
    daysLeft,
    bucket: bucket(daysLeft),
    score: score(opp, today),
    why: daysLeft === null ? opp.matchReason : `${opp.matchReason} · ${daysLeft === 0 ? 'closes today' : `${daysLeft} days left`}`,
    sourceUrl: opp.sourceUrl,
    action: ACTIONS[opp.source] ?? 'Open the source page',
    ...(kitIds.has(opp.id) && { kitId: kitIds.get(opp.id) }),
  };
}

/** Deadline ascending, nulls last, ties by score descending. */
export function byDeadline(a, b) {
  if (a.deadline !== b.deadline) {
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline < b.deadline ? -1 : 1;
  }
  return b.score - a.score;
}

export function buildPlan(opportunities, { today, headline = null, notes = [], kitIds = new Map(), now = new Date(), ruleEvidence = {} }) {
  const all = opportunities.map((o) => toItem(o, today, kitIds)).filter((i) => i.score >= MIN_SCORE);
  const items = all.filter((i) => i.daysLeft === null || i.daysLeft >= 0).sort(byDeadline);
  const missed = all.filter((i) => i.daysLeft !== null && i.daysLeft < 0).sort(byDeadline);
  items.forEach((item, i) => (item.rank = i + 1));

  const counts = { scholarship: 0, hackathon: 0, event: 0 };
  for (const i of items) counts[i.kind]++;

  return {
    generatedAt: now.toISOString(),
    today,
    headline: headline && { ...headline, daysLeft: daysBetween(today, headline.date) },
    items,
    missed,
    counts,
    notes,
    conflicts: findConflicts(items, ruleEvidence),
  };
}
