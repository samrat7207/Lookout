// Run history: every completed run (live, replay, mock) is saved to a small local JSON
// store (server/.data/history.json, gitignored), capped at the last 20. Entries keep
// what the plan screen needs: mode, time, persona, ranked items with verifier results,
// and the sources used and failed. diffPlans() compares two entries.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HISTORY_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.data', 'history.json');
export const HISTORY_LIMIT = 20;

/** Builds a history entry from a finished run's events. Returns null if the run has no plan. */
export function entryFromRun(run, { mode }) {
  const planEvt = run.history.findLast((e) => e.kind === 'plan.ready');
  if (!planEvt) return null;
  const started = run.history.find((e) => e.kind === 'run.started');
  const runMode = run.history.find((e) => e.kind === 'run.mode')?.payload;
  const kits = run.history.filter((e) => e.kind === 'kit.ready').map((e) => e.payload);
  const plan = planEvt.payload;
  return {
    id: run.id,
    savedAt: new Date().toISOString(),
    mode: runMode?.mode ?? mode,
    replay: run.replay,
    recording: runMode?.recording ?? null,
    fallbackReason: runMode?.fallbackReason ?? null,
    persona: started?.payload.profile ?? null,
    counts: { items: plan.items.length, missed: plan.missed?.length ?? 0, notApplicable: plan.notApplicable?.length ?? 0 },
    sources: plan.sources ? { checked: plan.sources.checked, failed: plan.sources.failed, cached: plan.sources.cached ?? 0, lastChecked: plan.sources.lastChecked, list: plan.sources.list ?? [] } : null,
    plan,
    kits,
  };
}

export function createHistory(file = HISTORY_FILE, limit = HISTORY_LIMIT) {
  const read = () => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
  };
  return {
    list: () => read(),
    get: (id) => read().find((e) => e.id === id) ?? null,
    remove(id) {
      const all = read();
      const next = all.filter((e) => e.id !== id);
      if (next.length === all.length) return false;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify(next));
      renameSync(`${file}.tmp`, file);
      return true;
    },
    add(entry) {
      const next = [entry, ...read().filter((e) => e.id !== entry.id)].slice(0, limit);
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(next));
      renameSync(tmp, file); // never leave a half-written file
      return next.length;
    },
  };
}

/** Short summary for the History drawer. */
export function summarize(e) {
  return { id: e.id, savedAt: e.savedAt, mode: e.mode, replay: e.replay, recording: e.recording, fallbackReason: e.fallbackReason, persona: e.persona?.label ?? null, counts: e.counts, sources: e.sources && { checked: e.sources.checked, failed: e.sources.failed } };
}

/**
 * What changed from plan A (older) to plan B (newer), by opportunity id.
 * @returns {{ added, removed, newlyClosed, deadlineMoved, fitChanged, verificationChanged, unchanged: number }}
 */
export function diffPlans(a, b) {
  const open = (p) => new Map((p.items ?? []).map((i) => [i.opportunityId, i]));
  const closed = (p) => new Map((p.missed ?? []).map((i) => [i.opportunityId, i]));
  const A = open(a), B = open(b), Bclosed = closed(b);
  const brief = (i) => ({ opportunityId: i.opportunityId, title: i.title, kind: i.kind, deadline: i.deadline ?? null });
  const out = { added: [], removed: [], newlyClosed: [], deadlineMoved: [], fitChanged: [], verificationChanged: [], unchanged: 0 };

  for (const [id, b1] of B) {
    const a1 = A.get(id);
    if (!a1) {
      out.added.push(brief(b1));
      continue;
    }
    let same = true;
    if ((a1.deadline ?? null) !== (b1.deadline ?? null)) {
      out.deadlineMoved.push({ ...brief(b1), from: a1.deadline ?? null, to: b1.deadline ?? null });
      same = false;
    }
    if (a1.fit !== b1.fit) {
      out.fitChanged.push({ ...brief(b1), from: a1.fit, to: b1.fit });
      same = false;
    }
    const va = a1.verification?.status ?? null, vb = b1.verification?.status ?? null;
    if (va !== vb) {
      out.verificationChanged.push({ ...brief(b1), from: va, to: vb });
      same = false;
    }
    if (same) out.unchanged++;
  }
  for (const [id, a1] of A) {
    if (B.has(id)) continue;
    if (Bclosed.has(id)) out.newlyClosed.push({ ...brief(a1), closedOn: Bclosed.get(id).deadline ?? null });
    else out.removed.push(brief(a1));
  }
  return out;
}
