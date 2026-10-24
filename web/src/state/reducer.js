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
    headline: null,
    watchtower: null,
    summary: null,
    error: null,
  };
}

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
    case 'watchtower.checked': return `Checked ${p.schemesTracked ?? '?'} schemes, no date changes`;
    case 'watchtower.change': return `Date changed: ${p.changes?.length ?? 0} schemes`;
    case 'run.complete': return `Run complete: ${p.findings ?? 0} findings, ${p.errors ?? 0} errors`;
    case 'run.failed': return `Run failed: ${p.message ?? ''}`;
    default: return evt.kind;
  }
}

const LEVEL = { 'agent.error': 'error', 'run.failed': 'error', 'agent.found': 'good', 'plan.ready': 'good', 'run.complete': 'good' };

/** Sources done / total: every agent except the mayor (Town Hall) is a source visit. */
export function sourceCounts(state) {
  const ids = state.agentOrder.filter((id) => id !== 'mayor');
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
  const setSource = (b, key, fn) => ({ ...b.sources, [key]: fn(b.sources[key]) });

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
      agentPatch({ name: p.name ?? evt.agentId, role: p.role ?? '', status: 'idle', target: 'townhall' });
      break;

    case 'agent.walking':
      agentPatch({ status: 'walking', target: p.to ?? evt.building });
      break;

    case 'agent.working': {
      const url = isUrl(p.target) ? p.target : null;
      agentPatch((a) => ({ status: 'working', target: evt.building ?? a.target, tool: p.tool ?? null, url: url ?? a.url, retrying: false }));
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
      agentPatch({ status: 'working' });
      buildingPatch('townhall', { status: 'busy' });
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
        const settled = a.result ?? (id === 'mayor' && evt.kind === 'run.complete' ? 'done' : a.status === 'working' || a.status === 'walking' ? 'failed' : a.status);
        agents[id] = { ...a, status: settled, result: a.result ?? (settled === 'done' || settled === 'failed' ? settled : null) };
      }
      s.agents = agents;
      break;
    }

    default:
      known = false;
  }

  if (known) {
    s.log = [...s.log.slice(-(LOG_LIMIT - 1)), { seq: evt.seq, t: evt.t ?? 0, kind: evt.kind, agentId: evt.agentId ?? null, building: evt.building ?? null, text: last.text, level: LEVEL[evt.kind] ?? (evt.kind === 'agent.error' ? 'error' : 'info') }];
  }
  return s;
}
