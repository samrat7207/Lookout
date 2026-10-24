import { useEffect, useRef, useState } from 'react';

function fmt(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function DiffList({ title, rows, render, tone }) {
  if (!rows.length) return null;
  return (
    <div className={`hist__diff hist__diff--${tone}`}>
      <h4>{title} ({rows.length})</h4>
      <ul>{rows.map((r) => <li key={r.opportunityId}>{render(r)}</li>)}</ul>
    </div>
  );
}

/** History drawer: the last 20 completed runs (server store). Open one, or compare two. */
export function HistoryDrawer({ onClose, onOpen }) {
  const [runs, setRuns] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState([]);
  const [cmp, setCmp] = useState(null);
  const [busy, setBusy] = useState(false);
  const panel = useRef(null);

  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    panel.current?.focus();
    fetch('/api/history')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setRuns(j.runs))
      .catch((e) => setError(`Could not load the history: ${e.message}. Is the server running?`));
    const onKey = (e) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  const open = async (id) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/history/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      onOpen(await r.json());
    } catch (e) {
      setError(`Could not open that run: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const compare = async () => {
    setBusy(true);
    setCmp(null);
    try {
      const r = await fetch(`/api/history/compare?a=${encodeURIComponent(picked[0])}&b=${encodeURIComponent(picked[1])}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setCmp(await r.json());
    } catch (e) {
      setError(`Could not compare: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="hist" role="dialog" aria-label="Run history" tabIndex={-1} ref={panel}>
      <header className="sys__head">
        <h2>Run history</h2>
        <button type="button" className="card__close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <p className="sys__muted">The last 20 completed runs saved on this server. Tick two to compare.</p>
      {error && <p className="hist__error" role="alert">{error}</p>}
      {runs === null && !error && <p className="sys__muted">Loading…</p>}
      {runs?.length === 0 && <p className="plan__empty">No completed runs yet. Finish a Live, Replay or Mock run and it appears here.</p>}
      {runs?.length > 0 && (
        <ul className="hist__list">
          {runs.map((r) => (
            <li key={r.id} className={picked.includes(r.id) ? 'hist__row hist__row--on' : 'hist__row'}>
              <label>
                <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Select run ${r.id} for comparison`} />
                <span className={`hist__mode hist__mode--${r.mode}`}>{r.mode}</span>
                <span>{fmt(r.savedAt)}</span>
              </label>
              <span className="sys__muted">
                {r.counts.items} items · {r.counts.notApplicable} not applicable{r.sources ? ` · sources ${r.sources.checked}, failed ${r.sources.failed}` : ''}
                {r.fallbackReason ? ' · fallback' : ''}
              </span>
              <button type="button" className="btn" disabled={busy} onClick={() => open(r.id)}>Open</button>
            </li>
          ))}
        </ul>
      )}
      <div className="hist__bar">
        <button type="button" className="btn btn--primary" disabled={picked.length !== 2 || busy} onClick={compare}>Compare the two ticked runs</button>
      </div>
      {cmp && (
        <section className="hist__cmp" aria-label="Comparison">
          <p>
            From <b>{cmp.older.mode}</b> {fmt(cmp.older.savedAt)} to <b>{cmp.newer.mode}</b> {fmt(cmp.newer.savedAt)}: {cmp.diff.unchanged} unchanged.
          </p>
          <DiffList title="Added" tone="good" rows={cmp.diff.added} render={(r) => <>{r.title}{r.deadline ? ` · ${r.deadline}` : ''}</>} />
          <DiffList title="Removed" tone="bad" rows={cmp.diff.removed} render={(r) => r.title} />
          <DiffList title="Newly closed" tone="bad" rows={cmp.diff.newlyClosed} render={(r) => <>{r.title} · closed {r.closedOn}</>} />
          <DiffList title="Deadline moved" tone="warn" rows={cmp.diff.deadlineMoved} render={(r) => <>{r.title}: {r.from ?? 'not published'} → {r.to ?? 'not published'}</>} />
          <DiffList title="Fit changed" tone="warn" rows={cmp.diff.fitChanged} render={(r) => <>{r.title}: {r.from} → {r.to}</>} />
          <DiffList title="Verifier result changed" tone="warn" rows={cmp.diff.verificationChanged} render={(r) => <>{r.title}: {r.from ?? 'none'} → {r.to ?? 'none'}</>} />
          {!['added', 'removed', 'newlyClosed', 'deadlineMoved', 'fitChanged', 'verificationChanged'].some((k) => cmp.diff[k].length) && <p className="plan__empty">No differences between these two runs.</p>}
        </section>
      )}
    </aside>
  );
}
