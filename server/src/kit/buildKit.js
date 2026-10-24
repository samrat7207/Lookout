// Application Kit (EVENT_SCHEMA v2): documents, persona-prefilled fields, steps,
// deadline and source link for one scholarship. READ-ONLY and PREFILL-ONLY:
// Lookout never submits forms and never asks for, enters or stores passwords,
// OTPs or Aadhaar numbers. assertKitSafe() enforces that for every kit we emit.

import { daysBetween } from '../rank/ranker.js';

export const SAFETY_NOTICE =
  'Lookout never submits forms and never asks for, enters or stores passwords, OTPs or Aadhaar numbers.';

const SENSITIVE_LABEL = /aadhaar|otp|password|passcode|pin\b|bank|account|ifsc|upi|card/i;

const PORTALS = {
  nsp: {
    name: 'NSP',
    applyUrl: 'https://scholarships.gov.in/',
    sensitive: ['Aadhaar number', 'OTP sent to your mobile', 'Bank account and IFSC'],
    steps: (opp, deadline) => [
      'Complete OTR (One Time Registration) on NSP yourself. It is Aadhaar based, so Lookout does not touch it.',
      `Log in with your OTR ID and choose "${opp.title}".`,
      'Fill the fields below and upload the documents.',
      `Submit before ${deadline}.`,
      ...(opp.scholarship?.verificationTill
        ? [`Ask your institute to verify your application before ${fmt(opp.scholarship.verificationTill)}.`]
        : []),
    ],
  },
  mahadbt2: {
    name: 'MahaDBT 2.0',
    applyUrl: 'https://mahadbt2.maharashtra.gov.in/',
    sensitive: ['Aadhaar number', 'Portal password', 'OTP sent to your mobile', 'Bank account and IFSC'],
    steps: (opp) => [
      'AY 2026-27 applications are accepted only on MahaDBT 2.0. Register or log in there yourself.',
      `Choose "${opp.title}" in the scheme list.`,
      'Fill the fields below and upload the documents. Read the exact list on the scheme page first.',
      'The deadline is not published on the scheme page. Check the MahaDBT 2.0 notices.',
    ],
  },
  external: {
    name: 'the provider site',
    applyUrl: null,
    sensitive: ['Portal password', 'OTP sent to your mobile', 'Bank account and IFSC'],
    steps: (opp, deadline) => [
      'Open the source page, and sign up or log in there yourself.',
      `Choose "${opp.title}" and press Apply.`,
      'Fill the fields below and upload the documents.',
      `Submit before ${deadline}.`,
    ],
  },
};

function fmt(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function documentsFor(opp, profile) {
  // `from: null` means "usually needed" and was not read from a page. Scouts that parse a
  // Documents Required section (MahaDBT, M3) pass opp.documents with real `from` URLs.
  if (opp.documents?.length) return opp.documents;
  const docs = [];
  if (['OBC', 'SC', 'ST'].includes(profile.category)) {
    docs.push({ name: `Caste certificate (${profile.category})`, why: `category=${profile.category}`, from: null });
    if (profile.category === 'OBC') docs.push({ name: 'Non-creamy layer certificate', why: 'category=OBC', from: null });
  }
  docs.push({ name: 'Income certificate (family)', why: 'most schemes are means-tested', from: null });
  docs.push({ name: 'Previous year marksheet', why: 'academic eligibility', from: null });
  docs.push({ name: 'Fee receipt or bonafide certificate from your college', why: 'proof of current enrolment', from: null });
  if (opp.scholarship?.portal === 'mahadbt2') docs.push({ name: 'Domicile certificate (Maharashtra)', why: 'state scheme', from: null });
  docs.push({ name: 'Passport-size photo', why: 'usually asked for', from: null });
  return docs;
}

function fieldsFor(profile, portal) {
  const persona = [
    ['Course', profile.courseLabel],
    ['Branch', profile.branch],
    ['Category', profile.category],
    ['Domicile state', profile.state],
    ['Gender', profile.gender && profile.gender[0].toUpperCase() + profile.gender.slice(1)],
  ]
    .filter(([, v]) => v)
    .map(([label, value]) => ({ label, value, from: 'persona' }));

  const student = ['Annual family income', 'Institute name and code', 'Marks in last exam (%)'].map((label) => ({
    label,
    value: null,
    from: 'student',
  }));

  const sensitive = portal.sensitive.map((label) => ({
    label,
    value: null,
    from: 'student',
    sensitive: true,
    note: `Enter this yourself on ${portal.name}. Lookout never asks for it.`,
  }));

  return [...persona, ...student, ...sensitive];
}

/** Throws if any kit field could carry a secret. Every kit goes through this before it is emitted. */
export function assertKitSafe(kit) {
  for (const f of kit.fields) {
    const looksSensitive = SENSITIVE_LABEL.test(f.label);
    if ((f.sensitive || looksSensitive) && f.value !== null) {
      throw new Error(`kit ${kit.id}: sensitive field "${f.label}" must have value null`);
    }
    if (looksSensitive && !f.sensitive) throw new Error(`kit ${kit.id}: field "${f.label}" must be marked sensitive`);
  }
  if (kit.safety !== SAFETY_NOTICE) throw new Error(`kit ${kit.id}: missing safety notice`);
  return kit;
}

export function buildKit(opp, profile, { today }) {
  if (opp.kind !== 'scholarship') throw new Error(`kits are for scholarships, got ${opp.kind}`);
  const portal = PORTALS[opp.scholarship?.portal] ?? PORTALS.external;
  const deadlineText = opp.deadline ? fmt(opp.deadline) : 'the published deadline';

  return assertKitSafe({
    id: `kit:${opp.id}`,
    opportunityId: opp.id,
    title: opp.title,
    deadline: opp.deadline,
    daysLeft: opp.deadline ? daysBetween(today, opp.deadline) : null,
    sourceUrl: opp.sourceUrl,
    applyUrl: portal.applyUrl ?? opp.sourceUrl,
    documents: documentsFor(opp, profile),
    fields: fieldsFor(profile, portal),
    steps: portal.steps(opp, deadlineText),
    safety: SAFETY_NOTICE,
    needsVerification: opp.needsVerification ?? false,
    generatedFrom: [...new Set([opp.sourceUrl, portal.applyUrl].filter(Boolean))],
  });
}
