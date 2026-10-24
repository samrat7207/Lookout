import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';

const NSP = readFileSync(new URL('./fixtures/nsp-all-scholarships.md', import.meta.url), 'utf8');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('API: /api/run (singular), /plan, /kit, /recheck and /health', async () => {
  const client = {
    async search() {
      return { results: [] };
    },
    async fetchPages({ urls }) {
      return { results: urls.filter((u) => u.includes('scholarships.gov.in')).map((url) => ({ url, text: NSP })), errors: urls.filter((u) => !u.includes('scholarships.gov.in')).map((url) => ({ url, error: 'proxy_error' })) };
    },
  };
  const server = await listen(createApp({ record: false, client, cacheDir: null }));
  const base = `http://localhost:${server.address().port}`;
  try {
    const { runId } = await post(`${base}/api/run`, { mode: 'fake', pace: 0 }).then((r) => r.json());
    const events = await fetch(`${base}/api/run/${runId}/events`).then((r) => r.text());
    assert.match(events, /"kind":"run.complete"/);

    const planRes = await fetch(`${base}/api/run/${runId}/plan`).then((r) => r.json());
    assert.equal(planRes.final, true);
    assert.ok(planRes.plan.items.length > 0);
    assert.ok(planRes.plan.profile.unknown.length >= 3);

    const scholarship = planRes.plan.items.find((i) => i.kitId);
    const kit = await fetch(`${base}/api/kit/${encodeURIComponent(scholarship.opportunityId)}`).then((r) => r.json());
    assert.equal(kit.kit.opportunityId, scholarship.opportunityId);
    assert.ok(kit.kit.fields.filter((f) => f.sensitive).every((f) => f.value === null));
    assert.equal((await fetch(`${base}/api/kit/nope`)).status, 404);

    const re = await post(`${base}/api/recheck`, { runId }).then((r) => r.json());
    assert.ok(re.summary.sources >= 1);
    const nsp = re.results.filter((r) => r.sourceUrl.includes('scholarships.gov.in'));
    assert.ok(nsp.length > 0 && nsp.every((r) => r.status === 'no-change'), 'the NSP fixture still has the same dates');
    assert.ok(re.results.some((r) => r.status === 'unchecked'), 'failed fetches are reported, not hidden');
    assert.equal((await post(`${base}/api/recheck`, {})).status, 400);

    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert.equal(typeof health.tinyfishKeyPresent, 'boolean');
    assert.ok(!JSON.stringify(health).includes(process.env.TINYFISH_API_KEY || 'no-key-set-here'));
    assert.equal(health.lastRun.runId, runId);
    assert.equal(health.lastRun.outcome, 'complete');
    assert.deepEqual(health.cache, { entries: 0, bytes: 0 });
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});
