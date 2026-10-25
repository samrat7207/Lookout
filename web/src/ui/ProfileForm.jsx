// The profile form: state, social category, course, year, optional gender and income
// band. Blank fields stay "unknown" (never filled from the sample student). It applies
// to Live runs only; Replay and Mock replay a recorded run of the sample student.
import { useState } from 'react';

const STATES = ['Maharashtra', 'Andhra Pradesh', 'Bihar', 'Delhi', 'Gujarat', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'];
const blank = { state: '', category: '', course: '', year: '', gender: '', incomeBand: '' };

export function ProfileForm({ value, onSave, onClose, mode }) {
  const [f, setF] = useState(value ? { ...blank, ...value, year: value.year ? String(value.year) : '' } : blank);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = (e) => {
    e.preventDefault();
    const out = { source: 'form' };
    for (const [k, v] of Object.entries(f)) if (v !== '' && k !== 'source') out[k] = k === 'year' ? Number(v) : v;
    onSave(out);
  };
  const sel = (k, label, opts) => (
    <label>
      {label}
      <select value={f[k]} onChange={set(k)}>
        <option value="">unknown</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  return (
    <aside className="pform" role="dialog" aria-label="Your profile">
      <header className="sys__head">
        <h2>Your profile</h2>
        <button type="button" className="card__close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <p className="pform__warn">Prototype: matches the schemes we cover. Results for other profiles may be incomplete. Our rules were checked only for Maharashtra, OBC, B.Tech, 2nd year; any other profile is shown as "not checked".</p>
      <form onSubmit={save}>
        {sel('state', 'State', STATES.map((s) => [s, s]))}
        {sel('category', 'Social category', ['General', 'OBC', 'SC', 'ST', 'EWS'].map((c) => [c, c]))}
        {sel('course', 'Course', [['btech', 'B.Tech'], ['other-ug', 'Other undergraduate degree'], ['diploma', 'Diploma'], ['pg', 'Postgraduate']])}
        {sel('year', 'Year of study', [1, 2, 3, 4, 5].map((y) => [String(y), `Year ${y}`]))}
        {sel('gender', 'Gender (optional)', [['male', 'male'], ['female', 'female']])}
        {sel('incomeBand', 'Family income band (optional)', [['upto-2.5L', 'up to ₹2.5 lakh'], ['2.5L-4.5L', '₹2.5 to 4.5 lakh'], ['4.5L-8L', '₹4.5 to 8 lakh'], ['above-8L', 'above ₹8 lakh']])}
        <p className="sys__muted">Blank fields stay "unknown"; nothing is guessed. The income band is saved and shown, but the live Judge does not use it yet (use Re-run on the plan with an exact income).</p>
        <p className="sys__muted">Consent: these fields (and nothing else: no name, contact or ID numbers) are saved with the run in the database, so the Librarian can compare your next run. You can delete a run from the plan.</p>
        {mode !== 'live' && <p className="pform__warn">Applies to Live runs only. Replay and Mock replay a recorded run of the sample student.</p>}
        <div className="hist__bar">
          <button type="submit" className="btn btn--primary">Use this profile</button>
          <button type="button" className="btn" onClick={() => onSave(null)}>Use the sample student</button>
        </div>
      </form>
    </aside>
  );
}
