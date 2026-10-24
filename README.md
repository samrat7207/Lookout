# Lookout: Scholarship Season

HackIIITD 2026 · TinyFish track · 24-hour build

A low-poly 3D city where each TinyFish web agent is a little character and each source (scholarship portals, foundation listings, hackathon boards) is a building. A student enters **course, state and category** once. The agents walk off to the sources, read them live with TinyFish, and bring back findings. Town Hall turns those findings into **one dated, sourced plan**: scholarships, hackathons and events in a single list, sorted by deadline. Each scholarship comes with a read-only **Application Kit** (documents, prefilled fields, steps, deadline, source link).


> **Lookout never submits forms, and never asks for, enters or stores passwords, OTPs or Aadhaar numbers.** It reads public pages and prefills a checklist. The student applies on the official portal.

## Status

Built in 6 stages ([docs/MILESTONES.md](docs/MILESTONES.md)).

| Stage | State |
|---|---|
| 1 City | ✅ done, upgraded: humanoid citizens with walk cycles, uniformed agents with props, signs, bus stop, stalls, haze, day-to-dusk cycle, click to zoom |
| 2 Event-driven characters | ✅ done |
| 3 Real data | ✅ **thin slice**: TinyFish Search + Fetch only, on NSP, MahaDBT 1.0, Buddy4Study, and the Devpost and HackerEarth feeds. Every call goes through the **Gatekeeper** (cache, rate limits, robots.txt, block handling). A **Profiler** feeds the rules, and a **Verifier** re-checks every plan item. Recorded to `recordings/real-run.jsonl` |
| 4 Plan screen and Application Kit | ✅ done: conflicts panel, ranked list, read-only kits, "Not applicable" reasons, sources footer, `?demo` |
| 5 Opportunities and Watchtower | ✅ **slim**: hackathons and events from the Devpost and HackerEarth feeds, with their own plan tab; Watchtower "Re-check now" (on request only, no schedules) |
| UI polish (Part B) | ✅ run history with compare, deadline timeline, print and `.ics` export (fetched dates only), filters and search, editable profile with a Judge and Ranker re-run, guided captions (`?guided`), Day / Dusk / Cycle theme with a filmic colour grade |
| 6 Polish and rehearsal | partly: LIVE / REPLAY / MOCK with an automatic fallback, a System view (`?tech`), and the API documented in [docs/API.md](docs/API.md) |

## Team

Samrat Kunte (lead: city, backend, integration), Aman Kumar (Application Kit data, eligibility rules), Aniket Gupta (opportunities research, pitch and demo). How we work (branches, pull requests, everyone commits under their own name): [team/README.md](team/README.md). Who did what: [CONTRIBUTORS.md](CONTRIBUTORS.md).

## Docs

| Doc | What it covers |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Problem, user, scope, must-haves, non-goals, success criteria |
| [docs/APPROACH.md](docs/APPROACH.md) | How it works end to end, and the key design decisions with reasons |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Repo layout, backend modules, API routes, SSE, the recorder and mock replay |
| [docs/EVENT_SCHEMA.md](docs/EVENT_SCHEMA.md) | The event contract between backend and city. Both sides build against this. |
| [docs/TINYFISH_INTEGRATION.md](docs/TINYFISH_INTEGRATION.md) | Request formats checked against docs.tinyfish.ai, limits, and how each API is used |
| [docs/RECON_FINDINGS.md](docs/RECON_FINDINGS.md) | What the real sources returned on 2026-10-24 (which worked, which failed), and what it means for parsing |
| [docs/CITY_DESIGN.md](docs/CITY_DESIGN.md) | 3D layout, buildings, characters, animation states, speech bubbles |
| [docs/MILESTONES.md](docs/MILESTONES.md) | The 6 build stages: tasks, what is already done, acceptance checks, commit points, time budget |
| [docs/DEMO_AND_RISKS.md](docs/DEMO_AND_RISKS.md) | 3-minute demo script, risk register, fallback ladder |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Decisions still needed from the team |
| [docs/TECHNICAL_OVERVIEW.md](docs/TECHNICAL_OVERVIEW.md) | One page for mentors: architecture, agent roster, TinyFish use, safeguards, trust model, limits |
| [docs/AGENT_AUDIT.md](docs/AGENT_AUDIT.md) | Every module and agent: what it does, deterministic or tool-using, tests |
| [docs/API.md](docs/API.md) | HTTP API with request and response examples |
| [docs/JUDGE_QA_TECH.md](docs/JUDGE_QA_TECH.md) | 12 likely technical questions with short, honest answers |

## Stack

- **web/**: Vite, React, @react-three/fiber, @react-three/drei. Boxes and cones only, flat colours, no external assets.
- **server/**: Node and Express. Holds `TINYFISH_API_KEY` from `.env`, calls TinyFish, and streams agent events to the browser over SSE. The key never reaches the browser.
- **recordings/**: JSONL files of real runs. MOCK MODE replays them.

## Run

Two terminals:

```sh
# 1. server
cd server
npm install
npm start                # http://localhost:8787 (reads server/.env if present)

# 2. city
cd web
npm install
npm run dev              # http://localhost:5173  (add ?stats for FPS and draw calls)
```

Pick a mode in the top bar and press **Start run**. **⚙ System view** (or `?tech`) shows the 10-role agent roster, event counts, TinyFish calls and the cache hit rate, all from the events. On the plan, **🗼 Re-check now** asks the Watchtower to re-fetch the sources (needs the key):

| Mode | What it does | Needs |
|---|---|---|
| **Live** | Real TinyFish Search + Fetch on NSP, MahaDBT 1.0, Buddy4Study, Devpost and HackerEarth, about 30 to 50 s (faster with a warm cache, and cache hits are shown). Recorded to `recordings/<runId>.jsonl`. If the key is missing or TinyFish is unreachable, it **falls back** to the last recording and says so in a "Replaying recorded run" badge. | `TINYFISH_API_KEY` in `server/.env` (copy `server/.env.example`) |
| **Replay** | Replays the last real run (`recordings/real-run.jsonl`), with pause, 1×/2×/4× and restart. | nothing |
| **Mock** | Replays the scripted run built from recon data (`recordings/fake-run.jsonl`). | nothing |

More views: **🕘 History** (the last 20 completed runs, saved in `server/.data/history.json`; open one or compare two), `?guided` (captions that narrate the run), and the **Day / Dusk / Cycle** theme switch. On the plan: a deadline timeline, filters and search, **Download plan** (print or PDF), **.ics** (only deadlines read from fetched pages), and **Re-run** after editing the profile (income, CAP admission, domicile proof).

`MODE=live|replay|mock` in `server/.env` sets the default (empty: live with a key, else replay). The plan opens when the run finishes, or with **View plan**. `http://localhost:5173/?demo` plays a replay at 2× and opens the plan (rehearsal); `?demo=live` and `?demo=mock` pick the mode.

Refresh the real recording (one live run with the sample student, about 30 s, Search and Fetch only):

```sh
cd server && npm run capture      # writes recordings/real-run.jsonl; a failed run keeps the old file
```

Tests:

```sh
cd server && npm test    # parsers, ranker, Gatekeeper, Verifier, Watchtower, Profiler, history and re-judge, API, live run on fixtures, fallback, SSE, replay (47)
cd web && npm test       # event reducer, timeline, filters, .ics export (8)
```

Raw stream, without the city:

```sh
curl -s -X POST localhost:8787/api/runs -H 'Content-Type: application/json' -d '{"mode":"replay"}'
curl -N localhost:8787/api/runs/<runId>/events
```
