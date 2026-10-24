import { useEffect, useRef, useState } from 'react';
import { buildIcs, buildTimeline, closesInText, exportableItems, filterItems } from '../lib/planTools.js';

const FIT = {
  match: { label: 'Match', cls: 'match' },
  conditional: { label: 'Conditional', cls: 'conditional' },
  unclear: { label: 'Unclear', cls: 'unclear' },
};
const SAFETY = 'Lookout never logs in and never submits anything. It never asks for, enters or stores passwords, OTPs or Aadhaar numbers. You apply yourself on the official portal.';

const daysLeft = (n) => (n === 0 ? 'closes today' : n === 1 ? '1 day left' : `${n} days left`);

function fmtDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function fmtChecked(iso) {
  if (!iso) return 'not checked';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function host(url) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Deadline({ item }) {
  if (!item.deadline) return <span className="plan__nodate">Deadline not published</span>;
  const soon = item.daysLeft <= 7;
  return (
    <span className={`plan__date${soon ? ' plan__date--soon' : ''}`}>
      {fmtDate(item.deadline)} · {daysLeft(item.daysLeft)}
    </span>
  );
}

function Conflicts({ conflicts }) {
  if (!conflicts?.length) return null;
  return (
    <section className="plan__conflicts" aria-label="Conflicts">
      <h3>⚠ Check before you apply</h3>
      {conflicts.map((c) => (
        <div key={c.id} className="plan__conflict">
          <strong>{c.title ?? c.ids.join(' + ')}</strong>
          <p>{c.text}</p>
          {c.officialRule ? (
            <p className="plan__quote">
              Official rule, read {fmtChecked(c.officialRule.checkedAt)}: “{c.officialRule.quote}”{' '}
              <a href={c.officialRule.sourceUrl} target="_blank" rel="noreferrer noopener">source</a>
            </p>
          ) : (
            <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener">Check the current rules on {host(c.sourceUrl)}</a>
          )}
        </div>
      ))}
    </section>
  );
}

const VERIFY = {
  verified: { label: '✓ Verified', cls: 'verified' },
  changed: { label: '⚠ Changed', cls: 'changed' },
  unverified: { label: '? Could not verify', cls: 'unverified' },
};

/** The Verifier's badge; anything but "verified" also shows its reason. */
export function VerifyBadge({ v, withReason = false }) {
  if (!v) return <span className="chip chip--unverified" title="The Verifier has not reported on this item">not re-checked</span>;
  const m = VERIFY[v.status] ?? VERIFY.unverified;
  return (
    <>
      <span className={`chip chip--${m.cls}`} title={v.reason}>{m.label}</span>
      {withReason && v.status !== 'verified' && <span className={`plan__vreason plan__vreason--${m.cls}`}>{v.reason}</span>}
    </>
  );
}

const WATCH = {
  changed: { label: '🗼 Changed since last check', cls: 'changed' },
  'no-change': { label: '🗼 No change', cls: 'verified' },
  unchecked: { label: '🗼 Not re-checked', cls: 'unverified' },
};

function Row({ item, kit, onKit, verification, watch }) {
  const fit = FIT[item.fit] ?? FIT.unclear;
  const v = item.verification ?? verification;
  const w = watch ? WATCH[watch.status] : null;
  return (
    <li className="plan__row">
      <div className="plan__rank">#{item.kindRank ?? item.rank}</div>
      <div className="plan__body">
        <div className="plan__top">
          <span className={`chip chip--${fit.cls}`}>{fit.label}</span>
          {item.needsVerification && <span className="chip chip--verify">needs verification</span>}
          <VerifyBadge v={v} withReason />
          {w && <span className={`chip chip--${w.cls}`} title={watch.reason}>{w.label}</span>}
          {watch?.status === 'changed' && <span className="plan__vreason plan__vreason--changed">{watch.reason}</span>}
          <span className="plan__kind">{item.kind === 'scholarship' ? '🎓' : item.kind === 'hackathon' ? '💻' : '📅'} {item.source}</span>
        </div>
        <h4>{item.title}</h4>
        <div className="plan__meta">
          <Deadline item={item} />
          {item.amount && <span className="plan__amount">{item.amount}</span>}
        </div>
        <p className="plan__why">{item.why}</p>
        <p className="plan__rankwhy"><b>Why this ranking:</b> {item.kindRankWhy ?? item.rankWhy}</p>
        <div className="plan__links">
          <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">{item.eventUrl ? 'Date read from' : 'Source'}: {host(item.sourceUrl)}</a>
          {item.eventUrl && <a href={item.eventUrl} target="_blank" rel="noreferrer noopener">Event page</a>}
          <span className="plan__checked">Last checked {fmtChecked(item.checkedAt)}{v?.checkedAt && v.status !== 'unverified' ? ` · re-checked ${fmtChecked(v.checkedAt)}` : ''}</span>
          {kit && (
            <button type="button" className="btn btn--primary" onClick={() => onKit(kit)}>
              Application Kit
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function KitView({ kit, onClose }) {
  const persona = kit.fields.filter((f) => f.from === 'persona');
  const yours = kit.fields.filter((f) => f.from !== 'persona');
  return (
    <div className="kit" role="dialog" aria-label={`Application Kit: ${kit.title}`}>
      <div className="kit__head">
        <div>
          <p className="kit__eyebrow">Application Kit (read only)</p>
          <h3>{kit.title}</h3>
        </div>
        <button type="button" className="card__close" onClick={onClose} aria-label="Close kit">×</button>
      </div>
      <p className="kit__safety">🔒 {SAFETY}</p>
      {kit.needsVerification && <p className="chip chip--verify">needs verification: eligibility was read from the scheme name or page, confirm on the official guideline</p>}
      <div className="kit__deadline">
        {kit.deadline ? <>Deadline <b>{fmtDate(kit.deadline)}</b> ({daysLeft(kit.daysLeft)})</> : <b>Deadline not published</b>}
        {' · '}
        <a href={kit.applyUrl} target="_blank" rel="noreferrer noopener">Official portal: {host(kit.applyUrl)}</a>
      </div>
      <h4>Documents needed</h4>
      <ul className="kit__docs">
        {kit.documents.map((d) => (
          <li key={d.name}>
            ☐ {d.name}
            {d.from ? (
              <a href={d.from} target="_blank" rel="noreferrer noopener"> (listed on {host(d.from)})</a>
            ) : (
              <span className="chip chip--verify">usually needed · needs verification</span>
            )}
          </li>
        ))}
      </ul>
      <h4>Steps, in order</h4>
      <ol className="kit__steps">
        {kit.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <h4>Your details (prefilled from the sample student)</h4>
      <dl className="kit__fields">
        {persona.map((f) => (
          <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>
        ))}
        {yours.map((f) => (
          <div key={f.label}><dt>{f.label}</dt><dd className="kit__self">{f.sensitive ? 'Enter this yourself on the official portal' : 'You fill this on the portal'}</dd></div>
        ))}
      </dl>
      <p className="kit__source">Read from <a href={kit.sourceUrl} target="_blank" rel="noreferrer noopener">{kit.sourceUrl}</a></p>
    </div>
  );
}

const TRI = [['', 'unknown, needs your input'], ['yes', 'yes'], ['no', 'no']];
const triValue = (v) => (v === true ? 'yes' : v === false ? 'no' : '');
const fromTri = (v) => (v === 'yes' ? true : v === 'no' ? false : null);

/**
 * The Profiler's view of the student: what we know (sample student) and what we do not.
 * Editing fields and pressing Re-run re-applies the Judge and the Ranker to the same
 * fetched data (POST /api/rejudge); nothing is re-fetched or guessed.
 */
function ProfileBox({ profile, onRerun, rerunState }) {
  const [edit, setEdit] = useState({ gender: 'male', category: 'OBC', familyIncome: '', capAdmission: '', domicileProof: '' });
  if (!profile) return null;
  const set = (k) => (e) => setEdit((x) => ({ ...x, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    onRerun?.({
      gender: edit.gender,
      category: edit.category,
      familyIncome: edit.familyIncome === '' ? null : Number(edit.familyIncome),
      capAdmission: fromTri(edit.capAdmission),
      domicileProof: fromTri(edit.domicileProof),
    });
  };
  return (
    <section className="plan__profile" aria-label="Your details">
      <h3>Your details <span className="plan__sample">{profile.label ?? 'profile'}</span></h3>
      <div className="plan__known">
        {profile.known.map((k) => (
          <span key={k.field} className="plan__fact"><b>{k.label}:</b> {k.value}</span>
        ))}
      </div>
      <details>
        <summary>Unknown ({profile.unknown.length}): needs your input, never guessed</summary>
        <ul>
          {profile.unknown.map((u) => (
            <li key={u.field}><b>{u.label}</b>: <i>{u.value}</i>. {u.why}</li>
          ))}
        </ul>
      </details>
      {onRerun && (
        <form className="plan__edit" onSubmit={submit} aria-label="Edit the profile and re-run the Judge and Ranker">
          <label>Gender <select value={edit.gender} onChange={set('gender')}><option value="male">male</option><option value="female">female</option></select></label>
          <label>Category <select value={edit.category} onChange={set('category')}>{['OBC', 'SC', 'ST', 'EWS', 'General'].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Annual family income (₹) <input type="number" min="0" step="10000" inputMode="numeric" placeholder="unknown, needs your input" value={edit.familyIncome} onChange={set('familyIncome')} /></label>
          <label>CAP admission <select value={edit.capAdmission} onChange={set('capAdmission')}>{TRI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Domicile proof <select value={edit.domicileProof} onChange={set('domicileProof')}>{TRI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <button type="submit" className="btn btn--primary" disabled={rerunState === 'busy'}>{rerunState === 'busy' ? 'Re-running…' : '↻ Re-run Judge and Ranker'}</button>
          {rerunState?.startsWith?.('error') && <span className="plan__watchmsg plan__watchmsg--err" role="alert">{rerunState}</span>}
          <span className="plan__muted">Uses the same fetched data; nothing is re-fetched. Values stay on this screen only.</span>
        </form>
      )}
    </section>
  );
}

/** Horizontal deadline timeline: days left per deadline; red under 7 days; a no-deadline lane. */
function Timeline({ items, today }) {
  const t = buildTimeline(items, today);
  if (!t.dated.length && !t.undated.length) return null;
  return (
    <section className="tl" aria-label="Deadline timeline">
      <div className="tl__track">
        {t.ticks.map((d) => (
          <span key={d} className="tl__tick" style={{ left: `${(d / t.span) * 100}%` }}>{d === 0 ? 'today' : `+${d}d`}</span>
        ))}
        {t.dated.map((d, i) => (
          <span
            key={d.item.opportunityId}
            className={`tl__chip${d.soon ? ' tl__chip--soon' : ''}${d.pos > 0.55 ? ' tl__chip--end' : ''}`}
            style={{ left: `${d.pos * 100}%`, top: `${26 + (i % 4) * 26}px` }}
            title={`${d.item.title}: ${d.item.deadline}`}
          >
            {d.item.title.length > 26 ? `${d.item.title.slice(0, 24)}…` : d.item.title} · {closesInText(d.daysLeft)}
          </span>
        ))}
      </div>
      {t.undated.length > 0 && (
        <div className="tl__lane">
          <b>No deadline published ({t.undated.length}):</b> {t.undated.map((i) => i.title).join(' · ')}
        </div>
      )}
    </section>
  );
}

const FIT_OPTS = [['match', 'Match'], ['conditional', 'Conditional'], ['unclear', 'Unclear']];
const TYPE_OPTS = [['central', 'Central'], ['state', 'State'], ['private', 'Private'], ['hackathon', 'Hackathon']];

function Toggle({ on, onClick, children }) {
  return <button type="button" aria-pressed={on} className={`fchip${on ? ' fchip--on' : ''}`} onClick={onClick}>{children}</button>;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Full-screen plan over the city: conflicts, ranked list, kits, not-applicable, sources footer. */
/** Watchtower: "Re-check now" re-fetches the plan's sources and reports real changes only. */
function Watchtower({ state, plan, result, setResult }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const items = [...plan.items, ...(plan.missed ?? [])].map(({ opportunityId, title, deadline, source, sourceUrl }) => ({ opportunityId, title, deadline, source, sourceUrl }));
      const res = await fetch('/api/recheck', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: state.runId, items }) });
      const json = await res.json().catch(() => ({}));
      setResult(res.ok ? json : { error: json.error ?? `HTTP ${res.status}` });
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setBusy(false);
    }
  };
  const sum = result?.summary;
  return (
    <section className="plan__watch">
      <button type="button" className="btn" disabled={busy} onClick={run}>{busy ? '🗼 Re-checking…' : '🗼 Re-check now'}</button>
      {result?.error && <span className="plan__watchmsg plan__watchmsg--err">{result.error}</span>}
      {sum && (
        <span className={`plan__watchmsg${sum.changed ? ' plan__watchmsg--err' : ''}`}>
          Watchtower, {fmtChecked(sum.checkedAt)}: {sum.changed ? `${sum.changed} changed since the last check` : 'no changes found'} ({sum.noChange} unchanged, {sum.unchecked} could not be re-checked, {sum.sources} sources fetched)
        </span>
      )}
      {!sum && !result?.error && <span className="plan__watchmsg">Re-fetches these sources now and flags only a real date or listing change.</span>}
    </section>
  );
}

/**
 * Full-screen plan over the city. `plan`, `kitsById` and `verification` default to the
 * live run's state; the History drawer and Re-run pass their own (with a `label`).
 */
export function PlanScreen({ state, onClose, recheck, setRecheck, view = null, onRerun, rerunState }) {
  const [kit, setKit] = useState(null);
  const [tab, setTab] = useState('scholarship');
  const [f, setF] = useState({ fits: [], types: [], verifiedOnly: false, q: '' });
  const panel = useRef(null);
  const plan = view?.plan ?? state.plan;
  const kitsById = view?.kitsById ?? state.kitsById;
  const verification = view?.verification ?? state.verification;

  // keyboard: Escape closes (the kit first); focus moves into the dialog once, when it opens
  const latest = useRef({ kit, onClose });
  latest.current = { kit, onClose };
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (latest.current.kit) setKit(null);
      else latest.current.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!plan) {
    return (
      <div className="plan" role="dialog" aria-label="Your plan">
        <div className="plan__panel" tabIndex={-1} ref={panel}>
          <header className="plan__header"><h2>Your plan</h2><button type="button" className="btn" onClick={onClose}>Back to the city</button></header>
          <p className="plan__empty">{state.status === 'running' || state.status === 'starting' ? 'The scouts are still reading the sources; the plan appears here when the Mayor has ranked their findings.' : 'No plan yet. Start a run (Live, Replay or Mock) from the top bar.'}</p>
        </div>
      </div>
    );
  }
  const notUsed = plan.sources?.notUsed ?? state.sourcesNotUsed ?? [];
  const watchById = new Map((recheck?.results ?? []).map((r) => [r.opportunityId, r]));
  const visible = filterItems(plan.items, f, verification);
  const scholarships = visible.filter((i) => i.kind === 'scholarship');
  const opportunities = visible.filter((i) => i.kind !== 'scholarship');
  const shown = tab === 'scholarship' ? scholarships : opportunities;
  const flip = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const filtered = f.fits.length || f.types.length || f.verifiedOnly || f.q;
  const icsCount = exportableItems(plan.items).length;
  const onTabKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') setTab((t) => (t === 'scholarship' ? 'opportunities' : 'scholarship'));
  };

  return (
    <div className="plan" role="dialog" aria-label="Your plan">
      <div className="plan__panel" tabIndex={-1} ref={panel}>
        <header className="plan__header">
          <div>
            <h2>Your plan</h2>
            <p>Sample student: B.Tech Computer Engineering, 2nd year, OBC, Maharashtra · ranked by deadline, then fit</p>
            {view?.label && <p className="plan__viewlabel">{view.label}</p>}
            {plan.rejudged && <p className="plan__viewlabel">Re-judged {fmtChecked(plan.rejudged.at)} with your edits ({plan.rejudged.moved.length} items moved); {plan.rejudged.from}.</p>}
          </div>
          <div className="plan__actions">
            <button type="button" className="btn" onClick={() => window.print()}>⎙ Download plan (print / PDF)</button>
            <button type="button" className="btn" disabled={!icsCount} onClick={() => download('lookout-deadlines.ics', buildIcs(plan.items), 'text/calendar')} title="Only deadlines read from fetched pages; none for 'not published'">📅 .ics ({icsCount} deadlines)</button>
            <button type="button" className="btn" onClick={onClose}>Back to the city</button>
          </div>
        </header>
        {plan.headline && (
          <div className="plan__headline">
            ⏰ {plan.headline.text} · <b>{daysLeft(plan.headline.daysLeft)}</b>{' '}
            <a href={plan.headline.sourceUrl} target="_blank" rel="noreferrer noopener">source</a>
          </div>
        )}
        <p className="plan__safety">🔒 {SAFETY}</p>
        <ProfileBox profile={plan.profile ?? state.profile} onRerun={onRerun} rerunState={rerunState} />
        {!view?.historical && <Watchtower state={state} plan={plan} result={recheck} setResult={setRecheck} />}
        <Timeline items={plan.items} today={plan.today} />
        {tab === 'scholarship' && <Conflicts conflicts={plan.conflicts} />}
        <div className="plan__filters" role="search">
          <input type="search" placeholder="Search by name" aria-label="Search by name" value={f.q} onChange={(e) => setF((x) => ({ ...x, q: e.target.value }))} />
          <span className="plan__fgroup" aria-label="Status">{FIT_OPTS.map(([v, l]) => <Toggle key={v} on={f.fits.includes(v)} onClick={() => flip('fits', v)}>{l}</Toggle>)}</span>
          <span className="plan__fgroup" aria-label="Type">{TYPE_OPTS.map(([v, l]) => <Toggle key={v} on={f.types.includes(v)} onClick={() => flip('types', v)}>{l}</Toggle>)}</span>
          <Toggle on={f.verifiedOnly} onClick={() => setF((x) => ({ ...x, verifiedOnly: !x.verifiedOnly }))}>✓ Verified only</Toggle>
          {filtered && <button type="button" className="btn" onClick={() => setF({ fits: [], types: [], verifiedOnly: false, q: '' })}>Clear filters</button>}
        </div>
        <div className="plan__tabs" role="tablist" onKeyDown={onTabKey}>
          <button type="button" role="tab" aria-selected={tab === 'scholarship'} className={`plan__tab${tab === 'scholarship' ? ' plan__tab--on' : ''}`} onClick={() => setTab('scholarship')}>
            🎓 Scholarships ({scholarships.length})
          </button>
          <button type="button" role="tab" aria-selected={tab !== 'scholarship'} className={`plan__tab${tab !== 'scholarship' ? ' plan__tab--on' : ''}`} onClick={() => setTab('opportunities')}>
            💻 Opportunities ({opportunities.length})
          </button>
        </div>
        {shown.length === 0 && <p className="plan__empty">{filtered ? 'Nothing matches these filters.' : tab === 'scholarship' ? 'No scholarships in this run.' : 'No hackathons or events in this run (the Opportunities scout did not run, or found none that fit).'}</p>}
        <ol className="plan__list">
          {shown.map((item) => (
            <Row key={item.opportunityId} item={item} kit={item.kitId ? kitsById[item.kitId] : null} onKit={setKit} verification={verification[item.opportunityId]} watch={watchById.get(item.opportunityId)} />
          ))}
        </ol>
        {plan.missed?.length > 0 && (
          <details className="plan__section">
            <summary>Missed ({plan.missed.length}): deadline already passed</summary>
            <ul>{plan.missed.map((m) => <li key={m.opportunityId}>{m.title} · closed {fmtDate(m.deadline)}</li>)}</ul>
          </details>
        )}
        {plan.notApplicable?.length > 0 && (
          <details className="plan__section">
            <summary>Not applicable ({plan.notApplicable.length}): why each was dropped</summary>
            <ul className="plan__na">
              {plan.notApplicable.map((n) => (
                <li key={`${n.title}-${n.sourceUrl}`}>
                  <b>{n.title}</b>: {n.reason}{' '}
                  <a href={n.sourceUrl} target="_blank" rel="noreferrer noopener">{host(n.sourceUrl)}</a>
                </li>
              ))}
            </ul>
          </details>
        )}
        {notUsed.length > 0 && (
          <details className="plan__section">
            <summary>Sources not used tonight ({notUsed.length})</summary>
            <ul>{notUsed.map((n) => <li key={n.name}><b>{n.name}</b>: {n.reason}</li>)}</ul>
          </details>
        )}
        <footer className="plan__footer">
          {plan.sources
            ? <span>Sources checked: <b>{plan.sources.checked}</b>, failed: <b>{plan.sources.failed}</b>, last checked: <b>{fmtChecked(plan.sources.lastChecked)}</b></span>
            : <span>Sources: not reported by this run</span>}
          {view?.mode ? view.mode !== 'live' && <span className="runbar__replay">{view.mode === 'mock' ? 'mock data' : 'replayed recording'}</span> : state.runMode && state.runMode.mode !== 'live' && <span className="runbar__replay">{state.runMode.mode === 'mock' ? 'mock data' : 'replayed recording'}</span>}
        </footer>
      </div>
      {kit && <KitView kit={kit} onClose={() => setKit(null)} />}
      <PrintPlan plan={plan} label={view?.label} />
    </div>
  );
}

/** What "Download plan" prints: a clean page (print to PDF) with every item, its source and date. */
function PrintPlan({ plan, label }) {
  return (
    <section className="print-plan" aria-hidden>
      <h1>Lookout plan · sample student</h1>
      <p>B.Tech Computer Engineering, 2nd year, OBC, Maharashtra · generated {fmtChecked(plan.generatedAt)}{label ? ` · ${label}` : ''}</p>
      <p>{SAFETY}</p>
      {plan.conflicts?.length > 0 && <p><b>Check before applying:</b> {plan.conflicts.map((c) => `${c.title}: ${c.text}`).join(' ')}</p>}
      <table>
        <thead><tr><th>#</th><th>Item</th><th>Deadline</th><th>Status</th><th>Verified</th><th>Source</th><th>Last checked</th></tr></thead>
        <tbody>
          {plan.items.map((i) => (
            <tr key={i.opportunityId}>
              <td>{i.rank}</td>
              <td>{i.title}<br /><small>{i.why}</small></td>
              <td>{i.deadline ? `${fmtDate(i.deadline)} (${i.deadlineLabel})` : 'Deadline not published'}</td>
              <td>{i.fit}</td>
              <td>{i.verification?.status ?? 'not re-checked'}</td>
              <td>{i.sourceUrl}</td>
              <td>{fmtChecked(i.checkedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {plan.sources && <p>Sources checked: {plan.sources.checked}, failed: {plan.sources.failed}, last checked: {fmtChecked(plan.sources.lastChecked)}</p>}
    </section>
  );
}
