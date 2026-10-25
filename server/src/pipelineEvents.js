// Events that show how the pipeline is organised (EVENT_SCHEMA "Assembly and handoffs"):
//   run.assembled  every agent has gathered at Town Hall
//   plan.split     the Mayor's assignments: who goes where, which sources, the run mode
//   handoff        data really passes from one agent to another (a scout's findings to the
//                  Mayor's Judge and Ranker, plan items to the Verifier, results back)
// The live run and the scripted run emit these at the points in the code where the
// hand-over happens. Recordings made before these events existed are upgraded on replay
// by upgradeLegacy(): the same events, rebuilt only from that recording's own events and
// marked `derived: true`.

export const BRIEFING_MS = 2500; // how long the agents stay gathered while the Mayor briefs

const TASKS = {
  'nsp-scout': { to: 'nsp', task: 'Read the NSP scheme list and its dates', sources: ['NSP (scholarships.gov.in)'] },
  'mahadbt-scout': { to: 'mahadbt', task: 'Read the MahaDBT scheme pages', sources: ['MahaDBT 1.0', 'MahaDBT 2.0'] },
  'foundations-scout': { to: 'foundations', task: 'Search and read private scholarship pages', sources: ['Buddy4Study'] },
  'opps-scout': { to: 'opportunities', task: 'Read the hackathon feeds', sources: ['Devpost JSON', 'HackerEarth JSON'] },
  watchman: { to: 'watchtower', task: 'Re-check NSP dates', sources: ['NSP'] },
  verifier: { to: 'townhall', task: 'Re-check every plan item at its source' },
  gatekeeper: { to: 'townhall', task: 'Guard every web call (cache, limits, robots.txt)' },
  profiler: { to: 'townhall', task: 'Turn the profile into criteria' },
  mayor: { to: 'townhall', task: 'Judge, rank and build the plan' },
};

/** The plan.split payload for these agents. */
export function splitFor(agentIds, mode, names = {}) {
  const assignments = agentIds.map((id) => ({ agentId: id, name: names[id] ?? id, ...(TASKS[id] ?? { to: 'townhall', task: '' }) }));
  const sources = [...new Set(assignments.flatMap((a) => a.sources ?? []))];
  return { mode, assignments, sources };
}

export function emitAssembly(run, agentIds, { mode, names = {}, derived = false } = {}) {
  run.emit('run.assembled', { agentId: 'mayor', building: 'townhall', payload: { at: 'townhall', agents: agentIds, ...(derived && { derived }) } });
  run.emit('plan.split', { agentId: 'mayor', building: 'townhall', payload: { ...splitFor(agentIds, mode, names), ...(derived && { derived }) } });
}

/** One hand-over of data between two agents, shown at the Cafeteria. */
export function handoffPayload({ from, to, summary, count = null, what = null, derived = false }) {
  return { from, to, summary, ...(count !== null && { count }), ...(what && { what }), ...(derived && { derived }) };
}
export function emitHandoff(run, h) {
  run.emit('handoff', { agentId: h.from, building: 'cafeteria', payload: handoffPayload(h) });
}

const SCOUT = /-scout$/;

/**
 * Recordings without run.assembled: insert the assembly, the split and the handoffs,
 * rebuilt from the recording's own events (spawned agents, mode, agent.done counts,
 * the Verifier's work). Returns the events unchanged if they already have them.
 */
export function upgradeLegacy(events) {
  if (events.some((e) => e.kind === 'run.assembled')) return events;
  const out = [];
  const names = {};
  const mode = events.find((e) => e.kind === 'run.mode')?.payload?.mode ?? events.find((e) => e.kind === 'run.started')?.payload?.mode ?? null;
  const spawned = events.filter((e) => e.kind === 'agent.spawned').map((e) => e.agentId);
  for (const e of events) if (e.kind === 'agent.spawned') names[e.agentId] = e.payload?.name ?? e.agentId;
  const lastSpawn = events.findLastIndex((e) => e.kind === 'agent.spawned');
  let shift = 0; // recording time added for the briefing pause
  const add = (base, kind, agentId, building, payload) => out.push({ ...base, kind, agentId, building, payload: { ...payload, derived: true }, t: base.t + shift });
  let verifyItems = null;
  events.forEach((e, i) => {
    out.push({ ...e, t: (e.t ?? 0) + shift });
    if (i === lastSpawn && spawned.length) {
      add(e, 'run.assembled', 'mayor', 'townhall', { at: 'townhall', agents: spawned });
      add(e, 'plan.split', 'mayor', 'townhall', splitFor(spawned, mode, names));
      shift += BRIEFING_MS;
    }
    if (e.kind === 'profile.ready' && e.agentId === 'profiler') {
      const p = e.payload ?? {};
      add(e, 'handoff', 'profiler', 'cafeteria', handoffPayload({ from: 'profiler', to: 'mayor', summary: `criteria: ${p.known?.length ?? 0} known, ${p.unknown?.length ?? 0} unknown`, what: 'criteria' }));
    }
    if (e.kind === 'agent.done' && SCOUT.test(e.agentId ?? '')) {
      const n = e.payload?.findings ?? 0;
      add(e, 'handoff', e.agentId, 'cafeteria', handoffPayload({ from: e.agentId, to: 'mayor', summary: `${n} item${n === 1 ? '' : 's'} found`, count: n, what: 'findings' }));
    }
    if (e.kind === 'plan.updated') verifyItems = e.payload?.items?.length ?? verifyItems;
    if (e.kind === 'agent.working' && e.agentId === 'verifier' && verifyItems !== null) {
      // the Mayor hands the ranked items over just before the Verifier starts
      out.splice(out.length - 1, 0, { ...e, kind: 'handoff', agentId: 'mayor', building: 'cafeteria', t: e.t + shift, payload: { ...handoffPayload({ from: 'mayor', to: 'verifier', summary: `${verifyItems} plan items to re-check`, count: verifyItems, what: 'plan items' }), derived: true } });
      verifyItems = null;
    }
    if (e.kind === 'agent.done' && e.agentId === 'verifier') {
      const p = e.payload ?? {};
      add(e, 'handoff', 'verifier', 'cafeteria', handoffPayload({ from: 'verifier', to: 'mayor', summary: `${p.verified ?? 0} re-checked, ${p.changed ?? 0} changed, ${p.unverified ?? 0} not re-checked`, what: 'verifier results' }));
    }
  });
  return out;
}
