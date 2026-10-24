// Per-run event bus. Stamps every event with the EVENT_SCHEMA v2 envelope,
// keeps the full history (for SSE replay on reconnect) and fans out to subscribers.

export const SCHEMA_VERSION = 2;
const RUN_TTL_MS = 60 * 60 * 1000;

const runs = new Map();

export function newRunId(now = new Date()) {
  const stamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
  return `run_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createRun({ runId = newRunId(), replay = false } = {}) {
  const startedAt = Date.now();
  const history = [];
  const subscribers = new Set();
  let seq = 0;
  let closed = false;

  const run = {
    id: runId,
    replay,
    history,
    get closed() { return closed; },

    /**
     * @param {string} kind
     * @param {{agentId?: string, building?: string, payload?: object, t?: number}} [fields]
     *   t overrides the run clock (replays use recording time, so pauses and speed don't skew it)
     */
    emit(kind, { agentId, building, payload = {}, t } = {}) {
      if (closed) throw new Error(`run ${runId} is closed`);
      const evt = {
        v: SCHEMA_VERSION,
        seq: ++seq,
        runId,
        ts: new Date().toISOString(),
        t: t ?? Date.now() - startedAt,
        kind,
        ...(agentId && { agentId }),
        ...(building && { building }),
        replay,
        payload,
      };
      history.push(evt);
      for (const fn of subscribers) fn(evt);
      return evt;
    },

    /** Live run that fell back to a recording before emitting anything: later events say replay: true. */
    markReplay() {
      replay = true;
      run.replay = true;
    },

    /** fn(evt) for each new event; fn(null) once when the run closes. Returns unsubscribe. */
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    close() {
      if (closed) return;
      closed = true;
      for (const fn of subscribers) fn(null);
      subscribers.clear();
    },
  };

  runs.set(runId, run);
  setTimeout(() => runs.delete(runId), RUN_TTL_MS).unref();
  return run;
}

export function getRun(runId) {
  return runs.get(runId);
}

/** Runs still in memory (the last hour), newest first. */
export function listRuns() {
  return [...runs.values()].reverse();
}
