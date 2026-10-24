import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, buildTimeline, exportableItems, filterItems, typeOf } from '../src/lib/planTools.js';

const TODAY = '2026-10-24';
const items = [
  { opportunityId: 'nsp:a', title: 'PM YASASVI College', kind: 'scholarship', source: 'nsp', deadline: '2026-10-31', fit: 'conditional', dateSource: 'parsed', sourceUrl: 'https://scholarships.gov.in/All-Scholarships', verification: { status: 'verified' }, evidence: 'Student Application Open till : 31-10-2026' },
  { opportunityId: 'b4s:b', title: 'IDFC FIRST Engineering', kind: 'scholarship', source: 'buddy4study', deadline: '2026-10-25', fit: 'conditional', dateSource: 'parsed', sourceUrl: 'https://www.buddy4study.com/page/x', verification: { status: 'changed' } },
  { opportunityId: 'm:c', title: 'Post Matric Scholarship to OBC Students', kind: 'scholarship', source: 'mahadbt', deadline: null, fit: 'conditional', dateSource: 'none', sourceUrl: 'https://mahadbt.maharashtra.gov.in/x' },
  { opportunityId: 'dp:d', title: 'PayPal AI Hackathon', kind: 'hackathon', source: 'devpost', deadline: '2026-11-12', fit: 'match', dateSource: 'parsed', sourceUrl: 'https://devpost.com/api/hackathons', verification: { status: 'verified' } },
  { opportunityId: 'he:e', title: 'Old Thing', kind: 'event', source: 'hackerearth', deadline: '2026-10-01', fit: 'unclear', dateSource: 'parsed', sourceUrl: 'https://www.hackerearth.com/x' },
];

test('timeline: days left, closing-soon under 7 days, a separate no-deadline lane, past items left out', () => {
  const t = buildTimeline(items, TODAY);
  assert.deepEqual(t.dated.map((d) => [d.item.opportunityId, d.daysLeft, d.soon]), [['b4s:b', 1, true], ['nsp:a', 7, false], ['dp:d', 19, false]]);
  assert.deepEqual(t.undated.map((i) => i.opportunityId), ['m:c']);
  assert.equal(t.span, 21);
  assert.equal(t.dated[0].pos, 1 / 21);
  assert.deepEqual(t.ticks, [0, 7, 14, 21]);
  assert.equal(buildTimeline([], TODAY).span, 14);
});

test('filters: status, type (central / state / private / hackathon), verified only, text search', () => {
  assert.deepEqual(items.map(typeOf), ['central', 'private', 'state', 'hackathon', 'hackathon']);
  const ids = (f) => filterItems(items, f).map((i) => i.opportunityId);
  assert.equal(ids({}).length, 5);
  assert.deepEqual(ids({ fits: ['match'] }), ['dp:d']);
  assert.deepEqual(ids({ types: ['central', 'state'] }), ['nsp:a', 'm:c']);
  assert.deepEqual(ids({ verifiedOnly: true }), ['nsp:a', 'dp:d']);
  assert.deepEqual(ids({ q: 'idfc' }), ['b4s:b']);
  assert.deepEqual(ids({ fits: ['conditional'], types: ['private', 'central'], q: 'pm ' }), ['nsp:a']);
  // the verifier result may come from the event stream instead of the item
  assert.deepEqual(filterItems([{ ...items[2] }], { verifiedOnly: true }, { 'm:c': { status: 'verified' } }).length, 1);
});

test('.ics: only deadlines read from fetched text; nothing for "not published"; valid all-day events', () => {
  const extra = { opportunityId: 'x', title: 'Guessed', deadline: '2026-11-01', dateSource: 'none', sourceUrl: 'https://e.x' };
  assert.deepEqual(exportableItems([...items, extra]).map((i) => i.opportunityId), ['nsp:a', 'b4s:b', 'dp:d', 'he:e']);
  const ics = buildIcs([...items, extra], { now: new Date('2026-10-24T18:00:00Z') });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 4);
  assert.match(ics, /DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101/);
  assert.ok(!ics.includes('Post Matric'), 'no event for a deadline that is not published');
  assert.ok(!ics.includes('Guessed'));
  const unfolded = ics.replace(/\r\n /g, ''); // RFC 5545 line folding
  assert.match(unfolded, /Evidence: Student Application Open till : 31-10-2026/);
  for (const line of ics.split('\r\n')) assert.ok(line.length <= 75, `line too long: ${line}`);
});
