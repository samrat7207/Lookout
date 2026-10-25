// Inbound rate limits (express-rate-limit, in memory, per client IP):
//   - starting runs and Watchtower re-checks: 10 per minute each
//   - everything else under /api: a looser read limit
//   - SSE: at most a few open event streams per IP
// A refusal is a 429 with Retry-After. Behind a proxy, set TRUST_PROXY so the client IP
// is read from X-Forwarded-For; without it every request through the Vite dev proxy
// counts as the same IP (localhost).

import { rateLimit } from 'express-rate-limit';

export function limitSettings(env = process.env) {
  const n = (v, d) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    windowMs: 60_000,
    runPerMinute: n(env.RATE_LIMIT_RUN, 10),
    recheckPerMinute: n(env.RATE_LIMIT_RECHECK, 10),
    readPerMinute: n(env.RATE_LIMIT_READ, 300),
    sseConnectionsPerIp: n(env.SSE_MAX_PER_IP, 6),
  };
}

function limiter(limit, windowMs, what) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      const reset = req.rateLimit?.resetTime?.getTime?.() ?? Date.now() + windowMs;
      res.set('Retry-After', String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))));
      res.status(429).json({ error: `too many ${what}; try again in a moment`, limitPerMinute: limit });
    },
  });
}

export function createLimiters(settings = limitSettings()) {
  const open = new Map(); // ip -> open SSE streams
  return {
    settings,
    run: limiter(settings.runPerMinute, settings.windowMs, 'runs started'),
    recheck: limiter(settings.recheckPerMinute, settings.windowMs, 're-checks'),
    read: limiter(settings.readPerMinute, settings.windowMs, 'requests'),
    /** Caps open event streams per IP; the slot is freed when the stream closes. */
    sse(req, res, next) {
      const ip = req.ip ?? 'unknown';
      const now = open.get(ip) ?? 0;
      if (now >= settings.sseConnectionsPerIp) {
        res.set('Retry-After', '5');
        return res.status(429).json({ error: 'too many open event streams from this address', limit: settings.sseConnectionsPerIp });
      }
      open.set(ip, now + 1);
      res.on('close', () => {
        const left = (open.get(ip) ?? 1) - 1;
        if (left > 0) open.set(ip, left);
        else open.delete(ip);
      });
      next();
    },
    openStreams: () => [...open.values()].reduce((a, b) => a + b, 0),
  };
}
