import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

test('API: completed runs land in the history; open, compare and re-judge them', async () => {
  const historyFile = join(mkdtempSync(join(tmpdir(), 'lookout-hist-')), 'history.json');
  const server = await listen(createApp({ record: false, cacheDir: null, historyFile }));
  const base = `http://localhost:${server.address().port}`;
  try {
    const ids = [];
    for (let i = 0; i < 2; i++) {
      const { runId } = await post(`${base}/api/run`, { mode: 'mock', speed: 16 });
      await fetch(`${base}/api/run/${runId}/events`).then((r) => r.text()); // wait for the end
      ids.push(runId);
    }
    await new Promise((r) => setTimeout(r, 50));
    const list = await fetch(`${base}/api/history`).then((r) => r.json());
    assert.deepEqual(list.runs.map((r) => r.id), [...ids].reverse());
    assert.equal(list.runs[0].mode, 'mock');

    const one = await fetch(`${base}/api/history/${ids[0]}`).then((r) => r.json());
    assert.ok(one.plan.items.length > 0 && one.kits.length > 0);

    const cmp = await fetch(`${base}/api/history/compare?a=${ids[0]}&b=${ids[1]}`).then((r) => r.json());
    assert.equal(cmp.diff.unchanged, one.plan.items.length, 'two replays of the same recording: no differences');
    assert.equal(cmp.diff.added.length + cmp.diff.removed.length + cmp.diff.deadlineMoved.length, 0);

    const re = await post(`${base}/api/rejudge`, { historyId: ids[1], profile: { familyIncome: 600000 } });
    assert.ok(re.plan.items.length < one.plan.items.length);
    assert.equal(re.profile.familyIncome, 600000);
    assert.ok(re.plan.rejudged.moved.length > 0);
    assert.equal((await fetch(`${base}/api/history/compare?a=x&b=y`)).status, 404);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});
