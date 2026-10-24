# Lookout: Scholarship Season

HackIIITD 2026 · TinyFish track · 24-hour build

A low-poly 3D city where each TinyFish web agent is a little character and each source (scholarship portals, foundation listings, hackathon boards) is a building. A student enters **course, state and category** once. The agents walk off to the sources, read them live with TinyFish, and bring back findings. Town Hall turns those findings into **one dated, sourced plan**: scholarships, hackathons and events in a single list, sorted by deadline. Each scholarship comes with a read-only **Application Kit** (documents, prefilled fields, steps, deadline, source link).


> **Lookout never submits forms, and never asks for, enters or stores passwords, OTPs or Aadhaar numbers.** It reads public pages and prefills a checklist. The student applies on the official portal.

## Status

Built in 6 stages ([docs/MILESTONES.md](docs/MILESTONES.md)). **Stages 1 and 2 are done:** the low-poly city with walking citizens, and agent characters driven only by the SSE event stream (a recorded fake run replayed through the server, with play/pause, 1×/2×/4× speed, restart, an event log and click-for-details cards). Next is Stage 3 (real TinyFish data), which needs the API key. Server pieces already done: the event bus, the SSE stream with `Last-Event-ID`, the JSONL recorder, the scripted fake run, mock replay with pause and speed control, the NSP parser, the TinyFish client skeleton, the plan sorter with conflict warnings, and the kit builder.

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

## Stack

- **web/**: Vite, React, @react-three/fiber, @react-three/drei. Boxes and cones only, flat colours, no external assets.
- **server/**: Node and Express. Holds `TINYFISH_API_KEY` from `.env`, calls TinyFish, and streams agent events to the browser over SSE. The key never reaches the browser.
- **recordings/**: JSONL files of real runs. MOCK MODE replays them.

## Run

Two terminals:

```sh
# 1. server (event stream, fake run, replay)
cd server
npm install
npm start                # http://localhost:8787

# 2. city
cd web
npm install
npm run dev              # http://localhost:5173  (add ?stats for FPS and draw calls)
```

Open http://localhost:5173 and press **Play recorded run**. The server replays `recordings/fake-run.jsonl` (real recon data, no live calls) and the agents walk, work, find, fail and retry from those events. Use Pause, 1×/2×/4× and Restart run in the top bar. Click any building or character for its status, last event and URL. Reloading the page mid-run picks the same run back up. Without the server, the city still loads, but the button reports that it cannot start a run.

Tests:

```sh
cd server && npm test    # parser, bus, SSE resume, replay control, fake run (19)
cd web && npm test       # event -> character state reducer (5)
```

Raw stream, without the city:

```sh
curl -s -X POST localhost:8787/api/runs -H 'Content-Type: application/json' -d '{"mode":"mock","recording":"fake-run"}'
curl -N localhost:8787/api/runs/<runId>/events
```
