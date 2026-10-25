import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createSqlRepository } from '../src/db/sqlRepository.js';
import { postgresDriver, sqliteDriver } from '../src/db/drivers.js';
import { openRepository } from '../src/db/index.js';
import { rowsFromEntry, unknownFields } from '../src/db/fromRun.js';
import { entryFromRun } from '../src/history/history.js';
import { createRun } from '../src/bus.js';
import { runFake } from '../src/fakeAgents.js';
import { createApp } from '../src/app.js';

const tmpFile = (name) => join(mkdtempSync(join(tmpdir(), 'lookout-db-')), name);
const UNREACHABLE = 'postgres://lookout:not-a-real-password@127.0.0.1:1/lookout';

async function fakeRows() {
  const run = createRun();
  await runFake(run, { pace: 0 });
  run.close();
  const entry = entryFromRun(run, { mode: 'mock' });
  return rowsFromEntry(entry, { startedAt: '2026-10-25T08:00:00.000Z', finishedAt: '2026-10-25T08:01:00.000Z', status: 'complete' });
}

/**
 * A pg.Pool stand-in backed by SQLite, so the Postgres implementation's own code path
 * (pool.query, pool.connect, BEGIN/COMMIT, $n parameters) runs without a Postgres server.
 * It records every statement and its parameters. Postgres-only DDL is translated.
 */
function sqliteBackedPool({ failAfter = Infinity } = {}) {
  const db = new DatabaseSync(':memory:');
  const log = [];
  let n = 0;
  const pgToSqlite = (sql) => sql.replace(/'\{\}'::jsonb/g, "'{}'").replace(/DEFAULT now\(\)/g, 'DEFAULT CURRENT_TIMESTAMP').replace(/\$(\d+)/g, '?$1');
  const query = async (sql, params = []) => {
    if (++n > failAfter) throw Object.assign(new Error('Connection terminated unexpectedly'), { code: 'ECONNRESET' });
    log.push({ sql, params });
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql) || !params.length) {
      if (/^\s*SELECT/i.test(sql)) return { rows: db.prepare(pgToSqlite(sql)).all() };
      db.exec(pgToSqlite(sql));
      return { rows: [] };
    }
    const stmt = db.prepare(pgToSqlite(sql));
    const bound = params.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v ?? null));
    return { rows: /^\s*SELECT/i.test(sql) ? stmt.all(...bound) : (stmt.run(...bound), []) };
  };
  return { log, query, connect: async () => ({ query, release() {} }), end: async () => {}, on() {} };
}

async function exercise(repo, label) {
  await repo.migrate();
  await repo.migrate(); // migrations run once
  const rows = await fakeRows();
  assert.ok(rows.items.length > 5, `${label}: items mapped`);
  await repo.saveRun(rows);
  const list = await repo.runs.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, rows.run.id);
  assert.equal(list[0].items, rows.items.length);
  const run = await repo.runs.get(rows.run.id);
  assert.equal(run.status, 'complete');
  const profile = await repo.profiles.get(run.profileId);
  assert.equal(profile.category, 'OBC');
  assert.equal(profile.year, 2);
  assert.equal(profile.extra.familyIncome, null, 'unknown facts stay null');
  assert.ok(unknownFields(profile).includes('familyIncome'));
  const items = await repo.planItems.listByRun(run.id);
  assert.deepEqual(items.filter((i) => i.rank !== null).map((i) => i.rank), items.filter((i) => i.rank !== null).map((_, n) => n + 1));
  for (const i of items) {
    assert.ok(i.sourceUrl && i.lastChecked, `${label}: source and last checked on every item`);
    assert.ok(['match', 'conditional', 'unclear', 'no'].includes(i.status));
    if (i.deadline === null) assert.equal(i.deadlineNote, 'deadline not published');
  }
  const sources = await repo.sources.list();
  assert.ok(sources.some((s) => !s.used && s.notUsedReason), 'not-used sources keep their reason');

  // constraints: bad status, missing source_url and missing last_checked are refused
  const base = { schemeId: 'x:y', name: 'x', type: 'scholarship', status: 'match', sourceUrl: 'https://example.org/', lastChecked: '2026-10-25T08:00:00Z' };
  await assert.rejects(repo.planItems.addMany(run.id, [{ ...base, status: 'maybe' }]));
  await assert.rejects(repo.planItems.addMany(run.id, [{ ...base, schemeId: 'x:1', sourceUrl: null }]));
  await assert.rejects(repo.planItems.addMany(run.id, [{ ...base, schemeId: 'x:2', lastChecked: null }]));
  await repo.planItems.addMany(run.id, [{ ...base, schemeId: 'x:3', deadline: null }]); // deadline may be null
}

test('local fallback (node:sqlite): migrations, save, list, get, constraints', async () => {
  const repo = createSqlRepository(sqliteDriver(tmpFile('lookout.db')));
  try {
    await exercise(repo, 'sqlite');
  } finally {
    await repo.close();
  }
});

test('Postgres implementation: same behaviour, parameterised SQL, one transaction per save (pg-compatible stand-in)', async () => {
  const pool = sqliteBackedPool();
  const repo = createSqlRepository(postgresDriver(pool));
  await exercise(repo, 'postgres');
  // values are always bound, never written into the SQL text
  const inserts = pool.log.filter((l) => /^\s*INSERT/i.test(l.sql));
  assert.ok(inserts.length > 10);
  for (const l of inserts) {
    assert.match(l.sql, /\$1/);
    assert.ok(!/https?:\/\//.test(l.sql), 'no URL inlined in SQL');
  }
  assert.ok(pool.log.some((l) => /^BEGIN$/.test(l.sql)) && pool.log.some((l) => /^COMMIT$/.test(l.sql)));
  assert.ok(pool.log.some((l) => /JSONB/.test(l.sql)), 'the Postgres DDL was used');
});

test('Postgres implementation against a real server (only when TEST_DATABASE_URL is set)', { skip: !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL not set' }, async () => {
  const repo = await openRepository({ databaseUrl: process.env.TEST_DATABASE_URL, localFile: ':memory:' });
  try {
    assert.equal(repo.info().kind, 'postgres');
    await repo.saveRun({ ...(await fakeRows()), run: { ...(await fakeRows()).run, id: `test_${Date.now()}` } });
  } finally {
    await repo.close();
  }
});

test('fallback: an unreachable DATABASE_URL opens the local store, and the reason never shows the URL or password', async () => {
  const repo = await openRepository({ databaseUrl: UNREACHABLE, localFile: tmpFile('fallback.db'), connectTimeoutMs: 1500 });
  try {
    const info = repo.info();
    assert.equal(info.kind, 'local');
    assert.equal(info.engine, 'sqlite');
    assert.match(info.fallbackReason, /Postgres unreachable \(\w+\)/);
    assert.ok(!JSON.stringify(info).includes('not-a-real-password') && !JSON.stringify(info).includes('postgres://'));
    await repo.saveRun(await fakeRows());
    assert.equal((await repo.runs.list()).length, 1);
  } finally {
    await repo.close();
  }
});

test('fallback: Postgres failing during use switches to the local store and keeps saving', async () => {
  const pool = sqliteBackedPool({ failAfter: 60 }); // migrations work, later calls fail
  const repo = await openRepository({ pool, localFile: ':memory:' });
  try {
    assert.equal(repo.info().kind, 'postgres');
    const rows = await fakeRows();
    for (let i = 0; i < 3; i++) await repo.saveRun({ ...rows, run: { ...rows.run, id: `${rows.run.id}_${i}` } });
    const info = repo.info();
    assert.equal(info.kind, 'local');
    assert.match(info.fallbackReason, /Postgres failed during use \(ECONNRESET\)/);
    assert.ok((await repo.runs.list()).length >= 1);
  } finally {
    await repo.close();
  }
});

test('API: with an unreachable database the app keeps running, health says local, and saved runs are listed', async () => {
  const app = createApp({ record: false, cacheDir: null, historyFile: tmpFile('history.json'), db: { databaseUrl: UNREACHABLE, localFile: ':memory:', connectTimeoutMs: 1500 } });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://localhost:${server.address().port}`;
  try {
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert.equal(health.database.kind, 'local');
    assert.match(health.database.fallbackReason, /unreachable/);
    const { runId } = await fetch(`${base}/api/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'mock', speed: 16 }) }).then((r) => r.json());
    await fetch(`${base}/api/run/${runId}/events`).then((r) => r.text());
    let list;
    for (let i = 0; i < 20; i++) {
      list = await fetch(`${base}/api/runs`).then((r) => r.json());
      if (list.runs.length) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(list.store, 'local');
    assert.equal(list.runs[0].id, runId);
    const one = await fetch(`${base}/api/runs/${runId}`).then((r) => r.json());
    assert.equal(one.run.mode, 'mock');
    assert.ok(one.items.length > 0 && one.items.every((i) => i.sourceUrl && i.lastChecked));
    assert.ok(one.unknown.includes('familyIncome'));
    assert.equal((await fetch(`${base}/api/runs/nope`)).status, 404);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});
