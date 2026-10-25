// Which profiles the Eligibility Judge really covers. rank/rules.js was written and
// checked for the sample student only (Maharashtra, OBC, B.Tech, 2nd year): several of
// its rules assume those facts. For any other profile, or when one of these facts is
// unknown, the Judge does not give confident verdicts: every scholarship is shown as
// "unclear, not checked for this profile" instead.

export const COVERED = { state: 'Maharashtra', category: 'OBC', course: 'btech', year: 2 };
export const COVERED_TEXT = 'Maharashtra, OBC, B.Tech, 2nd year';

export function profileSupport(p = {}) {
  const reasons = [];
  if (p.state !== COVERED.state) reasons.push(p.state ? `state ${p.state}` : 'state unknown');
  if (p.category !== COVERED.category) reasons.push(p.category ? `category ${p.category}` : 'category unknown');
  if (p.course !== COVERED.course) reasons.push(p.course ? `course ${p.course}` : 'course unknown');
  if (p.year !== COVERED.year) reasons.push(p.year ? `year ${p.year}` : 'year unknown');
  return { supported: reasons.length === 0, reasons, covered: COVERED_TEXT };
}

/** The verdict used instead of the rules when the profile is not covered. */
export const notCheckedVerdict = (support) => ({
  fit: 'unclear',
  reason: `Not checked for this profile (${support.reasons.join('; ')}): our rules cover only ${COVERED_TEXT}. Open the official guideline.`,
  needsVerification: true,
});
