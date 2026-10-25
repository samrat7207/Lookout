// 30-day auto purge: deletes saved runs, their plan items and stored profile snapshots older
// than RETENTION_DAYS (default 30) from the repository (Postgres and the local fallback).
// It runs once at server start and then once a day. It never deletes sources, and there are
// no user accounts yet. Only counts are logged, never row contents.

export const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function retentionDays(value = process.env.RETENTION_DAYS) {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_RETENTION_DAYS;
}

/**
 * @param {Promise<object|null>} repoReady the repository (or null when there is none)
 * @param {{ days?: number, intervalMs?: number, now?: () => number, log?: (line: string) => void }} [opts]
 */
export function startRetention(repoReady, { days = retentionDays(), intervalMs = DAY_MS, now = () => Date.now(), log = (l) => console.log(l) } = {}) {
  const state = { days, lastPurgeAt: null, lastRemoved: null, lastError: null, nextPurgeAt: null };
  let timer = null;
  async function runNow() {
    const repo = await repoReady;
    if (!repo?.purgeOlderThan) return null;
    const cutoff = new Date(now() - days * DAY_MS).toISOString();
    try {
      const removed = await repo.purgeOlderThan(cutoff);
      Object.assign(state, { lastPurgeAt: new Date(now()).toISOString(), lastRemoved: removed, lastError: null });
      log(`retention: removed ${removed.runs} runs, ${removed.planItems} plan items, ${removed.profiles} profile snapshots older than ${days} days`);
      return removed;
    } catch (err) {
      state.lastError = err?.code ?? err?.name ?? 'error'; // a code only, never a message
      log(`retention: purge failed (${state.lastError})`);
      return null;
    } finally {
      state.nextPurgeAt = timer ? new Date(now() + intervalMs).toISOString() : null;
    }
  }
  const first = runNow();
  timer = setInterval(runNow, intervalMs);
  timer.unref?.();
  return {
    first,
    runNow,
    status: () => ({ ...state }),
    stop: () => { clearInterval(timer); timer = null; },
  };
}
