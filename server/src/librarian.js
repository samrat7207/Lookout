// The Librarian: reads the repository (Postgres or the local fallback) for every run.
// After the Mayor's briefing (plan.split), the Mayor sends a library.request; the
// Librarian walks to the Library, looks up the last completed run for this profile
// (same state, category, course and year, comparable mode) and hands it to the Mayor.
// Just before the run ends it emits library.diff: "since your last run", computed from
// the stored rows and the new plan only. It runs in every mode (live, replay, mock),
// because the database is real in all of them. Recorded librarian events are skipped
// on replay (replay.js) so they are never doubled.

import { profileFromPersona } from './db/fromRun.js';
import { modeFamily, sinceLastRun } from './history/sinceLast.js';
import { emitHandoff } from './pipelineEvents.js';

export const LIBRARIAN = { id: 'librarian', name: 'Libby', role: 'Librarian' };

/** Events that belong to the live Librarian, not to a recording. */
export const isLibrarianEvent = (e) => e.agentId === 'librarian' || e.kind?.startsWith('library.') || (e.kind === 'handoff' && (e.payload?.from === 'librarian' || e.payload?.to === 'librarian'));

/**
 * @param {ReturnType<import('./bus.js').createRun>} run
 * @param {Promise<object|null>} repoReady the repository (or null when there is none)
 * @param {{ mode: string }} opts the requested mode (decides which earlier runs are comparable)
 */
export function attachLibrarian(run, repoReady, { mode }) {
  let profile = null;
  let started = false;
  let previous; // undefined = not looked up yet; null = none
  // stamped with the run's latest time, so on a replay the Librarian's events sit in
  // recording time next to the events around them
  const emit = (kind, fields) => {
    if (!run.closed) run.emit(kind, { ...fields, t: run.history.at(-1)?.t });
  };
  const as = (kind, payload, building = 'library') => emit(kind, { agentId: LIBRARIAN.id, building, payload });

  async function lookUp() {
    as('agent.walking', { to: 'library', reason: 'Looking up your last run' }, 'townhall');
    let repo = null;
    try {
      repo = await repoReady;
    } catch {
      repo = null;
    }
    const store = repo?.info?.().kind ?? 'none';
    as('agent.working', { tool: 'database', target: store, label: 'Find the last completed run for this profile' });
    try {
      const match = profileFromPersona(profile) ?? {};
      const run0 = repo ? await repo.runs.lastCompletedFor(match, modeFamily(mode)) : null;
      previous = run0 ? { run: run0, items: await repo.planItems.listByRun(run0.id) } : null;
    } catch (err) {
      previous = null;
      as('agent.error', { tool: 'database', code: err.code ?? 'error', message: 'Could not read the saved runs', retrying: false });
    }
    const summary = previous ? `last run ${previous.run.finishedAt?.slice(0, 16).replace('T', ' ') ?? ''} (${previous.items.filter((i) => i.rank !== null).length} items)` : 'no previous run';
    as('library.result', { found: !!previous, store, previous: previous ? { runId: previous.run.id, finishedAt: previous.run.finishedAt, mode: previous.run.mode } : null, summary });
    as('agent.done', { findings: previous ? 1 : 0, durationMs: 0 });
    emitHandoff(run, { from: LIBRARIAN.id, to: 'mayor', summary, what: 'previous run' });
    as('agent.returning', { to: 'townhall' });
  }

  const off = run.subscribe((evt) => {
    if (!evt) return off?.();
    if (evt.kind === 'run.started' && !profile) {
      profile = evt.payload?.profile ?? null;
      setImmediate(() => emit('agent.spawned', { agentId: LIBRARIAN.id, building: 'townhall', payload: { name: LIBRARIAN.name, role: LIBRARIAN.role } }));
    }
    if (evt.kind === 'plan.split' && !started) {
      started = true;
      setImmediate(() => {
        emit('library.request', { agentId: 'mayor', building: 'townhall', payload: { to: LIBRARIAN.id, want: 'the last completed run for this profile' } });
        lookUp().catch((err) => console.error('librarian:', err.code ?? err.name));
      });
    }
  });

  run.beforeEnd(() => {
    const plan = run.history.findLast((e) => e.kind === 'plan.ready')?.payload;
    if (!plan || !started) return;
    const diff = previous === undefined ? { previous: null, note: 'The Librarian had not finished the lookup.' } : sinceLastRun(previous, plan);
    run.emit('library.diff', { agentId: LIBRARIAN.id, building: 'library', payload: diff, t: run.history.at(-1)?.t });
  });
}
