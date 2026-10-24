import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { createRun } from '../src/bus.js';
import { recordRun } from '../src/recorder.js';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

/** Reads SSE frames from a fetch Response until `until(events)` is true or the stream ends. */
async function readEvents(res, until = () => false) {
  const events = [];
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = frame.split('\n').find((l) => l.startsWith('data: '));
      if (data) events.push(JSON.parse(data.slice(6)));
    }
    if (until(events)) break;
  }
  return events;
}

test('bus stamps the v2 envelope with increasing seq', () => {
  const run = createRun();
  const a = run.emit('run.started', { payload: { mode: 'fake' } });
  const b = run.emit('agent.spawned', { agentId: 'nsp-scout', building: 'townhall', payload: { name: 'Nisha' } });
  assert.equal(a.v, 2);
  assert.equal(a.seq, 1);
  assert.equal(b.seq, 2);
  assert.equal(b.runId, run.id);
  assert.equal(b.agentId, 'nsp-scout');
  assert.equal(b.replay, false);
  assert.ok(b.t >= a.t);
  assert.ok(!('agentId' in a), 'run-level events have no agentId');
});

test('SSE streams live events, then resumes from Last-Event-ID without duplicates', async () => {
  const server = await listen(createApp({ record: false }));
  const base = `http://localhost:${server.address().port}`;
  const run = createRun();
  run.emit('run.started', { payload: {} });
  run.emit('agent.spawned', { agentId: 'nsp-scout', payload: {} });

  // first connection: gets history, then a live event
  const ac = new AbortController();
  const res = await fetch(`${base}/api/runs/${run.id}/events`, { signal: ac.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  setTimeout(() => run.emit('agent.walking', { agentId: 'nsp-scout', payload: { to: 'nsp' } }), 50);
  const first = await readEvents(res, (evts) => evts.length >= 3);
  ac.abort();
  assert.deepEqual(first.map((e) => e.seq), [1, 2, 3]);

  // events emitted while disconnected
  run.emit('agent.working', { agentId: 'nsp-scout', payload: {} });
  run.emit('run.complete', { payload: {} });
  run.close();

  // reconnect with Last-Event-ID: 3 -> only 4 and 5, then the stream ends (run closed)
  const res2 = await fetch(`${base}/api/runs/${run.id}/events`, { headers: { 'Last-Event-ID': '3' } });
  const second = await readEvents(res2);
  assert.deepEqual(second.map((e) => e.seq), [4, 5]);
  assert.equal(second.at(-1).kind, 'run.complete');

  server.close();
});

test('unknown run is 404, unknown mode is 400', async () => {
  const server = await listen(createApp({ record: false }));
  const base = `http://localhost:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/runs/nope/events`)).status, 404);
  const res = await fetch(`${base}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'nonsense' }),
  });
  assert.equal(res.status, 400);
  server.close();
});

test('recorder writes one JSON line per event', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lookout-rec-'));
  const run = createRun();
  run.emit('run.started', { payload: {} });
  const done = recordRun(run, { dir });
  run.emit('run.complete', { payload: {} });
  run.close();
  const file = await done;
  const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((e) => e.kind), ['run.started', 'run.complete']);
});

test('replay control: pause holds events, resume and speed continue the run', async () => {
  const server = await listen(createApp({ record: false }));
  const base = `http://localhost:${server.address().port}`;
  try {
    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'mock', recording: 'fake-run', speed: 8 }),
    }).then((r) => r.json());
    assert.deepEqual(created.control, { speed: 8, paused: false });
    const control = (body) =>
      fetch(`${base}/api/runs/${created.runId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    assert.equal((await control({ paused: true })).status, 200);
    await new Promise((r) => setTimeout(r, 300));
    const ctl = await fetch(`${base}/api/runs/${created.runId}/control`).then((r) => r.json());
    assert.equal(ctl.control.paused, true);
    assert.equal(ctl.closed, false);

    assert.equal((await control({ speed: 99 })).status, 400);
    assert.equal((await control({ paused: false, speed: 16 })).status, 200);
    const res = await fetch(`${base}/api/runs/${created.runId}/events`);
    const events = await readEvents(res, (evts) => evts.some((e) => e.kind === 'run.complete'));
    assert.equal(events.at(-1).kind, 'run.complete');
    assert.ok(events.every((e) => e.replay === true));

    const fake = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'fake', pace: 0 }),
    }).then((r) => r.json());
    const refused = await fetch(`${base}/api/runs/${fake.runId}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: true }),
    });
    assert.equal(refused.status, 409);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});
