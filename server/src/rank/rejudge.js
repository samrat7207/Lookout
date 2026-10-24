// Re-run the Eligibility Judge and the Ranker on a finished plan with an edited profile
// (no new fetching). Rules that depend on facts the Profiler marks unknown (income, CAP
// admission, domicile proof) apply only once the student gives a value. The ceilings
// below were read from the official scheme pages on 2026-10-24 (team eligibility-rules).

import { assessByName } from './rules.js';
import { buildPlan } from './ranker.js';
import { buildCriteria } from '../profile/profiler.js';

const LAKH = 100_000;
export const INCOME_LIMITS = [
  { test: /top class education in college for obc/i, max: 2.5 * LAKH },
  { test: /scholarship for college and university students|\bCSSS\b/i, max: 4.5 * LAKH },
  { test: /swanath/i, max: 8 * LAKH },
  { test: /^post matric scholarship to obc students$/i, max: 2.5 * LAKH },
  { test: /parivartan/i, max: 2.5 * LAKH },
  { test: /tata capital pankh/i, max: 4 * LAKH },
];
const NEEDS_CAP = /^(post matric scholarship to obc students|tuition fees and examination fees to obc students)$/i;
const NEEDS_DOMICILE = (o) => o.source === 'mahadbt';

const fmtLakh = (n) => `₹${(n / LAKH).toLocaleString('en-IN', { maximumFractionDigits: 2 })} lakh`;

/** One opportunity -> { fit, reason } under the edited profile, starting from the run's own verdict. */
export function judge(opp, profile, criteria) {
  if (opp.kind === 'scholarship' && opp.source === 'nsp') {
    const byName = assessByName(opp.title, criteria);
    if (byName.fit === 'not_applicable') return byName;
  }
  if (opp.kind === 'scholarship' && criteria.gender === 'male' && /\b(girls?|women|female)\b|pragati/i.test(opp.title)) {
    return { fit: 'not_applicable', reason: 'For girl students only; the profile is male.' };
  }
  let fit = opp.fit ?? 'conditional';
  let reason = opp.why ?? opp.matchReason ?? '';
  const limit = INCOME_LIMITS.find((l) => l.test.test(opp.title));
  if (limit && Number.isFinite(profile.familyIncome)) {
    if (profile.familyIncome > limit.max) return { fit: 'not_applicable', reason: `Family income ${fmtLakh(profile.familyIncome)} is above this scheme's ${fmtLakh(limit.max)} limit.` };
    reason = `Income within the ${fmtLakh(limit.max)} limit · ${reason}`;
  }
  if (NEEDS_CAP.test(opp.title) && profile.capAdmission === false) return { fit: 'not_applicable', reason: 'Needs admission through CAP; the profile says no.' };
  if (NEEDS_DOMICILE(opp) && profile.domicileProof === false) return { fit: 'not_applicable', reason: 'State scheme: needs a Maharashtra domicile certificate; the profile says no.' };
  return { fit, reason };
}

/** Rebuilds an opportunity from a plan item (or a not-applicable entry that kept its fields). */
function toOpp(i) {
  return {
    id: i.opportunityId ?? `${i.source}:${i.title}`,
    kind: i.kind ?? 'scholarship',
    title: i.title,
    source: i.source,
    deadline: i.deadline ?? null,
    deadlineLabel: i.deadlineLabel,
    sourceUrl: i.sourceUrl,
    eventUrl: i.eventUrl ?? null,
    checkedAt: i.checkedAt ?? null,
    amount: i.amount ?? null,
    needsVerification: i.needsVerification ?? false,
    dateSource: i.dateSource,
    evidence: i.evidence,
    fit: i.fit,
    why: i.why,
    matchReason: i.why,
  };
}

/**
 * @param {object} plan a plan.ready payload
 * @param {object} profile the edited profile (sample student plus edits)
 * @returns the new plan, with `rejudged` describing what moved
 */
export function rejudgePlan(plan, profile) {
  const profiled = buildCriteria(profile);
  const criteria = profiled.criteria;
  const verification = new Map([...(plan.items ?? []), ...(plan.missed ?? [])].filter((i) => i.verification).map((i) => [i.opportunityId, i.verification]));
  const kitIds = new Map([...(plan.items ?? [])].filter((i) => i.kitId).map((i) => [i.opportunityId, i.kitId]));

  const keep = [];
  const notApplicable = [];
  const moved = [];
  for (const item of [...(plan.items ?? []), ...(plan.missed ?? [])]) {
    const v = judge(toOpp(item), profile, criteria);
    if (v.fit === 'not_applicable') {
      notApplicable.push({ title: item.title, reason: v.reason, sourceUrl: item.sourceUrl, checkedAt: item.checkedAt, ...toOpp(item), fit: undefined });
      moved.push({ title: item.title, to: 'not applicable', reason: v.reason });
    } else {
      keep.push({ ...toOpp(item), fit: v.fit, matchReason: v.reason });
    }
  }
  // dropped schemes come back only if the run kept their deadline fields (never guessed)
  for (const na of plan.notApplicable ?? []) {
    if (!na.source || !na.kind || !('deadline' in na)) {
      notApplicable.push(na);
      continue;
    }
    const opp = { ...toOpp(na), fit: 'conditional', why: 'Re-judged with your edits' };
    const byName = na.source === 'nsp' ? assessByName(na.title, criteria) : { fit: 'unclear', reason: 'Re-judged with your edits' };
    if (byName.fit === 'not_applicable') {
      notApplicable.push(na);
      continue;
    }
    const v = judge({ ...opp, fit: byName.fit, why: byName.reason }, profile, criteria);
    if (v.fit === 'not_applicable') notApplicable.push({ ...na, reason: v.reason });
    else {
      keep.push({ ...opp, fit: v.fit, matchReason: v.reason, needsVerification: true });
      moved.push({ title: na.title, to: v.fit, reason: v.reason });
    }
  }
  const next = buildPlan(keep, {
    today: plan.today,
    headline: plan.headline ? { text: plan.headline.text, date: plan.headline.date, sourceUrl: plan.headline.sourceUrl, evidence: plan.headline.evidence } : null,
    notes: plan.notes ?? [],
    notApplicable,
    sources: plan.sources ?? null,
    verification,
    kitIds,
    profile: profiled,
  });
  return { ...next, rejudged: { at: new Date().toISOString(), moved, from: 'the same fetched data; nothing was re-fetched' } };
}
