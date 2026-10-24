import express from 'express';
import { createRun, getRun } from './bus.js';
import { streamRun } from './sse.js';
import { recordRun } from './recorder.js';

/**
 * Run starters by mode. Each gets (run, body) and drives the run to close().
 * Filled in by later pieces: fake (scripted), mock (replay), live (TinyFish).
 * @type {Record<string, (run: ReturnType<typeof createRun>, body: any) => Promise<void> | void>}
 */
export const starters = {};

export function createApp({ record = true } = {}) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      modes: Object.keys(starters),
      tinyfishKeyPresent: Boolean(process.env.TINYFISH_API_KEY),
      opportunities: process.env.OPPORTUNITIES !== 'off',
    });
  });

  app.post('/api/runs', (req, res) => {
    const body = req.body ?? {};
    const mode = body.mode ?? 'fake';
    const start = starters[mode];
    if (!start) return res.status(400).json({ error: `unknown mode "${mode}"`, modes: Object.keys(starters) });

    const run = createRun({ replay: mode === 'mock' });
    if (record && mode !== 'mock') recordRun(run).catch((err) => console.error('recorder:', err.message));

    Promise.resolve()
      .then(() => start(run, body))
      .catch((err) => {
        console.error(`run ${run.id} failed:`, err);
        if (!run.closed) run.emit('run.failed', { payload: { message: err.message } });
      })
      .finally(() => run.close());

    res.status(201).json({ runId: run.id });
  });

  app.get('/api/runs/:runId/events', (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'run not found' });
    streamRun(req, res, run);
  });

  return app;
}
