// Scripted orchestrator (mode "fake"): emits a realistic EVENT_SCHEMA v2 sequence
// with random delays, using real recon data as payloads. No network calls.

import * as recon from './fake/reconData.js';
import { buildPlan } from './rank/ranker.js';
import { buildKit } from './kit/buildKit.js';
import { buildCriteria } from './profile/profiler.js';
import { BRIEFING_MS, CORNER_AGENTS, emitAssembly, emitConflictChecks, emitHandoff, emitKits } from './pipelineEvents.js';
import { CONFLICT_RULES } from './rank/conflicts.js';

// The recon was taken on this date, so the fake run uses it as "today" and the
// day counts match the data ("7 days left"). Live runs use the real IST date.
export const RECON_DATE = '2026-10-24';

const AGENTS = {
  'nsp-scout': { name: 'Nisha', role: 'NSP Scout', building: 'nsp' },
  'mahadbt-scout': { name: 'Mahi', role: 'MahaDBT Scout', building: 'mahadbt' },
  'foundations-scout': { name: 'Fauzi', role: 'Foundations Scout', building: 'foundations' },
  'opps-scout': { name: 'Hacky', role: 'Opportunities Scout', building: 'opportunities' },
  watchman: { name: 'Wardu', role: 'Watchman', building: 'watchtower' },
  mayor: { name: 'Mayor Tara', role: 'Town Hall', building: 'townhall' },
  verifier: { name: 'Vera', role: 'Verifier', building: 'townhall' },
  profiler: { name: 'Priya', role: 'Profiler', building: 'townhall' },
  ...CORNER_AGENTS,
};

/**
 * @param {ReturnType<import('./bus.js').createRun>} run
 * @param {{ profile?: object, opportunities?: boolean, pace?: number, today?: string }} [opts]
 *   pace scales every delay (1 = demo speed, 0 = instant, for tests)
 */
export async function runFake(run, opts = {}) {
  const {
    profile = recon.SAMPLE_STUDENT,
    opportunities = process.env.OPPORTUNITIES !== 'off',
    pace = 1,
    today = RECON_DATE,
  } = opts;
  const startedAt = Date.now();
  const sleep = (ms) => (pace > 0 ? new Promise((r) => setTimeout(r, ms * pace * (0.6 + Math.random() * 0.8))) : Promise.resolve());

  const scouts = ['nsp-scout', 'mahadbt-scout', 'foundations-scout', ...(opportunities ? ['opps-scout'] : [])];
  const agentIds = [...scouts, 'watchman', 'mayor', 'verifier', 'profiler', 'kit-builder', 'conflict-checker'];
  const profiled = buildCriteria(profile);
  const found = [];
  const notes = [];
  let headline = null;
  let errors = 0;

  const as = (agentId) => {
    const { building } = AGENTS[agentId];
    const emit = (kind, payload, at = building) => run.emit(kind, { agentId, building: at, payload });
    return {
      id: agentId,
      walk: (reason) => emit('agent.walking', { to: building, reason }, 'townhall'),
      work: (tool, target, label) => emit('agent.working', { tool, target, label }),
      progress: (text, tool) => emit('agent.progress', { text, ...(tool && { tool }) }),
      found: (payload) => {
        if (!payload.note) found.push(payload);
        emit('agent.found', payload);
      },
      error: (payload) => {
        errors++;
        emit('agent.error', payload);
      },
      done: (n, t0) => {
        doneCounts[agentId] = n;
        emit('agent.done', { findings: n, durationMs: Date.now() - t0 });
      },
      back: () => emit('agent.returning', { to: 'townhall' }),
    };
  };
  const doneCounts = {};

  run.emit('run.started', { payload: { profile, mode: 'fake', today, agents: agentIds } });
  for (const id of agentIds) {
    await sleep(150);
    run.emit('agent.spawned', { agentId: id, building: 'townhall', payload: { name: AGENTS[id].name, role: AGENTS[id].role } });
  }
  run.emit('profile.ready', { agentId: 'profiler', building: 'townhall', payload: profiled });
  run.emit('agent.done', { agentId: 'profiler', building: 'townhall', payload: { findings: 0, durationMs: 0, unknown: profiled.unknown.length } });
  emitHandoff(run, { from: 'profiler', to: 'mayor', summary: `criteria: ${profiled.known.length} known, ${profiled.unknown.length} unknown`, what: 'criteria' });
  emitAssembly(run, agentIds, { mode: 'fake', names: Object.fromEntries(agentIds.map((id) => [id, AGENTS[id].name])) });
  await sleep(BRIEFING_MS);

  const notApplicable = [...recon.NOT_APPLICABLE, ...recon.MAHADBT_SKIPPED.map(({ title, reason, sourceUrl }) => ({ title, reason: reason[0].toUpperCase() + reason.slice(1), sourceUrl }))];
  // the scripted run "checks" these sources; MahaDBT 2.0 is the one that fails
  const sources = { checked: 6, failed: 1, lastChecked: recon.RECON_CHECKED_AT };
  let verification = new Map();
  const planNow = (extra = {}) => buildPlan(found, { today, headline, notes, notApplicable, sources, verification, profile: profiled, ...extra });
  const returnHome = async (a) => {
    await sleep(600);
    a.back();
    const n = doneCounts[a.id] ?? 0;
    emitHandoff(run, { from: a.id, to: 'mayor', summary: `${n} item${n === 1 ? '' : 's'} found`, count: n, what: 'findings' });
    await sleep(2500); // the walk back
    run.emit('plan.updated', { agentId: 'mayor', building: 'townhall', payload: planNow() });
  };

  async function nspScout() {
    const a = as('nsp-scout');
    const t0 = Date.now();
    a.walk('Checking NSP scheme list');
    await sleep(3000);
    a.work('search', 'scholarship student application last date 2026-27 (scholarships.gov.in)', 'Search NSP');
    await sleep(1800);
    headline = recon.NSP_HEADLINE;
    a.found({ note: true, headline: true, text: recon.NSP_HEADLINE.evidence, sourceUrl: recon.NSP_HEADLINE.sourceUrl, bubble: 'NSP closes 31 Oct: 7 days left!' });
    await sleep(800);
    a.work('fetch', 'https://scholarships.gov.in/All-Scholarships', 'Fetch All-Scholarships');
    await sleep(2300);
    a.progress('Parsed 31 schemes; 3 match OBC + B.Tech (Pragati skipped: girls only)', 'fetch');
    for (const o of recon.nsp) {
      await sleep(900);
      a.found(o);
    }
    a.done(recon.nsp.length + 1, t0);
    await returnHome(a);
  }

  async function mahadbtScout() {
    const a = as('mahadbt-scout');
    const t0 = Date.now();
    a.walk('Checking MahaDBT state schemes');
    await sleep(3000);
    a.work('fetch', 'https://mahadbt.maharashtra.gov.in/', 'Fetch MahaDBT landing');
    await sleep(3600);
    notes.push('MahaDBT: AY 2026-27 applications only via MahaDBT 2.0 (mahadbt2.maharashtra.gov.in). Deadlines are not published on scheme pages.');
    a.found(recon.MAHADBT_NOTE);
    await sleep(700);
    a.work('fetch', recon.MAHADBT2_FAILURE.url, 'Fetch MahaDBT 2.0 (for deadlines)');
    await sleep(2500);
    a.error({ tool: 'fetch', code: recon.MAHADBT2_FAILURE.code, message: recon.MAHADBT2_FAILURE.message, target: recon.MAHADBT2_FAILURE.url, retrying: true });
    await sleep(1500);
    a.work('fetch', recon.MAHADBT2_FAILURE.url, 'Retry MahaDBT 2.0');
    await sleep(2500);
    a.error({ tool: 'fetch', code: recon.MAHADBT2_FAILURE.code, message: `${recon.MAHADBT2_FAILURE.message}. Gave up; deadlines stay "not published".`, target: recon.MAHADBT2_FAILURE.url, retrying: false });
    await sleep(700);
    a.progress(`About 45 Post Matric schemes listed on MahaDBT 1.0; reading 4 that mention OBC or professional courses`, 'fetch');
    await sleep(500);
    a.work('fetch', '4 SchemeData pages on mahadbt.maharashtra.gov.in', 'Fetch 4 scheme pages');
    await sleep(2800);
    for (const s of recon.MAHADBT_SKIPPED) {
      await sleep(500);
      a.progress(`Skipped "${s.title.slice(0, 44)}…": ${s.reason}`, 'fetch');
    }
    for (const o of recon.mahadbt) {
      await sleep(700);
      a.found(o);
    }
    a.done(recon.mahadbt.length + 1, t0);
    await returnHome(a);
  }

  async function foundationsScout() {
    const a = as('foundations-scout');
    const t0 = Date.now();
    a.walk('Checking private and foundation scholarships');
    await sleep(3000);
    a.work('search', 'scholarship 2026-27 B.Tech OBC Maharashtra deadline (buddy4study.com)', 'Search Buddy4Study');
    await sleep(1500);
    a.work('fetch', '2 Buddy4Study detail pages', 'Fetch scholarship pages');
    await sleep(4000);
    a.error({ tool: 'fetch', code: 'slow', message: 'Buddy4Study page is slow, still waiting', target: 'https://www.buddy4study.com/', retrying: true });
    await sleep(1500);
    a.work('fetch', '2 Buddy4Study detail pages', 'Retry Buddy4Study pages');
    await sleep(2000);
    a.progress(`Listed as unclear: "${recon.FOUNDATIONS_SKIPPED.title.slice(0, 40)}…": ${recon.FOUNDATIONS_SKIPPED.reason}`, 'fetch');
    for (const o of recon.foundations) {
      await sleep(800);
      a.found(o);
    }
    a.done(recon.foundations.length, t0);
    await returnHome(a);
  }

  async function oppsScout() {
    const a = as('opps-scout');
    const t0 = Date.now();
    a.walk('Looking for hackathons for a CE student');
    await sleep(3000);
    a.work('fetch', 'devfolio.co, mlh.io, devpost.com (JSON), hackerearth.com (JSON)', 'Fetch 4 hackathon listings');
    await sleep(2000);
    a.progress('Kept online events and in-person events in India that are still open', 'fetch');
    const [unstop, rest] = [recon.opportunities.filter((o) => o.source === 'unstop'), recon.opportunities.filter((o) => o.source !== 'unstop')];
    for (const o of rest) {
      await sleep(600);
      a.found(o);
    }
    a.work('search', 'hackathon registration deadline November 2026 India students (unstop.com)', 'Search Unstop');
    await sleep(1500);
    for (const o of unstop) a.found(o);
    a.done(recon.opportunities.length, t0);
    await returnHome(a);
  }

  async function watchman() {
    const emit = (kind, payload, at = 'watchtower') => run.emit(kind, { agentId: 'watchman', building: at, payload });
    await sleep(2000);
    emit('agent.walking', { to: 'watchtower', reason: 'Re-checking NSP dates' }, 'townhall');
    await sleep(3000);
    emit('agent.working', { tool: 'monitor', target: 'https://scholarships.gov.in/All-Scholarships', label: 'Monitor run-now' });
    await sleep(5000);
    emit('watchtower.checked', { monitorId: 'fake-monitor', checkedAt: new Date().toISOString(), schemesTracked: 31 });
    emit('agent.done', { findings: 0, durationMs: 0 });
  }

  await Promise.all([nspScout(), mahadbtScout(), foundationsScout(), ...(opportunities ? [oppsScout()] : []), watchman()]);

  // Town Hall: final plan, then a kit for every scholarship in it.
  // Verifier: a mock run has no network, so nothing is re-checked, and the badges say so
  {
    const emitV = (kind, payload, building = 'inspection') => run.emit(kind, { agentId: 'verifier', building, payload });
    const SOURCE_BUILDING = { nsp: 'nsp', mahadbt: 'mahadbt', buddy4study: 'foundations' };
    emitHandoff(run, { from: 'mayor', to: 'verifier', summary: `${planNow().items.length} plan items to re-check`, count: planNow().items.length, what: 'plan items' });
    emitV('agent.working', { tool: 'fetch', target: 'none (mock run)', label: 'Re-check plan items' });
    verification = new Map();
    for (const item of planNow().items) {
      const r = { status: 'unverified', reason: 'Mock run: the Verifier makes no network calls, so this was not re-checked.', checkedAt: null, sourceUrl: item.sourceUrl };
      verification.set(item.opportunityId, r);
      emitV('verify.result', { opportunityId: item.opportunityId, title: item.title, ...r }, SOURCE_BUILDING[item.source] ?? 'opportunities');
    }
    emitV('agent.done', { findings: 0, durationMs: 0, verified: 0, changed: 0, unverified: verification.size });
    emitHandoff(run, { from: 'verifier', to: 'mayor', summary: `0 re-checked, 0 changed, ${verification.size} not re-checked (mock)`, what: 'verifier results' });
  }

  const scholarships = found.filter((o) => o.kind === 'scholarship');
  const firstPlan = planNow();
  const planned = new Set(firstPlan.items.map((i) => i.opportunityId));
  await sleep(500);
  const kitIds = await emitKits(run, scholarships.filter((o) => planned.has(o.id)), (opp) => buildKit(opp, profile, { today }), { pause: () => sleep(200) });
  emitConflictChecks(run, planNow({ kitIds }), CONFLICT_RULES);
  run.emit('plan.ready', { agentId: 'mayor', building: 'townhall', payload: planNow({ kitIds }) });
  run.emit('run.complete', { payload: { durationMs: Date.now() - startedAt, findings: found.length, errors } });
}
