import { STATUS, TOOL_ICON, fmtTime, landmark, placeName, roleColor } from './agentStyle.js';
import { VerifyBadge } from './PlanScreen.jsx';

function Status({ status, retrying }) {
  const st = STATUS[status] ?? STATUS.idle;
  return (
    <span className="pill" style={{ '--c': st.color }}>
      {st.label}
      {status === 'failed' && (retrying ? ' · retrying ↻' : ' ✗')}
    </span>
  );
}

function LastEvent({ ev }) {
  if (!ev) return <p className="card__muted">No events yet.</p>;
  return (
    <p className="card__last">
      <span className="card__t">{fmtTime(ev.t)}</span> {ev.text}
    </p>
  );
}

function Url({ url }) {
  if (!url) return <p className="card__muted">No URL yet.</p>;
  return (
    <a className="card__url" href={url} target="_blank" rel="noreferrer noopener">
      {url}
    </a>
  );
}

const SRC_ICON = { ok: '✓', busy: '⏳', failed: '✗' };

function BuildingCard({ id, state }) {
  const lm = landmark(id);
  const b = state.buildings[id];
  const agent = b?.agentId ? state.agents[b.agentId] : null;
  const sources = b ? Object.entries(b.sources) : [];
  const checks = Object.values(state.verification).filter((v) => v.building === id);
  return (
    <>
      <header className="card__head">
        <span className="card__icon">{lm?.icon}</span>
        <div>
          <h2>{lm?.name ?? id}</h2>
          <p className="card__muted">{lm?.blurb}</p>
        </div>
      </header>
      <dl className="card__grid">
        <dt>Status</dt>
        <dd><Status status={b?.status === 'busy' ? 'working' : b?.status ?? 'idle'} retrying={b?.retrying} /></dd>
        <dt>Agent</dt>
        <dd>{agent ? <><span className="dot" style={{ background: roleColor(agent.id) }} /> {agent.name} ({agent.role})</> : '–'}</dd>
        <dt>Findings</dt>
        <dd>{b?.findings ?? 0}</dd>
      </dl>
      <h3>Last event</h3>
      <LastEvent ev={b?.lastEvent} />
      <h3>URL</h3>
      <Url url={b?.url} />
      {checks.length > 0 && (
        <>
          <h3>Verifier re-check</h3>
          <ul className="card__sources">
            {checks.map((v) => (
              <li key={v.opportunityId} className="src">
                <span />
                <div>
                  <VerifyBadge v={v} /> {v.title}
                  {v.status !== 'verified' && <div className="src__msg">{v.reason}</div>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {sources.length > 0 && (
        <>
          <h3>Calls at this source</h3>
          <ul className="card__sources">
            {sources.map(([key, src]) => (
              <li key={key} className={`src src--${src.status}`}>
                <span className="src__icon">{SRC_ICON[src.status]}</span>
                <div>
                  <div>
                    {TOOL_ICON[src.tool] ?? ''} {src.label}
                    {src.retries > 0 && <span className="src__retry"> ↻ retried {src.retries}×</span>}
                  </div>
                  {src.url && <a href={src.url} target="_blank" rel="noreferrer noopener">{src.url}</a>}
                  {src.status === 'failed' && <div className="src__msg">{src.message}{src.retrying ? ' · retrying' : ''}</div>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function AgentCard({ id, state }) {
  const a = state.agents[id];
  if (!a) return null;
  return (
    <>
      <header className="card__head">
        <span className="card__avatar" style={{ background: roleColor(id) }} />
        <div>
          <h2>{a.name}</h2>
          <p className="card__muted">{a.role} · {id}</p>
        </div>
      </header>
      <dl className="card__grid">
        <dt>Status</dt>
        <dd><Status status={a.status} retrying={a.retrying} /></dd>
        <dt>{a.status === 'walking' ? 'Heading to' : 'At'}</dt>
        <dd>{placeName(a.target)}</dd>
        <dt>Findings</dt>
        <dd>{a.findings}</dd>
        <dt>Errors</dt>
        <dd>{a.errors}</dd>
      </dl>
      <h3>Last event</h3>
      <LastEvent ev={a.lastEvent} />
      <h3>URL</h3>
      <Url url={a.url} />
    </>
  );
}

/** Side card for the clicked building or character. */
export function SideCard({ selected, state, onClose }) {
  if (!selected) return null;
  return (
    <aside className="card" aria-label="Details">
      <button type="button" className="card__close" onClick={onClose} aria-label="Close">×</button>
      {selected.type === 'building' ? <BuildingCard id={selected.id} state={state} /> : <AgentCard id={selected.id} state={state} />}
    </aside>
  );
}
