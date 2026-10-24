// Appends every event of a run to recordings/<runId>.jsonl (one event per line).
// MOCK MODE replays these files (replay.js).

import { createWriteStream, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RECORDINGS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'recordings');

/** Records the run to disk. Resolves with the file path once the run closes and the file is flushed. */
export function recordRun(run, { dir = RECORDINGS_DIR, name = run.id } = {}) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.jsonl`);
  const out = createWriteStream(file, { flags: 'w' });
  for (const evt of run.history) out.write(JSON.stringify(evt) + '\n');

  return new Promise((resolve, reject) => {
    out.on('error', reject);
    run.subscribe((evt) => {
      if (evt) return out.write(JSON.stringify(evt) + '\n');
      out.end(() => resolve(file));
    });
  });
}
