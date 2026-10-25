import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApp } from '../src/app.js';
import { errorHandler, redact, requestLogger } from '../src/security.js';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}
async function withServer(app, fn) {
  const server = await listen(app);
  try {
    await fn(`http://localhost:${server.address().port}`);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
}
const send = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const app = () => createApp({ record: false, cacheDir: null, db: { localFile: ':memory:', databaseUrl: '' } });

test('validation: wrong types on every POST body give 400 with field paths, and nothing runs', async () => {
  await withServer(app(), async (base) => {
    const cases = [
      ['/api/run', { mode: 'mock', speed: 'fast' }, 'speed'],
      ['/api/run', { mode: 'mock', recording: '../etc/passwd' }, 'recording'],
      ['/api/run', { mode: 'fake', profile: { year: 'second' } }, 'profile.year'],
      ['/api/runs/x/control', { paused: 'yes' }, 'paused'],
      ['/api/rejudge', { historyId: 'a b', profile: {} }, 'historyId'],
      ['/api/rejudge', { historyId: 'x', profile: { familyIncome: 'a lot' } }, 'profile.familyIncome'],
      ['/api/recheck', { items: [{ title: 'x', sourceUrl: 'javascript:alert(1)' }] }, 'items.0.sourceUrl'],
      ['/api/recheck', { items: 'all' }, 'items'],
      ['/api/run', { mode: 'live', profile: { source: 'form', state: '<script>' } }, 'profile.state'],
      ['/api/run', { mode: 'live', profile: { source: 'form', incomeBand: 'rich' } }, 'profile.incomeBand'],
    ];
    for (const [path, body, field] of cases) {
      const res = await send(`${base}${path}`, body);
      assert.equal(res.status, 400, `${path} ${JSON.stringify(body)}`);
      const json = await res.json();
      assert.equal(json.error, 'invalid request body');
      assert.ok(json.issues.some((i) => i.path === field), `${path}: issue on ${field}, got ${JSON.stringify(json.issues)}`);
    }
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert.equal(health.lastRun, null, 'no run was started by a rejected body');
  });
});

test('body parsing: bad JSON is 400 and an oversized body is 413, both without internals', async () => {
  await withServer(app(), async (base) => {
    const bad = await send(`${base}/api/run`, '{"mode": ');
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { error: 'invalid JSON body' });
    const big = await send(`${base}/api/rejudge`, { historyId: 'x', pad: 'x'.repeat(150_000) });
    assert.equal(big.status, 413);
    assert.deepEqual(await big.json(), { error: 'request body too large' });
    const unknown = await fetch(`${base}/api/nope`);
    assert.equal(unknown.status, 404);
  });
});

test('error handler: a thrown error gives a short 500 with a request id, no stack or message, and the log is redacted', async () => {
  const fakeKey = 'tf_test_FAKEKEY_1234567890';
  const before = process.env.TINYFISH_API_KEY;
  process.env.TINYFISH_API_KEY = fakeKey;
  const lines = [];
  const mini = express();
  mini.use(requestLogger({ enabled: false }));
  mini.get('/boom', () => {
    throw new Error(`upstream said ${fakeKey} at postgres://admin:hunter2@db:5432/x`);
  });
  mini.use(errorHandler({ log: (l) => lines.push(l) }));
  try {
    await withServer(mini, async (base) => {
      const res = await fetch(`${base}/boom`);
      assert.equal(res.status, 500);
      const json = await res.json();
      assert.equal(json.error, 'internal error');
      assert.match(json.requestId, /^[0-9a-f]{8}$/);
      const text = JSON.stringify(json);
      assert.ok(!text.includes(fakeKey) && !text.includes('hunter2') && !/at .*\.js/.test(text));
    });
    assert.equal(lines.length, 1);
    assert.ok(!lines[0].includes(fakeKey), 'key redacted in the log');
    assert.ok(!lines[0].includes('hunter2'), 'URL password redacted in the log');
  } finally {
    if (before === undefined) delete process.env.TINYFISH_API_KEY;
    else process.env.TINYFISH_API_KEY = before;
  }
});

test('request logger: method, path, status and time only; never body, query or profile', async () => {
  const lines = [];
  const mini = express();
  mini.use(requestLogger({ log: (l) => lines.push(l), enabled: true }));
  mini.use(express.json());
  mini.post('/api/rejudge', (_req, res) => res.json({ ok: true }));
  await withServer(mini, async (base) => {
    await send(`${base}/api/rejudge?token=abc123secret`, { profile: { familyIncome: 456789, category: 'OBC' } }, { Authorization: 'Bearer zzz-secret' });
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^POST \/api\/rejudge 200 \d+ms id=[0-9a-f]{8}$/);
  for (const s of ['abc123secret', '456789', 'OBC', 'zzz-secret']) assert.ok(!lines[0].includes(s), s);
  assert.equal(redact('password=hunter2 and x-api-key: abc'), 'password=[redacted] and x-api-key: [redacted]');
});

test('headers and CORS: helmet headers on, allowlisted origin gets CORS, others cannot POST', async () => {
  const a = createApp({ record: false, cacheDir: null, db: { localFile: ':memory:', databaseUrl: '' }, origins: ['http://localhost:5173', 'https://lookout.example'] });
  await withServer(a, async (base) => {
    const h = await fetch(`${base}/api/health`, { headers: { Origin: 'https://lookout.example' } });
    assert.equal(h.headers.get('access-control-allow-origin'), 'https://lookout.example');
    assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
    assert.match(h.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(h.headers.get('x-powered-by'), null);

    const pre = await fetch(`${base}/api/run`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre.status, 204);

    const other = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null, 'no CORS for other origins');
    const write = await send(`${base}/api/run`, { mode: 'mock' }, { Origin: 'https://evil.example' });
    assert.equal(write.status, 403);
  });
});
