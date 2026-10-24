# Agent audit (as of 2026-10-24, before the tech-round changes)

An honest inventory of what exists in the code today, and how it maps to the 10-role target roster.

**Is any of it LLM-based? No.** Every module below is plain, deterministic JavaScript (regexes, keyword rules, sorting). The only external tool is the TinyFish REST API (Search and Fetch). TinyFish runs its own infrastructure behind those calls (browsers, proxies). We treat it as a black box that returns page text or an error. We do not use the TinyFish Agent API, Monitor or any LLM. "Agent" in Lookout means a named worker in the event stream that has a job and a character in the city. It does not mean an autonomous LLM agent.

## 1. Modules that exist today

| Module | File | What it does | Inputs | Outputs | Events emitted | Kind | Tests |
|---|---|---|---|---|---|---|---|
| Event bus | `server/src/bus.js` | Per-run emitter; stamps `v, seq, ts, t`; keeps history; fans out | `emit(kind, {agentId, building, payload, t?})` | event objects | all | deterministic | `sse.test.js` |
| SSE transport | `server/src/sse.js` | Streams a run; replays history; `Last-Event-ID` resume; heartbeat | HTTP request, run | `text/event-stream` | none | deterministic | `sse.test.js` |
| Recorder | `server/src/recorder.js` | Writes every event of a run to `recordings/<name>.jsonl` | run | JSONL file | none | deterministic | `sse.test.js`, `fake.test.js` |
| Replay | `server/src/replay.js` | Replays a JSONL with its timing (speed, pause, 4 s gap cap) | file, control | events into a new run | the recorded ones | deterministic | `sse.test.js`, `fake.test.js` |
| API + modes | `server/src/app.js` | Routes; modes live, replay, mock, fake; live → replay fallback | HTTP | JSON, SSE | `run.mode` | deterministic | `sse.test.js`, `live.test.js` |
| TinyFish client | `server/src/tinyfish/client.js` | `search()`, `fetchPages()`; the only reader of the key; one retry on 429/503 | query or URLs | page text / results, or `TinyFishError` | none | **external tool** (TinyFish Search, Fetch) | not directly (stubbed in `live.test.js`) |
| Live orchestration + scouts | `server/src/liveRun.js` | Preflight Search; 3 scouts in parallel (NSP, MahaDBT, Buddy4Study); Mayor builds plan and kits | profile, client | plan, kits | `run.started`, `agent.*`, `plan.updated`, `plan.ready`, `kit.ready`, `run.complete` | deterministic code calling the external tool | `live.test.js` (stub client) |
| Scripted fake run | `server/src/fakeAgents.js` + `fake/reconData.js` | Emits a realistic run from recon data (no network) | profile, pace | events | same as live | deterministic | `fake.test.js` |
| NSP parser | `server/src/parse/nsp.js` | Scheme list → names, type, open/close/verification dates; headline closing date | markdown | schemes | none | deterministic | `nsp.test.js` |
| Buddy4Study parser | `server/src/parse/buddy4study.js` | Title, current deadline, award amount; ignores past-year blocks | markdown, today | {title, deadline, amount, pastDeadline} | none | deterministic | `live.test.js` |
| Eligibility rules | `server/src/rank/rules.js` | match / conditional / unclear / not_applicable with reason, from known rules and keywords | scheme name or page text, profile | {fit, reason, needsVerification} | none | deterministic | indirectly (`live.test.js`) |
| Ranker | `server/src/rank/ranker.js` | Deadline, then fit; buckets; "Why this ranking"; missed; counts | opportunities | Plan | none | deterministic | `live.test.js`, `fake.test.js` |
| Conflict checker | `server/src/rank/conflicts.js` | Flags pairs that may not be combinable; quotes a rule only from a fetched page | plan items, evidence | conflicts[] | none | deterministic | `fake.test.js`, `live.test.js` |
| Kit builder | `server/src/kit/buildKit.js` | Read-only kit; `assertKitSafe` refuses any value in a sensitive field | opportunity, profile | ApplicationKit | none | deterministic | `fake.test.js` |
| City reducer | `web/src/state/reducer.js` | Events → agent and building state, log, plan, kits | events | state | n/a | deterministic | `web/test/reducer.test.js` |
| Stream hook | `web/src/state/useRunStream.js` | EventSource, resume, start/control calls | runId | dispatches | n/a | deterministic | manual only |

## 2. Target roster: status today

| # | Role | Status | Where it lives today | Gap |
|---|---|---|---|---|
| 1 | Orchestrator (Mayor) | **partial** | `liveRun.js` (fixed source list, scouts in parallel, merge, plan and kits) | Picks no sources from the profile; no retries beyond the client's single 429/503 retry |
| 2 | Source Scouts | **exists** | `liveRun.js`: `nspScout`, `mahadbtScout`, `foundationsScout` | No opportunities scout (Stage 5 skipped) |
| 3 | Deadline Reader | **partial** | `parse/nsp.js`, `parse/buddy4study.js` (dates; Buddy4Study amounts) | No documents parsing; not a named step in the stream |
| 4 | Eligibility Judge | **exists** (as code, not as a visible agent) | `rank/rules.js` | Not a named agent; no profile → criteria step |
| 5 | Ranker | **exists** | `rank/ranker.js` | none |
| 6 | Conflict Checker | **exists** | `rank/conflicts.js` | none |
| 7 | Kit Builder | **exists** | `kit/buildKit.js` | Documents are "usually needed", not parsed |
| 8 | Verifier (Inspector) | **missing** | none | Nothing re-checks plan items after ranking |
| 9 | Gatekeeper (Traffic warden) | **partial** | `tinyfish/client.js` (single 429/503 retry, timeouts) | No cache, no concurrency limit, no per-host interval, no robots.txt, no block handling, no events |
| 10 | Watchtower (Night guard) | **missing** | Only a decorative beacon and fake `watchtower.checked` events in the mock run | No real re-check |

## 3. Honest notes for the mentors

- No LLM decides anything. Eligibility is keyword and rule code, which is why some items say "needs verification" or "unclear".
- Scouts are async functions in one process, not separate services. "Parallel" means `Promise.all` over network calls.
- Mock mode replays a scripted run built from recon data. Replay mode replays a recorded real run. Only Live makes network calls.
