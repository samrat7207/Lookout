// Plan-level warnings for schemes that may not be combinable. Each rule names two
// groups of opportunity ids; when the plan lists something from both, the plan gets
// a conflict so the student checks before applying.
//
// The warning text never states a hard rule. A rule is stated only when a page
// fetched during the run says so: the scout passes that line as `evidence`
// ({ [ruleId]: { quote, sourceUrl, checkedAt } }) and the conflict quotes and links it.

export const CONFLICT_TEXT = 'These may not be combinable. Check the current NSP rules before applying.';

const CSSS = ['nsp:pm-usp-csss'];
const STATE_FEE_REIMBURSEMENT = ['mahadbt:post-matric-obc', 'mahadbt:tuition-exam-fees-obc'];

export const CONFLICT_RULES = [
  {
    id: 'nsp-one-merit-scheme',
    title: 'PM YASASVI (college) and PM-USP CSSS',
    a: ['nsp:pm-yasasvi-college-obc-ebc-dnt'],
    b: CSSS,
    checkUrl: 'https://scholarships.gov.in/',
    // the sentence a scout looks for on the fetched NSP home page
    pattern: /[^.\n]*one\s+merit[- ]based\s+scheme[^.\n]*\.?/i,
  },
  {
    id: 'csss-vs-state-fee-reimbursement',
    title: 'PM-USP CSSS and a state fee reimbursement or freeship',
    a: CSSS,
    b: STATE_FEE_REIMBURSEMENT,
    checkUrl: 'https://scholarships.gov.in/',
    pattern: null, // the rule is in a guideline PDF we do not fetch; never stated as fact
  },
];

/** Finds a rule's official sentence in fetched page text. Returns { quote } or null. */
export function findRuleEvidence(rule, text) {
  if (!rule.pattern || !text) return null;
  const m = text.match(rule.pattern);
  return m ? { quote: m[0].trim().replace(/\s+/g, ' ') } : null;
}

/**
 * @param {{opportunityId: string}[]} items plan items
 * @param {Record<string, {quote: string, sourceUrl: string, checkedAt: string}>} [evidence]
 */
export function findConflicts(items, evidence = {}, rules = CONFLICT_RULES) {
  const listed = new Set(items.map((i) => i.opportunityId));
  const out = [];
  for (const rule of rules) {
    const a = rule.a.filter((id) => listed.has(id));
    const b = rule.b.filter((id) => listed.has(id));
    if (!a.length || !b.length) continue;
    const ev = evidence[rule.id];
    out.push({
      id: rule.id,
      title: rule.title,
      ids: [...a, ...b],
      text: CONFLICT_TEXT,
      sourceUrl: ev?.sourceUrl ?? rule.checkUrl,
      ...(ev && { officialRule: { quote: ev.quote, sourceUrl: ev.sourceUrl, checkedAt: ev.checkedAt } }),
    });
  }
  return out;
}
