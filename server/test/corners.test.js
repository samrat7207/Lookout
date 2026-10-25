import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../src/bus.js';
import { runFake } from '../src/fakeAgents.js';
import { readRecording, recordingPath } from '../src/replay.js';
import { conflictChecks, upgradeCorners, upgradeLegacy } from '../src/pipelineEvents.js';
import { CONFLICT_RULES } from '../src/rank/conflicts.js';

test('scripted run: the Kit Builder prepares each kit at the Application Desk', async () => {
  const run = createRun();
  await runFake(run, { pace: 0 });
  const h = run.history;
  const building = h.filter((e) => e.kind === 'kit.building');
  const ready = h.filter((e) => e.kind === 'kit.ready');
  assert.ok(ready.length > 0);
  assert.equal(building.length, ready.length, 'one kit.building per kit.ready');
  assert.ok([...building, ...ready].every((e) => e.agentId === 'kit-builder' && e.building === 'appdesk'));
  for (const r of ready) {
    const b = h.findIndex((e) => e.kind === 'kit.building' && e.payload.opportunityId === r.payload.opportunityId);
    assert.ok(b >= 0 && b < h.indexOf(r), 'kit.building comes before its kit.ready');
  }
  assert.ok(h.some((e) => e.kind === 'agent.spawned' && e.agentId === 'kit-builder'));
  assert.equal(h.find((e) => e.kind === 'agent.done' && e.agentId === 'kit-builder').payload.kits, ready.length);
});

test('scripted run: the Conflict Checker reports every rule at the Auditor\'s Office, matching the plan', async () => {
  const run = createRun();
  await runFake(run, { pace: 0 });
  const h = run.history;
  const checks = h.filter((e) => e.kind === 'conflict.check');
  assert.equal(checks.length, CONFLICT_RULES.length);
  assert.ok(checks.every((e) => e.agentId === 'conflict-checker' && e.building === 'auditor'));
  const plan = h.find((e) => e.kind === 'plan.ready').payload;
  const warnings = checks.filter((e) => e.payload.result === 'warning').map((e) => e.payload.ruleId).sort();
  assert.deepEqual(warnings, (plan.conflicts ?? []).map((c) => c.id).sort(), 'warnings are exactly the plan\'s conflicts');
  assert.ok(h.findIndex((e) => e.kind === 'conflict.check') < h.findIndex((e) => e.kind === 'plan.ready'));
});

test('scripted run: the Verifier works at the Inspection Office', async () => {
  const run = createRun();
  await runFake(run, { pace: 0 });
  const w = run.history.find((e) => e.kind === 'agent.working' && e.agentId === 'verifier');
  assert.equal(w.building, 'inspection');
});

test('conflictChecks: clear unless the plan lists that conflict', () => {
  const plan = { conflicts: [{ id: CONFLICT_RULES[0].id, ids: ['a', 'b'], officialRule: { quote: 'q' } }] };
  const c = conflictChecks(plan, CONFLICT_RULES);
  assert.equal(c[0].result, 'warning');
  assert.equal(c[0].officialRule, true);
  assert.deepEqual(c[0].ids, ['a', 'b']);
  assert.ok(c.slice(1).every((x) => x.result === 'clear' && !x.officialRule));
});

test('old recordings: Kit Builder and Conflict Checker rebuilt from the recording, marked as such', async () => {
  const raw = upgradeLegacy(await readRecording(recordingPath('real-run')));
  assert.ok(!raw.some((e) => e.kind === 'kit.building' || e.kind === 'conflict.check'), 'the committed recording predates them');
  const up = upgradeCorners(raw, CONFLICT_RULES);
  const kits = raw.filter((e) => e.kind === 'kit.ready');
  const built = up.filter((e) => e.kind === 'kit.building');
  assert.equal(built.length, kits.length, 'one per recorded kit, no more');
  assert.ok(built.every((e) => e.payload.derived && e.payload.note === 'rebuilt from the recording'));
  const checks = up.filter((e) => e.kind === 'conflict.check');
  assert.equal(checks.length, CONFLICT_RULES.length);
  const plan = raw.find((e) => e.kind === 'plan.ready').payload;
  assert.deepEqual(checks.filter((e) => e.payload.result === 'warning').map((e) => e.payload.ruleId).sort(), (plan.conflicts ?? []).map((c) => c.id).sort());
  for (const e of raw) assert.ok(up.includes(e), 'every recorded event is kept unchanged');
  assert.ok(up.some((e) => e.kind === 'agent.spawned' && e.agentId === 'kit-builder' && e.payload.derived));
  for (let i = 1; i < up.length; i++) assert.ok(up[i].t >= up[i - 1].t, 'time never goes backwards');
  assert.equal(upgradeCorners(up, CONFLICT_RULES), up, 'an upgraded recording is left as it is');
});

test('upgradeCorners: a recording with no kits and no plan is left alone', () => {
  const ev = [{ kind: 'run.started', t: 0, payload: {} }, { kind: 'run.failed', t: 1, payload: {} }];
  assert.equal(upgradeCorners(ev, CONFLICT_RULES), ev);
});
