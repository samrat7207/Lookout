// The Mayor's briefing card (plan.split): which sources, who goes where, and the run
// mode. It shows while the agents are gathered at Town Hall and closes when the first
// agent sets off (agent.walking).
import { placeName } from './agentStyle.js';

export function BriefingCard({ state }) {
  const split = state.planSplit;
  if (!split || state.status !== 'running') return null;
  if (state.dispersed) return null;
  const going = (split.assignments ?? []).filter((a) => a.to !== 'townhall');
  const staying = (split.assignments ?? []).filter((a) => a.to === 'townhall' && a.agentId !== 'mayor');
  return (
    <aside className="brief" aria-live="polite" aria-label="Mayor's briefing">
      <h3>🏛 Mayor's briefing · {split.mode} run</h3>
      <p className="sys__muted">Sources to visit: {split.sources?.join(', ') || 'none'}</p>
      <ul>
        {going.map((a) => <li key={a.agentId}><b>{a.name}</b> → {placeName(a.to)}: {a.task}</li>)}
      </ul>
      {staying.length > 0 && <p className="sys__muted">At Town Hall: {staying.map((a) => a.name).join(', ')}</p>}
      {split.derived && <p className="sys__muted">Rebuilt from this older recording's own events.</p>}
    </aside>
  );
}
