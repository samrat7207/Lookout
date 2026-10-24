import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffItem, isKnownSource, recheck } from '../src/watch/watchtower.js';
import { parseAllScholarships } from '../src/parse/nsp.js';
import { parseDevpost, parseHackerEarth, parseDevpostPeriod } from '../src/parse/opps.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const NSP = fixture('nsp-all-scholarships.md');
const DEVPOST = fixture('devpost-hackathons.md');
const TODAY = '2026-10-24';
const yas = parseAllScholarships(NSP).find((s) => /Top Class Education In College For OBC/.test(s.name));
const nspItem = { opportunityId: 'nsp:y', title: yas.name, deadline: yas.applyTill, source: 'nsp', sourceUrl: 'https://scholarships.gov.in/All-Scholarships' };

test('diff: same date is "no change"; a different date says from and to; a missing item says no longer listed', () => {
  assert.equal(diffItem(nspItem, NSP, TODAY).status, 'no-change');

  const moved = NSP.replace(/(Top Class Education In College For OBC[\s\S]*?Student Application Open till\s*:\s*)31-10-2026/, '$115-11-2026');
  const d = diffItem(nspItem, moved, TODAY);
  assert.equal(d.status, 'changed');
  assert.equal(d.from, '2026-10-31');
  assert.equal(d.to, '2026-11-15');

  const gone = diffItem({ ...nspItem, title: 'A Scheme That Was Withdrawn' }, NSP, TODAY);
  assert.equal(gone.status, 'changed');
  assert.match(gone.reason, /No longer listed/);
});

test('diff: unrelated text changes on the page are not reported', () => {
  const noisy = `${NSP}\n\nVisitors today: 123456. New banner: Helpdesk timings changed.`;
  assert.equal(diffItem(nspItem, noisy, TODAY).status, 'no-change');
});

test('diff on the hackathon feeds and on pages with no published deadline', () => {
  const first = parseDevpost(DEVPOST)[0];
  const item = { opportunityId: 'devpost:x', title: first.title, deadline: first.end, source: 'devpost', sourceUrl: 'https://devpost.com/api/hackathons?status[]=upcoming&status[]=open' };
  assert.equal(diffItem(item, DEVPOST, TODAY).status, 'no-change');
  assert.equal(diffItem({ ...item, deadline: '2026-12-01' }, DEVPOST, TODAY).status, 'changed');
  const he = parseHackerEarth(fixture('hackerearth-events.md'))[0];
  assert.equal(diffItem({ ...item, title: he.title, deadline: he.end, source: 'hackerearth' }, fixture('hackerearth-events.md'), TODAY).status, 'no-change');
  const mahadbt = { opportunityId: 'm', title: 'Post Matric Scholarship to OBC Students', deadline: null, source: 'mahadbt', sourceUrl: 'https://mahadbt.maharashtra.gov.in/x' };
  assert.equal(diffItem(mahadbt, '# Post Matric Scholarship to OBC Students\nEligibility...', TODAY).status, 'no-change');
});

test('Devpost periods: same month, two months, across years', () => {
  assert.deepEqual(parseDevpostPeriod('Oct 01 - Nov 12, 2026'), { start: '2026-10-01', end: '2026-11-12' });
  assert.deepEqual(parseDevpostPeriod('Nov 01 - 03, 2026'), { start: '2026-11-01', end: '2026-11-03' });
  assert.deepEqual(parseDevpostPeriod('Dec 20 - Jan 05, 2027'), { start: '2026-12-20', end: '2027-01-05' });
  assert.deepEqual(parseDevpostPeriod('Dec 15, 2026 - Jan 10, 2027'), { start: '2026-12-15', end: '2027-01-10' });
  assert.deepEqual(parseDevpostPeriod('soon'), { start: null, end: null });
});

test('recheck: only known hosts, cache bypassed, failures reported as unchecked', async () => {
  assert.equal(isKnownSource('https://scholarships.gov.in/All-Scholarships'), true);
  assert.equal(isKnownSource('https://evil.example/'), false);
  assert.equal(isKnownSource('http://scholarships.gov.in/'), false);
  const seen = [];
  const gk = {
    async fetchPages({ urls, ttl }) {
      seen.push({ urls, ttl });
      return { results: urls.filter((u) => u.includes('scholarships')).map((url) => ({ url, text: NSP, fetchedAt: 'T' })), errors: urls.filter((u) => !u.includes('scholarships')).map((url) => ({ url, error: 'proxy_error' })) };
    },
  };
  const out = await recheck([nspItem, { ...nspItem, opportunityId: 'b', source: 'buddy4study', sourceUrl: 'https://www.buddy4study.com/page/x' }, { ...nspItem, opportunityId: 'c', sourceUrl: 'https://evil.example/' }], gk, { today: TODAY });
  assert.equal(seen[0].ttl, 0);
  assert.ok(!seen[0].urls.includes('https://evil.example/'));
  assert.deepEqual(out.results.map((r) => r.status), ['no-change', 'unchecked', 'unchecked']);
  assert.deepEqual([out.summary.changed, out.summary.noChange, out.summary.unchecked], [0, 1, 2]);
});
