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
    matchReason: 'OBC + B.Tech (college)',
    source: 'nsp',
    dateSource: 'parsed',
    evidence: 'Student Application Open till : 31-10-2026',
    matchedOn: ['category=OBC', 'course=btech'],
    bubble: 'PM YASASVI (OBC, college): closes 31 Oct!',
    via: 'fetch',
    cached: false,
    scholarship: { portal: 'nsp', schemeType: 'Merit', openFrom: '2026-06-01', verificationTill: '2026-11-15', conditional: false },
  },
  {
    id: 'nsp:pm-usp-csss',
    kind: 'scholarship',
    title: 'PM-USP – Central Sector Scheme Of Scholarship For College And University Students (CSSS)',
    deadline: '2026-10-31',
    deadlineLabel: 'Student application closes',
    sourceUrl: NSP_ALL,
    matchReason: 'College student, merit scheme (renewals only on NSP right now)',
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
    matchReason: 'B.Tech (technical degree). Only for orphans and wards of martyred armed forces personnel',
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

const mahadbtScheme = (slug, title, matchReason, conditional = false) => ({
  id: `mahadbt:${slug}`,
  kind: 'scholarship',
  title,
  deadline: null,
  deadlineLabel: 'Not published (apply on MahaDBT 2.0)',
  sourceUrl: MAHADBT,
  matchReason,
  source: 'mahadbt',
  dateSource: 'none',
  evidence: title,
  matchedOn: ['category=OBC', 'state=Maharashtra'],
  bubble: `${title.slice(0, 44)}…`,
  via: 'fetch',
  cached: false,
  scholarship: { portal: 'mahadbt2', schemeType: null, openFrom: null, verificationTill: null, conditional },
});

export const mahadbt = [
  mahadbtScheme('post-matric-obc', 'Post Matric Scholarship to OBC Students', 'OBC + Maharashtra + post-matric course'),
  mahadbtScheme('tuition-exam-fees-obc', 'Tuition Fees and Examination Fees to OBC Students', 'OBC + Maharashtra'),
  mahadbtScheme('shahu-fee-reimbursement', 'Rajarshri Chhatrapati Shahu Maharaj Fee Reimbursement Scheme', 'Maharashtra + professional course (income limit applies)', true),
  mahadbtScheme('panjabrao-hostel', 'Dr Panjabrao Deshmukh Hostel Maintenance Allowance', 'Maharashtra + professional course (only if living in a hostel)', true),
];

export const foundations = [
  {
    id: 'buddy4study:hdfc-parivartan-ecss-ug',
    kind: 'scholarship',
    title: 'Parivartan ECSS Programme for Undergraduate Students (Merit-cum-Need Based) 2026-27',
    deadline: '2026-10-31',
    deadlineLabel: 'Application closes',
    sourceUrl: 'https://www.buddy4study.com/page/hdfc-bank-parivartans-ecss-programme',
    matchReason: 'UG professional course (B.Tech named), 55%+ marks, family income ≤ ₹2.5 lakh',
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

// Seen but not matched for this persona, kept here so the fake run can show an honest "skipped".
export const FOUNDATIONS_SKIPPED = {
  title: 'Tata Capital Pankh Scholarship Programme for General Graduation / Polytechnic / Diploma / ITI Students (2026–27)',
  reason: 'General graduation only; B.Tech is a professional degree',
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
