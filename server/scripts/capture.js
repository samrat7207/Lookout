// npm run capture: one LIVE run (TinyFish Search + Fetch only) with the sample student,
// recorded to recordings/real-run.jsonl. Replay mode and the live fallback use that file.
// Needs the key in server/.env. Writes to a temp file first, so a failed run keeps the old recording.

import { renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createRun } from '../src/bus.js';
import { recordRun, RECORDINGS_DIR } from '../src/recorder.js';
import { runLive } from '../src/liveRun.js';

const run = createRun({ runId: 'real-run' });
const tmp = 'real-run.partial';
const written = recordRun(run, { name: tmp });
try {
  run.emit('run.mode', { payload: { mode: 'live' } });
  await runLive(run, { ttlMs: 0 }); // a recording is a fresh read: no cache hits
  run.close();
  await written;
  renameSync(join(RECORDINGS_DIR, `${tmp}.jsonl`), join(RECORDINGS_DIR, 'real-run.jsonl'));
  const plan = run.history.findLast((e) => e.kind === 'plan.ready')?.payload;
  const errs = run.history.filter((e) => e.kind === 'agent.error');
  console.log(`wrote recordings/real-run.jsonl: ${run.history.length} events, ${run.history.at(-1).t} ms`);
  console.log(`plan: ${plan?.items.length ?? 0} items, ${plan?.notApplicable.length ?? 0} not applicable, ${plan?.conflicts.length ?? 0} conflicts; sources checked ${plan?.sources?.checked}, failed ${plan?.sources?.failed}`);
  for (const i of plan?.items ?? []) console.log(`  #${i.rank} [${i.fit}] ${i.deadline ?? 'deadline not published'}  ${i.title.slice(0, 80)}`);
  for (const e of errs) console.log(`  error at ${e.building}: ${e.payload.code}: ${e.payload.message.slice(0, 120)}`);
} catch (err) {
  run.close();
  await written.catch(() => {});
  rmSync(join(RECORDINGS_DIR, `${tmp}.jsonl`), { force: true });
  console.error(`capture failed, old recording kept: ${err.message}`);
  process.exitCode = 1;
}
