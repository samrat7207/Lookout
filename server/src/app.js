import { existsSync } from 'node:fs';
import express from 'express';
import { createRun, getRun } from './bus.js';
import { streamRun } from './sse.js';
import { recordRun } from './recorder.js';
import { runFake } from './fakeAgents.js';
import { SAMPLE_STUDENT } from './fake/reconData.js';
import { createControl, listRecordings, recordingPath, replayRecording } from './replay.js';
import { hasApiKey } from './tinyfish/client.js';
import { LiveUnavailableError, runLive } from './liveRun.js';

// Modes (MODE in server/.env sets the default):
//   live    real TinyFish Search + Fetch; recorded to recordings/<runId>.jsonl. Falls back
//           to the last real recording when the key is missing or TinyFish is unreachable.
//   replay  replays the last real recording (recordings/real-run.jsonl), else the fake run
//   mock    replays recordings/fake-run.jsonl (scripted, built from recon data)
//   fake    generates the scripted run on the fly (tests, npm run fake:record)
export const MODES = ['live', 'replay', 'mock', 'fake'];

/** The recording replay mode and the live fallback use: the committed real run, else the fake run. */
export function lastRealRecording() {
  for (const name of ['demo-golden', 'real-run']) if (existsSync(recordingPath(name))) return name;
  return 'fake-run';
}

export function defaultMode(env = process.env) {
  if (MODES.includes(env.MODE)) return env.MODE;
  return env.TINYFISH_API_KEY ? 'live' : 'replay';
}

async function replayInto(run, recording, extra = {}) {
  run.control ??= createControl();
  const path = recordingPath(recording);
  const [info] = (await listRecordings()).filter((r) => r.name === recording);
  run.emit('run.mode', { payload: { mode: extra.mode ?? 'replay', recording, recordedAt: info?.recordedAt ?? null, ...extra } });
  return replayRecording(run, path, { control: run.control });
}

/**
 * Run starters by mode. Each gets (run, body, ctx) and resolves when the run is finished;
 * the route then closes the run.
 * @type {Record<string, (run: ReturnType<typeof createRun>, body: any, ctx: {record: boolean}) => Promise<unknown>>}
 */
export const starters = {
  live: async (run, body, ctx) => {
    const fallback = (reason) => {
      run.markReplay();
      return replayInto(run, lastRealRecording(), { mode: 'replay', fallbackReason: reason });
    };
    if (!hasApiKey()) return fallback('No TinyFish API key on the server');
    try {
      return await runLive(run, {
        profile: { ...SAMPLE_STUDENT, ...body.profile },
        client: ctx.client,
        onLive: () => {
          run.emit('run.mode', { payload: { mode: 'live' } });
          if (ctx.record) recordRun(run).catch((err) => console.error('recorder:', err.message));
        },
      });
    } catch (err) {
      if (err instanceof LiveUnavailableError) return fallback(`Live run could not start: ${err.message}`);
      throw err;
    }
  },
  replay: (run, body) => replayInto(run, body.recording ?? lastRealRecording()),
  mock: (run) => replayInto(run, 'fake-run', { mode: 'mock' }),
  fake: (run, body) => runFake(run, { profile: { ...SAMPLE_STUDENT, ...body.profile }, pace: body.pace }),
};

const MAX_SPEED = 16;
function parseSpeed(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= MAX_SPEED ? n : undefined;
}

/** @param {{ record?: boolean, client?: {search: Function, fetchPages: Function} }} [opts] client is for tests */
export function createApp({ record = true, client } = {}) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      modes: MODES,
      defaultMode: defaultMode(),
      tinyfishKeyPresent: hasApiKey(),
      lastRecording: lastRealRecording(),
      opportunities: process.env.OPPORTUNITIES !== 'off',
    });
  });

  app.post('/api/runs', (req, res) => {
    const body = req.body ?? {};
    const mode = body.mode ?? defaultMode();
    const start = starters[mode];
    if (!start) return res.status(400).json({ error: `unknown mode "${mode}"`, modes: MODES });
    if (body.recording !== undefined && !/^[\w.-]+$/.test(body.recording)) return res.status(400).json({ error: 'bad recording name' });

    const replaying = mode === 'replay' || mode === 'mock';
    const run = createRun({ replay: replaying });
    // live runs may fall back to a replay; they get controls then (GET .../control to read them)
    if (replaying || mode === 'live') run.control = createControl({ speed: parseSpeed(body.speed) ?? 1 });
    if (record && mode === 'fake') recordRun(run).catch((err) => console.error('recorder:', err.message));

    Promise.resolve()
      .then(() => start(run, body, { record, client }))
      .catch((err) => {
        console.error(`run ${run.id} failed:`, err);
        if (!run.closed) run.emit('run.failed', { payload: { message: err.message } });
      })
      .finally(() => run.close());

    res.status(201).json({ runId: run.id, ...(run.control && { control: run.control }) });
  });

  // Play/pause and speed for replays. Live and fake runs cannot be paused.
  app.get('/api/runs/:runId/control', (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'run not found' });
    res.json({ control: run.replay ? run.control ?? null : null, closed: run.closed });
  });

  app.post('/api/runs/:runId/control', (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'run not found' });
    if (!run.control || !run.replay) return res.status(409).json({ error: 'only replays can be paused or sped up' });
    const { paused, speed } = req.body ?? {};
    if (speed !== undefined) {
      const s = parseSpeed(speed);
      if (s === undefined) return res.status(400).json({ error: `speed must be a number in (0, ${MAX_SPEED}]` });
      run.control.speed = s;
    }
    if (paused !== undefined) run.control.paused = Boolean(paused);
    res.json({ control: run.control, closed: run.closed });
  });

  app.get('/api/recordings', async (_req, res) => {
    res.json({ default: lastRealRecording(), recordings: await listRecordings() });
  });

  app.get('/api/runs/:runId/events', (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'run not found' });
    streamRun(req, res, run);
  });

  return app;
}
