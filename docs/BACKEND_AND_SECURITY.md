# Backend and security

What the server does today to store runs, protect itself and stay polite to the sites it reads, and what is planned. Everything under "Built" is in the code and covered by tests (`cd server && npm test`). Everything under "Planned" is **not implemented**.

## Built

### Storage: a repository with a fallback
- `server/src/db/` holds one repository with four tables: `profiles`, `runs`, `planItems`, `sources`. The rest of the server uses only this interface (`app.js` saves runs and serves `GET /api/runs`).
- **Postgres** (driver `pg`) is used only when `DATABASE_URL` is set and reachable.
- Otherwise the **local fallback** is used: SQLite through `node:sqlite`, built into Node 24 with no flag, in `server/.data/lookout.db` (gitignored).
  - If that file cannot be opened, the fallback runs in memory and says so.
- **Automatic fallback.** If Postgres is unreachable at start, or fails during use (connection errors, not data errors), the repository switches to the local store and keeps saving.
  - `GET /api/health` reports `database.kind` (`postgres` or `local`), the engine, and the reason, for example "Postgres unreachable (ECONNREFUSED)".
  - The reason holds an error code only, never the URL or a password.
- **Nothing else depends on the database.** The run history JSON (`server/.data/history.json`, used by History compare and Re-run) and the recordings work exactly as before. If the repository cannot open at all, `GET /api/runs` serves the JSON history instead.
- **Schema with migrations** (`server/src/db/schema.js`, recorded in `schema_migrations`):
  - `plan_items.source_url` and `plan_items.last_checked` are `NOT NULL`. An item without them is not stored.
  - `plan_items.deadline` is nullable and never invented. "deadline not published" goes in `deadline_note`.
  - `plan_items.status` is limited to `match`, `conditional`, `unclear` or `no`.
  - `profiles` keep only what matching needs: label, state, category, course, year, plus gender, disability, income, CAP admission and domicile proof in `extra`. Facts the profile does not state stay `NULL` and are shown as "unknown". No name, contact details or ID numbers are ever stored.
- **Parameterised queries only.** Every value is bound (`$1`, `$2`, ...), never written into SQL text. A test checks this on every INSERT.
- **What is saved:** each completed Live, Replay or Mock run, with its ranked items, its missed and not-applicable items (those that carry a source URL and a read time), and the source ledger (used, and not used with the reason).
- **Where you see it:**
  - `GET /api/runs` (newest first) and `GET /api/runs/:runId` (the run, its profile with the unknowns, and its items).
  - The **Saved runs** section of the History drawer.
  - The **Server** section of the System view, which shows the database in use.
- **Tests:**
  - the local store;
  - the Postgres implementation, through a pg-compatible stand-in backed by SQLite, which runs the Postgres driver's own code: pool, transaction, `$n` parameters, Postgres DDL;
  - an unreachable `DATABASE_URL`;
  - Postgres failing mid-use;
  - the API with an unreachable database.

  A test against a real Postgres server runs only when `TEST_DATABASE_URL` is set. The live app has been run against a real Postgres server (2026-10-25, Live, Replay and Mock saved and read back); the automated test against one still needs `TEST_DATABASE_URL`.

### Retention: 30-day auto purge (`server/src/db/retention.js`)
- Deletes saved **runs**, their **plan items** and **profile snapshots** older than `RETENTION_DAYS` (default 30) from the repository: Postgres, plus the local fallback if it was opened. A snapshot is removed only when no remaining run uses it.
- Runs once at server start and then once a day (in-process timer).
- **Never deletes sources.** There are no user accounts yet.
- Logs counts only (`retention: removed N runs, M plan items, K profile snapshots older than 30 days`), never row contents.
- `/api/health` returns `retention: { days, lastPurgeAt, lastRemoved, lastError }`; the System view shows it too.
- Tests: fake old rows are removed, while newer rows and sources survive, on the local store and the Postgres stand-in.
- The JSON history (`server/.data/history.json`, last 20 runs) and the recordings are outside this purge.

### Offline page cache (user side, `web/src/offline/`)
- In production builds only, a service worker caches the built app shell (HTML, JS, CSS) in a versioned cache (`lookout-shell-<hash of the build and the worker>`). A new build installs a new cache and deletes the old one.
- `/api/*` and the SSE stream are **never** cached. They always go to the network.
- When `/api/health` cannot be reached, a banner says: "Server unreachable. Showing the cached page. Live runs need the server."
- This cache lives on the user's device. Once the frontend is deployed, a **CDN** would sit in front of it. That is planned, not built.
- Not registered in dev (`npm run dev`).

### Security layer (`server/src/security.js`)
- **Headers:** `helmet` with a strict Content-Security-Policy for the API (`default-src 'none'`), `nosniff`, no `X-Powered-By`.
- **CORS allowlist:**
  - The dev origins are allowed by default: `localhost:5173` and `127.0.0.1:5173` (Vite dev), and the same two hosts on port 4173 (vite preview).
  - `PUBLIC_ORIGIN` adds a production origin. `CORS_ORIGINS` replaces the dev list.
  - A browser on any other origin gets no CORS headers, and its POSTs are refused with 403, so another site cannot start runs.
- **Body limit:** 100 kB of JSON. Larger bodies get 413, and malformed JSON gets 400.
- **Validation:** `zod` schemas on every POST body (`/api/run(s)`, `/api/runs/:id/control`, `/api/rejudge`, `/api/recheck`).
  - A wrong type gets 400 with the field paths.
  - Field values are never echoed back.
- **Errors:** one central handler. The client gets `{ error, requestId }`, never a stack trace or an internal message.
- **Logging:** one line per request: method, path (no query string), status, time, request id.
  - The body, headers, cookies, query and profile are never logged.
  - Error logs pass through `redact()`, which removes the TinyFish key, `user:password@` in URLs, and `password=` / `token=` / `api-key:` style values.
  - `LOG_REQUESTS=off` turns request lines off.
- **Secrets:**
  - `.env` files and key or certificate files (`*.pem`, `*.key`, `*.p12`, `*.pfx`) are git-ignored, while `server/.env.example` is kept with empty values.
  - The TinyFish key is read only in `server/src/tinyfish/client.js`. `/api/health` says only `keyPresent: "yes"` or `"no"`.
- **`npm audit`** (server and web, at the time of writing): 0 vulnerabilities. Upgrades are never forced.

### Rate limiting (`server/src/limits.js`, `express-rate-limit`)

| What | Default per IP | Setting |
|---|---|---|
| `POST /api/run`, `POST /api/runs` | 10 per minute | `RATE_LIMIT_RUN` |
| `POST /api/recheck` | 10 per minute | `RATE_LIMIT_RECHECK` |
| Everything else under `/api` | 300 per minute | `RATE_LIMIT_READ` |
| Open SSE event streams | 6 at once | `SSE_MAX_PER_IP` |

- A refusal is a 429 with a `Retry-After` header. The settings are shown in `/api/health` and the System view.
- The limits are in memory, per server process.
- Through the Vite dev proxy every request comes from localhost, so the limits apply to the whole dev machine. Behind a real proxy, set `TRUST_PROXY` so the client IP is read from `X-Forwarded-For`.

**Outbound (to TinyFish and the sites it reads):** the Gatekeeper (`server/src/tinyfish/gatekeeper.js`) keeps:
- at most 2 concurrent TinyFish calls;
- a minimum interval per target host (1.5 s);
- exponential backoff with jitter on TinyFish 429/503 and network errors (2 retries), now never sooner than TinyFish's own `Retry-After` (capped at 30 s);
- robots.txt read and honoured;
- a 30-minute stop on a host that answers 403/429, `bot_blocked` or captcha text.

Every backoff is a `rate.limited` event, and every block is a `blocked` event.

## Planned (not implemented)

**None of these exist in Lookout today. There is no CDN, no load balancer, no TEE, no login or sign-up, and no Terms and Conditions.** Today Lookout is one Node process on one machine, plus the Vite dev server.

| Planned | Why | What it needs first |
|---|---|---|
| **CDN for the static frontend** | The city is a static bundle (`web/dist`). A CDN would serve it close to students and take that load off the API. | A production build and hosting; the API origin then goes in `PUBLIC_ORIGIN`. |
| **Load balancer in front of stateless API instances** | Several API processes behind one address, so one busy run cannot slow everyone and a crashed process is replaced. | The API must be stateless. Today runs live in one process's memory, and the rate limits and blocked hosts are per process. They need a shared store (for example Redis) before more than one instance can run. |
| **Shared event store, or sticky routing, for SSE** | A browser's event stream must reach the process that holds the run. | Either sticky sessions on the load balancer (simplest), or a shared event log (Postgres or Redis pub/sub) that any instance can replay with `Last-Event-ID`. |
| **Postgres row-level security** | When real students have accounts, each one must only ever read their own profiles, runs and items, even if an API bug forgets a filter. | User accounts and an owner column on `profiles` and `runs`, then RLS policies keyed on the session's user. Today there are no accounts: one sample profile. |
| **TEE-based confidential computing for the sensitive profile** | Income and category are sensitive. Running the Judge inside a trusted execution environment would keep them encrypted even from the server's operators. | Real student profiles, a TEE-capable host, and remote attestation. Today the profile is the labelled "sample student"; we never collect names, Aadhaar numbers, passwords, OTPs or bank details. |
| Login and sign-up | Per-student saved runs and profiles. | An auth provider and accounts, then RLS (above). |
| Terms and Conditions | Needed before real students sign up. | Legal review, written alongside login. |
| Scheduled Watchtower re-checks (TinyFish Monitor) | Tell students when a date changes, without them pressing "Re-check now". | Notifications and a job runner. |
