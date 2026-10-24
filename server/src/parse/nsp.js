// NSP parsers (deterministic, APPROACH D3). Input is the Fetch markdown of
// https://scholarships.gov.in/All-Scholarships; see RECON_FINDINGS §1 for the format:
//
//   ###### <Scheme Name> (<Merit|Welfare> Based Scheme)
//   Scheme Open from : 01-06-2026
//   Student Application Open till : 31-10-2026
//   Defective Application Verification Open till:15-11-2026
//   Institute Verification Open till:15-11-2026
//   DNO/SNO/MNO Verification Open till:30-11-2026
//
// Variants: "(for Renewal)" after any label, "till :" vs "till:", empty "######" headings, CRLF.

export const NSP_ALL_SCHOLARSHIPS_URL = 'https://scholarships.gov.in/All-Scholarships';

const HEADING = /^#{6}\s+(.+?)\s*\((Merit|Welfare) Based Scheme\)\s*$/;
const DATE = '(\\d{2})-(\\d{2})-(\\d{4})';

const FIELDS = {
  openFrom: 'Scheme Open from',
  applyTill: 'Student Application Open till',
  defectiveTill: 'Defective Application Verification Open till',
  verificationTill: 'Institute Verification Open till',
  officerVerificationTill: 'DNO/SNO/MNO Verification Open till',
};

const fieldRegex = (label) => new RegExp(`^\\s*${label.replace(/\//g, '\\/')}\\s*(\\(for Renewal\\))?\\s*:\\s*${DATE}`, 'm');

/** "31-10-2026" parts -> "2026-10-31", or null if it is not a real calendar date. */
function toIso(dd, mm, yyyy) {
  const iso = `${yyyy}-${mm}-${dd}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(dd) ? null : iso;
}

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanName(raw) {
  return raw.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s{2,}/g, ' ').trim();
}

/**
 * @param {string} markdown
 * @returns {Array<{ name: string, slug: string, schemeType: 'Merit'|'Welfare', openFrom: string|null,
 *   applyTill: string|null, defectiveTill: string|null, verificationTill: string|null,
 *   officerVerificationTill: string|null, renewalOnly: boolean, evidence: string|null }>}
 */
export function parseAllScholarships(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const schemes = [];
  let current = null;

  const finish = () => {
    if (!current) return;
    const body = current.body.join('\n');
    const scheme = { name: current.name, slug: slugify(current.name), schemeType: current.type };
    let renewalOnly = false;
    let evidence = null;
    for (const [key, label] of Object.entries(FIELDS)) {
      const m = body.match(fieldRegex(label));
      scheme[key] = m ? toIso(m[2], m[3], m[4]) : null;
      if (key === 'applyTill' && m) {
        renewalOnly = Boolean(m[1]);
        evidence = m[0].trim();
      }
    }
    scheme.renewalOnly = renewalOnly;
    scheme.evidence = evidence;
    schemes.push(scheme);
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith('#')) {
      finish();
      const m = line.match(HEADING);
      if (m) current = { name: cleanName(m[1]), type: m[2], body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  finish();
  return schemes;
}

/**
 * Finds the headline closing date in free text (home page announcement or a Search snippet), e.g.
 * "Closing dates for student application is 31-10-2026". Returns { date, evidence } or null.
 */
export function findStudentClosingDate(text) {
  const m = text.match(new RegExp(`closing dates? for student application(?:s)? (?:is|are)\\s*:?\\s*${DATE}`, 'i'));
  if (!m) return null;
  const date = toIso(m[1], m[2], m[3]);
  return date && { date, evidence: m[0] };
}
