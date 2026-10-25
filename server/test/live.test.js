import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp, defaultMode } from '../src/app.js';
import { createRun } from '../src/bus.js';
import { runLive, LiveUnavailableError } from '../src/liveRun.js';
import { buildPlan, byRank } from '../src/rank/ranker.js';
import { parseBuddy4Study } from '../src/parse/buddy4study.js';
import { TinyFishError } from '../src/tinyfish/client.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const TODAY = '2026-10-24';

const opp = (id, deadline, fit, extra = {}) => ({
  id,
  kind: 'scholarship',
  title: id,
  deadline,
  deadlineLabel: 'Application closes',
  sourceUrl: `https://example.org/${id}`,
  matchReason: 'test',
  source: 'nsp',
  fit,
  ...extra,
});

test('ranker: deadline first, then fit; nothing else changes the order', () => {
  const plan = buildPlan(
    [
      opp('late-match', '2026-11-30', 'match', { amount: 'up to INR 1 lakh', source: 'buddy4study' }),
      opp('soon-unclear', '2026-10-31', 'unclear'),
      opp('soon-match', '2026-10-31', 'match', { dateSource: 'snippet' }),
      opp('soon-conditional', '2026-10-31', 'conditional'),
      opp('no-date-match', null, 'match'),
      opp('first', '2026-10-26', 'unclear'),
      opp('missed', '2026-10-01', 'match'),
    ],
    { today: TODAY },
  );
  assert.deepEqual(plan.items.map((i) => i.opportunityId), ['first', 'soon-match', 'soon-conditional', 'soon-unclear', 'late-match', 'no-date-match']);
  assert.deepEqual(plan.missed.map((i) => i.opportunityId), ['missed']);
  const noDate = plan.items.at(-1);
  assert.equal(noDate.deadlineLabel, 'deadline not published');
  assert.match(noDate.rankWhy, /No deadline is published/);
  assert.match(plan.items[2].rankWhy, /same date as #2, placed after it because you may match/);
  // source, amount and date confidence do not move anything
  const shuffled = buildPlan([...plan.items].reverse().map((i) => opp(i.opportunityId, i.deadline, i.fit)), { today: TODAY });
  assert.deepEqual(shuffled.items.map((i) => i.opportunityId), plan.items.map((i) => i.opportunityId));
  assert.ok(!('score' in plan.items[0]));
  assert.equal(typeof byRank, 'function');
});

test('Buddy4Study parser reads the current deadline and award, not past-year blocks', () => {
  const p = parseBuddy4Study(fixture('b4s-tata-pankh.md'), TODAY);
  assert.equal(p.title, 'Tata Capital Pankh Scholarship Program 2026-27');
  assert.equal(p.deadline, '2026-10-26');
  assert.equal(p.evidence, 'Deadline Date: 26-Oct-2026');
  assert.equal(p.pastDeadline, null);
  assert.equal(parseBuddy4Study(fixture('b4s-tata-pankh.md'), '2026-11-01').pastDeadline, '2026-10-26');
});

/** A stub TinyFish client that serves the committed fixtures. */
function stubClient({ failSearch } = {}) {
  return {
    async search({ include_domains }) {
      if (failSearch) throw new TinyFishError(failSearch);
      if (include_domains === 'buddy4study.com') return { results: [{ url: 'https://www.buddy4study.com/page/the-tata-capital-pankh-scholarship-programme', title: 'Tata', snippet: '' }] };
      return { results: [{ url: 'https://scholarships.gov.in/', title: 'NSP', snippet: 'Closing dates for student application is 31-10-2026' }] };
    },
    async fetchPages({ urls }) {
      const pages = {
        'https://scholarships.gov.in/All-Scholarships': fixture('nsp-all-scholarships.md'),
        'https://scholarships.gov.in/': 'From AY 2026-27 a student may apply for one merit-based scheme and one or more welfare-based schemes.',
        'https://www.buddy4study.com/page/the-tata-capital-pankh-scholarship-programme': fixture('b4s-tata-pankh.md'),
      };
      const results = [];
      const errors = [];
      for (const url of urls) {
        if (pages[url]) results.push({ url, final_url: url, title: null, text: pages[url], latency_ms: 1 });
        else if (/mahadbt2/.test(url)) errors.push({ url, error: 'proxy_error' });
        else results.push({ url, final_url: url, title: 'MahaDBT', text: 'Scheme page: OBC', latency_ms: 1 });
      }
      return { results, errors };
    },
  };
}

test('live run (stub client): real-shaped plan with sources, last-checked times, conflicts and a quoted rule', async () => {
  const run = createRun();
  await runLive(run, { client: stubClient(), today: TODAY, cacheDir: null });
  run.close();
  const plan = run.history.findLast((e) => e.kind === 'plan.ready').payload;
  assert.equal(plan.headline.date, '2026-10-31');
  assert.ok(plan.items.length >= 5);
  for (const i of plan.items) {
    assert.match(i.sourceUrl, /^https:\/\//);
    assert.ok(i.checkedAt, `${i.title} has a last-checked time`);
    assert.ok(i.deadline === null ? i.deadlineLabel === 'deadline not published' : /^\d{4}-\d{2}-\d{2}$/.test(i.deadline));
  }
  assert.ok(plan.items.every((i) => i.fit !== 'not_applicable'));
  assert.ok(plan.notApplicable.some((n) => /Pragati/.test(n.title) && /girl/.test(n.reason)));
  assert.ok(plan.notApplicable.some((n) => /Shahu/.test(n.title)));
  assert.equal(plan.sources.failed, 1, 'MahaDBT 2.0 fails, honestly');
  assert.ok(plan.sources.checked >= 8);
  const merit = plan.conflicts.find((c) => c.id === 'nsp-one-merit-scheme');
  assert.match(merit.officialRule.quote, /one merit-based scheme/);
  assert.equal(merit.officialRule.sourceUrl, 'https://scholarships.gov.in/');
  const fee = plan.conflicts.find((c) => c.id === 'csss-vs-state-fee-reimbursement');
  assert.equal(fee.officialRule, undefined, 'no fetched page states it, so no hard rule');
  assert.ok(run.history.some((e) => e.kind === 'kit.ready'));
  // the Verifier re-checked every item; none was dropped
  assert.ok(plan.items.every((i) => i.verification && ['verified', 'changed', 'unverified'].includes(i.verification.status)));
  assert.equal(run.history.filter((e) => e.kind === 'verify.result').length, plan.items.length);
});

test('live run (stub client): assembly, split and real handoffs between agents', async () => {
  const run = createRun();
  await runLive(run, { client: stubClient(), today: TODAY, cacheDir: null, briefMs: 0 });
  const h = run.history;
  const firstWalk = h.findIndex((e) => e.kind === 'agent.walking');
  assert.ok(h.findIndex((e) => e.kind === 'run.assembled') < firstWalk && h.findIndex((e) => e.kind === 'plan.split') < firstWalk, 'the briefing comes before anyone leaves');
  const split = h.find((e) => e.kind === 'plan.split').payload;
  assert.equal(split.mode, 'live');
  assert.ok(split.assignments.some((a) => a.agentId === 'nsp-scout' && a.to === 'nsp'));
  const handoffs = h.filter((e) => e.kind === 'handoff').map((e) => e.payload);
  for (const e of h.filter((x) => x.kind === 'agent.done' && /-scout$/.test(x.agentId))) {
    const ho = handoffs.find((x) => x.from === e.agentId && x.to === 'mayor');
    assert.ok(ho, `${e.agentId} hands its findings to the Mayor`);
    assert.equal(ho.count, e.payload.findings);
  }
  const toVerifier = handoffs.find((x) => x.from === 'mayor' && x.to === 'verifier');
  assert.ok(toVerifier && toVerifier.count > 0);
  assert.ok(handoffs.some((x) => x.from === 'verifier' && x.to === 'mayor'));
  assert.ok(handoffs.every((x) => !x.derived), 'live handoffs are real, not derived');
});

test('live run with a bad key throws before emitting anything', async () => {
  const run = createRun();
  await assert.rejects(runLive(run, { client: stubClient({ failSearch: { code: 'HTTP_401', message: 'unauthorized', status: 401 } }), today: TODAY, cacheDir: null }), LiveUnavailableError);
  assert.equal(run.history.length, 0);
});

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function eventsOf(base, runId) {
  const res = await fetch(`${base}/api/runs/${runId}/events`);
  const text = await res.text(); // the stream ends when the run closes
  return text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
}

test('fallback: live without a working key replays the last recording with a replay badge', async () => {
  const server = await listen(createApp({ record: false, cacheDir: null, client: stubClient({ failSearch: { code: 'HTTP_401', message: 'unauthorized', status: 401 } }) }));
  const base = `http://localhost:${server.address().port}`;
  const saved = process.env.TINYFISH_API_KEY;
  try {
    process.env.TINYFISH_API_KEY = 'test-placeholder';
    const { runId } = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'live', speed: 16 }),
    }).then((r) => r.json());
    const events = await eventsOf(base, runId);
    assert.equal(events[0].kind, 'run.mode');
    assert.equal(events[0].payload.mode, 'replay');
    assert.match(events[0].payload.fallbackReason, /401/);
    assert.ok(events.every((e) => e.replay === true));
    assert.equal(events.at(-1).kind, 'run.complete');

    delete process.env.TINYFISH_API_KEY;
    const second = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'live', speed: 16 }),
    }).then((r) => r.json());
    const first = (await eventsOf(base, second.runId))[0];
    assert.equal(first.payload.fallbackReason, 'No TinyFish API key on the server');
  } finally {
    if (saved === undefined) delete process.env.TINYFISH_API_KEY;
    else process.env.TINYFISH_API_KEY = saved;
    server.closeAllConnections?.();
    server.close();
  }
});

test('MODE picks the default: explicit value, else live with a key, else replay', () => {
  assert.equal(defaultMode({ MODE: 'mock' }), 'mock');
  assert.equal(defaultMode({ MODE: '', TINYFISH_API_KEY: 'x' }), 'live');
  assert.equal(defaultMode({}), 'replay');
});

test('Profiler: known facts from the sample student, unknowns never guessed', async () => {
  const { buildCriteria, UNKNOWN } = await import('../src/profile/profiler.js');
  const { SAMPLE_STUDENT } = await import('../src/fake/reconData.js');
  const p = buildCriteria(SAMPLE_STUDENT);
  assert.equal(p.label, 'sample student');
  assert.deepEqual(p.criteria, { gender: 'male', course: 'btech', level: 'ug', year: 2, category: 'OBC', state: 'Maharashtra', disability: false });
  assert.ok(p.known.some((k) => k.field === 'year' && k.value === '2nd year'));
  for (const f of ['familyIncome', 'capAdmission', 'domicileProof']) {
    const u = p.unknown.find((x) => x.field === f);
    assert.equal(u?.value, UNKNOWN, `${f} is unknown, needs your input`);
  }
  assert.equal(buildCriteria({ ...SAMPLE_STUDENT, familyIncome: 200000 }).unknown.some((u) => u.field === 'familyIncome'), false);
});
