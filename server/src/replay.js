// MOCK MODE: plays a recorded JSONL run into a new run, keeping the original
// timing (scaled by speed, each gap capped) and marking events replay: true.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { RECORDINGS_DIR } from './recorder.js';

export const MAX_GAP_MS = 4000;

export async function readRecording(file) {
  const text = await readFile(file, 'utf8');
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

export function recordingPath(name, dir = RECORDINGS_DIR) {
  if (!/^[\w.-]+$/.test(name)) throw new Error(`bad recording name "${name}"`);
  return join(dir, `${name}.jsonl`);
}

/** @param {ReturnType<import('./bus.js').createRun>} run a run created with replay: true */
export async function replayRecording(run, file, { speed = 1, maxGapMs = MAX_GAP_MS } = {}) {
  const events = await readRecording(file);
  let prevT = events[0]?.t ?? 0;
  for (const evt of events) {
    const gap = Math.min(Math.max(evt.t - prevT, 0), maxGapMs) / speed;
    prevT = evt.t;
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    run.emit(evt.kind, { agentId: evt.agentId, building: evt.building, payload: evt.payload });
  }
  return events.length;
}

export async function listRecordings(dir = RECORDINGS_DIR) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    const events = await readRecording(join(dir, f)).catch(() => []);
    const started = events.find((e) => e.kind === 'run.started');
    out.push({
      name: f.replace(/\.jsonl$/, ''),
      events: events.length,
      recordedAt: events[0]?.ts ?? null,
      durationMs: events.at(-1)?.t ?? 0,
      mode: started?.payload.mode ?? null,
      today: started?.payload.today ?? null,
    });
  }
  // golden first, then fake, then newest
  const weight = (r) => (r.name === 'demo-golden' ? 0 : r.name === 'fake-run' ? 1 : 2);
  return out.sort((a, b) => weight(a) - weight(b) || String(b.recordedAt).localeCompare(String(a.recordedAt)));
}
