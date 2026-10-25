// Pure reducer: EVENT_SCHEMA v2 events -> the city's state. Every character and
// building state comes from here, so the same events always give the same picture
// (live, fake or replayed). Unknown kinds are ignored. No React, no three.js.

export const LOG_LIMIT = 60;

export function initialState() {
  return {
    runId: null,
    status: 'idle', // idle | starting | running | complete | failed
    connection: 'closed', // closed | open | reconnecting | lost
    replay: false,
    mode: null,
    lastSeq: 0,
    lastT: 0,
    agentOrder: [],
    agents: {},
    buildings: {},
    log: [],
    runMode: null, // { mode: live | replay | mock, recording?, recordedAt?, fallbackReason? }
    sourcesNotUsed: [],
    plan: null,
    kits: 0,
    kitsById: {},
    kitBuilds: 0, // kit.building events (Kit Builder at the Application Desk)
    kitsRebuilt: false, // true when those were rebuilt from an older recording
    conflictChecks: [], // conflict.check payloads (Conflict Checker at the Auditor's Office)
    headline: null,
    watchtower: null,
    summary: null,
    // observability (System view): counts straight from the events
    eventCounts: {}, // kind -> n
    gate: { hits: 0, misses: 0, rateLimited: 0, blocked: 0, fallbacks: 0, blockedHosts: [] },
    tools: { ok: 0, failed: 0, cached: 0 }, // TinyFish calls as seen by the scouts
    verification: {}, // opportunityId -> { status, reason, checkedAt }
    profile: null, // Profiler output
    assembly: null, // run.assembled payload
    planSplit: null, // plan.split payload (the Mayor's briefing card), plus the library request
    handoffs: [], // recent handoff events: { seq, t, from, to, summary }
    library: null, // library.result payload
    sinceLastRun: null, // library.diff payload
    error: null,
  };
}

// the four corner buildings and the agent who works at each (city v3)
export const CORNER_OF = { gatekeeper: 'checkpoint', verifier: 'inspection', 'kit-builder': 'appdesk', 'conflict-checker': 'auditor' };

const isUrl = (s) => typeof s === 'string' && /^https?:\/\//.test(s);

function newAgent(id, slot) {
  return {
    id,
    name: id,
    role: '',
    slot,
    status: 'idle', // idle | walking | working | done | failed
    target: 'townhall', // building the character is at or heading to
    result: null, // done | failed, set by agent.done
    tool: null,
    url: null,
    retrying: false,
    errors: 0,
    findings: 0,
    bubble: null, // { text, seq }
    lastEvent: null,
  };
}

function newBuilding(id) {
  return {
    id,
    status: 'idle', // idle | busy | done | failed
    agentId: null,
    tool: null,
    url: null,
    current: null, // key into sources
    sources: {}, // key -> { label, url, status: busy | ok | failed, retries, message }
    findings: 0,
    retrying: false,
    lastEvent: null,
  };
}

/** One line for the event log and the side cards. */
export function describe(evt) {
  const p = evt.payload ?? {};
  switch (evt.kind) {
    case 'run.mode':
      return p.mode === 'live' ? 'Live run: reading real pages through TinyFish' : `${p.mode === 'mock' ? 'Mock run' : 'Replaying recorded run'}${p.recording ? ` (${p.recording})` : ''}${p.fallbackReason ? `. Fallback: ${p.fallbackReason}` : ''}`;
    case 'run.started': return `Run started (${p.mode ?? '?'}${evt.replay ? ', replay' : ''}) for the ${p.profile?.label ?? 'student'}`;
    case 'agent.spawned': return `${p.name ?? evt.agentId} (${p.role ?? 'agent'}) spawned at Town Hall`;
    case 'agent.walking': return `Walking to ${p.to}: ${p.reason ?? ''}`.trim();
    case 'agent.working': return `${p.tool ?? 'call'}: ${p.label ?? p.target ?? ''}`;
    case 'agent.progress': return p.text ?? '';
    case 'agent.found': return p.note ? p.bubble ?? p.text : `Found: ${p.bubble ?? p.title}`;
    case 'agent.error': return `${p.code ?? 'error'}: ${p.message ?? ''}${p.retrying ? ' (retrying)' : ' (gave up)'}`;
    case 'agent.done': return `Done, ${p.findings ?? 0} findings`;
    case 'agent.returning': return 'Walking back to Town Hall';
    case 'plan.updated': return `Plan updated: ${p.items?.length ?? 0} items`;
    case 'plan.ready': return `Plan ready: ${p.items?.length ?? 0} items${p.conflicts?.length ? `, ${p.conflicts.length} conflicts` : ''}`;
    case 'kit.ready': return `Application Kit ready: ${p.title ?? p.id}`;
    case 'kit.building': return `Kit Builder preparing a read-only kit: ${p.title ?? p.opportunityId}${p.derived ? ' (rebuilt from the recording)' : ''}`;
    case 'conflict.check': return `Conflict check, ${p.title}: ${p.result === 'warning' ? 'may not be combinable' : 'no conflict in this plan'}${p.derived ? ' (rebuilt from the recording)' : ''}`;
    case 'watchtower.checked': return `Checked ${p.schemesTracked ?? '?'} schemes, no date changes`;
    case 'watchtower.change': return `Date changed: ${p.changes?.length ?? 0} schemes`;
    case 'run.assembled': return `Everyone gathered at Town Hall (${p.agents?.length ?? 0} agents)${p.derived ? ' · rebuilt from the recording' : ''}`;
    case 'plan.split': return `Briefing: ${p.assignments?.filter((a) => a.to !== 'townhall').length ?? 0} agents to ${p.sources?.length ?? 0} sources (${p.mode ?? '?'} run)`;
    case 'handoff': return `Handoff ${p.from} → ${p.to}: ${p.summary}${p.derived ? ' (rebuilt from the recording)' : ''}`;
    case 'library.request': return 'Mayor asks the Librarian for your last run';
    case 'library.result': return `Library (${p.store}): ${p.summary}`;
    case 'library.diff': return p.previous ? `Since your last run: ${p.newItems?.length ?? 0} new, ${p.closedItems?.length ?? 0} closed, ${p.deadlineChanged?.length ?? 0} deadlines changed` : 'Since your last run: no previous run for this profile';
    case 'run.complete': return `Run complete: ${p.findings ?? 0} findings, ${p.errors ?? 0} errors`;
    case 'run.failed': return `Run failed: ${p.message ?? ''}`;
    case 'profile.ready': return `Profile read: ${p.known?.length ?? 0} facts known, ${p.unknown?.length ?? 0} unknown (needs your input)`;
    case 'verify.result': return `${VERIFY_LABEL[p.status] ?? p.status}: ${p.title ?? p.opportunityId}${p.status === 'verified' ? '' : `. ${p.reason}`}`;
    case 'cache.hit': return `Cache hit: ${p.url ?? p.call} (fetched ${Math.round((p.ageMs ?? 0) / 60000)} min ago)`;
    case 'cache.miss': return `Cache miss: ${p.url ?? p.call}, fetching live`;
    case 'rate.limited': return `Backing off ${Math.round((p.retryInMs ?? 0) / 100) / 10} s (${p.reason}), attempt ${p.attempt}`;
    case 'blocked': return `Blocked at ${p.host}: ${p.reason}. Stopped for this host`;
    case 'fallback': return `Fallback to the cached copy from ${p.usingCacheFrom}: ${p.reason}`;
    default: return evt.kind;
  }
}

export const VERIFY_LABEL = { verified: 'Verified', changed: 'Changed since ranking', unverified: 'Could not verify' };

/** The few payload fields the guided captions need (keeps the log small). */
function brief(kind, p) {
  const keep = ['mode', 'fallbackReason', 'to', 'tool', 'code', 'retrying', 'host', 'reason', 'status', 'title', 'findings', 'errors'];
  const out = Object.fromEntries(keep.filter((k) => p[k] !== undefined && typeof p[k] !== 'object').map((k) => [k, p[k]]));
  if (Array.isArray(p.items)) out.itemCount = p.items.length;
  if (Array.isArray(p.unknown)) out.unknownCount = p.unknown.length;
  return out;
}

/** Agents that help but do not visit a source; they are not counted in "sources done". */
export const HELPERS = new Set(['mayor', 'gatekeeper', 'verifier', 'profiler', 'librarian']);

const LEVEL = {
  'blocked': 'error', 'agent.error': 'error', 'run.failed': 'error', 'agent.found': 'good', 'plan.ready': 'good', 'run.complete': 'good' };

/** Sources done / total: every agent except the mayor (Town Hall) is a source visit. */
export function sourceCounts(state) {
  const ids = state.agentOrder.filter((id) => !HELPERS.has(id));
  const done = ids.filter((id) => state.agents[id].result).length;
  const failed = ids.filter((id) => state.agents[id].result === 'failed').length;
  return { done, total: ids.length, failed };
}

export function reduce(state, evt) {
  if (!evt || typeof evt !== 'object') return state;

  // local (non-server) actions
  if (evt.kind === 'local.reset') return { ...initialState(), status: evt.starting ? 'starting' : 'idle' };
  if (evt.kind === 'local.connection') return { ...state, connection: evt.connection };

  if (typeof evt.seq !== 'number' || !evt.runId) return state;
  if (evt.runId !== state.runId) {
    // first event of another run: start fresh (restart, or a reload onto a new run)
    state = { ...initialState(), runId: evt.runId, status: 'running', connection: state.connection };
  } else if (evt.seq <= state.lastSeq) {
    return state; // duplicate (reconnect overlap)
  }

  const s = { ...state, lastSeq: evt.seq, lastT: evt.t ?? state.lastT, replay: state.replay || !!evt.replay };
  const p = evt.payload ?? {};
  const last = { kind: evt.kind, text: describe(evt), t: evt.t ?? 0, seq: evt.seq };

  const agentPatch = (patch) => {
    const id = evt.agentId;
    if (!id) return;
    const cur = s.agents[id] ?? newAgent(id, s.agentOrder.length);
    if (!s.agents[id]) s.agentOrder = [...s.agentOrder, id];
    s.agents = { ...s.agents, [id]: { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch), lastEvent: last } };
  };
  const buildingPatch = (id, patch) => {
    if (!id) return;
    const cur = s.buildings[id] ?? newBuilding(id);
    s.buildings = { ...s.buildings, [id]: { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch), lastEvent: last } };
  };
  const patchOther = (id, patch) => {
    const cur = s.agents[id];
    if (cur) s.agents = { ...s.agents, [id]: { ...cur, ...patch } };
  };
  const setSource = (b, key, fn) => ({ ...b.sources, [key]: fn(b.sources[key]) });

  s.eventCounts = { ...s.eventCounts, [evt.kind]: (s.eventCounts[evt.kind] ?? 0) + 1 };
  let known = true;
  switch (evt.kind) {
    case 'run.mode':
      // the first one wins: a replayed live recording carries its own "live" marker
      s.runMode ??= p;
      break;

    case 'run.started':
      s.status = 'running';
      s.mode = p.mode ?? null;
      s.sourcesNotUsed = p.sourcesNotUsed ?? [];
      break;

    case 'agent.spawned':
      // an agent who arrives during the briefing joins the assembly
      agentPatch({ name: p.name ?? evt.agentId, role: p.role ?? '', status: 'idle', target: s.assembly && !s.dispersed ? 'assembly' : 'townhall' });
      break;

    case 'run.assembled':
      s.assembly = p;
      s.dispersed = false;
      for (const id of s.agentOrder) if (id !== 'mayor') patchOther(id, { target: 'assembly' });
      buildingPatch('townhall', { status: 'busy', agentId: 'mayor' });
      break;

    case 'plan.split':
      s.planSplit = { ...p, at: evt.t ?? 0 };
      // helpers go to their posts at Town Hall now; scouts leave on their own agent.walking
      for (const a of p.assignments ?? []) if (a.to === 'townhall' && a.agentId !== 'mayor') patchOther(a.agentId, { target: 'townhall' });
      break;

    case 'library.request':
      if (s.planSplit) s.planSplit = { ...s.planSplit, assignments: [...(s.planSplit.assignments ?? []), { agentId: 'librarian', name: 'Libby', to: 'library', task: 'Look up your last run in the saved runs' }] };
      break;

    case 'library.result':
      s.library = p;
      break;

    case 'library.diff':
      s.sinceLastRun = p;
      break;

    case 'handoff': {
      s.handoffs = [...s.handoffs.slice(-11), { seq: evt.seq, t: evt.t ?? 0, from: p.from, to: p.to, summary: p.summary, derived: !!p.derived }];
      const visit = { place: 'cafeteria', seq: evt.seq, from: p.from, to: p.to };
      patchOther(p.from, { visit });
      patchOther(p.to, { visit });
      break;
    }

    case 'agent.walking':
      if (evt.agentId !== 'librarian') s.dispersed = true; // the briefing ends when a source visit starts
      agentPatch({ status: 'walking', target: p.to ?? evt.building });
      break;

    case 'agent.working': {
      const url = isUrl(p.target) ? p.target : null;
      // the Verifier always works at the Inspection Office (older recordings say Town Hall)
      const at = evt.agentId === 'verifier' ? 'inspection' : evt.building;
      agentPatch((a) => ({ status: 'working', target: at ?? a.target, tool: p.tool ?? null, url: url ?? a.url, retrying: false }));
      if (evt.agentId === 'verifier' && evt.building !== 'inspection') buildingPatch('inspection', { status: 'busy', tool: p.tool ?? null });
      buildingPatch(evt.building, (b) => {
        const key = p.target ?? p.label ?? 'call';
        // a new call means the previous one finished
        const sources = Object.fromEntries(
          Object.entries(b.sources).map(([k, v]) => [k, k !== key && v.status === 'busy' ? { ...v, status: 'ok' } : v]),
        );
        const prev = sources[key];
        sources[key] = {
          label: p.label ?? key,
          url,
          tool: p.tool ?? null,
          status: 'busy',
          retries: prev ? prev.retries + (prev.status === 'failed' ? 1 : 0) : 0,
          message: prev?.message ?? null,
        };
        return { status: 'busy', agentId: evt.agentId ?? b.agentId, tool: p.tool ?? null, url: url ?? b.url, current: key, sources, retrying: false };
      });
      break;
    }

    case 'agent.progress':
      agentPatch((a) => ({ status: a.status === 'walking' ? 'walking' : 'working', retrying: false }));
      buildingPatch(evt.building, (b) => (b.status === 'failed' ? { status: 'busy', retrying: false } : {}));
      break;

    case 'agent.found':
      agentPatch((a) => ({
        status: a.status === 'walking' ? 'walking' : 'working',
        retrying: false,
        findings: a.findings + (p.note ? 0 : 1),
        bubble: p.bubble ? { text: p.bubble, seq: evt.seq } : a.bubble,
      }));
      buildingPatch(evt.building, (b) => ({
        status: 'busy',
        retrying: false,
        findings: b.findings + (p.note ? 0 : 1),
        sources: b.current && b.sources[b.current]?.status !== 'failed'
          ? setSource(b, b.current, (src) => ({ ...src, status: 'ok' }))
          : b.sources,
      }));
      if (p.headline) s.headline = { text: p.text, sourceUrl: p.sourceUrl };
      break;

    case 'agent.error':
      agentPatch((a) => ({ status: 'failed', retrying: !!p.retrying, errors: a.errors + 1, url: isUrl(p.target) ? p.target : a.url }));
      buildingPatch(evt.building, (b) => {
        const key = p.target && b.sources[p.target] ? p.target : b.current ?? p.target ?? 'call';
        const sources = setSource(b, key, (src) => ({
          label: src?.label ?? key,
          url: src?.url ?? (isUrl(p.target) ? p.target : null),
          tool: src?.tool ?? p.tool ?? null,
          retries: src?.retries ?? 0,
          status: 'failed',
          message: `${p.code ?? 'error'}: ${p.message ?? ''}`,
          retrying: !!p.retrying,
        }));
        return { status: 'failed', retrying: !!p.retrying, sources };
      });
      break;

    case 'agent.done': {
      if (CORNER_OF[evt.agentId] && evt.building !== CORNER_OF[evt.agentId] && s.buildings[CORNER_OF[evt.agentId]]) buildingPatch(CORNER_OF[evt.agentId], { status: 'done' });
      const b = s.buildings[evt.building];
      const failedSources = b ? Object.values(b.sources).filter((x) => x.status === 'failed').length : 0;
      const findings = p.findings ?? 0;
      // a scout that found nothing because its sources failed has failed; partial failures still count as done
      const result = failedSources && !findings ? 'failed' : 'done';
      agentPatch({ status: result, result, retrying: false });
      buildingPatch(evt.building, (bb) => ({
        status: result,
        retrying: false,
        sources: Object.fromEntries(Object.entries(bb.sources).map(([k, v]) => [k, v.status === 'busy' ? { ...v, status: 'ok' } : v])),
      }));
      break;
    }

    case 'agent.returning':
      agentPatch({ status: 'walking', target: p.to ?? 'townhall' });
      break;

    case 'plan.updated':
    case 'plan.ready':
      s.plan = p;
      agentPatch({ status: evt.kind === 'plan.ready' ? 'done' : 'working' });
      buildingPatch('townhall', { status: evt.kind === 'plan.ready' ? 'done' : 'busy', agentId: evt.agentId ?? 'mayor' });
      if (p.headline && !s.headline) s.headline = p.headline;
      break;

    case 'kit.ready':
      s.kits += 1;
      if (p.id) s.kitsById = { ...s.kitsById, [p.id]: p };
      // new runs: the Kit Builder at the Application Desk; older recordings: the Mayor at Town Hall
      if (evt.agentId === 'kit-builder') {
        agentPatch({ status: 'working', target: 'appdesk' });
        buildingPatch('appdesk', { status: 'busy' });
      } else {
        agentPatch({ status: 'working' });
        buildingPatch('townhall', { status: 'busy' });
      }
      break;

    case 'kit.building':
      s.kitBuilds += 1;
      if (p.derived) s.kitsRebuilt = true;
      agentPatch({ status: 'working', target: 'appdesk' });
      buildingPatch('appdesk', { status: 'busy' });
      break;

    case 'conflict.check':
      s.conflictChecks = [...s.conflictChecks, p];
      agentPatch({ status: 'working', target: 'auditor' });
      buildingPatch('auditor', { status: 'busy' });
      break;

    case 'watchtower.checked':
    case 'watchtower.change':
      s.watchtower = { ...p, kind: evt.kind };
      buildingPatch('watchtower', { status: 'done' });
      break;

    case 'run.complete':
    case 'run.failed': {
      s.status = evt.kind === 'run.complete' ? 'complete' : 'failed';
      s.summary = p;
      if (evt.kind === 'run.failed') s.error = p.message ?? 'run failed';
      // everyone settles: agents still walking home arrive, the mayor is done
      const agents = {};
      for (const id of s.agentOrder) {
        const a = s.agents[id];
        const settled = a.result ?? (HELPERS.has(id) && evt.kind === 'run.complete' ? 'done' : a.status === 'working' || a.status === 'walking' ? 'failed' : a.status);
        agents[id] = { ...a, status: settled, result: a.result ?? (settled === 'done' || settled === 'failed' ? settled : null) };
      }
      s.agents = agents;
      break;
    }

    case 'profile.ready':
      s.profile = p;
      agentPatch({ status: 'working' });
      break;

    case 'verify.result':
      s.verification = { ...s.verification, [p.opportunityId]: { ...p, building: evt.building ?? null } };
      agentPatch({ status: 'working', target: 'inspection' });
      break;

    case 'cache.hit':
    case 'cache.miss':
    case 'rate.limited':
    case 'blocked':
    case 'fallback': {
      const g = { ...s.gate };
      if (evt.kind === 'cache.hit') g.hits++;
      if (evt.kind === 'cache.miss') g.misses++;
      if (evt.kind === 'rate.limited') g.rateLimited++;
      if (evt.kind === 'fallback') g.fallbacks++;
      if (evt.kind === 'blocked') {
        g.blocked++;
        if (p.host && !g.blockedHosts.includes(p.host)) g.blockedHosts = [...g.blockedHosts, p.host];
      }
      s.gate = g;
      // the Gatekeeper works at the Checkpoint (older recordings say Town Hall)
      agentPatch({ status: evt.kind === 'blocked' ? 'failed' : 'working', ...(evt.agentId === 'gatekeeper' && { target: 'checkpoint' }) });
      if (evt.agentId === 'gatekeeper') buildingPatch('checkpoint', { status: 'busy' });
      break;
    }

    default:
      known = false;
  }

  // TinyFish calls as the scouts saw them: each working call ends ok or failed
  if (evt.kind === 'agent.error' && ['fetch', 'search'].includes(p.tool)) s.tools = { ...s.tools, failed: s.tools.failed + 1 };
  if (evt.kind === 'cache.hit') s.tools = { ...s.tools, cached: s.tools.cached + 1 };
  if (evt.kind === 'cache.miss') s.tools = { ...s.tools, ok: s.tools.ok + 1 };

  if (known) {
    s.log = [...s.log.slice(-(LOG_LIMIT - 1)), { seq: evt.seq, t: evt.t ?? 0, kind: evt.kind, agentId: evt.agentId ?? null, building: evt.building ?? null, text: last.text, payload: brief(evt.kind, p), level: LEVEL[evt.kind] ?? (evt.kind === 'agent.error' ? 'error' : 'info') }];
  }
  return s;
}
