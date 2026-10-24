import { useEffect, useRef, useState } from 'react';
import { VERIFY_LABEL } from '../state/reducer.js';

// Guided demo mode (?guided): one short caption at a time, written from the events as they
// happen, so the presenter does not have to talk over the screen. Each caption stays at
// least MIN_MS; newer events replace older queued ones.

const MIN_MS = 2600;
const PLACE = { nsp: 'the NSP Hall', mahadbt: 'State Scholarships', foundations: 'Private & Foundation', opportunities: 'the Opportunities district', watchtower: 'the Watchtower', townhall: 'Town Hall' };

/** One plain sentence for an event, or null to stay quiet. Pure: same event, same caption. */
export function captionFor(evt, agents) {
  const p = evt.payload ?? {};
  const who = agents[evt.agentId]?.name ?? evt.agentId;
  switch (evt.kind) {
    case 'run.mode':
      return p.mode === 'live' ? 'Live run: Lookout reads real pages right now through TinyFish.' : p.mode === 'mock' ? 'Mock run: scripted from research data, no network.' : `Replaying a real recorded run${p.fallbackReason ? ` (fallback: ${p.fallbackReason})` : ''}.`;
    case 'profile.ready':
      return `The Profiler reads the sample student: ${p.unknownCount ?? p.unknown?.length ?? 0} facts unknown, so nothing is guessed.`;
    case 'agent.walking':
      return p.to && p.to !== 'townhall' ? `${who} heads to ${PLACE[p.to] ?? p.to}.` : null;
    case 'agent.working':
      if (evt.agentId === 'verifier') return 'The Verifier re-opens every source page to check names and dates.';
      return `${who} is reading ${PLACE[evt.building] ?? 'a source'} (${p.tool ?? 'fetch'}).`;
    case 'agent.error':
      return `${who}: ${p.code}. ${p.retrying ? 'Retrying politely.' : 'Shown honestly, not hidden.'}`;
    case 'blocked':
      return `The Gatekeeper stops at ${p.host}: ${p.reason}. No workaround.`;
    case 'verify.result':
      return `Verifier: ${VERIFY_LABEL[p.status] ?? p.status} · ${p.title}`;
    case 'plan.ready':
      return `The plan is ready: ${p.itemCount ?? p.items?.length ?? 0} items, ranked by deadline, then fit.`;
    case 'run.complete':
      return `Done: ${p.findings ?? 0} findings, ${p.errors ?? 0} honest errors. Opening the plan.`;
    default:
      return null;
  }
}

export function Guide({ state, onSkip }) {
  const [caption, setCaption] = useState(null);
  const queue = useRef([]);
  const shownAt = useRef(0);
  const seen = useRef(0);

  // collect captions for new events
  useEffect(() => {
    for (const evt of state.log.filter((l) => l.seq > seen.current)) {
      seen.current = evt.seq;
      const c = captionFor({ kind: evt.kind, agentId: evt.agentId, building: evt.building, payload: evt.payload ?? {} }, state.agents);
      if (c) queue.current = [...queue.current.slice(-2), c]; // keep it short: latest few
    }
  }, [state.log, state.agents]);
  useEffect(() => {
    if (!state.runId) {
      seen.current = 0;
      queue.current = [];
    }
  }, [state.runId]);

  // show the next caption no faster than MIN_MS
  useEffect(() => {
    const id = setInterval(() => {
      if (!queue.current.length || Date.now() - shownAt.current < MIN_MS) return;
      setCaption(queue.current.shift());
      shownAt.current = Date.now();
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="guide" role="status" aria-live="polite">
      <span className="guide__text">{caption ?? 'Press Start run: the captions follow the agents.'}</span>
      <button type="button" className="btn" onClick={onSkip}>Skip captions</button>
    </div>
  );
}
