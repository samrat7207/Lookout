// Writes recordings/fake-run.jsonl from a fake run at demo pace (about 25 s).
// M2 builds the city against this file before live mode exists.

import { createRun } from '../src/bus.js';
import { runFake } from '../src/fakeAgents.js';
import { recordRun } from '../src/recorder.js';

const run = createRun({ runId: 'fake-run' });
const written = recordRun(run, { name: 'fake-run' });
await runFake(run, { pace: 1, opportunities: true });
run.close();
console.log(`wrote ${await written} (${run.history.length} events, ${run.history.at(-1).t} ms)`);
