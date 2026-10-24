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

## Stage 1: The low-poly city (frontend only, about 4 h) ✅ done

**Goal:** a polished, standalone 3D city in `web/` that runs with `npm run dev`. It makes **no backend calls and no TinyFish calls, and has no data**. `server/` is not touched.

### Tasks
1. Scaffold `web/` with Vite, React, three, @react-three/fiber and @react-three/drei (package `lookout-web`).
2. Isometric low-poly city block on a flat grey base (CITY_DESIGN §1): roads with lane markings and crosswalks, sidewalks, trees, small plazas (vehicles were removed in Stage 2; citizens walk the sidewalks instead). Cheerful, clean and toy-like. Procedural from boxes, cylinders and cones, with flat shading, original designs, and no external assets.
3. Landmarks, each labelled with its name shown on hover (CITY_DESIGN §2): **Central Scholarships Hall (NSP)**, **State Scholarships** (generic, any state), **Private & Foundation Scholarships**, **Watchtower** (tall, with a beacon), **Town Hall** (plan and briefing), and the **Opportunities district** (3 small buildings). Everything else is filler. No portal is named in the UI except NSP.
4. Buildings have window details and rooftop elements.
5. An orthographic isometric camera with orbit, zoom and pan limits. Soft lighting and shadows.
6. Performance: instancing for all repeated meshes, low draw calls, and an FPS/draw-call readout behind `?stats`.

### Acceptance
- `cd web && npm install && npm run dev` shows the city. DevTools → Network shows no `/api` calls and no other network calls after load.
- All 6 landmarks are labelled, and hovering one shows its name.
- It holds a stable frame rate (target 60 fps at 1080p on an RTX 2050 laptop), with draw calls in the tens, not hundreds (`?stats`).
- It looks polished: no z-fighting, no floating objects.

**Commit:** `Stage 1: low-poly isometric city (standalone web app)`

---

## Stage 2: City driven by the event stream ✅ done

**Goal:** the city animates from the existing SSE stream. It uses the recorded **fake run** first, and characters move only in response to events.

### Done ✅ (server side, before Stage 2)
- ✅ `bus.js`: per-run emitter with seq, ts and t stamping, and a history buffer.
- ✅ `sse.js`: a 15 s heartbeat, history replay on connect, and **`Last-Event-ID`** resume without duplicates (tested).
- ✅ `recorder.js`: JSONL to `recordings/<runId>.jsonl`.
- ✅ `fakeAgents.js`: a **scripted fake run** from real recon data (EVENT_SCHEMA v2), plus `recordings/fake-run.jsonl`.
- ✅ Routes: `POST /api/runs` (`mode: "fake"` or `"mock"`), `GET /api/runs/:id/events`, `GET /api/health`.

### Done ✅ (Stage 2)
- ✅ Cleanup: all cars and road vehicles removed (roads kept). Ambient **citizens** instead (`city/Citizens.jsx`): about 50 pastel low-poly people on the sidewalks who cross at the crosswalks, turn at corners and pause. Two instanced meshes, decoration only, never event driven.
- ✅ Fake data fixed for the sample student (`fake/reconData.js`): Shahu fee reimbursement (EBC/EWS) and Panjabrao hostel allowance (General/SEBC) are no longer matches but "skipped" lines. PM YASASVI and the MahaDBT OBC schemes are conditional (income, institute and CAP admission are unknown). Uncertain rules say "unclear", and MahaDBT deadlines stay `null`. The plan carries **`conflicts`** (`rank/conflicts.js`): PM YASASVI vs CSSS (one NSP merit scheme), and CSSS vs a state fee reimbursement. The run shows the real recon failure (**MahaDBT 2.0 `proxy_error`**, retried once, then given up), honestly.
- ✅ Replay control: `POST/GET /api/runs/:id/control` (`{ paused, speed }`, mock runs only). Replays stamp recording time as `t`, so pausing and speed don't skew it (tested).
- ✅ Vite proxy: `/api` → `http://localhost:8787`.
- ✅ `state/reducer.js` (pure) plus 5 unit tests (`web/test/reducer.test.js`): the full `fake-run.jsonl` final picture, duplicate/overlap safety, error → retry, walking/return targets, unknown kinds and a new runId.
- ✅ `state/useRunStream.js`: EventSource, `Last-Event-ID` resume (the reducer also drops duplicate seq), unknown kinds ignored, and the runId kept in sessionStorage so a reload resumes the same run.
- ✅ Run bar: **Play recorded run**, pause/play, speed 1×/2×/4×, **Restart run**, plus run state, sources done / total and elapsed time.
- ✅ Agent characters (`city/Agents.jsx`): bigger than citizens, a role colour, a name tag with status (idle, walking, working, done, failed) and a ground ring in the status colour. They spawn at Town Hall, walk the roads (`city/paths.js`) to their building, wiggle while working, show speech bubbles for findings, and walk back. Everything comes from `agent.*` events.
- ✅ Buildings: a spinning progress ring and sparkles while busy, and a status chip under the label (fetching…, ✓ N found, "Source trouble · retrying ↻", "1 source failed").
- ✅ Failures: a red character with a "↻" retry marker, a red building ring and chip, red log rows, and failed calls listed in the building card with their message and retry count.
- ✅ Event log panel (collapsible, last 40 events with the source name) and side cards for buildings and characters (status, last event, URL, calls at that source).
- ✅ Performance: about 60 draw calls including shadows with a finished run, and about 4.4 ms per frame at 1920×912 on an integrated GPU.

### Not done in Stage 2 (moved on)
- The CITY_DESIGN bubble queue ("+N more") is simplified to "latest bubble wins".
- Tool icons are shown in the DOM status chip, not as floating 3D icons.
- The plan, countdown and kits arrive in the stream and the log, but have no UI yet (Stage 4).
- Live runs: the button replays `fake-run.jsonl` only. Live mode is Stage 3, and the LIVE / MOCK toggle is Stage 6.

### Acceptance (checked)
- Server running, press Play recorded run: characters walk to their landmarks, work, show bubbles, fail and retry where the recording says so, and return. ✅
- Reloading mid-run resumes the same picture (history replay). ✅
- The same JSONL always gives the same final picture (reducer test). No app console errors. ✅

**Commit:** `Stage 2: event-driven agent characters, replay controls, event log and side cards`

---

## Stage 3: Real data via TinyFish ✅ thin slice done

**Goal:** `mode: "live"`. Real Search and Fetch scouts for the kept sources, a persona-based ranker, and every live run recorded to JSONL.

### Done ✅ (thin slice)
- ✅ Key in `server/.env` (gitignored, checked with `git check-ignore`); `server/.env.example` has empty placeholders. The key is read only in `tinyfish/client.js` and is in no tracked file, recording or commit.
- ✅ `liveRun.js`: **TinyFish Search + Fetch only** (no Agent API, no Monitor, no logins). One polite retry on 429/503.
  - nsp-scout: Search (headline from the snippet), Fetch NSP All-Scholarships + home, parse all schemes, keep or drop each with a reason.
  - mahadbt-scout: Fetch the MahaDBT 1.0 landing page + the 2 OBC scheme pages, and try MahaDBT 2.0 once (it still returns `proxy_error`, shown honestly).
  - foundations-scout: Search Buddy4Study, Fetch up to 4 detail pages, `parse/buddy4study.js` (current deadline, award, past-year blocks ignored).
  - Not used tonight, listed with reasons in the plan: Vidyasaarathi, hackathon boards, the Watchtower Monitor, and the sources dropped in recon.
- ✅ `rank/rules.js`: persona eligibility (match / conditional / unclear / not applicable) from official rules for known schemes and from scheme names and page text otherwise (marked "needs verification").
- ✅ `rank/ranker.js`: **rank = deadline, then fit**, nothing else (ties by title for a stable order). "Deadline not published" goes last. Each item has a plain "Why this ranking" line, its source URL and a last-checked time.
- ✅ Conflict warnings never state a hard rule: "These may not be combinable. Check the current NSP rules before applying." A rule is quoted and linked only when a page fetched in that run says it (tonight the NSP home page did not, so none is quoted).
- ✅ `MODE=live|replay|mock`, and an automatic fallback from live to the last recording (missing key, 401/403, network) with a "Replaying recorded run" badge.
- ✅ `npm run capture` records one live run to `recordings/real-run.jsonl` (committed). Last capture: 12 source calls, 1 failed (MahaDBT 2.0), 7 ranked items, 32 not applicable, 2 conflicts, about 30 s.
- ✅ Tests: ranker order, Buddy4Study parser, live run on fixtures with a stub client, bad key → no events, fallback over HTTP, MODE default.

### Not done (later)
- `sources/registry.js` and `tinyfish/cache.js` (disk cache); the scouts are in one file for now.
- MahaDBT "Documents Required" parsing for the kits; the MahaDBT 1.0 landing page no longer shows the 2.0 notice in its fetched text, so no note is emitted live.
- Vidyasaarathi.

**Commit:** `Step 2: live thin slice (TinyFish Search + Fetch), MODE live|replay|mock with fallback, deadline-then-fit ranker`

---

## Stage 4: Plan screen and Application Kit ✅ done

**Goal:** the plan and the kits are readable and trustworthy. **The kit is read-only and prefill-only. Lookout never logs in, never submits forms, and never asks for, enters or stores passwords, OTPs or Aadhaar numbers.**

### Done ✅
- ✅ `rank/ranker.js` and `kit/buildKit.js` (from before), now with `fit`, `rankWhy`, `amount`, `checkedAt`, `needsVerification`, `notApplicable` and `sources`.
- ✅ `ui/PlanScreen.jsx`: opens over the city when the run finishes (or **View plan**).
  - Conflicts panel at the top.
  - Ranked list: name, status chip (match / conditional / unclear), "needs verification" tag, deadline or "Deadline not published", days left, amount if known, source link, last checked, the "why you match" line and **"Why this ranking"**.
  - **Application Kit** per scholarship (read-only): safety notice, documents ("usually needed · needs verification" where not read from a page), steps in order, the official portal link, prefilled persona fields, and "Enter this yourself on the official portal" for sensitive ones. No inputs.
  - "Not applicable" with the reason for each dropped scheme, "Missed", and "Sources not used tonight".
  - Footer: "Sources checked: N, failed: M, last checked: time".
- ✅ `?demo` auto-plays a run and opens the plan (rehearsal).
- ✅ Projector-readable: 16 to 30 px type, strong contrast.

**Commit:** `Step 3: plan screen with conflicts, ranked list, read-only kits, not-applicable reasons, sources footer, ?demo`

---

## City upgrade ✅ done (after Stage 2)
- Citizens: about 60 humanoids (head, hair in five styles, torso, arms, legs) with walk cycles, varied heights, skin tones and clothes. They walk the sidewalks, wait at crossings, chat in small groups, sit on benches, carry bags or look at phones, and step aside for agents. 9 instanced meshes.
- Agents: uniforms and props by job (researchers with a laptop and glasses, verifiers with a vest, badge, cap and clipboard, the orchestrator in a suit with a tablet), about 1.6 times citizen height, with a walk cycle, a name tag and a status ring.
- Places: readable signs on every source building and the shops (one canvas atlas, one draw call), a bus stop, market stalls, bins, plus the existing lamps, benches, trees, planters, fountain, plaza and crosswalks.
- Atmosphere: soft sun shadows, haze (fog), a day-to-dusk cycle toggle (windows light up), and a smooth zoom to a building when it is clicked.
- Frame time (`?stats`, render only): **about 2.3 ms per frame at 1920×912, 85 draw calls, about 92k triangles** on an AMD Radeon integrated GPU.

**Commit:** `Step 4: humanoid citizens and uniformed agents, signs, bus stop, stalls, bins, haze, day-to-dusk cycle, zoom to building`

---

## Stage 5: Opportunities district and Watchtower ⏭ skipped for now (planned)

Skipped to keep the night's budget; nothing depends on it. With no `opps-scout` the district stays idle scenery, and the Watchtower beacon is decorative. The plan lists both under "Sources not used tonight".

### Planned tasks (unchanged)
1. `agents/oppsScout.js` + `parse/opps.js`: Fetch Devfolio, MLH, the Devpost JSON and the HackerEarth JSON in one request. Search Unstop, then Fetch its detail pages with `include_selectors: ["main"]` (RECON_FINDINGS §4). Keep events that are online or in India, still open, and open to UG students. Use honest `deadlineLabel`s.
2. `scripts/setupMonitor.js`: create the Monitor once and print `MONITOR_ID` for `.env`.
3. `agents/watchtower.js`: run now, re-parse with `parse/nsp.js`, diff against `server/.cache/watchtower.json`, and emit `watchtower.checked` or `watchtower.change`.
4. Web: the district lights up for `opps-scout`, the Watchtower beacon shows checked/changed states, and the plan shows hackathon rows with their tag.

---

## Stage 6: Mock mode, polish and rehearsal (about 4 h)

**Goal:** the demo never breaks on stage.

### Already done ✅
- ✅ Modes in the UI: LIVE / REPLAY / MOCK with an automatic live → replay fallback and an honest badge (Stage 3 thin slice), speed 1×/2×/4×, `?demo`.
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
