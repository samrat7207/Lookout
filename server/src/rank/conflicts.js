// Plan-level warnings for schemes that cannot be held together. Each rule names two
// groups of opportunity ids; when the plan lists something from both, the plan gets a
// conflict so the student chooses before applying. Rules come from official pages
// (read 2026-10-24); see the handoff eligibility-rules.json for the wording.

const CSSS = ['nsp:pm-usp-csss'];
const STATE_FEE_REIMBURSEMENT = ['mahadbt:post-matric-obc', 'mahadbt:tuition-exam-fees-obc'];

export const CONFLICT_RULES = [
  {
    id: 'nsp-one-merit-scheme',
    a: ['nsp:pm-yasasvi-college-obc-ebc-dnt'],
    b: CSSS,
    text: 'PM YASASVI (college) and PM-USP CSSS are both NSP merit schemes. From AY 2026-27 you can apply for only one merit scheme on NSP, so pick one.',
    sourceUrl: 'https://scholarships.gov.in/',
  },
  {
    id: 'csss-vs-state-fee-reimbursement',
    a: CSSS,
    b: STATE_FEE_REIMBURSEMENT,
    text: 'PM-USP CSSS is not paid to students who also take a state fee reimbursement or freeship (guideline 4(iv)). Holding a MahaDBT OBC scholarship or fee scheme rules out CSSS.',
    sourceUrl: 'https://scholarships.gov.in/public/schemeGuidelines/CSSS_GUIDLINES_07022024_updated.pdf',
  },
];

/** @param {{opportunityId: string}[]} items plan items @returns {{id, ids: string[], text, sourceUrl}[]} */
export function findConflicts(items, rules = CONFLICT_RULES) {
  const listed = new Set(items.map((i) => i.opportunityId));
  const out = [];
  for (const rule of rules) {
    const a = rule.a.filter((id) => listed.has(id));
    const b = rule.b.filter((id) => listed.has(id));
    if (a.length && b.length) out.push({ id: rule.id, ids: [...a, ...b], text: rule.text, sourceUrl: rule.sourceUrl });
  }
  return out;
}
