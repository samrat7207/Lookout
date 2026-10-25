import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { limitSettings } from '../src/limits.js';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const make = (limits) => createApp({ record: false, cacheDir: null, db: { localFile: ':memory:', databaseUrl: '' }, limits: { ...limitSettings({}), ...limits } });

test('defaults: 10 runs and 10 re-checks per minute per IP, a looser read limit, a few streams per IP', () => {
  const s = limitSettings({});
  assert.equal(s.runPerMinute, 10);
  assert.equal(s.recheckPerMinute, 10);
  assert.ok(s.readPerMinute > 10);
  assert.ok(s.sseConnectionsPerIp >= 1);
});

test('POST /api/run and POST /api/recheck: over the limit is 429 with Retry-After', async () => {
  const server = await listen(make({ runPerMinute: 2, recheckPerMinute: 2 }));
  const base = `http://localhost:${server.address().port}`;
  try {
    // invalid bodies still count, so no runs are started by this test
    assert.equal((await post(`${base}/api/run`, { mode: 'nonsense' })).status, 400);
    assert.equal((await post(`${base}/api/runs`, { mode: 'nonsense' })).status, 400);
    const r = await post(`${base}/api/run`, { mode: 'nonsense' });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) >= 1);
    assert.match((await r.json()).error, /too many runs/);

    await post(`${base}/api/recheck`, {});
    await post(`${base}/api/recheck`, {});
    const c = await post(`${base}/api/recheck`, {});
    assert.equal(c.status, 429);
    assert.ok(Number(c.headers.get('retry-after')) >= 1);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('read endpoints: a looser limit, then 429 with Retry-After', async () => {
  const server = await listen(make({ readPerMinute: 3 }));
  const base = `http://localhost:${server.address().port}`;
  try {
    for (let i = 0; i < 3; i++) assert.equal((await fetch(`${base}/api/health`)).status, 200);
    const r = await fetch(`${base}/api/history`);
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) >= 1);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('SSE: a per-IP cap on open event streams; a closed stream frees its slot', async () => {
  const server = await listen(make({ sseConnectionsPerIp: 1 }));
  const base = `http://localhost:${server.address().port}`;
  try {
    const { runId } = await post(`${base}/api/run`, { mode: 'mock', speed: 1 }).then((r) => r.json());
    const first = new AbortController();
    const a = await fetch(`${base}/api/runs/${runId}/events`, { signal: first.signal });
    assert.equal(a.status, 200);
    const b = await fetch(`${base}/api/runs/${runId}/events`);
    assert.equal(b.status, 429);
    assert.equal(b.headers.get('retry-after'), '5');
    first.abort();
    await a.body?.cancel().catch(() => {});
    let c;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      c = await fetch(`${base}/api/health`).then((r) => r.json());
      if (c.limits.openEventStreams === 0) break;
    }
    assert.equal(c.limits.openEventStreams, 0);
    const again = new AbortController();
    const d = await fetch(`${base}/api/runs/${runId}/events`, { signal: again.signal });
    assert.equal(d.status, 200);
    again.abort();
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});
