import { useEffect, useRef, useState } from 'react';
import { placeName, roleColor } from './agentStyle.js';

const SHOW = 40;

/** Compact, collapsible list of the latest events, newest at the bottom. */
export function EventLog({ state, onSelect }) {
  const [open, setOpen] = useState(true);
  const list = useRef(null);
  const rows = state.log.slice(-SHOW);
  const lastSeq = rows.at(-1)?.seq;

  useEffect(() => {
    if (open && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [open, lastSeq]);

  return (
    <section className={`log${open ? '' : ' log--closed'}`}>
      <button type="button" className="log__head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Event log</span>
        <span className="log__count">{state.log.length}</span>
        <span className="log__chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ol className="log__list" ref={list}>
          {rows.length === 0 && <li className="log__empty">Events from the run appear here.</li>}
          {rows.map((r) => {
            const agent = r.agentId ? state.agents[r.agentId] : null;
            const source = r.building && r.building !== 'townhall' ? placeName(r.building) : agent ? placeName('townhall') : 'Run';
            return (
              <li key={r.seq} className={`log__row log__row--${r.level}`}>
                <span className="log__t">{(r.t / 1000).toFixed(1)}s</span>
                <button
                  type="button"
                  className="log__src"
                  onClick={() => (r.building ? onSelect({ type: 'building', id: r.building }) : agent && onSelect({ type: 'agent', id: agent.id }))}
                  style={{ '--c': agent ? roleColor(agent.id) : '#9aa3ad' }}
                >
                  {source}
                </button>
                <span className="log__text">
                  {agent && <b>{agent.name}: </b>}
                  {r.text}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
