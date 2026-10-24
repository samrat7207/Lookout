import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAllScholarships, findStudentClosingDate } from '../src/parse/nsp.js';

const fixture = readFileSync(new URL('./fixtures/nsp-all-scholarships.md', import.meta.url), 'utf8');
const schemes = parseAllScholarships(fixture);
const byName = (re) => schemes.find((s) => re.test(s.name));

test('parses every scheme block in the 2026-10-24 fixture', () => {
  assert.equal(schemes.length, 31);
  assert.ok(schemes.every((s) => s.applyTill), 'every scheme has a student apply-till date');
  assert.ok(schemes.every((s) => s.name && !s.name.includes('Based Scheme')));
  assert.equal(new Set(schemes.map((s) => s.slug)).size, schemes.length, 'slugs are unique');
});

test('persona schemes have the dates seen in recon', () => {
  const college = byName(/PM YASASVI .* In College/);
  assert.equal(college.applyTill, '2026-10-31');
  assert.equal(college.openFrom, '2026-06-01');
  assert.equal(college.verificationTill, '2026-11-15');
  assert.equal(college.schemeType, 'Merit');
  assert.equal(college.evidence, 'Student Application Open till : 31-10-2026');

  const schools = byName(/PM YASASVI .* In Schools/);
  assert.equal(schools.openFrom, '2026-10-22');
  assert.equal(schools.applyTill, '2026-11-30');

  const pragati = byName(/Pragati .*Technical Degree/);
  assert.equal(pragati.applyTill, '2026-10-31');
  assert.equal(pragati.name, 'AICTE - Pragati Scholarship Scheme For Girl Students (Technical Degree)');
});

test('"(for Renewal)" labels parse and are flagged', () => {
  const csss = byName(/CSSS/);
  assert.equal(csss.applyTill, '2026-10-31');
  assert.equal(csss.openFrom, '2026-06-01');
  assert.equal(csss.verificationTill, '2026-11-15');
  assert.equal(csss.renewalOnly, true);
  assert.equal(byName(/NEC Merit/).renewalOnly, true);
  assert.equal(byName(/PM YASASVI .* In College/).renewalOnly, false);
});

test('welfare schemes are typed', () => {
  assert.equal(byName(/Swanath Scholarship Scheme \(Technical Degree\)/).schemeType, 'Welfare');
});

test('handles CRLF, stray headings, spacing variants and missing dates', () => {
  const md = [
    '###### ',
    '###### Test Scheme A ( Technical Degree) (Merit Based Scheme)',
    'Scheme Open from:01-06-2026 ',
    'Student Application Open till :   31-10-2026',
    'Institute Verification Open till : 15-11-2026',
    '###### Test Scheme B (Welfare Based Scheme)',
    'Student Application Open till : 31-02-2026',
    '###### Not a scheme heading',
    'Student Application Open till : 01-01-2030',
  ].join('\r\n');
  const out = parseAllScholarships(md);
  assert.equal(out.length, 2);
  assert.deepEqual(
    { name: out[0].name, openFrom: out[0].openFrom, applyTill: out[0].applyTill, verificationTill: out[0].verificationTill, defectiveTill: out[0].defectiveTill },
    { name: 'Test Scheme A (Technical Degree)', openFrom: '2026-06-01', applyTill: '2026-10-31', verificationTill: '2026-11-15', defectiveTill: null },
  );
  assert.equal(out[1].applyTill, null, 'impossible date 31-02 is rejected, not shifted');
  assert.equal(parseAllScholarships('no schemes here').length, 0);
});

test('finds the headline closing date in the home announcement and the search snippet', () => {
  const home =
    'is currently open in NSP. Closing dates for student application is 31-10-2026 and closing date for institute verification is : 15-11-2026';
  assert.deepEqual(findStudentClosingDate(home), {
    date: '2026-10-31',
    evidence: 'Closing dates for student application is 31-10-2026',
  });
  assert.equal(findStudentClosingDate('nothing to see'), null);
});
