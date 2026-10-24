// Real data seen in the 2026-10-24 recon (docs/RECON_FINDINGS.md), shaped as
// EVENT_SCHEMA v2 Opportunities. The fake run replays these so the city and the
// plan are built against real titles, dates and URLs before live mode exists.

export const SAMPLE_STUDENT = {
  label: 'sample student',
  course: 'btech',
  courseLabel: 'B.Tech Computer Engineering',
  branch: 'Computer Engineering',
  state: 'Maharashtra',
  category: 'OBC',
  gender: 'male',
  disability: false,
};

const NSP_ALL = 'https://scholarships.gov.in/All-Scholarships';
const NSP_HOME = 'https://scholarships.gov.in/';
const MAHADBT = 'https://mahadbt.maharashtra.gov.in/';

export const NSP_HEADLINE = {
  text: 'NSP student applications close 31 Oct 2026',
  date: '2026-10-31',
  sourceUrl: NSP_HOME,
  evidence: 'Closing dates for student application is 31-10-2026',
};

export const nsp = [
  {
    id: 'nsp:pm-yasasvi-college-obc-ebc-dnt',
    kind: 'scholarship',
    title: 'PM YASASVI Central Sector Scheme Of Top Class Education In College For OBC, EBC And DNT Students',
    deadline: '2026-10-31',
    deadlineLabel: 'Student application closes',
    sourceUrl: NSP_ALL,
    matchReason: 'OBC + B.Tech · only if family income ≤ ₹2.5 lakh and your college is a notified "Top Class" institute (2nd year: leftover slots only)',
    source: 'nsp',
    dateSource: 'parsed',
    evidence: 'Student Application Open till : 31-10-2026',
    matchedOn: ['category=OBC', 'course=btech'],
    bubble: 'PM YASASVI (OBC, college): closes 31 Oct!',
    via: 'fetch',
    cached: false,
    scholarship: { portal: 'nsp', schemeType: 'Merit', openFrom: '2026-06-01', verificationTill: '2026-11-15', conditional: true },
  },
  {
    id: 'nsp:pm-usp-csss',
    kind: 'scholarship',
    title: 'PM-USP – Central Sector Scheme Of Scholarship For College And University Students (CSSS)',
    deadline: '2026-10-31',
    deadlineLabel: 'Student application closes',
    sourceUrl: NSP_ALL,
    matchReason: 'Renewal only: a 2nd-year student can apply only if he won CSSS in 1st year · income ≤ ₹4.5 lakh, no state fee reimbursement',
    source: 'nsp',
    dateSource: 'parsed',
    evidence: 'Student Application Open till (for Renewal): 31-10-2026',
    matchedOn: ['course=btech'],
    bubble: 'PM-USP CSSS renewals: closes 31 Oct',
    via: 'fetch',
    cached: false,
    scholarship: { portal: 'nsp', schemeType: 'Merit', openFrom: '2026-06-01', verificationTill: '2026-11-15', conditional: true },
  },
  {
    id: 'nsp:aicte-swanath-technical-degree',
    kind: 'scholarship',
    title: 'AICTE - Swanath Scholarship Scheme (Technical Degree)',
    deadline: '2026-10-31',
    deadlineLabel: 'Student application closes',
    sourceUrl: NSP_ALL,
    matchReason: 'B.Tech in an AICTE college · only for orphans, Covid-bereaved, wards of martyred armed forces personnel or critical-illness cases; income ≤ ₹8 lakh',
    source: 'nsp',
    dateSource: 'parsed',
    evidence: 'Student Application Open till : 31-10-2026',
    matchedOn: ['course=btech'],
    bubble: 'Swanath (B.Tech, conditional): 31 Oct',
    via: 'fetch',
    cached: false,
    scholarship: { portal: 'nsp', schemeType: 'Welfare', openFrom: '2026-06-01', verificationTill: '2026-11-15', conditional: true },
  },
];

export const MAHADBT_NOTE = {
  note: true,
  text: 'Fresh and renewal applications for AY 2026-27 are accepted only through the MahaDBT 2.0 portal (https://mahadbt2.maharashtra.gov.in/)',
  sourceUrl: MAHADBT,
  bubble: 'AY 2026-27: apply on MahaDBT 2.0 only',
};

const mahadbtScheme = ({ slug, title, matchReason, url, matchedOn, conditional = true }) => ({
  id: `mahadbt:${slug}`,
  kind: 'scholarship',
  title,
  deadline: null, // MahaDBT scheme pages publish no deadline; never invent one
  deadlineLabel: 'Not published (apply on MahaDBT 2.0)',
  sourceUrl: url,
  matchReason,
  source: 'mahadbt',
  dateSource: 'none',
  evidence: title,
  matchedOn,
  bubble: `${title.slice(0, 44)}…`,
  via: 'fetch',
  cached: false,
  scholarship: { portal: 'mahadbt2', schemeType: null, openFrom: null, verificationTill: null, conditional },
});

const SCHEME_PAGE = 'https://mahadbt.maharashtra.gov.in/SchemeData/SchemeData?str=';

// Both stay conditional: income, CAP admission and attendance are not in the profile.
export const mahadbt = [
  mahadbtScheme({
    slug: 'post-matric-obc',
    title: 'Post Matric Scholarship to OBC Students',
    matchReason: 'OBC + Maharashtra + B.Tech · needs family income ≤ ₹2.5 lakh, CAP admission and 75% attendance',
    url: `${SCHEME_PAGE}E9DDFA703C38E51AB02E984835E89FEFDB316E301CE6A991F41C5D42B01A7D7E`,
    matchedOn: ['category=OBC', 'state=Maharashtra', 'course=btech'],
  }),
  mahadbtScheme({
    slug: 'tuition-exam-fees-obc',
    title: 'Tuition Fees and Examination Fees to OBC Students',
    matchReason: 'OBC + Maharashtra + engineering degree · needs CAP admission (not a deemed university); income rule unclear (the page states none)',
    url: `${SCHEME_PAGE}E9DDFA703C38E51A19A7691F3B40AD4EE0F3DDA5DE324AC54819922BB3D36B63`,
    matchedOn: ['category=OBC', 'state=Maharashtra', 'course=btech'],
  }),
];

// Read on the same scheme pages but NOT a match for an OBC student; the fake run
// shows them as honest "skipped" lines instead of listing them in the plan.
// Schemes read during recon that do not apply to the sample student (shown as "Not applicable").
export const NOT_APPLICABLE = [
  { title: 'AICTE - Pragati Scholarship Scheme (Technical Degree)', reason: 'For girl students only; the profile is male.', sourceUrl: NSP_ALL },
  { title: 'PM YASASVI Central Sector Scheme Of Top Class Education In Schools For OBC, EBC And DNT Students', reason: 'School students only; he is in college.', sourceUrl: NSP_ALL },
];

export const MAHADBT_SKIPPED = [
  {
    title: 'Rajarshri Chhatrapati Shahu Maharaj Fee Reimbursement Scheme',
    reason: 'meant for EBC/EWS students; OBC students use the OBC schemes (unclear, not a hard fail)',
    sourceUrl: `${SCHEME_PAGE}E9DDFA703C38E51A7F4D327BDEB7125DE0BA4AE1C51180C272281017EBEF6F7C`,
  },
  {
    title: 'Dr Panjabrao Deshmukh Hostel Maintenance Allowance',
    reason: 'only General and SEBC category admissions are eligible',
    sourceUrl: `${SCHEME_PAGE}E9DDFA703C38E51A3D30C2CB15631E4E31F4E2AFF5E4258B33E89887D583052E`,
  },
];

// MahaDBT 2.0 returned proxy_error twice in the 2026-10-24 recon (RECON_FINDINGS).
export const MAHADBT2_FAILURE = {
  url: 'https://mahadbt2.maharashtra.gov.in/',
  code: 'proxy_error',
  message: 'MahaDBT 2.0 did not load through the TinyFish proxy (same as in recon)',
};

export const foundations = [
  {
    id: 'buddy4study:hdfc-parivartan-ecss-ug',
    kind: 'scholarship',
    title: 'Parivartan ECSS Programme for Undergraduate Students (Merit-cum-Need Based) 2026-27',
    deadline: '2026-10-31',
    deadlineLabel: 'Application closes',
    sourceUrl: 'https://www.buddy4study.com/page/hdfc-bank-parivartans-ecss-programme',
    matchReason: 'B.Tech named as eligible · needs 55%+ in the last exam and family income ≤ ₹2.5 lakh',
    source: 'buddy4study',
    dateSource: 'parsed',
    evidence: 'EligibilityDeadline Date: 31-Oct-2026',
    matchedOn: ['course=btech'],
    bubble: 'HDFC Parivartan (UG, B.Tech): 31 Oct',
    via: 'fetch',
    cached: false,
    scholarship: { portal: 'external', schemeType: 'Merit', openFrom: null, verificationTill: null, conditional: true },
  },
];

// Read in recon; B.Tech is neither named nor excluded, so it is listed as "unclear".
foundations.push({
  id: 'buddy4study:tata-capital-pankh-general-ug',
  kind: 'scholarship',
  fit: 'unclear',
  title: 'Tata Capital Pankh Scholarship Programme for General Graduation Students (2026-27)',
  deadline: '2026-10-26',
  deadlineLabel: 'Application closes',
  sourceUrl: 'https://www.buddy4study.com/page/the-tata-capital-pankh-scholarship-programme',
  matchReason: 'Unclear: "General Graduation" names B.Com, B.Sc and B.A; B.Tech is neither named nor excluded · income ≤ ₹4 lakh, 60%+ marks',
  amount: 'up to INR 15,000',
  source: 'buddy4study',
  dateSource: 'parsed',
  evidence: 'EligibilityDeadline Date: 26-Oct-2026',
  matchedOn: [],
  bubble: 'Tata Pankh (unclear for B.Tech): 26 Oct',
  via: 'fetch',
  cached: false,
  needsVerification: true,
  scholarship: { portal: 'external', schemeType: 'Merit', openFrom: null, verificationTill: null, conditional: true },
});

// Kept for the progress line; the scheme itself is listed above as "unclear".
export const FOUNDATIONS_SKIPPED = {
  title: 'Tata Capital Pankh Scholarship Programme for General Graduation / Polytechnic / Diploma / ITI Students (2026–27)',
  reason: 'unclear: "General Graduation" names B.Com, B.Sc and B.A, and B.Tech is neither named nor excluded',
  sourceUrl: 'https://www.buddy4study.com/page/the-tata-capital-pankh-scholarship-programme',
};

const hackathon = (o) => ({ kind: 'hackathon', dateSource: 'parsed', via: 'fetch', cached: false, ...o });

export const opportunities = [
  hackathon({
    id: 'devpost:nebius-nvidia-global-ai',
    title: 'Nebius x NVIDIA Global AI Hackathon',
    deadline: '2026-10-30',
    deadlineLabel: 'Submissions close',
    sourceUrl: 'https://nebiusglobalaihackathon.devpost.com/',
    matchReason: 'Online, open to students, AI / beginner friendly',
    source: 'devpost',
    evidence: '"submission_period_dates":"Aug 26 - Oct 30, 2026"',
    matchedOn: ['mode=online'],
    bubble: 'Nebius x NVIDIA AI hack: submit by 30 Oct',
    event: { startsOn: '2026-08-26', endsOn: '2026-10-30', mode: 'online', location: 'Online', organiser: 'Nebius x NVIDIA' },
  }),
  hackathon({
    id: 'mlh:hackcbs-9',
    title: 'hackCBS 9.O',
    deadline: '2026-10-31',
    deadlineLabel: 'Event starts',
    sourceUrl: 'https://mlh.io/seasons/2027/events',
    matchReason: 'MLH hackathon in India (New Delhi), in person',
    source: 'mlh',
    evidence: 'hackCBS 9.O · OCT 31 - NOV 01 · New delhi, New delhi, IN · In-Person',
    matchedOn: ['country=IN'],
    bubble: 'hackCBS 9.O, New Delhi: 31 Oct',
    event: { startsOn: '2026-10-31', endsOn: '2026-11-01', mode: 'in-person', location: 'New Delhi, IN', organiser: 'hackCBS' },
  }),
  hackathon({
    id: 'devfolio:lean-in-hacks-8',
    title: 'Lean In Hacks 8.0',
    deadline: '2026-10-31',
    deadlineLabel: 'Hackathon starts',
    sourceUrl: 'https://devfolio.co/hackathons',
    matchReason: 'Online, no theme restrictions',
    source: 'devfolio',
    evidence: 'Lean In Hacks 8.0 · Online · Open · Starts 31/10/26',
    matchedOn: ['mode=online'],
    bubble: 'Lean In Hacks 8.0 (online): starts 31 Oct',
    event: { startsOn: '2026-10-31', endsOn: null, mode: 'online', location: 'Online', organiser: null },
  }),
  hackathon({
    id: 'devfolio:hackodisha-6',
    title: 'hackodisha-6.0',
    deadline: '2026-10-31',
    deadlineLabel: 'Hackathon starts',
    sourceUrl: 'https://devfolio.co/hackathons',
    matchReason: 'Online, 1000+ participating, no theme restrictions',
    source: 'devfolio',
    evidence: 'hackodisha-6.0 · Online · Open · Starts 31/10/26',
    matchedOn: ['mode=online'],
    bubble: 'hackodisha 6.0 (online): starts 31 Oct',
    event: { startsOn: '2026-10-31', endsOn: null, mode: 'online', location: 'Online', organiser: null },
  }),
  hackathon({
    id: 'unstop:chaoscore-2026',
    title: 'ChaosCore Hackathon 2026',
    deadline: '2026-11-06',
    deadlineLabel: 'Registration closes',
    sourceUrl: 'https://unstop.com/hackathons/chaoscore-hackathon-2026-invoqe-1774071',
    matchReason: 'Online, open innovation, team of 1–4',
    source: 'unstop',
    dateSource: 'snippet',
    via: 'search',
    evidence: '06 Nov 26, 06:29 PM CUT Registration Deadline',
    matchedOn: ['mode=online'],
    bubble: 'ChaosCore (online): register by 6 Nov',
    event: { startsOn: '2026-10-23', endsOn: '2026-11-15', mode: 'online', location: 'Online', organiser: 'Invoqe' },
  }),
  hackathon({
    id: 'hackerearth:agentic-banking-2',
    title: 'Agentic Banking Hackathon',
    deadline: '2026-11-13',
    deadlineLabel: 'Challenge ends',
    sourceUrl: 'https://www.hackerearth.com/challenges/hackathon/agentic-banking-hackathon-2/',
    matchReason: 'Online, ongoing, AI agents',
    source: 'hackerearth',
    evidence: '"end_tz": "2026-11-13 23:59:00+05:30"',
    matchedOn: ['mode=online'],
    bubble: 'Agentic Banking hack: ends 13 Nov',
    event: { startsOn: '2026-10-05', endsOn: '2026-11-13', mode: 'online', location: 'Online', organiser: 'HackerEarth' },
  }),
];

// Everything above was read on the recon date (docs/RECON_FINDINGS.md).
export const RECON_CHECKED_AT = '2026-10-24T10:00:00+05:30';
for (const o of [...nsp, ...mahadbt, ...foundations, ...opportunities]) o.checkedAt ??= RECON_CHECKED_AT;
