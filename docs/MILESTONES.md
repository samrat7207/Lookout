# Build Stages

Six stages. **Each one ends runnable and committed** (plus small commits inside a stage). The old three-milestone split (M1 backend stream → M2 city → M3 live data) is replaced by this order. Work that was already done under M1 is marked ✅ under the stage it belongs to, and is not redone.

Time budget for 24 h: S1 about 4 h → S2 about 4 h → S3 about 5 h → S4 about 4 h → S5 about 3 h → S6 about 4 h.

| Stage | What | Touches | Needs |
|---|---|---|---|
| 1 | Low-poly city, standalone | `web/` only | nothing |
| 2 | City driven by the SSE stream (fake run) | `web/` (+ the existing server) | Stage 1 |
| 3 | Real data via TinyFish, persona ranker, live runs recorded | `server/` | API key in `server/.env` |
| 4 | Plan screen and Application Kit UI | `web/` (+ kit builder) | Stage 2 |
| 5 | Opportunities district and Watchtower monitoring | both | Stage 3 (wallet for Monitor) |
| 6 | Mock mode in the UI, polish, rehearsal | both | Stages 2 to 5 |

---

## Stage 1: The low-poly city (frontend only, about 4 h)

**Goal:** a polished, standalone 3D city in `web/` that runs with `npm run dev`. It makes **no backend calls and no TinyFish calls, and has no data**. `server/` is not touched.

### Tasks
1. Scaffold `web/` with Vite, React, three, @react-three/fiber and @react-three/drei (package `lookout-web`).
2. Isometric low-poly city block on a flat grey base (CITY_DESIGN §1): roads with lane markings and crosswalks, sidewalks, trees, small plazas, parked and moving cars and trucks. Cheerful, clean and toy-like. Procedural from boxes, cylinders and cones, with flat shading, original designs, and no external assets.
3. Landmarks, each labelled with its name shown on hover (CITY_DESIGN §2): **Central Scholarships Hall (NSP)**, **State Scholarships** (generic, any state), **Private & Foundation Scholarships**, **Watchtower** (tall, with a beacon), **Town Hall** (plan and briefing), and the **Opportunities district** (3 small buildings). Everything else is filler. No portal is named in the UI except NSP.
4. Buildings have window details and rooftop elements.
5. An orthographic isometric camera with orbit, zoom and pan limits. Soft lighting and shadows. Cars loop on the roads.
6. Performance: instancing for all repeated meshes, low draw calls, and an FPS/draw-call readout behind `?stats`.

### Acceptance
- `cd web && npm install && npm run dev` shows the city. DevTools → Network shows no `/api` calls and no other network calls after load.
- All 6 landmarks are labelled, and hovering one shows its name.
- It holds a stable frame rate (target 60 fps at 1080p on an RTX 2050 laptop), with draw calls in the tens, not hundreds (`?stats`).
- It looks polished: no z-fighting, no floating objects, cars stay in their lanes.

**Commit:** `Stage 1: low-poly isometric city (standalone web app)`

---

## Stage 2: City driven by the event stream (about 4 h)

**Goal:** the city animates from the existing SSE stream. It uses the scripted **fake run** first, and characters move only in response to events.

### Already done ✅ (server side)
- ✅ `bus.js`: per-run emitter with seq, ts and t stamping, and a history buffer.
- ✅ `sse.js`: a 15 s heartbeat, history replay on connect, and **`Last-Event-ID`** resume without duplicates (tested).
- ✅ `recorder.js`: JSONL to `recordings/<runId>.jsonl`.
- ✅ `fakeAgents.js`: a **scripted fake run** from real recon data (EVENT_SCHEMA v2), plus `recordings/fake-run.jsonl`.
- ✅ Routes: `POST /api/runs` (`mode: "fake"`), `GET /api/runs/:id/events`, `GET /api/health`.

### Tasks
1. Vite proxy: `/api` → `http://localhost:8787`.
2. `state/reducer.js` (pure) plus a unit test that feeds `fake-run.jsonl` and checks the final state.
3. `state/useRunStream.js`: EventSource wiring, reconnect, and ignoring unknown kinds.
4. A minimal "Run (fake)" button, so this stage needs no profile form yet.
5. Characters (CITY_DESIGN §3): spawn at Town Hall, walk along the roads to their building, working wiggle, found glow, error puff, return.
6. Speech bubbles with a queue. Building busy states and tool icons.
7. Map the event `building` IDs to landmarks: `nsp` → Central Scholarships Hall, `mahadbt` → State Scholarships, `foundations` → Private & Foundation, `watchtower`, `townhall`, `opportunities`.

### Acceptance
- With the server running, press Run (fake). Characters walk to their landmarks, light up, show bubbles, and return.
- Reloading mid-run resumes the same picture (history replay).
- The same JSONL always gives the same final picture. No console errors, and the frame rate matches Stage 1.

**Commit:** `Stage 2: characters and bubbles driven by the SSE event stream`

---

## Stage 3: Real data via TinyFish (about 5 h)

**Goal:** `mode: "live"`. Real Search and Fetch scouts for the kept sources, a persona-based ranker, and every live run recorded to JSONL. **This needs the TinyFish API key in `server/.env`.**

### Already done ✅
- ✅ `tinyfish/client.js` skeleton: `search()` and `fetchPages()`. It is the only file that reads the key, and `/api/health` reports only whether a key is present.
- ✅ `parse/nsp.js`: the **NSP parser**. 31/31 schemes in the fixture, the "(for Renewal)" variants, spacing and CRLF, and impossible dates are rejected (tested).
- ✅ `npm run capture` (refreshes fixtures, needs the key).
- ✅ The recorder already writes every run to JSONL, so live runs are recorded with no new code.

### Tasks
1. **First 20 minutes:** put the key in `server/.env`, run `npm run capture`, and check the wallet. Retry `mahadbt2.maharashtra.gov.in` once (it returned `proxy_error` twice in recon). Update RECON_FINDINGS.
2. `sources/registry.js`: the kept sources from RECON_FINDINGS §3, each with its discovery (Search or a fixed URL), Fetch options, parser and `building` ID. Only kept sources go in it. Dropped ones are listed in a comment with the reason.
3. `agents/nspScout.js`: Search (headline from the snippet via `findStudentClosingDate`), then Fetch All-Scholarships and home, then parse, match and emit.
4. `agents/stateScout.js` (state building): MahaDBT 1.0 for Maharashtra. Fetch the landing page (html, for the name→URL map), Fetch up to 10 scheme pages, parse eligibility and **Documents Required** (`parse/mahadbt.js`), and emit the MahaDBT 2.0 note. For other states, emit the honest "state portal not covered" note.
5. `agents/foundationsScout.js`: **Buddy4Study via Search** (detail pages; the listing page is empty) and **Vidyasaarathi via Search**, then Fetch up to 10 detail pages (`parse/buddy4study.js`, `parse/vidyasaarathi.js`, with fixtures and tests; see RECON_FINDINGS §3 for the past-year blocks and the `Deadline :` variant).
6. `rank/rules.js`: the **persona-based ranker** (APPROACH D4 keyword rules and exclusions), wired into the existing `ranker.js` sort. Tests cover the sample student (male, B.Tech CE, 2nd year, OBC, Maharashtra) and the persona variants in RECON_FINDINGS.
7. `tinyfish/cache.js`: a disk cache plus a fallback, with `cached: true` tagging.
8. Orchestrator: run the scouts in parallel, emit `plan.ready` when they are done, and emit `kit.ready` for each scholarship.
9. Error drills: wrong key (401), a slow Fetch (the bubble shows a retry), and the network off (cache).

### Acceptance
- A live run with the sample student finishes `plan.ready` in **under 60 s**, with real NSP dates, real state schemes and at least 2 real private/foundation scholarships. Every item has a working source link.
- The run is in `recordings/<runId>.jsonl`, and replays with `mode: "mock"`.
- `grep -r TINYFISH_API_KEY` in code shows only `.env`, `.env.example` and `client.js`. The browser network tab shows no tinyfish.ai requests.

**Commit:** `Stage 3: live TinyFish scouts, source registry, persona ranker`

---

## Stage 4: Plan screen and Application Kit (about 4 h)

**Goal:** the plan and the kits are readable and trustworthy. **The kit is read-only and prefill-only. Lookout never submits forms, and never asks for, enters or stores passwords, OTPs or Aadhaar numbers.**

### Already done ✅
- ✅ `rank/ranker.js`: the **basic plan sorter**. One list of all kinds, sorted by deadline, undated items last, ties broken by score, with buckets, a headline and missed items (tested).
- ✅ `kit/buildKit.js`: the **kit builder**. Documents, persona-prefilled fields, steps, deadline and source. `assertKitSafe()` refuses any sensitive field (Aadhaar, OTP, password, bank) that has a value (tested).

### Tasks
1. Profile form, prefilled with the **sample student** and labelled as such.
2. Plan panel: **one list sorted by deadline**, with bucket dividers, a **category tag** (scholarship / hackathon / event), source, the date and its label, days left, a **"why you match"** line, the source link and the action.
3. Countdown banner from `plan.headline` (NSP, 31 Oct).
4. Application Kit drawer from `kit.ready`: documents checklist, prefilled fields, steps, deadline, source link, and the fixed safety notice at the top. Sensitive fields render as "Enter this yourself on the official portal", and never as inputs.
5. Kits use the real Documents Required lists from Stage 3 where a scout parsed them, and "usually needed" items otherwise.

### Acceptance
- Run (fake or live). The plan appears as one deadline-sorted list, with 31 Oct and "7 days left" in the banner.
- Every scholarship row opens a kit with the safety notice visible, and no kit contains an input box.

**Commit:** `Stage 4: plan screen and read-only Application Kit`

---

## Stage 5: Opportunities district and Watchtower (about 3 h)

**Goal:** hackathons and events join the same plan, and the Watchtower watches the NSP deadlines. **The Opportunities district can be cut:** with `OPPORTUNITIES=off` the agent is not spawned, the district stays idle, and nothing breaks.

### Tasks
1. `agents/oppsScout.js` + `parse/opps.js`: Fetch Devfolio, MLH, the Devpost JSON and the HackerEarth JSON in one request. Search Unstop, then Fetch its detail pages with `include_selectors: ["main"]` (RECON_FINDINGS §4). Keep events that are online or in India, still open, and open to UG students. Use honest `deadlineLabel`s.
2. `scripts/setupMonitor.js`: create the Monitor once and print `MONITOR_ID` for `.env`.
3. `agents/watchtower.js`: run now, re-parse with `parse/nsp.js`, diff against `server/.cache/watchtower.json`, and emit `watchtower.checked` or `watchtower.change`. Optional webhook route plus a tunnel.
4. Web: the district lights up for `opps-scout`, the Watchtower beacon shows checked/changed states, and the plan shows hackathon rows with their tag.

### Acceptance
- A live run lists real hackathons in the same deadline-sorted list.
- The Watchtower shows "checked at HH:MM" from a real Monitor run.
- `OPPORTUNITIES=off` gives a clean run with no hackathon rows.

**Commit:** `Stage 5: Opportunities district and Watchtower deadline monitoring`

---

## Stage 6: Mock mode, polish and rehearsal (about 4 h)

**Goal:** the demo never breaks on stage.

### Already done ✅
- ✅ `replay.js`: plays a JSONL file into a new run through **the same SSE endpoint** (`POST /api/runs` with `mode: "mock"`). It keeps the timing, applies the speed multiplier and a 4 s gap cap, and sets `replay: true` (tested). `GET /api/recordings` lists the recordings.

### Tasks
1. UI: a LIVE / MOCK toggle, a recording dropdown, speed (1×, 2×, 4×), and a mode badge ("Replaying recorded run from …").
2. Run live 3 to 5 times with the sample student. Pick the cleanest run, commit it as `recordings/demo-golden.jsonl`, and make it the default.
3. Optional Deep Diver (Agent API) side quest, if time allows (TINYFISH_INTEGRATION §3). It never blocks `plan.ready`.
4. Polish: pacing (golden replay at 1.5× lasts about 45 to 60 s), clickable buildings with raw findings (P1-5), plan export (P1-4).
5. README: how to run, screenshots, architecture diagram. Record a screen capture of the golden run.
6. Rehearse the demo script 3 times (DEMO_AND_RISKS).

### Acceptance
- Wi-Fi off, toggle to MOCK, Run: the golden run plays end to end and looks the same as live.
- The full demo fits in 3 minutes.

**Commit:** `Stage 6: mock mode UI, golden recording, polish`
