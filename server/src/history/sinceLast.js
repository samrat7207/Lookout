// "Since your last run": compares the previous completed run for this profile, as stored
// in the database (plan_items rows), with the plan just built. Only stored and fetched
// values are compared; a deadline that was not published stays "not published".

/**
 * @param {{ run: {id: string, finishedAt: string|null, mode: string}, items: object[] } | null} previous
 *   the stored run and its plan_items rows (repository shape), or null
 * @param {{ items?: object[], missed?: object[], today?: string }} plan the current plan
 */
export function sinceLastRun(previous, plan) {
  if (!previous) return { previous: null, note: 'No previous run for this profile.' };
  const before = new Map(previous.items.filter((i) => i.rank !== null && i.status !== 'no').map((i) => [i.schemeId, i]));
  const now = new Map((plan.items ?? []).map((i) => [i.opportunityId, i]));
  const missedNow = new Map((plan.missed ?? []).map((i) => [i.opportunityId, i]));
  const today = plan.today ?? null;
  const out = { previous: { runId: previous.run.id, finishedAt: previous.run.finishedAt, mode: previous.run.mode, items: before.size }, newItems: [], closedItems: [], noLongerListed: [], deadlineChanged: [], unchanged: 0 };

  for (const [id, i] of now) {
    const b = before.get(id);
    if (!b) {
      out.newItems.push({ id, title: i.title, deadline: i.deadline ?? null });
      continue;
    }
    if ((b.deadline ?? null) !== (i.deadline ?? null)) out.deadlineChanged.push({ id, title: i.title, from: b.deadline ?? null, to: i.deadline ?? null });
    else out.unchanged++;
  }
  for (const [id, b] of before) {
    if (now.has(id)) continue;
    const closedOn = missedNow.get(id)?.deadline ?? (b.deadline && today && b.deadline < today ? b.deadline : null);
    if (missedNow.has(id) || closedOn) out.closedItems.push({ id, title: b.name, closedOn });
    else out.noLongerListed.push({ id, title: b.name, deadline: b.deadline ?? null });
  }
  return out;
}

/** The modes whose runs are comparable: real data with real data, scripted with scripted. */
export const modeFamily = (mode) => (mode === 'mock' || mode === 'fake' ? ['mock', 'fake'] : ['live', 'replay']);
