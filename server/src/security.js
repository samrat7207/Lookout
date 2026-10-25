// Security middleware: helmet headers, a CORS allowlist, zod validation of POST bodies,
// a request logger that logs no secrets or profile data, and a central error handler
// that never sends stack traces or internal messages to the client.

import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import { z } from 'zod';

// ---------- CORS ----------

// Dev origins (the Vite dev server and vite preview). PUBLIC_ORIGIN adds a production
// origin, CORS_ORIGINS replaces the dev list (comma separated).
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];

export function allowedOrigins(env = process.env) {
  const list = env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',') : DEV_ORIGINS;
  return [...new Set([...list, ...(env.PUBLIC_ORIGIN ? [env.PUBLIC_ORIGIN] : [])].map((o) => o.trim().replace(/\/$/, '')).filter(Boolean))];
}

/**
 * Requests without an Origin header (curl, same-origin GETs, the Vite proxy's own calls)
 * pass. A browser request from an origin not on the list gets no CORS headers, and a
 * write from it (POST and friends) is refused outright, so another site cannot start runs.
 */
export function cors(origins) {
  const allowed = new Set(origins);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next();
    res.vary('Origin');
    if (!allowed.has(origin)) {
      if (req.method === 'GET' || req.method === 'HEAD') return next();
      return res.status(403).json({ error: 'origin not allowed' });
    }
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID');
    res.set('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
}

// ---------- headers ----------

// An API only: no inline content to protect, so a strict CSP that allows nothing.
export const securityHeaders = () =>
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

// ---------- validation ----------

const id = z.string().min(1).max(120).regex(/^[\w.:-]+$/, 'letters, digits and _ . : - only');
const tri = z.boolean().nullable().optional();

const profile = z
  .object({
    label: z.string().max(80).optional(),
    gender: z.enum(['male', 'female']).optional(),
    category: z.enum(['OBC', 'SC', 'ST', 'General', 'EWS']).optional(),
    state: z.string().max(60).optional(),
    course: z.string().max(40).optional(),
    courseLabel: z.string().max(120).optional(),
    branch: z.string().max(120).optional(),
    year: z.number().int().min(1).max(6).optional(),
    disability: z.boolean().optional(),
    familyIncome: z.union([z.number().min(0).max(1e9), z.literal(''), z.null()]).optional(),
    capAdmission: tri,
    domicileProof: tri,
  })
  .optional();

export const schemas = {
  run: z.object({
    mode: z.string().max(20).optional(), // the route checks it against MODES and lists them
    speed: z.number().positive().max(1000).optional(), // the route caps it at 16
    pace: z.number().min(0).max(10_000).optional(),
    recording: z.string().max(80).regex(/^[\w.-]+$/, 'bad recording name').optional(),
    profile,
  }),
  control: z.object({ paused: z.boolean().optional(), speed: z.number().positive().max(1000).optional() }),
  rejudge: z.object({ runId: id.optional(), historyId: id.optional(), profile }),
  recheck: z.object({
    runId: id.optional(),
    items: z
      .array(
        z.object({
          opportunityId: z.string().max(300).optional(),
          title: z.string().min(1).max(300),
          deadline: z.string().max(20).nullable().optional(),
          source: z.string().max(40).nullable().optional(),
          sourceUrl: z.url({ protocol: /^https?$/ }).max(2000),
        }),
      )
      .max(200)
      .optional(),
  }),
};

/** Replaces req.body with the parsed value, or answers 400 with the field errors (no values echoed). */
export const validate = (schema) => (req, res, next) => {
  const out = schema.safeParse(req.body ?? {});
  if (!out.success) {
    return res.status(400).json({
      error: 'invalid request body',
      issues: out.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.') || '(body)', message: i.message })),
    });
  }
  req.body = out.data;
  next();
};

// ---------- logging ----------

/** Removes anything secret-looking from a string before it is logged. */
export function redact(text, env = process.env) {
  let s = String(text ?? '');
  for (const secret of [env.TINYFISH_API_KEY].filter((v) => v && v.length >= 8)) s = s.split(secret).join('[redacted]');
  return s
    .replace(/(\/\/)[^/\s:@]+:[^@\s]+@/g, '$1[redacted]@') // user:password@ in URLs
    .replace(/\b(bearer|x-api-key|api[_-]?key|password|passwd|token|otp|aadhaar)\b(\s*[:=]\s*|\s+)\S+/gi, '$1$2[redacted]');
}

/**
 * One line per request: method, path (no query string), status, time. Never the body,
 * headers, cookies, query or profile. Off with LOG_REQUESTS=off.
 */
export function requestLogger({ log = console.log, enabled = process.env.LOG_REQUESTS !== 'off' } = {}) {
  return (req, res, next) => {
    req.id = randomUUID().slice(0, 8);
    if (!enabled) return next();
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      log(`${req.method} ${redact(req.path)} ${res.statusCode} ${ms.toFixed(0)}ms id=${req.id}`);
    });
    next();
  };
}

// ---------- errors ----------

/** The last middleware: a short JSON error, never a stack trace or an internal message. */
export function errorHandler({ log = console.error } = {}) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON body' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'request body too large' });
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    log(`error id=${req.id ?? '-'} ${req.method} ${redact(req.path)}: ${err?.code ?? err?.name ?? 'Error'} ${redact(err?.message ?? '')}`);
    if (res.headersSent) return res.end();
    res.status(status).json({ error: status === 500 ? 'internal error' : 'bad request', requestId: req.id ?? null });
  };
}
