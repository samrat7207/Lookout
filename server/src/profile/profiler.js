// The Profiler: turns the profile into the structured criteria the Eligibility Judge
// (rank/rules.js) uses, and lists what we do NOT know. Unknowns are never guessed: they
// are shown as "unknown, needs your input" and keep matching schemes "conditional".
// The ranker uses none of this directly; rank stays deadline, then fit.

export const UNKNOWN = 'unknown, needs your input';

// Facts many schemes depend on that the sample profile does not state.
const UNKNOWN_FIELDS = [
  { field: 'familyIncome', label: 'Annual family income', why: 'Most schemes have an income ceiling (for example ₹2.5 lakh, ₹4.5 lakh or ₹8 lakh).' },
  { field: 'capAdmission', label: 'Admitted through CAP (Maharashtra)', why: 'The MahaDBT OBC schemes ask for CAP admission.' },
  { field: 'domicileProof', label: 'Maharashtra domicile certificate', why: 'State schemes need proof of domicile, not just the state you live in.' },
  { field: 'lastExamMarks', label: 'Marks in the last exam', why: 'Merit schemes have a minimum percentage.' },
  { field: 'priorScholarship', label: 'Scholarships already held (for example CSSS in 1st year)', why: 'Renewals and "one merit scheme" limits depend on it.' },
  { field: 'institute', label: 'Institute (AISHE code, notified "Top Class" or not)', why: 'PM YASASVI (college) is only for notified institutes.' },
];

/**
 * @param {{ label?: string, course?: string, courseLabel?: string, branch?: string, year?: number, state?: string,
 *   category?: string, gender?: string, disability?: boolean }} profile
 */
export function buildCriteria(profile) {
  const known = [
    ['gender', 'Gender', profile.gender],
    ['course', 'Course', profile.courseLabel ?? profile.course],
    ['level', 'Level', profile.course ? 'Undergraduate (degree)' : null],
    ['year', 'Year of study', profile.year ? `${profile.year}${profile.year === 1 ? 'st' : profile.year === 2 ? 'nd' : profile.year === 3 ? 'rd' : 'th'} year` : null],
    ['category', 'Category', profile.category],
    ['state', 'State', profile.state],
    ['disability', 'Disability', profile.disability === undefined ? null : profile.disability ? 'yes' : 'none stated'],
  ]
    .filter(([, , v]) => v !== null && v !== undefined && v !== '')
    .map(([field, label, value]) => ({ field, label, value: String(value), from: profile.label ?? 'profile' }));

  const unknown = UNKNOWN_FIELDS.filter((u) => profile[u.field] === undefined || profile[u.field] === null).map((u) => ({ ...u, value: UNKNOWN }));

  return {
    label: profile.label ?? null,
    // what the Judge reads (rank/rules.js)
    criteria: {
      gender: profile.gender ?? null,
      course: profile.course ?? null,
      level: profile.course ? 'ug' : null,
      year: profile.year ?? null,
      category: profile.category ?? null,
      state: profile.state ?? null,
      disability: profile.disability ?? false,
    },
    known,
    unknown,
  };
}
