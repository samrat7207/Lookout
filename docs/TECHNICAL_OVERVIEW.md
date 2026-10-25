# Lookout: technical overview

## Problem
Scholarship and hackathon deadlines for an Indian engineering student are spread across government portals, foundation sites and event boards. Each has a different format, and deadlines arrive together (most NSP schemes close for students on 31 Oct 2026). Lookout reads the public pages for one student profile and returns one dated, sourced plan. Each item carries the page it came from, when that page was read, and whether it was re-checked.

## Architecture
- **Orchestrator–worker in one Node process.** The Mayor (orchestrator) starts named workers ("agents") as async functions. They run in parallel through `Promise.all`, and every step is an event. There is no agent framework and no LLM. Every decision is deterministic JavaScript.
- **Event bus.** A per-run emitter (`bus.js`) stamps `seq`, `ts` and `t`, keeps the history, and fans out to subscribers.
- **SSE with resume.** `GET /api/run/:id/events` sends the history, then live events. `Last-Event-ID` resumes without duplicates, and the client reducer also drops duplicate `seq`.
- **JSONL record and replay.** Every live run is written to `recordings/<runId>.jsonl`. Replay feeds a file back through the same bus and SSE (speed, pause, a 4 s gap cap). Because the city is a pure reducer over events, a replay looks identical to the live run.
- **Observability UI.** The 3D city is a view of the event stream. The System view (`?tech`) shows the 10-role roster, event counts, TinyFish calls (live, cached, failed, blocked), the cache hit rate, and the sources used and not used, all derived from events.

```
profile ──▶ Profiler ──criteria──┐
                                 ▼
Mayor ──spawns──▶ Scouts (NSP, MahaDBT, Buddy4Study, Devpost+HackerEarth)
                     │  every web call
                     ▼
               Gatekeeper ──▶ TinyFish Search / Fetch      (cache, 2 concurrent, per-host spacing,
                     │                                       backoff+jitter, robots.txt, block stop)
                     ▼
        Deadline Reader (parsers) ─▶ Eligibility Judge (rules) ─▶ Ranker (deadline, then fit)
                                                                    │
                     Conflict Checker ◀───────────────────────────┤
                     Verifier (re-fetch, name+date still there?) ◀─┤
                     Kit Builder (read-only, assertKitSafe) ◀──────┘
                                                                    ▼
                                         plan.ready ─▶ SSE ─▶ city + plan screen ─▶ JSONL
Watchtower: on "Re-check now" only ─▶ Gatekeeper ─▶ re-read dates ─▶ changed / no change
```

## Agent roster

| # | Role | Module | Kind |
|---|---|---|---|
| 1 | Orchestrator (Mayor) | `liveRun.js` | deterministic code |
| 2 | Source Scouts | `liveRun.js` (nsp, mahadbt, foundations, opps) | code that calls TinyFish Search and Fetch |
| 3 | Deadline Reader | `parse/nsp.js`, `parse/buddy4study.js`, `parse/opps.js` | deterministic code |
| 4 | Eligibility Judge (+ Profiler) | `rank/rules.js`, `profile/profiler.js` | deterministic code |
| 5 | Ranker | `rank/ranker.js` | deterministic code |
| 6 | Conflict Checker | `rank/conflicts.js` | deterministic code |
| 7 | Kit Builder | `kit/buildKit.js` | deterministic code |
| 8 | Verifier | `verify/verifier.js` | code that calls TinyFish Fetch (cache bypassed) |
| 9 | Gatekeeper | `tinyfish/gatekeeper.js` (wraps `client.js`) | code around TinyFish |
| 10 | Watchtower | `watch/watchtower.js`, `POST /api/recheck` | code that calls TinyFish Fetch on request |

## How TinyFish is used
- **Search:** to discover pages that have no usable listing (Buddy4Study), and for the NSP closing-date headline.
- **Fetch:** to read pages as markdown (NSP All-Scholarships and home, the MahaDBT 1.0 pages, Buddy4Study detail pages, the Devpost and HackerEarth JSON feeds, robots.txt), at most 10 URLs per call.
- **Agent API: not used tonight.** It is meant for portals that need clicks or forms. Our sources are readable with Fetch, and the Agent API is slower, costs more and is less predictable, which is bad for a live demo. We never use it to log in or submit anything.
- **Monitor: not used.** The Watchtower re-checks only when the user presses "Re-check now". There are no schedules, webhooks or background jobs yet.

## Safeguards
- **One door to the web.** Agents never call TinyFish directly. Every call goes through the Gatekeeper, and only `client.js` reads the API key.
- **Shared cache.** Pages are cached on disk, keyed by URL and options, with `fetchedAt` and a TTL (30 min). Hits are events and are shown, and "last checked" stays the real fetch time. Recordings are captured with the cache off.
- **Politeness.** At most 2 TinyFish calls at once, a minimum interval per target host, and exponential backoff with jitter on TinyFish 429/503 and network errors (2 retries at most).
- **robots.txt and blocks.** robots.txt is read through Fetch and honoured. A 403 or 429 from a target, `bot_blocked`, or captcha text stops that host for 30 minutes with a `blocked` event, and we never retry around it. Logged-in portals are out of scope: we never log in, never submit forms, and never handle passwords, OTPs or Aadhaar numbers (`assertKitSafe` enforces null sensitive fields).
- **Honest failures.** Failures are events that show in red in the city, the log and the plan footer ("Sources checked: N, failed: M"). Example: MahaDBT 2.0 returns `proxy_error` and is shown as failed, not hidden.

## Trust model
- Deadlines come only from fetched text, through a parser per source. If there is none, the item says "deadline not published". Nothing is guessed.
- Amounts and prizes are shown only when they are on the fetched page (Buddy4Study award lines, the Devpost `prize_amount`).
- Every item carries its source URL and "last checked".
- The **Verifier** re-fetches each plan item's page and shows a "Source re-checked" chip with the time (or "changed" / "not re-checked"). Nothing is dropped.
- Eligibility read from names or keywords carries a separate "Rule awaiting review" chip. Unknown profile facts (income, CAP admission, domicile proof) are listed as "unknown, needs your input".
- Conflict warnings never state a rule unless a fetched page says it. When one does, the warning quotes and links it.
- The ranking is explainable: deadline, then fit, and nothing else. Every row has a "Why this ranking" line.

## Features
- **City:** a live view of the event stream: agents walk, work, fail and retry; buildings show status; a Day / Dusk / Cycle theme.
- **Plan:** one list ranked by deadline, then fit, with "Why this ranking", Verifier and Watchtower badges, a deadline timeline, filters and search, conflicts, read-only Application Kits, "Not applicable" reasons, and a sources footer.
- **Exports:** a printable plan (print to PDF) and an `.ics` file with only the deadlines read from fetched text.
- **Profile:** the Profiler shows the unknowns. Editing them and pressing Re-run re-applies the Judge (official income limits, CAP and domicile rules) and the Ranker to the same fetched data (`POST /api/rejudge`); nothing is re-fetched.
- **History:** the last 20 completed runs are saved on the server; open one, or compare two (added, removed, newly closed, deadline moved, fit or verifier changes).
- **Observability:** the System view (`?tech`), the event log, and guided captions (`?guided`) for presenting.

## Known limits
- No Vidyasaarathi, Unstop, Hack2skill, Devfolio or MLH in the live run (reasons are listed in the plan).
- MahaDBT 2.0 is unreachable through the proxy, so MahaDBT deadlines are "not published".
- Eligibility is keyword and rule based, so it can be wrong at the edges (hence "Rule awaiting review").
- Live runs stream from one process's memory (kept for an hour). Completed runs are saved to Postgres when `DATABASE_URL` is set, else to a local SQLite fallback ([BACKEND_AND_SECURITY.md](BACKEND_AND_SECURITY.md)). Verified against a real Postgres server on 2026-10-25 (city-v2 end-to-end runs).
- No CDN, load balancer or TEE (planned, see BACKEND_AND_SECURITY.md).
- One sample profile drives the demo (no profile form yet).
- Outcome measurement (did a student apply or win) would be self-reported; we have none yet.

## Roadmap
1. An official data partnership (for example NSP or MahaDBT open data) instead of reading pages.
2. Watchtower schedules with TinyFish Monitor, and notifications on real changes.
3. Documents parsing for kits (MahaDBT "Documents Required").
4. A profile form, and more sources (Vidyasaarathi, Unstop, Hack2skill with time-zone checks).
5. Re-check history in the database (runs and plan items are already saved).
