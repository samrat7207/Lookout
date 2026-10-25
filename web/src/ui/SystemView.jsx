import { useEffect, useState } from 'react';
import { STATUS, roleColor } from './agentStyle.js';

// System view (?tech or the "System" button): the 10-role roster with live status and
// counts, built only from the run's events (reducer state) and the Watchtower result.
// The role -> agent mapping is the architecture; every number comes from events.

const SCOUTS = ['nsp-scout', 'mahadbt-scout', 'foundations-scout', 'opps-scout'];

function agentStatus(state, ids) {
  const present = ids.filter((id) => state.agents[id]);
  if (!present.length) return { label: 'not in this run', color: '#9aa3ad' };
  const statuses = present.map((id) => state.agents[id].status);
  const worst = ['failed', 'working', 'walking', 'idle', 'done'].find((s) => statuses.includes(s)) ?? statuses[0];
  return { label: STATUS[worst]?.label ?? worst, color: STATUS[worst]?.color ?? '#9aa3ad' };
}

function roster(state, recheck) {
  const plan = state.plan;
  const ec = state.eventCounts;
  const v = Object.values(state.verification);
  const tally = (s) => v.filter((x) => x.status === s).length;
  const found = ec['agent.found'] ?? 0;
  const fits = plan ? plan.items.reduce((m, i) => ({ ...m, [i.fit]: (m[i.fit] ?? 0) + 1 }), {}) : {};
  const done = (cond) => ({ label: cond ? 'Done' : state.status === 'running' ? 'Waiting' : 'not run', color: cond ? STATUS.done.color : '#9aa3ad' });
  return [
    { n: 1, role: 'Orchestrator (Mayor)', who: ['mayor'], kind: 'code', what: `${ec['plan.updated'] ?? 0} plan updates, ${ec['plan.ready'] ?? 0} final plan` },
    { n: 2, role: 'Source Scouts', who: SCOUTS, kind: 'TinyFish Search + Fetch', what: `${SCOUTS.filter((id) => state.agents[id]).length} scouts, ${found} findings, ${ec['agent.error'] ?? 0} errors` },
    { n: 3, role: 'Deadline Reader', who: [], kind: 'code (parsers)', status: done(found > 0), what: plan ? `${plan.items.filter((i) => i.deadline).length} dated, ${plan.items.filter((i) => !i.deadline).length} "not published"` : 'inside each scout' },
    { n: 4, role: 'Eligibility Judge', who: ['profiler'], kind: 'code (rules)', what: plan ? `match ${fits.match ?? 0}, conditional ${fits.conditional ?? 0}, unclear ${fits.unclear ?? 0}, not applicable ${plan.notApplicable?.length ?? 0}` : (state.profile ? `${state.profile.unknown.length} unknowns from the Profiler` : '') },
    { n: 5, role: 'Ranker', who: [], kind: 'code', status: done(!!plan), what: plan ? `${plan.items.length} items: deadline, then fit` : '' },
    { n: 6, role: "Conflict Checker (Auditor's Office)", who: state.agents['conflict-checker'] ? ['conflict-checker'] : [], kind: 'code', status: state.agents['conflict-checker'] ? undefined : done(!!plan), what: state.conflictChecks.length ? `${state.conflictChecks.length} rules checked, ${state.conflictChecks.filter((c) => c.result === 'warning').length} may not be combinable, ${state.conflictChecks.filter((c) => c.officialRule).length} quoting a fetched rule${state.conflictChecks.some((c) => c.derived) ? ' (rebuilt from the recording)' : ''}` : plan ? `${plan.conflicts?.length ?? 0} conflicts` : '' },
    { n: 7, role: 'Kit Builder (Application Desk)', who: state.agents['kit-builder'] ? ['kit-builder'] : [], kind: 'code', status: state.agents['kit-builder'] ? undefined : done((ec['kit.ready'] ?? 0) > 0), what: `${state.kitBuilds} prepared, ${ec['kit.ready'] ?? 0} read-only kits ready${state.kitsRebuilt ? ' (rebuilt from the recording)' : ''}` },
    { n: 8, role: 'Verifier (Inspection Office)', who: ['verifier'], kind: 'TinyFish Fetch (re-fetch)', what: v.length ? `verified ${tally('verified')}, changed ${tally('changed')}, could not verify ${tally('unverified')}` : 'no results yet' },
    { n: 9, role: 'Gatekeeper (Checkpoint)', who: ['gatekeeper'], kind: 'code around TinyFish', what: `cache hits ${state.gate.hits}, misses ${state.gate.misses}, backoffs ${state.gate.rateLimited}, blocked ${state.gate.blocked}, fallbacks ${state.gate.fallbacks}` },
    {
      n: 10,
      role: 'Watchtower (Night guard)',
      who: state.agents.watchman ? ['watchman'] : [],
      kind: 'TinyFish Fetch on request',
      status: recheck?.summary ? { label: 'Checked', color: STATUS.done.color } : state.agents.watchman ? undefined : { label: 'not run', color: '#9aa3ad' },
      what: recheck?.summary
        ? `${recheck.summary.changed} changed, ${recheck.summary.noChange} unchanged, ${recheck.summary.unchecked} not re-checked`
        : state.agents.watchman ? 'scripted in the mock run (no network)' : 'press "Re-check now" on the plan',
    },
  ];
}

export function SystemView({ state, recheck, onClose }) {
  const rows = roster(state, recheck);
  const g = state.gate;
  const hitRate = g.hits + g.misses ? Math.round((100 * g.hits) / (g.hits + g.misses)) : null;
  const gkFinal = state.summary?.gatekeeper;
  const list = state.plan?.sources?.list ?? [];
  const notUsed = state.plan?.sources?.notUsed ?? state.sourcesNotUsed ?? [];
  const counts = Object.entries(state.eventCounts).sort((a, b) => b[1] - a[1]);
  const mode = state.runMode?.mode ?? (state.mode === 'fake' ? 'fake (generated)' : state.mode);

  return (
    <aside className="sys" aria-label="System view">
      <header className="sys__head">
        <h2>System view</h2>
        <button type="button" className="card__close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <p className="sys__mode">
        Run <code>{state.runId ?? 'none'}</code> · mode <b>{mode ?? 'none'}</b>
        {state.replay && ' · replayed events'}
        {state.runMode?.fallbackReason && <span className="sys__warn"> · fallback: {state.runMode.fallbackReason}</span>}
        {' · '}status <b>{state.status}</b> · {state.lastSeq} events
      </p>

      <h3>Agent roster (10 roles)</h3>
      <table className="sys__table">
        <thead><tr><th>#</th><th>Role</th><th>Agent</th><th>Kind</th><th>Status</th><th>From the events</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const st = r.status ?? agentStatus(state, r.who);
            return (
              <tr key={r.n}>
                <td>{r.n}</td>
                <td>{r.role}</td>
                <td>{r.who.filter((id) => state.agents[id]).map((id) => (
                  <span key={id} className="sys__agent"><span className="dot" style={{ background: roleColor(id) }} /> {state.agents[id].name}</span>
                ))}{!r.who.some((id) => state.agents[id]) && <span className="sys__muted">{r.who.length ? 'absent' : 'step inside the pipeline'}</span>}</td>
                <td className="sys__muted">{r.kind}</td>
                <td><span className="pill" style={{ '--c': st.color }}>{st.label}</span></td>
                <td>{r.what}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="sys__muted">No LLM is used anywhere. "Code" means deterministic JavaScript; the only external tool is TinyFish Search and Fetch.</p>

      <div className="sys__grid">
        <section>
          <h3>TinyFish calls (this run)</h3>
          {g.hits + g.misses === 0 ? (
            <p className="sys__muted">No network calls in this run{state.runMode?.mode === 'mock' ? ' (mock)' : ''}.</p>
          ) : (
            <ul className="sys__list">
              <li>Pages and searches fetched live: <b>{g.misses}</b></li>
              <li>Served from cache: <b>{g.hits}</b> (hit rate {hitRate}%)</li>
              <li>Failed (as seen by scouts): <b>{state.tools.failed}</b> · blocked: <b>{g.blocked}</b>{g.blockedHosts.length ? ` (${g.blockedHosts.join(', ')})` : ''}</li>
              <li>Backoffs: <b>{g.rateLimited}</b> · stale-cache fallbacks: <b>{g.fallbacks}</b></li>
              {gkFinal && <li>TinyFish API calls: <b>{gkFinal.calls}</b> (ok {gkFinal.ok}, failed {gkFinal.failed})</li>}
            </ul>
          )}
        </section>
        <section>
          <h3>Event counts</h3>
          <ul className="sys__list sys__counts">
            {counts.map(([k, n]) => <li key={k}><code>{k}</code> {n}</li>)}
          </ul>
        </section>
      </div>

      <ServerStatus />

      <h3>Sources used ({list.length})</h3>
      {list.length ? (
        <ul className="sys__list">
          {list.map((l, i) => (
            <li key={`${l.url}-${i}`} className={l.ok ? '' : 'sys__bad'}>
              {l.ok ? '✓' : '✗'} {l.name}{l.cached ? ' (cached)' : ''}{l.error ? `: ${l.error}` : ''}
            </li>
          ))}
        </ul>
      ) : <p className="sys__muted">This run does not report a source ledger.</p>}
      <h3>Sources not used ({notUsed.length})</h3>
      <ul className="sys__list">{notUsed.map((n) => <li key={n.name}><b>{n.name}</b>: {n.reason}</li>)}</ul>
    </aside>
  );
}

/** The server's own health (GET /api/health, read when the view opens): database, key, limits, cache. */
function ServerStatus() {
  const [h, setH] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setH)
      .catch((e) => setErr(e.message));
  }, []);
  if (err) return <p className="sys__bad">Server health unavailable: {err}</p>;
  if (!h) return <p className="sys__muted">Reading server health…</p>;
  const db = h.database ?? {};
  const dbText = db.kind === 'postgres' ? 'Postgres' : db.kind === 'local' ? `local fallback (${db.engine ?? 'sqlite'})` : 'none (JSON history only)';
  const l = h.limits;
  return (
    <section>
      <h3>Server</h3>
      <ul className="sys__list">
        <li>Database in use: <b>{dbText}</b>{db.fallbackReason ? <span className="sys__muted"> · {db.fallbackReason}</span> : null}</li>
        <li>Default mode: <b>{h.mode}</b> · TinyFish key present: <b>{h.keyPresent}</b></li>
        {l && <li>Rate limits per IP: runs {l.runPerMinute}/min, re-checks {l.recheckPerMinute}/min, reads {l.readPerMinute}/min, open event streams {l.sseConnectionsPerIp}</li>}
        <li>Page cache: {h.cache.entries} entries ({Math.round(h.cache.bytes / 1024)} KB)</li>
        {h.retention && (
          <li>
            Retention: saved runs, plan items and profile snapshots are deleted after <b>{h.retention.days} days</b> (at start and daily) · last purge:{' '}
            {h.retention.lastPurgeAt ? `${new Date(h.retention.lastPurgeAt).toLocaleString('en-IN')} (${h.retention.lastRemoved?.runs ?? 0} runs removed)` : h.retention.lastError ? `failed (${h.retention.lastError})` : 'not yet'}
          </li>
        )}
        <li>Last run: {h.lastRunAt ? new Date(h.lastRunAt).toLocaleString('en-IN') : 'none since the server started'}</li>
      </ul>
    </section>
  );
}
