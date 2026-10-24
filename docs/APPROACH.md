# Approach

## 1. End-to-end flow

```
Student form ──POST /api/runs──▶ Orchestrator (server)
                                   │
          ┌────────────────────────┼─────────────────────────┬───────────────────┐
          ▼                        ▼                         ▼                   ▼
   NSP Scout (Search+Fetch)  MahaDBT Scout (Search+Fetch)  Watchtower (Monitor)  Deep Diver (Agent, optional)
          │                        │                         │                   │
          └──────── findings ──────┴──────────┬──────────────┴───── late findings┘
                                              ▼
                                   Town Hall ranker (deterministic)
                                              │
   every step emits an event ──▶ Event bus ──▶ Recorder (JSONL) + SSE ──▶ City (R3F)
```

1. The student submits course, state and category.
2. The server creates a `runId`, opens an event log and starts the agents in parallel.
3. Each agent emits events as it works: walking, working, found, error, done.
4. The city subscribes to `GET /api/runs/:id/events` (SSE) and animates **only** from those events.
5. When the scouts finish, Town Hall ranks the findings and emits `plan.ready`.
6. Every live run is saved to `recordings/<runId>.jsonl`. Mock mode streams one of these files back through the same SSE endpoint, with the original timing.

## 2. Key decisions and why

### D1. One event contract, two sources (live and replay)
The city never knows whether it is live or mock. The server emits the same events either way. This keeps mock mode honest (it is a real recorded run, not a separate fake) and means we only debug the frontend once.

### D2. Search and Fetch are the critical path. Agent is optional.
Our checks on 2026-10-24 showed that both portals render cleanly through Fetch:
- NSP `/All-Scholarships` returns every scheme with its dates in about 2 s.
- MahaDBT scheme pages return eligibility and benefits in about 3 s.

The Agent API takes 4 to 9 minutes and is flaky on government forms. It runs only as a side quest, and its result is merged into the plan if it arrives in time.

### D3. Deterministic parsing and ranking, not an LLM
The NSP page has a stable text pattern:
```
###### <Scheme Name> (<Merit|Welfare> Based Scheme)
Scheme Open from : DD-MM-YYYY
Student Application Open till : DD-MM-YYYY
```
Regex parsing is fast, free and explainable on stage ("we read this line, here's the link"). It also needs no second API key. If parsing fails, the finding still shows the raw snippet and source, marked "date unparsed".

### D4. Eligibility matching uses keyword rules, and shows its reasoning
A small rules table maps profile fields to scheme-name and eligibility keywords:

| Profile field | Matches if scheme text contains |
|---|---|
| category = OBC | `OBC`, `EBC`, `DNT`, `Other Backward` |
| category = SC | `SC `, `Scheduled Caste`, `Navbouddha`, `Neo Buddhist` |
| category = ST | `ST `, `Schedule Tribe`, `Tribal` |
| category = Minority | `Minority` |
| gender = female | `Girl` |
| disability = yes | `Disabilit`, `Specially Abled`, `Saksham` |
| course = B.Tech/BE | `Technical Degree`, `College`, `Post Matric`, `Higher` |
| course = Diploma | `Technical Diploma`, `Post Matric` |
| course = PG | `Post Graduate`, `PG` |
| state = Maharashtra | MahaDBT schemes become eligible, plus `Maharashtra` |

Exclusion rules: schemes tagged for a specific other group (e.g. "Jammu Kashmir And Ladakh", "NER", "Police Personnel Martyred", "Railways", "Beedi/Cine") are hidden unless the profile matches. Every plan item shows a "why it matches" line that lists the keywords that matched.

### D5. Ranking formula (shown in the UI)
```
score = 50 * eligibilityStrength      // 0..1: share of profile fields matched, specific > generic
      + 35 * urgency                  // 1.0 if <=7 days left, 0.7 if <=30, 0.4 if later, 0.2 if unknown
      + 15 * sourceConfidence         // 1.0 parsed date from the portal, 0.5 date from search snippet, 0.2 none
closed schemes (deadline < today) are dropped, and listed under "Missed"
```
The plan shows **one list of all kinds (scholarship, hackathon, event) sorted by deadline**, soonest first, with "no date published" items last. The score drops weak matches (below a threshold) and breaks ties, but it never overrides deadline order. **This week**, **This month**, **Later** and **No date published** appear only as divider labels in that list (EVENT_SCHEMA Plan).

### D6. Watchtower uses Monitor, plus our own diff
Monitor change notifications are push-only (webhook), and "run now" does **not** send a webhook. So:
- **Setup:** create one Page Monitor (`type: "fetch"`) on `https://scholarships.gov.in/All-Scholarships`, `schedule_cron: "CRON_TZ=Asia/Kolkata 0 9 * * *"`, with a `purpose` about student application deadline changes.
- **In the demo:** the Watchtower calls `POST /v1/monitors/{id}/runs`, takes the returned page text, re-parses the dates and diffs them against our last snapshot. It emits `watchtower.checked` or `watchtower.change`.
- **Optional:** expose `/api/webhooks/monitor` through a tunnel (cloudflared) so scheduled runs also push into the city.

### D7. MahaDBT honesty
The MahaDBT 1.0 site says AY 2026-27 applications are accepted only on **MahaDBT 2.0** (`mahadbt2.maharashtra.gov.in`), and scheme pages do not show deadlines. The plan reports this plainly: "Apply on MahaDBT 2.0. Deadline not published on scheme page." We do not invent dates. This is a good use for the optional Agent task (D2): "find the AY 2026-27 last date on MahaDBT 2.0".

### D8. Keep it small
1 city, 5 buildings (NSP, MahaDBT, Foundations, Watchtower, Town Hall) plus the cuttable Opportunities district, with one character per agent role, plus an optional Deep Diver. Boxes and cones only. Make it look good with colour and motion, not geometry.

## 3. Agents (characters)

| Character | Building | TinyFish APIs | Job |
|---|---|---|---|
| **Nisha the NSP Scout** | NSP | Search (`include_domains=scholarships.gov.in`), Fetch (`/All-Scholarships`, `/`) | List schemes, parse dates, read announcements |
| **Mahi the MahaDBT Scout** | MahaDBT | Search (`include_domains=mahadbt.maharashtra.gov.in`), Fetch (landing page, then up to 10 SchemeData pages that match) | Find state schemes that fit the profile, read eligibility and the 2.0 notice |
| **Fauzi the Foundations Scout** | Foundations | Search (`include_domains=buddy4study.com`, `vidyasaarathi.co.in`), Fetch (up to 10 detail pages) | Private and foundation scholarships with deadlines |
| *Hacky the Opportunities Scout* (cuttable) | Opportunities district | Fetch (Devfolio, MLH, Devpost JSON, HackerEarth JSON), Search + Fetch (Unstop) | Hackathons and tech events for a CE student |
| **Wardu the Watchman** | Watchtower | Monitor (create once, run now) | Re-check NSP dates, report changes |
| **Mayor Tara** | Town Hall | none (local ranker) | Collect findings, sort them by deadline, publish the plan, and build an Application Kit for each scholarship |
| *Dabba the Deep Diver* (optional) | MahaDBT | Agent (`run-sse`) | One narrow question on MahaDBT 2.0. Can time out without harm. |

Names are placeholders and can be changed.
