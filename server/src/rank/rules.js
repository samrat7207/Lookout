// Persona eligibility from scheme names and fetched page text (APPROACH D4).
// Returns fit = match | conditional | unclear | not_applicable plus a plain reason.
// Known schemes use rules read from their official pages on 2026-10-24 (see the
// team's eligibility-rules.json); everything else is a keyword reading of the name,
// which is marked needsVerification.

const OTHER_STATES = [
  'Andhra', 'Arunachal', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Jammu', 'Kashmir', 'Ladakh', 'Delhi', 'Puducherry', 'Chandigarh', 'Lakshadweep', 'Andaman', 'North East',
];

/** Rules for schemes whose official guidelines were read (2026-10-24). */
const KNOWN = [
  {
    test: /top class education in college for obc/i,
    fit: 'conditional',
    reason: 'OBC + B.Tech · only if family income ≤ ₹2.5 lakh and your college is a notified "Top Class" institute (2nd year: leftover slots only)',
  },
  {
    test: /scholarship for college and university students|\bCSSS\b/i,
    fit: 'conditional',
    reason: 'Renewal only: a 2nd-year student can apply only if he won CSSS in 1st year · income ≤ ₹4.5 lakh, no state fee reimbursement',
  },
  {
    test: /swanath/i,
    fit: 'conditional',
    reason: 'B.Tech in an AICTE college · only for orphans, Covid-bereaved, wards of martyred armed forces personnel or critical-illness cases; income ≤ ₹8 lakh',
  },
];

/**
 * @param {string} name scheme name
 * @param {{ gender?: string, category?: string, state?: string, disability?: boolean }} profile
 */
export function assessByName(name, profile) {
  if (/diploma/i.test(name) && !/degree/i.test(name)) {
    return { fit: 'not_applicable', reason: 'Diploma-level scheme; he is in a B.Tech degree.', needsVerification: false };
  }
  for (const k of KNOWN) if (k.test.test(name)) return { fit: k.fit, reason: k.reason, needsVerification: false };

  const na = (reason) => ({ fit: 'not_applicable', reason, needsVerification: true });
  if (profile.gender === 'male' && /\b(girls?|women|female|beti|daughter)\b|pragati/i.test(name)) return na('For girl students only; the profile is male.');
  if (!profile.disability && /saksham|disabilit|divyang|\bpwd\b|differently abled/i.test(name)) return na('For students with disabilities; the profile has none.');
  if (/\bschools?\b|pre[- ]?matric|class(es)? (ix|x|9|10|11|12)\b|secondary|madrasa/i.test(name)) return na('School-level scheme; he is in college.');
  if (/post[- ]?graduate|\bPG\b|ph\.?\s?d|doctoral|m\.?\s?tech|research|fellowship/i.test(name)) return na('Postgraduate or research level; he is an undergraduate.');
  if (/wards? of|martyred|police personnel|armed police|assam rifles|railways|beedi|cine workers/i.test(name)) {
    return na('Only for wards of specific workers or service personnel; the profile does not say this applies.');
  }
  if (/\bNER\b|north[- ]east/i.test(name)) return na('For students from the North East; the profile is Maharashtra.');
  const other = OTHER_STATES.find((s) => new RegExp(`\\b${s}`, 'i').test(name));
  if (other && !/maharashtra/i.test(name)) return na(`For students of ${other}; the profile is Maharashtra.`);
  if (!/\bobc\b|other backward/i.test(name) && /scheduled castes?|scheduled tribes?|\bSC\b|\bST\b|minorit|tribal|denotified|ebc only/i.test(name)) {
    return na(`For another category; the profile is ${profile.category}.`);
  }
  if (/\bobc\b|other backward/i.test(name) && /college|university|post[- ]?matric|higher|degree|technical/i.test(name)) {
    return { fit: 'conditional', reason: 'OBC + college level named in the scheme title · income and other conditions are in the guideline', needsVerification: true };
  }
  if (/technical|engineering|degree|college|universit|higher education|professional|post[- ]?matric|graduat/i.test(name)) {
    return { fit: 'unclear', reason: 'Unclear: the listing does not say whether a 2nd-year OBC B.Tech student from Maharashtra qualifies; open the guideline', needsVerification: true, generic: true };
  }
  return { ...na('The listing gives no sign it covers a 2nd-year B.Tech student.'), generic: true };
}

/** Buddy4Study-style detail page text (main block only). */
export function assessPageText(title, text, profile) {
  // a definite rule from the title wins; the generic "no sign" reading does not, the page text decides
  const byName = assessByName(title, profile);
  if (byName.fit === 'not_applicable' && !byName.generic) return byName;
  const t = `${title}\n${text}`;
  if (profile.gender === 'male' && /\bonly (for )?(girls|women|female)|girl students only|female students only/i.test(t)) {
    return { fit: 'not_applicable', reason: 'The page says it is for girl students only.', needsVerification: true };
  }
  const names = /b\.?\s?tech|b\.?\s?e\.?\b|engineering|professional (course|degree)/i.test(t);
  if (names) return { fit: 'conditional', reason: 'B.Tech or engineering is named on the page · marks and income conditions on the page apply', needsVerification: true };
  return { fit: 'unclear', reason: 'Unclear: the page does not name B.Tech or engineering', needsVerification: true };
}
