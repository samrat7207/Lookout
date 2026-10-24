# Lookout: Scholarship Season

HackIIITD 2026 · TinyFish track · 24-hour build

A low-poly 3D city where each TinyFish web agent is a little character and each source (scholarship portals, foundation listings, hackathon boards) is a building. A student enters **course, state and category** once. The agents walk off to the sources, read them live with TinyFish, and bring back findings. Town Hall turns those findings into **one dated, sourced plan**: scholarships, hackathons and events in a single list, sorted by deadline. Each scholarship comes with a read-only **Application Kit** (documents, prefilled fields, steps, deadline, source link).

> Headline for the demo (checked live on 2026-10-24): most NSP schemes close for students on **31-10-2026**. That is 7 days from the start of the hackathon.

> **Lookout never submits forms, and never asks for, enters or stores passwords, OTPs or Aadhaar numbers.** It reads public pages and prefills a checklist. The student applies on the official portal.

## Status

Milestone 1 in progress. See [docs/MILESTONES.md](docs/MILESTONES.md) for the build order.

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
| [docs/MILESTONES.md](docs/MILESTONES.md) | The 3 milestones: tasks, acceptance checks, commit points, time budget |
| [docs/DEMO_AND_RISKS.md](docs/DEMO_AND_RISKS.md) | 3-minute demo script, risk register, fallback ladder |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Decisions still needed from the team |

## Stack

- **web/**: Vite, React, @react-three/fiber, @react-three/drei. Boxes and cones only, flat colours, no external assets.
- **server/**: Node and Express. Holds `TINYFISH_API_KEY` from `.env`, calls TinyFish, and streams agent events to the browser over SSE. The key never reaches the browser.
- **recordings/**: JSONL files of real runs. MOCK MODE replays them.

## Run (server, Milestone 1)

```sh
cd server
npm install
npm test                 # parser + bus tests (node:test)
npm start                # http://localhost:8787
# in another shell:
curl -s -X POST localhost:8787/api/runs -H 'Content-Type: application/json' -d '{"mode":"fake"}'
curl -N localhost:8787/api/runs/<runId>/events
```
