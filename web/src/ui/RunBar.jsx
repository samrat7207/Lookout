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

/** Header: run state (sources done / total, elapsed) and the replay controls. */
export function RunBar({ state, playback, start, control, startError }) {
  const elapsed = useElapsed(state, playback);
  const { done, total } = sourceCounts(state);
  const running = state.status === 'running';
  const hasRun = state.status !== 'idle';

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
            {playback.paused && running && <span className="runbar__badge">paused</span>}
            {state.connection === 'reconnecting' && <span className="runbar__badge runbar__badge--warn">reconnecting…</span>}
            {state.connection === 'lost' && state.status === 'running' && <span className="runbar__badge runbar__badge--err">stream lost</span>}
          </>
        )}
      </div>
      <div className="runbar__controls">
        {!hasRun ? (
          <button type="button" className="btn btn--primary" onClick={() => start()}>
            ▶ Play recorded run
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              disabled={!running}
              onClick={() => control({ paused: !playback.paused })}
              aria-label={playback.paused ? 'Resume' : 'Pause'}
            >
              {playback.paused ? '▶ Play' : '❚❚ Pause'}
            </button>
            <div className="seg" role="group" aria-label="Replay speed">
              {SPEEDS.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  className={`seg__btn${playback.speed === sp ? ' seg__btn--on' : ''}`}
                  onClick={() => control({ speed: sp })}
                >
                  {sp}×
                </button>
              ))}
            </div>
            <button type="button" className="btn" onClick={() => start(playback.speed)}>
              ↺ Restart run
            </button>
          </>
        )}
      </div>
      {hasRun && <div className="runbar__mode">Replaying the recorded fake run (recordings/fake-run.jsonl): no live calls</div>}
      {startError && <div className="runbar__error">{startError}</div>}
    </div>
  );
}
