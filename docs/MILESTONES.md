# Milestones

Three milestones, each ending in a working, committed state. **Commit after each milestone** (plus small commits inside).

Time budget for 24 h: M1 about 5 h → M2 about 7 h → M3 about 7 h → polish and rehearsal about 5 h.

---

## Milestone 1: Backend event stream (about 5 h)

**Goal:** the server can start a run and stream schema-valid events over SSE, record them, and replay them. It makes **no TinyFish calls yet**, apart from capturing fixtures.

### Tasks
1. `git init`. Add `.gitignore` (node_modules, .env, dist, server/.cache, recordings/* except golden and fake), `README`, and `docs/`.
2. Scaffold `server/` as an Express ESM project on Node 24. Add `.env.example` and the `/api/health` route.
3. `bus.js`: a per-run emitter with seq, ts and t stamping, and a history buffer.
4. `sse.js`: headers, a 15 s heartbeat, history replay on connect, and `Last-Event-ID` support.
5. `recorder.js`: writes JSONL to `recordings/<runId>.jsonl`.
6. `replay.js`: plays a JSONL file into a new run, keeps the timing, applies the speed multiplier and a 4 s gap cap, and sets `replay: true`.
7. `fakeAgents.js`: a scripted orchestrator that emits a realistic v2 sequence (EVENT_SCHEMA example), including the Foundations and Opportunities scouts and `kit.ready`, with random delays. It uses the **real** data from RECON_FINDINGS as payloads. `OPPORTUNITIES=off` drops `opps-scout` from the script.
8. Routes: `POST /api/runs` (modes `fake` and `mock`), `GET /api/runs/:id/events`, `GET /api/recordings`.
9. Hand-write `recordings/fake-run.jsonl` (or generate it from a fake run) for M2.
10. `tinyfish/client.js` skeleton with `search()` and `fetchPages()` only, plus a script `npm run capture` that refreshes the raw markdown of the recon URLs in `server/test/fixtures/`. **This is the only real TinyFish usage in M1.** It proves the key works server-side. (The first fixtures, `nsp-all-scholarships.md` and `b4s-tata-pankh.md`, were saved from the 2026-10-24 recon Fetch, so the parser does not wait for the key.)
11. `parse/nsp.js` with unit tests against the fixture (node:test). It should handle the variants listed in RECON_FINDINGS.

### Acceptance
- `curl -N localhost:8787/api/runs/<id>/events` shows events streaming live.
- Killing and reconnecting the stream resumes it without duplicates (`Last-Event-ID`).
- `mode: "mock"` replays `fake-run.jsonl` with the same order and timing (scaled).
- `node --test` passes. The NSP parser extracts 30 or more schemes (31 in the fixture). PM YASASVI College's `applyTill` equals `2026-10-31`, PM YASASVI Schools' equals `2026-11-30`, and the "(for Renewal)" labels on PM-USP CSSS parse correctly.
- `grep -r TINYFISH_API_KEY` shows it only in `.env`, `.env.example` and `client.js`.

**Commit:** `M1: backend event bus, SSE stream, recorder, replay, NSP parser`

---

## Milestone 2: City with fake events (about 7 h)

**Goal:** the full 3D city and UI, driven entirely by the M1 stream (fake or mock). It should look demo-ready before any live data flows.

### Tasks
1. Scaffold `web/` with Vite, React, three, @react-three/fiber and @react-three/drei. Proxy `/api` to `:8787`.
2. `reducer.js` (pure) plus a unit test that feeds `fake-run.jsonl` and checks the final state.
3. `useRunStream`: EventSource wiring, reconnect, and ignoring unknown kinds.
4. City: ground, paths, 5 buildings (NSP, MahaDBT, Foundations, Watchtower, Town Hall; CITY_DESIGN §2), lights and camera. The Opportunities district is drawn only if `opps-scout` is in `run.started.agents`.
5. Characters: spawn, walk lerp, working wiggle, found glow, error puff, return.
6. Speech bubbles with a queue (CITY_DESIGN §3).
7. Building busy states and tool icons. Watchtower lamp.
8. Overlay: profile form (prefilled with the **"sample student"** persona and labelled as such), LIVE/MOCK toggle, recording dropdown, speed, countdown banner, plan panel, event ticker, mode badge.
9. Plan panel renders `plan.updated` and `plan.ready` as **one list sorted by deadline**, with a kind badge (scholarship / hackathon / event), bucket dividers and source links.
10. Application Kit panel: opens from a scholarship row and renders `kit.ready`. It shows documents, prefilled fields, steps, the deadline and the source link, plus the fixed safety notice. Sensitive fields render as "enter this yourself on the portal" and never as inputs.
11. Server: `rank/rules.js`, `rank/ranker.js` and `kit/buildKit.js`, run on the fake findings, so the plan and kits in M2 already use real logic. Unit tests use the persona variants from RECON_FINDINGS, and one test checks that no kit field marked sensitive ever has a value.

### Acceptance
- Pick fake or mock and press Run. Characters walk to NSP, MahaDBT, Foundations (and Opportunities, if on), light up, show bubbles, and return. The plan appears as one list sorted by deadline, with 31 Oct at the top and "7 days left".
- Clicking a scholarship opens its Application Kit with the safety notice visible.
- With `OPPORTUNITIES=off` the same run plays with no district and no hackathon rows, and with no errors.
- Reloading the page mid-run resumes the same picture (history replay).
- The same JSONL always gives the same final picture.
- Runs at 60 fps on a laptop. No console errors.

**Commit:** `M2: R3F city, characters, bubbles, plan panel driven by event stream`

---

## Milestone 3: Real TinyFish events wired in (about 7 h)

**Goal:** live mode. Real Search and Fetch scouts, a real Watchtower Monitor, an optional Agent side quest, and a recorded **golden run** for MOCK MODE.

### Tasks
1. **First 20 minutes:** check the wallet balance. Retry `https://mahadbt2.maharashtra.gov.in/` once (it returned `proxy_error` twice in recon). Update RECON_FINDINGS.
2. `agents/nspScout.js`: Search (headline from the snippet), then Fetch All-Scholarships and home, then parse, match and emit findings.
3. `agents/mahadbtScout.js`: Fetch the landing page (html, to get the name→URL map), match scheme names to the profile, Fetch up to 10 scheme pages in one request, parse the eligibility and **Documents Required** sections (the kit uses them), emit findings, and emit the 2.0 notice.
3b. `agents/foundationsScout.js` + `parse/buddy4study.js` + `parse/vidyasaarathi.js`: Search with `include_domains` to discover detail pages (their listing pages render empty), Fetch up to 10, parse the deadline lines (RECON_FINDINGS §3), match and emit.
3c. **(Cuttable, do last)** `agents/oppsScout.js` + `parse/opps.js`: Fetch Devfolio, MLH, the Devpost JSON and the HackerEarth JSON in one request. Search Unstop and Fetch the top detail pages with `include_selectors: ["main"]`. Keep events that are online or in India, still open, and open to UG students. Gated by `OPPORTUNITIES`.
4. `tinyfish/cache.js`: disk cache plus a fallback, with `cached: true` tagging.
5. `scripts/setupMonitor.js`: create the Monitor once and print `MONITOR_ID` to put in `.env`.
6. `agents/watchtower.js`: run now, re-parse, diff against the snapshot, emit `watchtower.checked` or `watchtower.change`. Optional webhook route plus a cloudflared tunnel.
7. `agents/deepDiver.js` (if time allows): run-sse with the narrow goal. Map PROGRESS to bubbles. 7-minute cap, then cancel. Merge any result via `plan.updated`.
8. Orchestrator: run the scouts and Watchtower in parallel, emit `plan.ready` when the scouts are done, and do not wait for the Deep Diver.
9. Run live 3 to 5 times with the demo persona. Pick the cleanest run, copy it to `recordings/demo-golden.jsonl` and commit it. Make it the default in the mock dropdown.
10. Error drills: wrong key (401), network off (switch to mock), and a slow Fetch (the bubble shows a retry).

### Acceptance
- A live run with the demo persona finishes `plan.ready` in **under 60 s**, with real NSP dates, real MahaDBT schemes and at least 2 real private/foundation scholarships, and every item has a working source link. Buddy4Study detail pages took 17 to 20 s in recon, so fetch them in one batch in parallel with NSP.
- Every scholarship in the plan has a kit, and every kit cites a real source page.
- The Watchtower shows "checked at HH:MM" from a real Monitor run.
- Wi-Fi off, then toggle to MOCK and Run: the golden run plays end to end.
- The browser network tab shows no tinyfish.ai requests and no key.

**Commit:** `M3: live TinyFish scouts, Watchtower monitor, golden recording for mock mode`

---

## After M3: polish and rehearsal (about 5 h)
- Pacing: the golden replay runs at 1.5× and lasts about 45 to 60 s.
- Clickable buildings that show raw findings (P1-5) and plan export (P1-4).
- README: how to run, screenshots, architecture diagram.
- Rehearse the demo script 3 times (DEMO_AND_RISKS).
