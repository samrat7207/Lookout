import { useEffect, useRef, useState } from 'react';
import City from './city/City.jsx';
import { useRunStream } from './state/useRunStream.js';
import { RunBar } from './ui/RunBar.jsx';
import { EventLog } from './ui/EventLog.jsx';
import { SideCard } from './ui/SideCard.jsx';
import { PlanScreen } from './ui/PlanScreen.jsx';

// ?demo plays a run on load and opens the plan when it finishes (rehearsal).
// ?demo uses replay at 2x; ?demo=live or ?demo=mock pick the mode.
const DEMO = (() => {
  const q = new URLSearchParams(window.location.search);
  if (!q.has('demo')) return null;
  const v = q.get('demo');
  return { mode: ['live', 'replay', 'mock'].includes(v) ? v : 'replay', speed: v === 'live' ? 1 : 2 };
})();

export default function App() {
  const { state, playback, start, control, startError, health } = useRunStream();
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState(DEMO?.mode ?? null);
  const [planOpen, setPlanOpen] = useState(false);
  const [duskCycle, setDuskCycle] = useState(false);
  const [recheck, setRecheck] = useState(null); // Watchtower result for the current plan
  useEffect(() => setRecheck(null), [state.runId]);

  // open the plan once per run when it finishes
  const openedFor = useRef(null);
  useEffect(() => {
    if (state.status === 'complete' && state.plan && openedFor.current !== state.runId) {
      openedFor.current = state.runId;
      setPlanOpen(true);
    }
  }, [state.status, state.plan, state.runId]);

  // ?demo: start once on load
  const demoStarted = useRef(false);
  useEffect(() => {
    if (!DEMO || demoStarted.current) return;
    demoStarted.current = true;
    setPlanOpen(false);
    start(DEMO.mode, DEMO.speed);
  }, [start]);

  // default mode comes from the server (MODE in server/.env, else live with a key, else replay)
  useEffect(() => {
    if (!mode && health?.defaultMode) setMode(health.defaultMode === 'fake' ? 'mock' : health.defaultMode);
  }, [health, mode]);

  return (
    <main className="app">
      <div className="sky" aria-hidden />
      <City state={state} playback={playback} selected={selected} onSelect={setSelected} duskCycle={duskCycle} />
      <header className="brand">
        <h1>Lookout</h1>
        <p>Scholarship Season · sample student: B.Tech CE, 2nd year, OBC, Maharashtra</p>
        <button type="button" className="btn brand__toggle" aria-pressed={duskCycle} onClick={() => setDuskCycle((v) => !v)}>
          {duskCycle ? '🌇 Day-to-dusk cycle: on' : '☀ Daytime (start dusk cycle)'}
        </button>
      </header>
      <RunBar
        state={state}
        playback={playback}
        start={start}
        control={control}
        startError={startError}
        health={health}
        mode={mode ?? 'replay'}
        setMode={setMode}
        onViewPlan={() => setPlanOpen(true)}
      />
      <EventLog state={state} onSelect={setSelected} />
      <SideCard selected={selected} state={state} onClose={() => setSelected(null)} />
      {planOpen && <PlanScreen state={state} onClose={() => setPlanOpen(false)} recheck={recheck} setRecheck={setRecheck} />}
      <p className="safety">Lookout never logs in, never submits forms, and never asks for, enters or stores passwords, OTPs or Aadhaar numbers.</p>
      <p className="hint">Drag to orbit · scroll to zoom · right-drag to pan · click a building or character</p>
    </main>
  );
}
