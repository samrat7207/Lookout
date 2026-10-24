import { useEffect, useRef, useState } from 'react';
import { sourceCounts } from '../state/reducer.js';
import { fmtTime } from './agentStyle.js';

const SPEEDS = [1, 2, 4];

/**
 * Elapsed run time on the same clock as the event log (event `t`), ticking smoothly
 * between events while the run plays.
 */
function useElapsed(state, playback) {
  const [ms, setMs] = useState(state.lastT);
  const anchor = useRef({ t: 0, at: 0 });
  useEffect(() => {
    anchor.current = { t: state.lastT, at: performance.now() };
    setMs(state.lastT);
    if (state.status !== 'running' || playback.paused) return undefined;
    // replays stamp recording time, which runs `speed` times faster than the wall clock
    const rate = state.replay ? playback.speed : 1;
    const id = setInterval(() => setMs(anchor.current.t + (performance.now() - anchor.current.at) * rate), 250);
    return () => clearInterval(id);
  }, [state.lastT, state.status, state.replay, playback.paused, playback.speed]);
  return ms;
}

const STATE_LABEL = { idle: 'No run yet', starting: 'Starting…', running: 'Running', complete: 'Run complete', failed: 'Run failed' };
const MODES = [
  { id: 'live', label: 'Live', title: 'Real TinyFish Search + Fetch (falls back to the last recording)' },
  { id: 'replay', label: 'Replay', title: 'Replay the last real recorded run' },
  { id: 'mock', label: 'Mock', title: 'Scripted run built from recon data' },
];

function fmtStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** The honest badge: what the city is showing right now. */
function ModeBadge({ runMode }) {
  if (!runMode) return null;
  if (runMode.mode === 'live') return <div className="runbar__mode runbar__mode--live">● LIVE: reading real pages through TinyFish Search and Fetch</div>;
  const what = runMode.mode === 'mock' ? 'Mock run (scripted from recon data)' : 'Replaying recorded run';
  return (
    <div className="runbar__mode">
      <span className="runbar__replay">{what}</span>
      {runMode.recording && ` · ${runMode.recording}.jsonl`}
      {runMode.recordedAt && `, recorded ${fmtStamp(runMode.recordedAt)}`}
      {runMode.fallbackReason && <span className="runbar__why"> · {runMode.fallbackReason}</span>}
    </div>
  );
}

/** Header: mode, run state (sources done / total, elapsed) and the replay controls. */
export function RunBar({ state, playback, start, control, startError, health, mode, setMode, onViewPlan }) {
  const elapsed = useElapsed(state, playback);
  const { done, total } = sourceCounts(state);
  const running = state.status === 'running';
  const hasRun = state.status !== 'idle';
  const canControl = running && state.replay;

  return (
    <div className="runbar">
      <div className="runbar__state">
        <span className={`runbar__dot runbar__dot--${state.status}`} />
        <strong>{STATE_LABEL[state.status]}</strong>
        {hasRun && (
          <>
            <span className="runbar__sep">·</span>
            <span>
              Sources <b>{done}/{total || '–'}</b> done
            </span>
            <span className="runbar__sep">·</span>
            <span className="runbar__time">{fmtTime(elapsed)}</span>
            {playback.paused && canControl && <span className="runbar__badge">paused</span>}
            {state.connection === 'reconnecting' && <span className="runbar__badge runbar__badge--warn">reconnecting…</span>}
            {state.connection === 'lost' && state.status === 'running' && <span className="runbar__badge runbar__badge--err">stream lost</span>}
          </>
        )}
      </div>
      <div className="runbar__controls">
        <div className="seg" role="group" aria-label="Mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.title}
              className={`seg__btn${mode === m.id ? ' seg__btn--on' : ''}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
              {m.id === 'live' && health && !health.tinyfishKeyPresent ? ' (no key)' : ''}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--primary" onClick={() => start(mode, playback.speed)}>
          {hasRun ? '↺ Restart run' : '▶ Start run'}
        </button>
        {hasRun && (
          <>
            <button
              type="button"
              className="btn"
              disabled={!canControl}
              title={canControl ? '' : 'Only replays can be paused'}
              onClick={() => control({ paused: !playback.paused })}
            >
              {playback.paused && canControl ? '▶ Play' : '❚❚ Pause'}
            </button>
            <div className="seg" role="group" aria-label="Replay speed">
              {SPEEDS.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  disabled={!canControl}
                  className={`seg__btn${playback.speed === sp ? ' seg__btn--on' : ''}`}
                  onClick={() => control({ speed: sp })}
                >
                  {sp}×
                </button>
              ))}
            </div>
          </>
        )}
        {state.plan && (
          <button type="button" className="btn btn--accent" onClick={onViewPlan}>
            📋 View plan
          </button>
        )}
      </div>
      <ModeBadge runMode={state.runMode} />
      {startError && <div className="runbar__error">{startError}</div>}
    </div>
  );
}
