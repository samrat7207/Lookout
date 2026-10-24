import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRun } from '../src/bus.js';
import { runFake } from '../src/fakeAgents.js';
import { recordRun } from '../src/recorder.js';
import { replayRecording } from '../src/replay.js';
import { assertKitSafe, buildKit, SAFETY_NOTICE } from '../src/kit/buildKit.js';
import { SAMPLE_STUDENT, nsp } from '../src/fake/reconData.js';

async function fakeRun(opts = {}) {
  const run = createRun();
  await runFake(run, { pace: 0, ...opts });
  run.close();
  return run.history;
}

test('fake run emits a well-formed v2 sequence', async () => {
  const events = await fakeRun();
  assert.equal(events[0].kind, 'run.started');
  assert.equal(events.at(-1).kind, 'run.complete');
  assert.ok(events.every((e, i) => e.v === 2 && e.seq === i + 1));
  assert.equal(events[0].payload.profile.label, 'sample student');
  const agents = events[0].payload.agents;
  assert.ok(agents.includes('foundations-scout') && agents.includes('opps-scout'));
  for (const kind of ['agent.spawned', 'agent.walking', 'agent.working', 'agent.found', 'agent.returning', 'plan.updated', 'kit.ready', 'plan.ready', 'watchtower.checked']) {
    assert.ok(events.some((e) => e.kind === kind), `missing ${kind}`);
  }
});

test('plan.ready merges all kinds into one list sorted by deadline, nulls last', async () => {
  const plan = (await fakeRun()).find((e) => e.kind === 'plan.ready').payload;
  const dates = plan.items.map((i) => i.deadline);
  const dated = dates.filter(Boolean);
  assert.deepEqual(dated, [...dated].sort());
  assert.ok(dates.indexOf(null) === -1 || dates.slice(dates.indexOf(null)).every((d) => d === null));
  assert.ok(plan.counts.scholarship > 0 && plan.counts.hackathon > 0);
  assert.deepEqual(plan.items.map((i) => i.rank), plan.items.map((_, i) => i + 1));
  assert.equal(plan.headline.daysLeft, 7);
  assert.ok(plan.items.some((i) => i.title.startsWith('PM YASASVI') && i.daysLeft === 7));
  assert.ok(!plan.items.some((i) => /Pragati/.test(i.title)), 'Pragati is for girls; persona is male');
});

test('every scholarship in the plan has a safe kit; hackathons have none', async () => {
  const events = await fakeRun();
  const plan = events.find((e) => e.kind === 'plan.ready').payload;
  const kits = new Map(events.filter((e) => e.kind === 'kit.ready').map((e) => [e.payload.id, e.payload]));
  for (const item of plan.items) {
    if (item.kind === 'scholarship') {
      const kit = kits.get(item.kitId);
      assert.ok(kit, `no kit for ${item.title}`);
      assert.equal(kit.safety, SAFETY_NOTICE);
      assert.ok(kit.fields.filter((f) => f.sensitive).every((f) => f.value === null));
      assert.ok(kit.fields.some((f) => f.from === 'persona' && f.value === 'B.Tech Computer Engineering'));
    } else {
      assert.equal(item.kitId, undefined);
    }
  }
});

test('assertKitSafe rejects a kit that carries a secret', () => {
  const kit = buildKit(nsp[0], SAMPLE_STUDENT, { today: '2026-10-24' });
  const leaked = structuredClone(kit);
  leaked.fields.find((f) => /Aadhaar/.test(f.label)).value = '1234 5678 9012';
  assert.throws(() => assertKitSafe(leaked), /must have value null/);
  const sneaky = structuredClone(kit);
  sneaky.fields.push({ label: 'Login password', value: null, from: 'student' });
  assert.throws(() => assertKitSafe(sneaky), /must be marked sensitive/);
});

test('OPPORTUNITIES off: no opps-scout, no hackathons, plan still complete', async () => {
  const events = await fakeRun({ opportunities: false });
  assert.ok(!events.some((e) => e.agentId === 'opps-scout'));
  const plan = events.find((e) => e.kind === 'plan.ready').payload;
  assert.equal(plan.counts.hackathon, 0);
  assert.equal(plan.items[0].deadline, '2026-10-31');
});

test('mock replay reproduces the recorded order with replay: true', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lookout-replay-'));
  const live = createRun();
  const file = recordRun(live, { dir, name: 'rec' });
  await runFake(live, { pace: 0.02 });
  live.close();
  const path = await file;

  const mock = createRun({ replay: true });
  await replayRecording(mock, path, { speed: 50 });
  assert.deepEqual(mock.history.map((e) => e.kind), live.history.map((e) => e.kind));
  assert.deepEqual(mock.history.map((e) => e.payload), live.history.map((e) => e.payload));
  assert.ok(mock.history.every((e) => e.replay === true));
});

test('sample student plan: no Shahu or Panjabrao, MahaDBT undated, conflicts flagged', async () => {
  const plan = (await fakeRun()).find((e) => e.kind === 'plan.ready').payload;
  assert.ok(!plan.items.some((i) => /Shahu|Panjabrao/.test(i.title)), 'EBC/EWS and General/SEBC schemes are not for an OBC student');
  for (const i of plan.items.filter((i) => i.source === 'mahadbt')) assert.equal(i.deadline, null, 'MahaDBT publishes no deadline');
  const ids = plan.conflicts.map((c) => c.id).sort();
  assert.deepEqual(ids, ['csss-vs-state-fee-reimbursement', 'nsp-one-merit-scheme']);
  for (const c of plan.conflicts) {
    assert.match(c.sourceUrl, /^https:\/\//);
    assert.ok(c.ids.every((id) => plan.items.some((i) => i.opportunityId === id)));
  }
});

test('the fake run shows failures honestly: MahaDBT 2.0 fails after one retry', async () => {
  const errors = (await fakeRun()).filter((e) => e.kind === 'agent.error');
  const m2 = errors.filter((e) => e.payload.target === 'https://mahadbt2.maharashtra.gov.in/');
  assert.deepEqual(m2.map((e) => e.payload.retrying), [true, false]);
  assert.ok(errors.every((e) => e.payload.code && e.payload.message));
});
