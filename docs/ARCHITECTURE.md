# Architecture

## 1. Repo layout

✅ marks the items that exist now. `S1` to `S6` marks the stage (MILESTONES) that builds each of the rest.

```
HACKIIITD/
├─ README.md
├─ docs/                      # these planning docs
├─ .gitignore                 ✅ .env, node_modules, dist, server/.cache, recordings/* (except fake + golden)
├─ server/
│  ├─ package.json            ✅ express only; Node 24 has fetch and --env-file built in
│  ├─ .env.example            ✅ TINYFISH_API_KEY=, PORT=8787, MONITOR_ID=, PUBLIC_WEBHOOK_BASE=, OPPORTUNITIES=on
│  ├─ scripts/                ✅ capture.js (refresh fixtures), recordFake.js (fake-run.jsonl); setupMonitor.js (S5)
│  ├─ test/                   ✅ node:test suites + fixtures/
│  └─ src/
│     ├─ index.js, app.js     ✅ express app, routes
│     ├─ bus.js               ✅ per-run event bus: emit(), subscribe(), history buffer
│     ├─ sse.js               ✅ SSE helper: headers, heartbeat, replay history, Last-Event-ID
│     ├─ recorder.js          ✅ appends every event to recordings/<runId>.jsonl
│     ├─ replay.js            ✅ streams a recording with its original timing (speed, gap cap)
│     ├─ fakeAgents.js        ✅ scripted fake run (+ fake/reconData.js, real recon payloads)
│     ├─ orchestrator.js      S3: starts live agents for a profile, waits, calls ranker + kits
│     ├─ sources/registry.js  S3: kept sources only (RECON_FINDINGS §3–4)
│     ├─ tinyfish/
│     │  ├─ client.js         ✅ search(), fetchPages(); S5/S6 add monitors.*, agentSse()
│     │  └─ cache.js          S3: disk cache of Fetch/Search results (demo safety)
│     ├─ agents/
│     │  ├─ nspScout.js       S3
│     │  ├─ stateScout.js     S3: MahaDBT 1.0 for Maharashtra; honest note for other states
│     │  ├─ foundationsScout.js  S3: Buddy4Study + Vidyasaarathi (Search to discover, Fetch to read)
│     │  ├─ oppsScout.js      S5: hackathons; cuttable via OPPORTUNITIES=off
│     │  ├─ watchtower.js     S5
│     │  └─ deepDiver.js      S6 (optional Agent API side quest)
│     ├─ parse/
│     │  ├─ nsp.js            ✅ All-Scholarships markdown -> [{name, schemeType, openFrom, applyTill, ...}]
│     │  ├─ mahadbt.js        S3: SchemeData markdown -> {name, department, eligibility[], documents[]}
│     │  ├─ buddy4study.js    S3: "Deadline Date: DD-Mon-YYYY" blocks
│     │  ├─ vidyasaarathi.js  S3: "Valid Upto" table rows
│     │  └─ opps.js           S5: Devfolio, MLH, Devpost JSON, HackerEarth JSON, Unstop
│     ├─ kit/
│     │  └─ buildKit.js       ✅ Opportunity + profile -> ApplicationKit (assertKitSafe)
│     └─ rank/
│        ├─ rules.js          S3: profile -> keyword rules (APPROACH D4)
│        └─ ranker.js         ✅ score, filter, sort by deadline (APPROACH D5)
├─ web/
│  ├─ package.json            S1: vite, react, three, @react-three/fiber, @react-three/drei
│  ├─ vite.config.js          S1; S2 adds the proxy /api -> http://localhost:8787
│  └─ src/
│     ├─ main.jsx, App.jsx, styles.css   S1
│     ├─ city/                S1: the low-poly city
│     │  ├─ City.jsx          Canvas, iso camera, controls, lights, stats
│     │  ├─ layout.js         grid, roads, block contents, landmark positions
│     │  ├─ batch.js          collector of primitive instances (box, cylinder, cone, ...)
│     │  ├─ InstancedBatch.jsx  one InstancedMesh per primitive kind, per-instance colour
│     │  ├─ buildCity.js      roads, markings, filler buildings, windows, rooftops, trees, props
│     │  ├─ landmarks.js      the 6 landmark designs (procedural)
│     │  ├─ Traffic.jsx       looping keep-left cars and trucks + parked cars (instanced)
│     │  ├─ Landmarks.jsx     labels, hover cards, highlight rings
│     │  └─ Beacon.jsx        Watchtower beacon and beam
│     ├─ city/Character.jsx, SpeechBubble.jsx   S2
│     ├─ state/useRunStream.js, reducer.js      S2
│     └─ ui/ProfileForm.jsx, PlanPanel.jsx, KitDrawer.jsx, Countdown.jsx (S4), ModeToggle.jsx (S6)
└─ recordings/
   ├─ fake-run.jsonl          ✅ committed: generated fake run (npm run fake:record)
   ├─ demo-golden.jsonl       S6: committed recorded real run used for MOCK MODE
   └─ *.jsonl                 other runs (gitignored)
```

## 2. Server routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | `{ ok, mode, tinyfishKeyPresent: bool }`. Never returns the key. |
| `POST` | `/api/runs` | Body `{ profile: {course, state, category, gender?, disability?}, mode: "live"|"mock", recording?: "demo-golden", speed?: 1 }` → `{ runId }` |
| `GET` | `/api/runs/:runId/events` | SSE stream. On connect it replays buffered history first, then live events. |
| `GET` | `/api/recordings` | List of available recordings for the mock dropdown |
| `POST` | `/api/watchtower/check` | Run the Monitor now and diff (also triggered inside a run) |
| `POST` | `/api/webhooks/monitor` | Optional. Receives Monitor webhook payloads and emits `watchtower.*` events on the global channel. |

`POST` then `GET` (rather than a single GET with query params) lets the profile be a JSON body, and lets a browser reconnect to the same run.

## 3. SSE details

- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
- Each message: `id: <seq>\nevent: <kind>\ndata: <json>\n\n`. The frontend uses one generic `onmessage` handler (we also send `event:`, so add listeners per kind, or just put `kind` inside `data` and keep the default event). **Decision: put `kind` inside `data` and use the default `message` event.** It is simpler.
- A heartbeat comment `: hb\n\n` every 15 s.
- History buffer per run. A reconnecting `EventSource` sends `Last-Event-ID`, and the server resends events after that seq.
- Runs are kept in memory for 1 hour, then dropped (their recording files remain on disk).

## 4. Event bus, recorder and replay

```
agent code ──emit(evt)──▶ bus(runId) ──▶ history[] ──▶ SSE subscribers
                                    └──▶ recorder.append(runId, evt)  (JSONL, one line per event)
```

- `emit()` stamps `seq`, `ts` (ISO) and `t` (ms since run start).
- **Replay:** read the JSONL, and for each event wait `(evt.t - prev.t) / speed` before emitting it into a **new** runId's bus. Cap any single gap at 4 s so the dead time of a slow fetch is not replayed in full. Replayed events keep their payloads but get `replay: true`.
- The golden recording is chosen and committed in Stage 6, from live runs recorded in Stage 3. Until then, Stages 2 and 4 use the generated `recordings/fake-run.jsonl` (`npm run fake:record`), which follows the same schema.

## 5. TinyFish client (server only)

Thin wrapper around the REST API. No SDK dependency, so there is no surprise behaviour. See TINYFISH_INTEGRATION for the exact formats.

```js
search({ query, include_domains, location: "IN", language: "en" })   // GET  https://api.search.tinyfish.ai
fetchPages({ urls, format: "markdown", links, per_url_timeout_ms })   // POST https://api.fetch.tinyfish.ai
agentSse({ url, goal, output_schema, agent_config }, onEvent)         // POST https://agent.tinyfish.ai/v1/automation/run-sse
monitors.create / get / runNow / pause / remove                       // https://agent.tinyfish.ai/v1/monitors...
```

- Every call has a timeout (AbortController): Search 20 s, Fetch 150 s, Agent SSE 10 min, Monitor run 150 s.
- Errors are normalised to `{ code, message, status, requestId }` and emitted as `agent.error`. They never crash the run.
- Fetch and Search results are cached on disk by request hash (`server/.cache/`). If TinyFish is unreachable in live mode, the cache is used and the event payload is tagged `cached: true`. This is a second safety net under mock mode.

## 6. Security

- `TINYFISH_API_KEY` is read only in `server/src/tinyfish/client.js` from `process.env`.
- `.env` is gitignored, and `.env.example` is committed.
- The Vite proxy means the browser only ever talks to `/api`. CORS stays off in prod.
- No key in event payloads. The client strips `X-API-Key` from any logged request.
- Acceptance check: `grep -r "TINYFISH" web/dist` returns nothing, and DevTools → Network shows no tinyfish.ai calls from the browser.

## 7. Frontend state

- `useRunStream(runId)` opens an `EventSource` and dispatches each event to `reducer`.
- City state: `{ agents: {id: {building, status, bubble, glow}}, buildings: {id: {status}}, findings: [], plan: null, watchtower: {...}, mode }`.
- The reducer is pure, so the same events always give the same picture. This is why replay looks identical to live.
- Movement: an `agent.walking` event sets a target building. `Character` lerps toward it in `useFrame`. Arrival is visual only, and the next event drives the next state.
