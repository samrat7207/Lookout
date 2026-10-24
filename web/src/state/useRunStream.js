// Wires the SSE stream of one run into the reducer. EventSource resends
// Last-Event-ID on reconnect and the server replays only what was missed; the
// reducer also drops any duplicate seq. The runId is kept in sessionStorage, so a
// page reload reconnects to the same run and rebuilds the same picture from history.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { initialState, reduce } from './reducer.js';

const KEY = 'lookout.runId';

function stored() {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function store(runId) {
  try {
    if (runId) sessionStorage.setItem(KEY, runId);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: reload just won't resume */
  }
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export function useRunStream() {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const [runId, setRunId] = useState(stored);
  const [playback, setPlayback] = useState({ paused: false, speed: 1 });
  const [startError, setStartError] = useState(null);
  const [health, setHealth] = useState(null); // { defaultMode, tinyfishKeyPresent, lastRecording }
  const runRef = useRef(runId);
  runRef.current = runId;

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  // a live run that fell back to a recording becomes pausable: read its controls
  const replayingNow = state.runMode && state.runMode.mode !== 'live';
  useEffect(() => {
    if (!runId || !replayingNow) return;
    fetch(`/api/runs/${encodeURIComponent(runId)}/control`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.control && runRef.current === runId && setPlayback(j.control))
      .catch(() => {});
  }, [runId, replayingNow]);

  useEffect(() => {
    if (!runId) return undefined;
    const es = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
    es.onopen = () => dispatch({ kind: 'local.connection', connection: 'open' });
    es.onmessage = (m) => {
      let evt;
      try {
        evt = JSON.parse(m.data);
      } catch {
        return;
      }
      if (evt.runId !== runRef.current) return; // a late event from the previous run
      dispatch(evt);
      if (evt.kind === 'run.complete' || evt.kind === 'run.failed') {
        es.close(); // finished: stop the auto-reconnect loop
        dispatch({ kind: 'local.connection', connection: 'closed' });
      }
    };
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        dispatch({ kind: 'local.connection', connection: 'lost' });
        // forget the run only if the server says it is gone (restarted, or expired);
        // the browser also closes the stream while the page unloads, e.g. on reload
        fetch(`/api/runs/${encodeURIComponent(runId)}/control`)
          .then((r) => r.status === 404 && runRef.current === runId && store(null))
          .catch(() => {});
      } else {
        dispatch({ kind: 'local.connection', connection: 'reconnecting' });
      }
    };
    // a reload mid-replay: pick up the server's play/pause and speed
    fetch(`/api/runs/${encodeURIComponent(runId)}/control`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.control && runRef.current === runId && setPlayback(j.control))
      .catch(() => {});
    return () => es.close();
  }, [runId]);

  /** Starts a run: mode live | replay | mock (the server falls back from live to replay by itself). */
  const start = useCallback(async (mode, speed = playback.speed) => {
    setStartError(null);
    dispatch({ kind: 'local.reset', starting: true });
    try {
      const { runId: id, control } = await post('/api/runs', { mode, speed });
      store(id);
      setPlayback(control ?? { paused: false, speed });
      setRunId(id);
    } catch (err) {
      dispatch({ kind: 'local.reset' });
      setStartError(`Could not start the run: ${err.message}. Is the server running (cd server && npm start)?`);
    }
  }, [playback.speed]);

  const control = useCallback(async (patch) => {
    setPlayback((p) => ({ ...p, ...patch })); // optimistic: the city reacts at once
    const id = runRef.current;
    if (!id) return;
    try {
      const { control: c } = await post(`/api/runs/${encodeURIComponent(id)}/control`, patch);
      if (c && runRef.current === id) setPlayback(c);
    } catch {
      /* finished runs can't be controlled; keep the local value */
    }
  }, []);

  return { state, runId, playback, start, control, startError, health };
}
