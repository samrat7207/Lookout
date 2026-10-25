// Maps a finished run (its history entry, history/history.js) to repository rows.
// Only facts that came from the run are stored: no deadline or check time is filled in.

import { SOURCES_NOT_USED } from '../liveRun.js';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const statusOf = (fit) => (fit === 'not_applicable' ? 'no' : ['match', 'conditional', 'unclear'].includes(fit) ? fit : null);
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** The profile row: only what matching needs; facts the profile does not state stay null. */
export function profileFromPersona(p) {
  if (!p) return null;
  const pick = (v) => (v === undefined || v === '' ? null : v);
  return {
    label: pick(p.label),
    state: pick(p.state),
    category: pick(p.category),
    course: pick(p.course),
    year: Number.isInteger(p.year) ? p.year : null,
    extra: {
      gender: pick(p.gender),
      disability: typeof p.disability === 'boolean' ? p.disability : null,
      familyIncome: Number.isFinite(p.familyIncome) ? p.familyIncome : null,
      capAdmission: typeof p.capAdmission === 'boolean' ? p.capAdmission : null,
      domicileProof: typeof p.domicileProof === 'boolean' ? p.domicileProof : null,
    },
  };
}

function itemRows(plan) {
  const rows = [];
  let skipped = 0;
  const add = (i, rank) => {
    const status = statusOf(i.fit ?? (rank === null ? 'not_applicable' : null));
    // NOT NULL source_url and last_checked: an item without them is not stored
    if (!status || !i.sourceUrl || !i.checkedAt) return skipped++;
    rows.push({
      schemeId: i.opportunityId ?? `${i.source ?? 'item'}:${slug(i.title)}`,
      name: i.title,
      type: i.kind ?? 'scholarship',
      status,
      deadline: isDay(i.deadline) ? i.deadline : null,
      deadlineNote: isDay(i.deadline) ? i.deadlineLabel ?? null : 'deadline not published',
      amount: i.amount ?? null,
      sourceUrl: i.sourceUrl,
      lastChecked: i.checkedAt,
      verifierStatus: i.verification?.status ?? null,
      rank,
      whyRanked: i.rankWhy ?? i.why ?? i.reason ?? null,
    });
  };
  (plan.items ?? []).forEach((i, n) => add(i, n + 1));
  for (const i of plan.missed ?? []) add(i, null);
  for (const i of plan.notApplicable ?? []) add({ ...i, fit: 'not_applicable' }, null);
  // one row per scheme id per run
  const seen = new Set();
  const unique = rows.filter((r) => (seen.has(r.schemeId) ? false : seen.add(r.schemeId)));
  return { rows: unique, skipped: skipped + rows.length - unique.length };
}

function sourceRows(plan) {
  const used = (plan.sources?.list ?? []).map((s) => ({
    id: `used:${slug(s.name)}`,
    name: s.name,
    url: s.url ?? null,
    kind: /search/i.test(s.name) ? 'search' : /json|feed/i.test(s.name) ? 'feed' : 'page',
    used: true,
    notUsedReason: null,
    lastChecked: s.checkedAt ?? null,
  }));
  const notUsed = SOURCES_NOT_USED.map((s) => ({ id: `not-used:${slug(s.name)}`, name: s.name, url: null, kind: 'not-used', used: false, notUsedReason: s.reason, lastChecked: null }));
  return [...used, ...notUsed];
}

/**
 * @param {object} entry a history entry (entryFromRun)
 * @param {{ startedAt: string, finishedAt: string, status: 'complete'|'failed' }} times
 */
export function rowsFromEntry(entry, { startedAt, finishedAt, status }) {
  const { rows, skipped } = itemRows(entry.plan);
  return {
    profile: profileFromPersona(entry.persona),
    run: { id: entry.id, mode: entry.mode, startedAt, finishedAt, status },
    items: rows,
    sources: sourceRows(entry.plan),
    skipped,
  };
}

/** Facts the profile does not state, for display ("unknown"). */
export function unknownFields(profile) {
  if (!profile) return [];
  const top = ['label', 'state', 'category', 'course', 'year'].filter((k) => profile[k] == null);
  const extra = Object.entries(profile.extra ?? {}).filter(([, v]) => v == null).map(([k]) => k);
  return [...top, ...extra];
}
