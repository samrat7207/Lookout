import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHistory, diffPlans } from '../src/history/history.js';
import { rejudgePlan } from '../src/rank/rejudge.js';
import { createRun } from '../src/bus.js';
import { runFake } from '../src/fakeAgents.js';
import { SAMPLE_STUDENT } from '../src/fake/reconData.js';

const item = (id, deadline, extra = {}) => ({ opportunityId: id, title: id, kind: 'scholarship', deadline, fit: 'conditional', verification: { status: 'verified' }, ...extra });

test('history diff: added, removed, newly closed, deadline moved, fit and verification changes', () => {
  const a = { items: [item('same', '2026-10-31'), item('moved', '2026-10-31'), item('gone', '2026-11-30'), item('closes', '2026-10-25'), item('fit', null), item('ver', '2026-11-01')] };
  const b = {
    items: [item('same', '2026-10-31'), item('moved', '2026-11-15'), item('new', '2026-12-01'), item('fit', null, { fit: 'match' }), item('ver', '2026-11-01', { verification: { status: 'changed' } })],
    missed: [item('closes', '2026-10-25')],
  };
  const d = diffPlans(a, b);
  assert.deepEqual(d.added.map((x) => x.opportunityId), ['new']);
  assert.deepEqual(d.removed.map((x) => x.opportunityId), ['gone']);
  assert.deepEqual(d.newlyClosed.map((x) => x.opportunityId), ['closes']);
  assert.deepEqual(d.deadlineMoved, [{ opportunityId: 'moved', title: 'moved', kind: 'scholarship', deadline: '2026-11-15', from: '2026-10-31', to: '2026-11-15' }]);
  assert.deepEqual(d.fitChanged.map((x) => [x.from, x.to]), [['conditional', 'match']]);
  assert.deepEqual(d.verificationChanged.map((x) => [x.from, x.to]), [['verified', 'changed']]);
  assert.equal(d.unchanged, 1);
});

test('history store keeps the newest 20 and replaces an entry with the same id', () => {
  const h = createHistory(join(mkdtempSync(join(tmpdir(), 'hist-')), 'h.json'), 20);
  for (let i = 0; i < 25; i++) h.add({ id: `r${i}`, savedAt: String(i) });
  assert.equal(h.list().length, 20);
  assert.equal(h.list()[0].id, 'r24');
  assert.equal(h.get('r0'), null);
  h.add({ id: 'r24', savedAt: 'again' });
  assert.equal(h.list().filter((e) => e.id === 'r24').length, 1);
});

test('re-judge: known income applies the scheme limits; unknowns never drop anything', async () => {
  const run = createRun();
  await runFake(run, { pace: 0 });
  run.close();
  const plan = run.history.findLast((e) => e.kind === 'plan.ready').payload;

  const same = rejudgePlan(plan, SAMPLE_STUDENT);
  assert.equal(same.items.length, plan.items.length, 'no edits: nothing moves');

  const rich = rejudgePlan(plan, { ...SAMPLE_STUDENT, familyIncome: 600000 });
  const titles = rich.items.map((i) => i.title);
  assert.ok(!titles.some((t) => /Top Class Education In College For OBC/.test(t)), 'PM YASASVI limit is 2.5 lakh');
  assert.ok(!titles.some((t) => /CSSS/.test(t)), 'CSSS limit is 4.5 lakh');
  assert.ok(titles.some((t) => /Swanath/.test(t)), 'Swanath limit is 8 lakh');
  assert.ok(rich.notApplicable.some((n) => /above this scheme's ₹2.5 lakh limit/.test(n.reason)));
  assert.ok(rich.rejudged.moved.length >= 2);

  const poor = rejudgePlan(plan, { ...SAMPLE_STUDENT, familyIncome: 200000 });
  const y = poor.items.find((i) => /Top Class Education In College For OBC/.test(i.title));
  assert.match(y.why, /^Income within the ₹2.5 lakh limit/);

  const noCap = rejudgePlan(plan, { ...SAMPLE_STUDENT, capAdmission: false });
  assert.ok(!noCap.items.some((i) => i.source === 'mahadbt'), 'MahaDBT OBC schemes need CAP admission');
  // deadlines are never invented by a re-judge
  for (const i of rich.items) assert.equal(i.deadline, plan.items.find((p) => p.opportunityId === i.opportunityId).deadline);
});
