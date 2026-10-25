import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialState, reduce, sourceCounts } from '../src/state/reducer.js';

const FAKE_RUN = new URL('../../recordings/fake-run.jsonl', import.meta.url);
const events = readFileSync(FAKE_RUN, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const play = (evts, state = initialState()) => evts.reduce(reduce, state);

test('fake-run.jsonl ends with every source settled and the honest MahaDBT 2.0 failure kept', () => {
  const s = play(events);
  assert.equal(s.status, 'complete');
  assert.deepEqual(sourceCounts(s), { done: 5, total: 5, failed: 0 });
  for (const id of s.agentOrder) assert.equal(s.agents[id].status, 'done', id);
  assert.equal(s.agents['nsp-scout'].target, 'townhall', 'scouts walk back home');
  assert.equal(s.agents.watchman.target, 'watchtower', 'the watchman stays on his tower');

  const state = s.buildings.mahadbt;
  const failed = Object.values(state.sources).filter((x) => x.status === 'failed');
  assert.equal(failed.length, 1);
  assert.equal(failed[0].url, 'https://mahadbt2.maharashtra.gov.in/');
  assert.equal(failed[0].retries, 1, 'MahaDBT 2.0 was retried once before giving up');
  assert.equal(s.plan.conflicts.length, 2);
  assert.ok(s.log.length > 0 && s.log.length <= 60);
});

test('same events twice (reconnect overlap) give the same picture as once', () => {
  const once = play(events);
  const cut = 30;
  const twice = play([...events.slice(0, cut), ...events.slice(cut - 10)]);
  assert.deepEqual(twice, once);
});

test('an error marks the agent failed with a retry marker, and the retry brings it back to work', () => {
  const at = (kind) => events.findIndex((e) => e.kind === kind && e.agentId === 'foundations-scout');
  const errIdx = at('agent.error');
  const afterError = play(events.slice(0, errIdx + 1));
  assert.equal(afterError.agents['foundations-scout'].status, 'failed');
  assert.equal(afterError.agents['foundations-scout'].retrying, true);
  assert.equal(afterError.buildings.foundations.status, 'failed');

  const nextWork = events.findIndex((e, i) => i > errIdx && e.kind === 'agent.working' && e.agentId === 'foundations-scout');
  const retried = play(events.slice(0, nextWork + 1));
  assert.equal(retried.agents['foundations-scout'].status, 'working');
  assert.equal(retried.buildings.foundations.status, 'busy');
  assert.equal(retried.buildings.foundations.sources[retried.buildings.foundations.current].retries, 1);
});

test('characters follow events only: walking sets the target, done and returning bring it home', () => {
  const walk = events.findIndex((e) => e.kind === 'agent.walking' && e.agentId === 'nsp-scout');
  const s1 = play(events.slice(0, walk + 1));
  assert.equal(s1.agents['nsp-scout'].status, 'walking');
  assert.equal(s1.agents['nsp-scout'].target, 'nsp');

  const ret = events.findIndex((e) => e.kind === 'agent.returning' && e.agentId === 'nsp-scout');
  const s2 = play(events.slice(0, ret + 1));
  assert.equal(s2.agents['nsp-scout'].status, 'walking');
  assert.equal(s2.agents['nsp-scout'].target, 'townhall');
  assert.equal(s2.agents['nsp-scout'].result, 'done');
});

test('unknown kinds are ignored, and a new runId starts a fresh state', () => {
  const s = play(events.slice(0, 5));
  const odd = { ...events[5], kind: 'deep.diver.dance', payload: { x: 1 } };
  const after = reduce(s, odd);
  assert.equal(after.lastSeq, odd.seq);
  assert.deepEqual(after.agents, s.agents);
  assert.equal(after.log.length, s.log.length);
  assert.equal(reduce(after, null), after);

  const other = reduce(play(events), { ...events[0], runId: 'run_other' });
  assert.equal(other.runId, 'run_other');
  assert.equal(other.agentOrder.length, 0);
  assert.equal(other.plan, null);
});

test('corner agents: Kit Builder, Conflict Checker, Verifier and Gatekeeper go to their corner buildings', () => {
  const ev = (seq, kind, agentId, building, payload = {}) => ({ v: 2, runId: 'r-corners', seq, t: seq * 10, kind, agentId, building, payload });
  let s = initialState();
  const events = [
    ev(1, 'agent.spawned', 'kit-builder', 'townhall', { name: 'Kit', role: 'Kit Builder' }),
    ev(2, 'agent.spawned', 'conflict-checker', 'townhall', { name: 'Cora', role: 'Conflict Checker' }),
    ev(3, 'cache.hit', 'gatekeeper', 'townhall', { url: 'https://x' }), // older recording: Town Hall
    ev(4, 'agent.working', 'verifier', 'townhall', { tool: 'fetch', target: '3 pages' }),
    ev(5, 'verify.result', 'verifier', 'nsp', { opportunityId: 'a', status: 'changed', reason: 'moved' }),
    ev(6, 'kit.building', 'kit-builder', 'appdesk', { opportunityId: 'a', title: 'A', derived: true }),
    ev(7, 'kit.ready', 'kit-builder', 'appdesk', { id: 'kit:a', title: 'A' }),
    ev(8, 'conflict.check', 'conflict-checker', 'auditor', { ruleId: 'r1', title: 'R1', result: 'warning' }),
    ev(9, 'conflict.check', 'conflict-checker', 'auditor', { ruleId: 'r2', title: 'R2', result: 'clear' }),
  ];
  for (const e of events) s = reduce(s, e);
  assert.equal(s.agents.gatekeeper.target, 'checkpoint');
  assert.equal(s.agents.verifier.target, 'inspection');
  assert.equal(s.agents['kit-builder'].target, 'appdesk');
  assert.equal(s.agents['conflict-checker'].target, 'auditor');
  assert.equal(s.kitBuilds, 1);
  assert.equal(s.kits, 1);
  assert.ok(s.kitsRebuilt);
  assert.equal(s.conflictChecks.length, 2);
  assert.equal(s.buildings.auditor.status, 'busy');
  assert.match(s.log.find((l) => l.kind === 'kit.building').text, /rebuilt from the recording/);
});
