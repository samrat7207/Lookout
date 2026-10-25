import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../src/bus.js';
import { runFake } from '../src/fakeAgents.js';
import { entryFromRun } from '../src/history/history.js';
import { rowsFromEntry } from '../src/db/fromRun.js';
import { openRepository } from '../src/db/index.js';
import { retentionDays, startRetention } from '../src/db/retention.js';
import { createApp } from '../src/app.js';

const NOW = Date.parse('2026-10-25T12:00:00.000Z');
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

let entry;
async function rowsAt(id, startedAt) {
  if (!entry) {
    const run = createRun();
    await runFake(run, { pace: 0 });
    run.close();
    entry = entryFromRun(run, { mode: 'mock' });
  }
  const rows = rowsFromEntry(entry, { startedAt, finishedAt: startedAt, status: 'complete' });
  return { ...rows, run: { ...rows.run, id }, items: rows.items.map((i, n) => ({ ...i, id: `${id}:${n}` })) };
}

test('RETENTION_DAYS: default 30, a positive whole number otherwise', () => {
  assert.equal(retentionDays(undefined), 30);
  assert.equal(retentionDays(''), 30);
  assert.equal(retentionDays('abc'), 30);
  assert.equal(retentionDays('0'), 30);
  assert.equal(retentionDays('7'), 7);
});

test('purge: runs, plan items and profile snapshots older than 30 days go; newer rows and sources survive', async () => {
  const repo = await openRepository({ databaseUrl: '', localFile: ':memory:' });
  try {
    await repo.saveRun(await rowsAt('old-1', daysAgo(45)));
    await repo.saveRun(await rowsAt('old-2', daysAgo(31)));
    await repo.saveRun(await rowsAt('new-1', daysAgo(29)));
    await repo.saveRun(await rowsAt('new-2', daysAgo(0)));
    const itemsBefore = (await repo.planItems.listByRun('new-1')).length;
    const sourcesBefore = (await repo.sources.list()).length;
    const oldRun = await repo.runs.get('old-1');
    assert.ok(itemsBefore > 0 && sourcesBefore > 0 && oldRun.profileId);

    const lines = [];
    const r = startRetention(Promise.resolve(repo), { days: 30, now: () => NOW, log: (l) => lines.push(l) });
    const removed = await r.first;
    r.stop();

    assert.equal(removed.runs, 2);
    assert.equal(removed.planItems, 2 * itemsBefore);
    assert.equal(removed.profiles, 2, 'the two old runs\' profile snapshots');
    assert.equal(await repo.runs.get('old-1'), null);
    assert.equal(await repo.runs.get('old-2'), null);
    assert.equal(await repo.profiles.get(oldRun.profileId), null);
    assert.equal((await repo.planItems.listByRun('old-1')).length, 0);
    // newer rows survive, with their profile and items
    const kept = await repo.runs.get('new-1');
    assert.ok(kept && (await repo.profiles.get(kept.profileId)));
    assert.equal((await repo.planItems.listByRun('new-1')).length, itemsBefore);
    assert.ok(await repo.runs.get('new-2'));
    assert.equal((await repo.sources.list()).length, sourcesBefore, 'sources are never purged');
    // counts only, never contents
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^retention: removed 2 runs, \d+ plan items, 2 profile snapshots older than 30 days$/);
    assert.ok(!lines[0].includes('old-1') && !lines[0].includes('sample'));
    const st = r.status();
    assert.equal(st.days, 30);
    assert.equal(st.lastPurgeAt, new Date(NOW).toISOString());
    // a second purge finds nothing more
    assert.deepEqual(await r.runNow(), { runs: 0, planItems: 0, profiles: 0 });
  } finally {
    await repo.close();
  }
});

test('purge with no repository does nothing and does not throw', async () => {
  const r = startRetention(Promise.resolve(null), { log: () => assert.fail('nothing to log') });
  assert.equal(await r.first, null);
  r.stop();
});

test('API: /api/health shows the retention period and the last purge time', async () => {
  const app = createApp({ record: false, cacheDir: null, db: { databaseUrl: '', localFile: ':memory:' }, retention: { days: 12, log: () => {} } });
  await app.locals.retention.first;
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const health = await fetch(`http://localhost:${server.address().port}/api/health`).then((r) => r.json());
    assert.equal(health.retention.days, 12);
    assert.ok(health.retention.lastPurgeAt);
    assert.deepEqual(health.retention.lastRemoved, { runs: 0, planItems: 0, profiles: 0 });
  } finally {
    app.locals.retention.stop();
    server.close();
  }
});
