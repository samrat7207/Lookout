import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { createRun, getRun, listRuns } from './bus.js';
import { streamRun } from './sse.js';
import { recordRun } from './recorder.js';
import { runFake } from './fakeAgents.js';
import { SAMPLE_STUDENT } from './fake/reconData.js';
import { createControl, listRecordings, recordingPath, replayRecording } from './replay.js';
import * as tinyfish from './tinyfish/client.js';
import { hasApiKey } from './tinyfish/client.js';
import { CACHE_DIR, LiveUnavailableError, runLive } from './liveRun.js';
import { createGatekeeper } from './tinyfish/gatekeeper.js';
import { recheck } from './watch/watchtower.js';
import { istToday } from './rank/ranker.js';
import { createHistory, diffPlans, entryFromRun, HISTORY_FILE, summarize } from './history/history.js';
import { rejudgePlan } from './rank/rejudge.js';
import { openRepository } from './db/index.js';
import { attachLibrarian } from './librarian.js';
import { rowsFromEntry, unknownFields } from './db/fromRun.js';
import { createLimiters, limitSettings } from './limits.js';
import { allowedOrigins, cors, errorHandler, redact, requestLogger, schemas, securityHeaders, validate } from './security.js';

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
        profile: profileFromBody(body.profile),
        client: ctx.client,
        ...(ctx.cacheDir !== undefined && { cacheDir: ctx.cacheDir }),
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

// The profile form sends only the facts it asks for; blanks stay unknown (never filled
// from the sample student). Anything else is the sample student plus edits.
const COURSE_LABEL = { btech: 'B.Tech', 'other-ug': 'Other undergraduate degree', diploma: 'Diploma', pg: 'Postgraduate' };
export function profileFromBody(p = {}) {
  if (p?.source !== 'form') return { ...SAMPLE_STUDENT, ...p };
  const out = { label: 'your profile' };
  for (const k of ['state', 'category', 'course', 'year', 'gender', 'incomeBand']) if (p[k] !== undefined && p[k] !== '') out[k] = p[k];
  if (out.course) out.courseLabel = COURSE_LABEL[out.course] ?? out.course;
  return out;
}

const MAX_SPEED = 16;
function parseSpeed(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= MAX_SPEED ? n : undefined;
}

/** @param {{ record?: boolean, client?: {search: Function, fetchPages: Function}, cacheDir?: string|null }} [opts]
 *  client and cacheDir are for tests (null = no disk cache) */
/** Files and bytes in the Gatekeeper's disk cache. */
function cacheStats(dir) {
  if (!dir || !existsSync(dir)) return { entries: 0, bytes: 0 };
  let entries = 0;
  let bytes = 0;
  for (const f of readdirSync(dir)) {
    entries++;
    bytes += statSync(join(dir, f)).size;
  }
  return { entries, bytes };
}

/** The latest plan in a run's history (plan.ready, else the last plan.updated). */
function planOf(run) {
  const evt = run.history.findLast((e) => e.kind === 'plan.ready') ?? run.history.findLast((e) => e.kind === 'plan.updated');
  return evt?.payload ?? null;
}

/** @param {{ record?: boolean, client?: object, cacheDir?: string|null, historyFile?: string,
 *   db?: Parameters<typeof openRepository>[0] | Promise<Awaited<ReturnType<typeof openRepository>>> }} [opts]
 *   db: options for openRepository, or an already opened repository (tests); origins: the CORS allowlist;
 *   limits: rate-limit settings (limitSettings() shape) */
export function createApp({ record = true, client, cacheDir, historyFile = process.env.LOOKOUT_HISTORY_FILE || HISTORY_FILE, db, origins = allowedOrigins(), limits = limitSettings() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);
  const limiter = createLimiters(limits);
  app.use(requestLogger());
  app.use(securityHeaders());
  app.use(cors(origins));
  const history = createHistory(historyFile);
  // the database (Postgres, else local SQLite); never blocks start-up, and a failure here
  // leaves the JSON history and the recordings as they are
  const repoReady = Promise.resolve(db?.then ? db : openRepository(db ?? {})).catch((err) => {
    console.error('database: unavailable, using the JSON history only:', err.code ?? err.name);
    return null;
  });
  app.locals.repo = repoReady;
  app.use(express.json({ limit: '100kb' }));
  // runs and re-checks have their own tighter limits; everything else under /api the read limit
  app.use('/api', (req, res, next) => (req.method === 'POST' && /^\/(runs?|recheck)\/?$/.test(req.path) ? next() : limiter.read(req, res, next)));
  const cacheDirUsed = cacheDir === undefined ? CACHE_DIR : cacheDir;
  let lastRun = null; // { runId, mode, startedAt, finishedAt, outcome, gatekeeper? }

  app.get('/api/health', async (_req, res) => {
    res.json({
      ok: true,
      modes: MODES,
      mode: defaultMode(),
      defaultMode: defaultMode(),
      keyPresent: hasApiKey() ? 'yes' : 'no', // yes/no only; the key itself never leaves client.js
      tinyfishKeyPresent: hasApiKey(),
      lastRecording: lastRealRecording(),
      opportunities: process.env.OPPORTUNITIES !== 'off',
      cache: cacheStats(cacheDirUsed),
      limits: { ...limiter.settings, openEventStreams: limiter.openStreams() },
      database: await repoReady.then((r) => r?.info() ?? { kind: 'none', fallbackReason: 'database unavailable; the JSON history is used' }),
      lastRunAt: lastRun?.finishedAt ?? lastRun?.startedAt ?? null,
      lastRun,
    });
  });

  // Saved runs from the database: newest first, and one run with its plan items.
  app.get('/api/runs', async (req, res, next) => {
    try {
      const repo = await repoReady;
      if (!repo) return res.json({ store: 'json', runs: history.list().map(summarize) });
      res.json({ store: repo.info().kind, runs: await repo.runs.list({ limit: req.query.limit }) });
    } catch (err) {
      next(err);
    }
  });
  // Delete a saved run: its database rows (and its profile if no other run uses it) and its
  // history entry. Recordings of live runs are files on the server and are not touched.
  app.delete('/api/runs/:runId', async (req, res, next) => {
    try {
      const repo = await repoReady;
      const fromDb = repo ? await repo.runs.remove(req.params.runId) : false;
      const fromHistory = history.remove(req.params.runId);
      if (!fromDb && !fromHistory) return res.status(404).json({ error: 'no saved run with that id' });
      res.json({ deleted: req.params.runId, database: fromDb, history: fromHistory });
    } catch (err) {
      next(err);
    }
  });
  app.get('/api/runs/:runId', async (req, res, next) => {
    try {
      const repo = await repoReady;
      const run = repo && (await repo.runs.get(req.params.runId));
      if (!run) return res.status(404).json({ error: 'no saved run with that id' });
      const profile = run.profileId ? await repo.profiles.get(run.profileId) : null;
      res.json({ store: repo.info().kind, run, profile, unknown: unknownFields(profile), items: await repo.planItems.listByRun(run.id) });
    } catch (err) {
      next(err);
    }
  });

  app.post(['/api/runs', '/api/run'], limiter.run, validate(schemas.run), (req, res) => {
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
    // the Librarian reads the saved runs in every mode except the test-only fake run
    if (mode !== 'fake') attachLibrarian(run, repoReady, { mode });

    lastRun = { runId: run.id, mode, startedAt: new Date().toISOString(), finishedAt: null, outcome: 'running' };
    const mine = lastRun;
    Promise.resolve()
      .then(() => start(run, body, { record, client, cacheDir }))
      .catch((err) => {
        console.error(`run ${run.id} failed:`, redact(err.message));
        if (!run.closed) run.emit('run.failed', { payload: { message: err.message } });
      })
      .finally(() => {
        run.close();
        const end = run.history.findLast((e) => e.kind === 'run.complete' || e.kind === 'run.failed');
        // run history: every completed run with a plan (fake test runs are not saved)
        if (mode !== 'fake') {
          let entry = null;
          try {
            entry = entryFromRun(run, { mode });
            if (entry) history.add(entry);
          } catch (err) {
            console.error('history:', err.message);
          }
          if (entry) {
            const rows = rowsFromEntry(entry, { startedAt: mine.startedAt, finishedAt: new Date().toISOString(), status: end?.kind === 'run.complete' ? 'complete' : 'failed' });
            repoReady
              .then((repo) => repo?.saveRun(rows))
              .catch((err) => console.error('database: run not saved:', err.code ?? err.name));
          }
        }
        Object.assign(mine, {
          finishedAt: new Date().toISOString(),
          outcome: end?.kind === 'run.complete' ? 'complete' : 'failed',
          replay: run.replay,
          ...(end?.payload?.gatekeeper && { gatekeeper: end.payload.gatekeeper }),
        });
      });

    res.status(201).json({ runId: run.id, ...(run.control && { control: run.control }) });
  });

  // Play/pause and speed for replays. Live and fake runs cannot be paused.
  app.get('/api/runs/:runId/control', (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'run not found' });
    res.json({ control: run.replay ? run.control ?? null : null, closed: run.closed });
  });

  app.post('/api/runs/:runId/control', validate(schemas.control), (req, res) => {
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

  app.get(['/api/runs/:runId/events', '/api/run/:runId/events'], limiter.sse, (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'run not found' });
    streamRun(req, res, run);
  });

  app.get(['/api/runs/:runId/plan', '/api/run/:runId/plan'], (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'run not found (runs are kept in memory for an hour)' });
    const plan = planOf(run);
    if (!plan) return res.status(404).json({ error: 'no plan yet', closed: run.closed });
    res.json({ runId: run.id, final: run.history.some((e) => e.kind === 'plan.ready'), replay: run.replay, plan });
  });

  // The latest read-only kit for a scheme, from runs still in memory. schemeId is the
  // opportunity id ("nsp:...") or the kit id ("kit:nsp:...").
  app.get('/api/kit/:schemeId', (req, res) => {
    const id = req.params.schemeId;
    for (const run of listRuns()) {
      const kit = run.history.findLast((e) => e.kind === 'kit.ready' && (e.payload.opportunityId === id || e.payload.id === id))?.payload;
      if (kit) return res.json({ runId: run.id, replay: run.replay, kit });
    }
    res.status(404).json({ error: 'no kit for this scheme in recent runs' });
  });

  // Run history (last 20 completed runs), one entry, and a comparison of two.
  app.get('/api/history', (_req, res) => res.json({ runs: history.list().map(summarize) }));
  app.get('/api/history/compare', (req, res) => {
    const a = history.get(String(req.query.a ?? ''));
    const b = history.get(String(req.query.b ?? ''));
    if (!a || !b) return res.status(404).json({ error: 'both runs must be in the history (?a=older&b=newer)' });
    const [older, newer] = a.savedAt <= b.savedAt ? [a, b] : [b, a];
    res.json({ older: summarize(older), newer: summarize(newer), diff: diffPlans(older.plan, newer.plan) });
  });
  app.get('/api/history/:id', (req, res) => {
    const e = history.get(req.params.id);
    if (!e) return res.status(404).json({ error: 'not in the history' });
    res.json(e);
  });

  // Re-run the Judge and Ranker on a finished plan with an edited profile (no fetching).
  // Body: { runId | historyId, profile }.
  app.post('/api/rejudge', validate(schemas.rejudge), (req, res) => {
    const body = req.body ?? {};
    const run = body.runId ? getRun(body.runId) : null;
    const plan = (run && planOf(run)) ?? (body.historyId ? history.get(body.historyId)?.plan : null) ?? (body.runId ? history.get(body.runId)?.plan : null);
    if (!plan) return res.status(404).json({ error: 'no finished plan for that run (in memory or in the history)' });
    const p = body.profile ?? {};
    const tri = (v) => (v === true || v === false ? v : undefined);
    const income = Number(p.familyIncome);
    const profile = {
      ...SAMPLE_STUDENT,
      ...(typeof p.gender === 'string' && ['male', 'female'].includes(p.gender) && { gender: p.gender }),
      ...(typeof p.category === 'string' && ['OBC', 'SC', 'ST', 'General', 'EWS'].includes(p.category) && { category: p.category }),
      ...(Number.isFinite(income) && income >= 0 && p.familyIncome !== '' && p.familyIncome !== null && { familyIncome: income }),
      ...(tri(p.capAdmission) !== undefined && { capAdmission: p.capAdmission }),
      ...(tri(p.domicileProof) !== undefined && { domicileProof: p.domicileProof }),
    };
    res.json({ plan: rejudgePlan(plan, profile), profile });
  });

  // Watchtower: re-fetch the sources of a plan's items now and report real changes only.
  // Body: { runId } (preferred) or { items: [{ opportunityId, title, deadline, source, sourceUrl }] }.
  app.post('/api/recheck', limiter.recheck, validate(schemas.recheck), async (req, res) => {
    if (!hasApiKey() && !client) return res.status(503).json({ error: 'Re-check reads live pages, so it needs the TinyFish key on the server. Nothing was checked.' });
    const body = req.body ?? {};
    let items = null;
    const run = body.runId ? getRun(body.runId) : null;
    if (run) {
      const plan = planOf(run);
      items = plan ? [...plan.items, ...(plan.missed ?? [])] : null;
    }
    if (!items && Array.isArray(body.items)) {
      items = body.items
        .slice(0, 60)
        .filter((i) => i && typeof i.title === 'string' && typeof i.sourceUrl === 'string')
        .map((i) => ({ opportunityId: String(i.opportunityId ?? i.title), title: i.title.slice(0, 300), deadline: /^\d{4}-\d{2}-\d{2}$/.test(i.deadline ?? '') ? i.deadline : null, source: String(i.source ?? ''), sourceUrl: i.sourceUrl }));
    }
    if (!items?.length) return res.status(400).json({ error: 'give a runId that is still in memory, or the plan items to re-check' });
    const events = [];
    const gk = createGatekeeper({ client: client ?? tinyfish, cacheDir: cacheDirUsed });
    gk.attach((kind, payload) => events.push({ kind, ...payload }));
    try {
      const out = await recheck(items, gk, { today: istToday() });
      res.json({ ...out, gatekeeper: { ...gk.stats(), events } });
    } catch (err) {
      res.status(502).json({ error: `Re-check failed: ${err.code ?? ''} ${err.message}`.trim(), gatekeeper: { ...gk.stats(), events } });
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'no such API route' }));
  app.use(errorHandler());
  return app;
}
