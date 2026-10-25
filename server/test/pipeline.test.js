import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRun } from '../src/bus.js';
import { runFake } from '../src/fakeAgents.js';
import { readRecording, recordingPath } from '../src/replay.js';
import { upgradeLegacy } from '../src/pipelineEvents.js';
import { sinceLastRun } from '../src/history/sinceLast.js';
import { createApp } from '../src/app.js';

test('scripted run: assembly before dispersal, and a handoff wherever data passes', async () => {
  const run = createRun();
  await runFake(run, { pace: 0 });
  const h = run.history;
  const firstWalk = h.findIndex((e) => e.kind === 'agent.walking');
  assert.ok(h.findIndex((e) => e.kind === 'run.assembled') < firstWalk);
  assert.ok(h.findIndex((e) => e.kind === 'plan.split') < firstWalk);
  const ho = h.filter((e) => e.kind === 'handoff');
  assert.ok(ho.every((e) => e.building === 'cafeteria' && e.payload.from && e.payload.to && e.payload.summary));
  assert.ok(ho.some((e) => e.payload.from === 'profiler' && e.payload.to === 'mayor'));
  assert.equal(ho.filter((e) => /-scout$/.test(e.payload.from)).length, 4);
  assert.ok(ho.some((e) => e.payload.from === 'mayor' && e.payload.to === 'verifier'));
});

test('old recordings: the same events are rebuilt from their own data and marked derived', async () => {
  const raw = await readRecording(recordingPath('real-run'));
  assert.ok(!raw.some((e) => e.kind === 'run.assembled'), 'the committed recording predates the new events');
  const up = upgradeLegacy(raw);
  assert.ok(up.find((e) => e.kind === 'run.assembled').payload.derived);
  assert.ok(up.findIndex((e) => e.kind === 'plan.split') < up.findIndex((e) => e.kind === 'agent.walking'));
  for (const done of raw.filter((e) => e.kind === 'agent.done' && /-scout$/.test(e.agentId))) {
    const h = up.find((e) => e.kind === 'handoff' && e.payload.from === done.agentId);
    assert.equal(h.payload.count, done.payload.findings, "the count is the recording's own");
    assert.ok(h.payload.derived);
  }
  for (let i = 1; i < up.length; i++) assert.ok(up[i].t >= up[i - 1].t, 'time never goes backwards');
  assert.equal(upgradeLegacy(up), up, 'an upgraded recording is left as it is');
});

const row = (schemeId, deadline, rank = 1, extra = {}) => ({ schemeId, name: schemeId, deadline, rank, status: 'conditional', ...extra });

test('since your last run: new, closed, no longer listed and changed deadlines, from stored data only', () => {
  const previous = {
    run: { id: 'r1', finishedAt: '2026-10-24T10:00:00Z', mode: 'live' },
    items: [row('same', '2026-10-31'), row('moved', '2026-10-31'), row('closes', '2026-10-25'), row('gone', '2026-11-30'), row('unpub', null), row('na', null, null, { status: 'no' })],
  };
  const plan = {
    today: '2026-10-26',
    items: [
      { opportunityId: 'same', title: 'same', deadline: '2026-10-31' },
      { opportunityId: 'moved', title: 'moved', deadline: '2026-11-15' },
      { opportunityId: 'fresh', title: 'fresh', deadline: null },
      { opportunityId: 'unpub', title: 'unpub', deadline: '2026-12-01' },
    ],
    missed: [],
  };
  const d = sinceLastRun(previous, plan);
  assert.equal(d.previous.runId, 'r1');
  assert.deepEqual(d.newItems.map((x) => x.id), ['fresh']);
  assert.deepEqual(d.closedItems, [{ id: 'closes', title: 'closes', closedOn: '2026-10-25' }]);
  assert.deepEqual(d.noLongerListed.map((x) => x.id), ['gone']);
  assert.deepEqual(d.deadlineChanged.map((x) => [x.id, x.from, x.to]), [['moved', '2026-10-31', '2026-11-15'], ['unpub', null, '2026-12-01']]);
  assert.equal(d.unchanged, 1);
});

test('since your last run: no previous run', () => {
  assert.deepEqual(sinceLastRun(null, { items: [] }), { previous: null, note: 'No previous run for this profile.' });
});

test('Librarian (API): the first run finds no previous run; the second gets the first, with no differences', async () => {
  const app = createApp({ record: false, cacheDir: null, historyFile: join(mkdtempSync(join(tmpdir(), 'lib-')), 'h.json'), db: { localFile: ':memory:', databaseUrl: '' } });
  const server = await new Promise((r) => {
    const s = app.listen(0, () => r(s));
  });
  const base = `http://localhost:${server.address().port}`;
  const runOnce = async () => {
    const { runId } = await fetch(`${base}/api/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'mock', speed: 16 }) }).then((r) => r.json());
    const text = await fetch(`${base}/api/run/${runId}/events`).then((r) => r.text());
    return { runId, evts: text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6))) };
  };
  try {
    const a = await runOnce();
    const kinds = a.evts.map((e) => e.kind);
    assert.ok(kinds.indexOf('library.request') > kinds.indexOf('plan.split'));
    assert.equal(a.evts.find((e) => e.kind === 'library.result').payload.found, false);
    assert.equal(a.evts.find((e) => e.kind === 'library.diff').payload.previous, null);
    assert.ok(kinds.indexOf('library.diff') < kinds.indexOf('run.complete'), 'the diff arrives before the run ends');
    assert.ok(a.evts.some((e) => e.kind === 'handoff' && e.payload.from === 'librarian' && e.payload.summary === 'no previous run'));
    for (let i = 1; i < a.evts.length; i++) assert.equal(a.evts[i].seq, a.evts[i - 1].seq + 1, 'events arrive in order');

    await new Promise((r) => setTimeout(r, 150)); // the save after the run
    const b = await runOnce();
    const diffB = b.evts.find((e) => e.kind === 'library.diff').payload;
    assert.equal(diffB.previous.runId, a.runId);
    assert.equal(diffB.newItems.length + diffB.closedItems.length + diffB.deadlineChanged.length, 0);
    assert.ok(diffB.unchanged > 0);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});
