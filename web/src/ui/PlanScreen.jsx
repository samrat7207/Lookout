import { useState } from 'react';

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

function Row({ item, kit, onKit }) {
  const fit = FIT[item.fit] ?? FIT.unclear;
  return (
    <li className="plan__row">
      <div className="plan__rank">#{item.rank}</div>
      <div className="plan__body">
        <div className="plan__top">
          <span className={`chip chip--${fit.cls}`}>{fit.label}</span>
          {item.needsVerification && <span className="chip chip--verify">needs verification</span>}
          <span className="plan__kind">{item.kind === 'scholarship' ? '🎓' : item.kind === 'hackathon' ? '💻' : '📅'} {item.source}</span>
        </div>
        <h4>{item.title}</h4>
        <div className="plan__meta">
          <Deadline item={item} />
          {item.amount && <span className="plan__amount">{item.amount}</span>}
        </div>
        <p className="plan__why">{item.why}</p>
        <p className="plan__rankwhy"><b>Why this ranking:</b> {item.rankWhy}</p>
        <div className="plan__links">
          <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">Source: {host(item.sourceUrl)}</a>
          <span className="plan__checked">Last checked {fmtChecked(item.checkedAt)}</span>
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

/** Full-screen plan over the city: conflicts, ranked list, kits, not-applicable, sources footer. */
export function PlanScreen({ state, onClose }) {
  const [kit, setKit] = useState(null);
  const plan = state.plan;
  if (!plan) return null;
  const notUsed = plan.sources?.notUsed ?? state.sourcesNotUsed ?? [];

  return (
    <div className="plan" role="dialog" aria-label="Your plan">
      <div className="plan__panel">
        <header className="plan__header">
          <div>
            <h2>Your plan</h2>
            <p>Sample student: B.Tech Computer Engineering, 2nd year, OBC, Maharashtra · ranked by deadline, then fit</p>
          </div>
          <button type="button" className="btn" onClick={onClose}>Back to the city</button>
        </header>
        {plan.headline && (
          <div className="plan__headline">
            ⏰ {plan.headline.text} · <b>{daysLeft(plan.headline.daysLeft)}</b>{' '}
            <a href={plan.headline.sourceUrl} target="_blank" rel="noreferrer noopener">source</a>
          </div>
        )}
        <p className="plan__safety">🔒 {SAFETY}</p>
        <Conflicts conflicts={plan.conflicts} />
        <ol className="plan__list">
          {plan.items.map((item) => (
            <Row key={item.opportunityId} item={item} kit={item.kitId ? state.kitsById[item.kitId] : null} onKit={setKit} />
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
            ? <>Sources checked: <b>{plan.sources.checked}</b>, failed: <b>{plan.sources.failed}</b>, last checked: <b>{fmtChecked(plan.sources.lastChecked)}</b></>
            : 'Sources: not reported by this run'}
          {state.runMode && state.runMode.mode !== 'live' && <span className="runbar__replay">{state.runMode.mode === 'mock' ? 'mock data' : 'replayed recording'}</span>}
        </footer>
      </div>
      {kit && <KitView kit={kit} onClose={() => setKit(null)} />}
    </div>
  );
}
