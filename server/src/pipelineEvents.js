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
  verifier: { to: 'townhall', task: 'Re-check every plan item at its source (Inspection Office)' },
  gatekeeper: { to: 'townhall', task: 'Guard every web call: cache, limits, robots.txt (Checkpoint)' },
  'kit-builder': { to: 'townhall', task: 'Prepare a read-only Application Kit per scholarship (Application Desk)' },
  'conflict-checker': { to: 'townhall', task: 'Check the plan for schemes that may not be combinable (Auditor’s Office)' },
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

// ---------- corner districts (city v3) ----------
// The Kit Builder and the Conflict Checker were code roles inside the Mayor's step; they
// now emit their own events at the point where that code runs:
//   kit.building     { opportunityId, title }  just before buildKit() for one scholarship
//   conflict.check   { ruleId, title, result: "warning"|"clear", ids, officialRule }
//                    one per rule in CONFLICT_RULES, from the final plan's conflicts
// The Gatekeeper's events (cache.*, rate.limited, blocked, fallback) are sent from the
// Checkpoint, and the Verifier works at the Inspection Office.

export const CORNER_AGENTS = {
  'kit-builder': { name: 'Kit', role: 'Kit Builder', building: 'appdesk' },
  'conflict-checker': { name: 'Cora', role: 'Conflict Checker', building: 'auditor' },
};

/** One conflict.check payload per rule: "warning" when the plan has that conflict. */
export function conflictChecks(plan, rules) {
  const byId = new Map((plan?.conflicts ?? []).map((c) => [c.id, c]));
  return rules.map((r) => {
    const c = byId.get(r.id);
    return { ruleId: r.id, title: r.title, result: c ? 'warning' : 'clear', ids: c?.ids ?? [], officialRule: !!c?.officialRule };
  });
}

/** Kit Builder: walk to the Application Desk, then kit.building + kit.ready per scholarship. */
export async function emitKits(run, opps, build, { pause = async () => {} } = {}) {
  const at = { agentId: 'kit-builder', building: 'appdesk' };
  const kitIds = new Map();
  if (!opps.length) return kitIds;
  run.emit('agent.walking', { agentId: 'kit-builder', building: 'townhall', payload: { to: 'appdesk', reason: `Preparing ${opps.length} Application Kits` } });
  for (const o of opps) {
    run.emit('kit.building', { ...at, payload: { opportunityId: o.id, title: o.title } });
    const kit = build(o);
    kitIds.set(o.id, kit.id);
    await pause();
    run.emit('kit.ready', { ...at, payload: kit });
  }
  run.emit('agent.done', { ...at, payload: { findings: 0, durationMs: 0, kits: kitIds.size } });
  return kitIds;
}

/** Conflict Checker: walk to the Auditor's Office and report every rule's check. */
export function emitConflictChecks(run, plan, rules) {
  const at = { agentId: 'conflict-checker', building: 'auditor' };
  const checks = conflictChecks(plan, rules);
  run.emit('agent.walking', { agentId: 'conflict-checker', building: 'townhall', payload: { to: 'auditor', reason: `Checking ${rules.length} "may not be combinable" rules` } });
  for (const c of checks) run.emit('conflict.check', { ...at, payload: c });
  const warnings = checks.filter((c) => c.result === 'warning').length;
  run.emit('agent.done', { ...at, payload: { findings: 0, durationMs: 0, checked: checks.length, warnings } });
}

const REBUILT = { derived: true, note: 'rebuilt from the recording' };

/**
 * Recordings without kit.building / conflict.check: add the Kit Builder and the Conflict
 * Checker, rebuilt only from that recording's own kit.ready and plan.ready events, marked
 * `derived: true` and "rebuilt from the recording". The recorded events are kept as they are.
 */
export function upgradeCorners(events, rules) {
  const hasKits = events.some((e) => e.kind === 'kit.building');
  const hasChecks = events.some((e) => e.kind === 'conflict.check');
  if (hasKits && hasChecks) return events;
  const kits = events.filter((e) => e.kind === 'kit.ready');
  const planReady = events.find((e) => e.kind === 'plan.ready');
  const needKits = !hasKits && kits.length > 0;
  const needChecks = !hasChecks && !!planReady;
  if (!needKits && !needChecks) return events;
  const lastSpawn = events.findLastIndex((e) => e.kind === 'agent.spawned');
  const firstKit = kits[0];
  const lastKit = kits.at(-1);
  const out = [];
  const mk = (base, kind, agentId, building, payload) => ({ ...base, kind, agentId, building, payload: { ...payload, ...REBUILT } });
  const spawn = (base, id) => out.push(mk(base, 'agent.spawned', id, 'townhall', { name: CORNER_AGENTS[id].name, role: CORNER_AGENTS[id].role }));
  events.forEach((e, i) => {
    if (needChecks && e === planReady) {
      out.push(mk(e, 'agent.walking', 'conflict-checker', 'townhall', { to: 'auditor', reason: 'Checking "may not be combinable" rules' }));
      const checks = conflictChecks(e.payload, rules);
      for (const c of checks) out.push(mk(e, 'conflict.check', 'conflict-checker', 'auditor', c));
      out.push(mk(e, 'agent.done', 'conflict-checker', 'auditor', { findings: 0, durationMs: 0, checked: checks.length, warnings: checks.filter((c) => c.result === 'warning').length }));
    }
    if (needKits && e === firstKit) out.push(mk(e, 'agent.walking', 'kit-builder', 'townhall', { to: 'appdesk', reason: `Preparing ${kits.length} Application Kits` }));
    if (needKits && e.kind === 'kit.ready') out.push(mk(e, 'kit.building', 'kit-builder', 'appdesk', { opportunityId: e.payload?.opportunityId ?? e.payload?.id, title: e.payload?.title }));
    out.push(e);
    if (needKits && e === lastKit) out.push(mk(e, 'agent.done', 'kit-builder', 'appdesk', { findings: 0, durationMs: 0, kits: kits.length }));
    if (i === lastSpawn) {
      if (needKits) spawn(e, 'kit-builder');
      if (needChecks) spawn(e, 'conflict-checker');
    }
  });
  return out;
}
