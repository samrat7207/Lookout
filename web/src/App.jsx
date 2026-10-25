import { useEffect, useRef, useState } from 'react';
import City from './city/City.jsx';
import { useRunStream } from './state/useRunStream.js';
import { RunBar } from './ui/RunBar.jsx';
import { EventLog } from './ui/EventLog.jsx';
import { SideCard } from './ui/SideCard.jsx';
import { PlanScreen } from './ui/PlanScreen.jsx';
import { SystemView } from './ui/SystemView.jsx';
import { BriefingCard } from './ui/BriefingCard.jsx';
import { ProfileForm } from './ui/ProfileForm.jsx';
import { HistoryDrawer } from './ui/HistoryDrawer.jsx';
import { Guide } from './ui/Guide.jsx';

const TECH = new URLSearchParams(window.location.search).has('tech');
const GUIDED = new URLSearchParams(window.location.search).has('guided');

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
  const [theme, setTheme] = useState('day'); // day | dusk | cycle
  const [sysOpen, setSysOpen] = useState(TECH);
  const [recheck, setRecheck] = useState(null); // Watchtower result for the current plan
  useEffect(() => setRecheck(null), [state.runId]);
  const [histOpen, setHistOpen] = useState(false);
  const [formProfile, setFormProfile] = useState(null); // the profile form (Live runs only)
  const [formOpen, setFormOpen] = useState(false);
  const [guided, setGuided] = useState(GUIDED);
  // a plan shown instead of the live one: a saved run from the history, or a re-judged plan
  const [view, setView] = useState(null);
  const [rerunState, setRerunState] = useState(null);
  useEffect(() => setView(null), [state.runId]);

  // the Library and the Librarian open the run history
  const select = (sel) => {
    if ((sel?.type === 'building' && sel.id === 'library') || (sel?.type === 'agent' && sel.id === 'librarian')) {
      setHistOpen(true);
      setSelected(null);
      return;
    }
    setSelected(sel);
  };

  const openHistory = (entry) => {
    const verification = Object.fromEntries(entry.plan.items.filter((i) => i.verification).map((i) => [i.opportunityId, i.verification]));
    setView({
      plan: entry.plan,
      kitsById: Object.fromEntries((entry.kits ?? []).map((k) => [k.id, k])),
      verification,
      label: `Saved ${entry.mode} run from ${new Date(entry.savedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${entry.fallbackReason ? ` (fallback: ${entry.fallbackReason})` : ''}`,
      mode: entry.mode,
      historical: true,
      historyId: entry.id,
    });
    setHistOpen(false);
    setPlanOpen(true);
  };

  const rerun = async (profile) => {
    setRerunState('busy');
    try {
      const body = view?.historyId ? { historyId: view.historyId, profile } : { runId: state.runId, profile };
      const res = await fetch('/api/rejudge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setView((v) => ({ ...(v ?? { kitsById: state.kitsById, verification: state.verification, mode: state.runMode?.mode }), plan: json.plan, label: v?.label }));
      setRerunState(null);
    } catch (err) {
      setRerunState(`error: re-run failed (${err.message})`);
    }
  };

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
      <City state={state} playback={playback} selected={selected} onSelect={select} theme={theme} />
      <BriefingCard state={state} />
      <header className="brand">
        <h1>Lookout</h1>
        <p>Scholarship Season · sample student: B.Tech CE, 2nd year, OBC, Maharashtra</p>
        <div className="seg brand__toggle" role="group" aria-label="Theme">
          {[['day', '☀ Day'], ['dusk', '🌇 Dusk'], ['cycle', '↻ Cycle']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={theme === v} className={`seg__btn${theme === v ? ' seg__btn--on' : ''}`} onClick={() => setTheme(v)}>{l}</button>
          ))}
        </div>
        <button type="button" className="btn brand__toggle" aria-pressed={sysOpen} onClick={() => setSysOpen((v) => !v)}>
          ⚙ System view
        </button>
        <button type="button" className="btn brand__toggle" aria-pressed={histOpen} onClick={() => setHistOpen((v) => !v)}>
          🕘 History
        </button>
        <button type="button" className="btn brand__toggle" aria-pressed={formOpen} onClick={() => setFormOpen((v) => !v)}>
          👤 {formProfile ? 'Your profile (Live)' : 'Profile: sample student'}
        </button>
      </header>
      <RunBar
        state={state}
        playback={playback}
        start={(m, s) => start(m, s, m === 'live' ? formProfile : null)}
        control={control}
        startError={startError}
        health={health}
        mode={mode ?? 'replay'}
        setMode={setMode}
        onViewPlan={() => {
          setView(null);
          setPlanOpen(true);
        }}
      />
      <EventLog state={state} onSelect={select} />
      <SideCard selected={selected} state={state} onClose={() => setSelected(null)} />
      {sysOpen && <SystemView state={state} recheck={recheck} onClose={() => setSysOpen(false)} />}
      {formOpen && (
        <ProfileForm
          value={formProfile}
          mode={mode ?? 'replay'}
          onClose={() => setFormOpen(false)}
          onSave={(p) => {
            setFormProfile(p);
            setFormOpen(false);
          }}
        />
      )}
      {histOpen && <HistoryDrawer onClose={() => setHistOpen(false)} onOpen={openHistory} />}
      {planOpen && (
        <PlanScreen
          state={state}
          view={view}
          onClose={() => setPlanOpen(false)}
          recheck={view?.historical ? null : recheck}
          setRecheck={setRecheck}
          onRerun={rerun}
          rerunState={rerunState}
        />
      )}
      {guided && <Guide state={state} onSkip={() => setGuided(false)} />}
      <p className="safety">Lookout never logs in, never submits forms, and never asks for, enters or stores passwords, OTPs or Aadhaar numbers.</p>
      <p className="hint">Drag to orbit · scroll to zoom · right-drag to pan · click a building or character</p>
    </main>
  );
}
