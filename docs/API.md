# Lookout API

The Express server (`server/`, port 8787) is the only thing that talks to TinyFish. The browser talks only to `/api` (Vite proxies it in development). The examples below are trimmed from real responses on 2026-10-24.

Older plural routes (`/api/runs`, `/api/runs/:id/...`) still work and behave the same.

## POST /api/run

Starts a run.

```http
POST /api/run
Content-Type: application/json

{ "mode": "replay", "speed": 2, "profile": { } }
```

| field | values | notes |
|---|---|---|
| `mode` | `live` \| `replay` \| `mock` (also `fake`, used by tests) | Default from `MODE` in `server/.env`. If that is empty: `live` with a key, else `replay`. |
| `speed` | 0 to 16 | Replays only. |
| `recording` | a file name in `recordings/` | Replay only. Defaults to `real-run`. |
| `profile` | partial profile | Merged over the sample student. The profile is not stored anywhere except inside this run's events. |

**live** reads NSP, MahaDBT 1.0, Buddy4Study, and the Devpost and HackerEarth feeds through TinyFish Search and Fetch. It falls back to the last recording if the key is missing or TinyFish answers 401 or 403, or is unreachable at the start. The first event is then `run.mode` with `fallbackReason`.

```json
{ "runId": "run_2026-10-24T17-41-57_s28j", "control": { "speed": 2, "paused": false } }
```

## GET /api/run/:id/events

Server-sent events. Each message is `id: <seq>` plus `data: <event JSON>`. On connect, the server sends the run's history first, then live events. A reconnecting `EventSource` sends `Last-Event-ID`, and only the missed events are resent. A finished run sends its history and closes. The event shapes are in [EVENT_SCHEMA.md](EVENT_SCHEMA.md).

```
id: 1
data: {"v":2,"seq":1,"runId":"run_…","t":19,"kind":"run.mode","replay":true,"payload":{"mode":"replay","recording":"real-run","recordedAt":"2026-10-24T17:39:33.493Z"}}

id: 3
data: {"v":2,"seq":3,"runId":"run_…","t":790,"kind":"run.started","replay":true,"payload":{"profile":{"label":"sample student", …}}}
```

The Gatekeeper's own events appear in the same stream: `cache.hit`, `cache.miss`, `rate.limited`, `blocked` and `fallback`. So do the Verifier's `verify.result` and the Profiler's `profile.ready`.

## GET /api/run/:id/plan

The latest plan of a run that is still in memory (runs are kept for an hour). `final` is true once `plan.ready` has been emitted.

```json
{
  "runId": "run_2026-10-24T17-41-57_s28j", "final": true, "replay": true,
  "plan": {
    "today": "2026-10-24",
    "headline": { "text": "NSP student applications close 31-10-2026", "date": "2026-10-31", "daysLeft": 7, "sourceUrl": "https://scholarships.gov.in/", "dateSource": "parsed" },
    "items": [{
      "opportunityId": "buddy4study:idfc-first-bank-engineering-scholarship",
      "kind": "scholarship", "title": "IDFC FIRST Bank Engineering Scholarship Programme 2026-30",
      "deadline": "2026-10-25", "deadlineLabel": "Application closes", "daysLeft": 1,
      "fit": "conditional", "why": "B.Tech or engineering is named on the page · marks and income conditions on the page apply",
      "amount": "up to INR 1 lakh", "sourceUrl": "https://www.buddy4study.com/page/idfc-first-bank-engineering-scholarship",
      "checkedAt": "2026-10-24T17:40:01.067Z", "needsVerification": true,
      "verification": { "status": "verified", "reason": "Name and deadline (2026-10-25) found on the page.", "checkedAt": "2026-10-24T17:40:24.068Z" },
      "rank": 1, "rankWhy": "#1: Closes 25 Oct 2026 (1 day left); you may match (conditions below).",
      "kindRank": 1, "kitId": "kit:buddy4study:idfc-first-bank-engineering-scholarship"
    }],
    "missed": [], "notApplicable": [{ "title": "…", "reason": "For girl students only; the profile is male.", "sourceUrl": "…" }],
    "counts": { "scholarship": 7, "hackathon": 9, "event": 2 },
    "conflicts": [{ "id": "nsp-one-merit-scheme", "title": "PM YASASVI (college) and PM-USP CSSS", "text": "These may not be combinable. Check the current NSP rules before applying.", "sourceUrl": "https://scholarships.gov.in/" }],
    "profile": { "label": "sample student", "known": [ … ], "unknown": [{ "field": "familyIncome", "value": "unknown, needs your input", … }] },
    "sources": { "checked": 14, "failed": 1, "cached": 0, "lastChecked": "2026-10-24T17:40:01.067Z", "list": [ … ], "notUsed": [ … ], "gatekeeper": { … } }
  }
}
```

Errors: `404 {"error":"run not found …"}`, and `404 {"error":"no plan yet"}`.

## GET /api/kit/:schemeId

The latest read-only Application Kit for a scheme, taken from runs in memory. `schemeId` is the opportunity id (URL-encoded) or the kit id. Sensitive fields always have `value: null`; the server refuses to build a kit that breaks this.

```http
GET /api/kit/nsp%3Apm-usp-central-sector-scheme-of-scholarship-for-college-and-university-students-csss
```
```json
{ "runId": "run_…", "replay": true,
  "kit": { "id": "kit:nsp:pm-usp-…", "title": "PM-USP – Central Sector Scheme Of Scholarship For College And University Students (CSSS)",
           "deadline": "2026-10-31", "daysLeft": 7, "applyUrl": "https://scholarships.gov.in/",
           "documents": [ … ], "fields": [{ "label": "Aadhaar number", "value": null, "sensitive": true, … }], "steps": [ … ],
           "safety": "Lookout never submits forms and never asks for, enters or stores passwords, OTPs or Aadhaar numbers." } }
```

## POST /api/recheck

The Watchtower. It re-fetches the sources of a plan's items now, through the Gatekeeper with the cache bypassed. Each item's date is re-read with the parser that found it. It reports `changed` only when that date differs or the item is no longer listed. Otherwise it reports `no-change`, or `unchecked` with the reason. Only known source hosts are fetched, so it is not an open proxy. It needs the key: it never "re-checks" from a recording.

```http
POST /api/recheck
Content-Type: application/json

{ "runId": "run_2026-10-24T17-41-57_s28j" }
```
or `{ "items": [{ "opportunityId", "title", "deadline", "source", "sourceUrl" }] }` (up to 60 items).

```json
{
  "summary": { "checkedAt": "2026-10-24T17:42:35.136Z", "sources": 7, "changed": 0, "noChange": 18, "unchecked": 0 },
  "results": [{ "opportunityId": "buddy4study:idfc-first-bank-engineering-scholarship", "title": "IDFC FIRST Bank Engineering Scholarship Programme 2026-30",
                "status": "no-change", "reason": "Still 2026-10-25.", "checkedAt": "2026-10-24T17:42:35.118Z", "sourceUrl": "…" }],
  "gatekeeper": { "calls": 1, "ok": 1, "blocked": 0, "cacheHits": 0, "cacheMisses": 7, "events": [ … ] }
}
```

Errors: `503` without a key; `400` without a usable runId or items; `502` if TinyFish rejects the call.

## GET /api/health

```json
{ "ok": true, "modes": ["live", "replay", "mock", "fake"], "defaultMode": "live",
  "tinyfishKeyPresent": true, "lastRecording": "real-run", "opportunities": true,
  "cache": { "entries": 19, "bytes": 141918 },
  "lastRun": { "runId": "run_…", "mode": "replay", "startedAt": "…", "finishedAt": "…", "outcome": "complete", "replay": true } }
```

`tinyfishKeyPresent` is a yes or no only. The key never leaves `server/src/tinyfish/client.js`.

## Other routes

| Route | Purpose |
|---|---|
| `GET /api/runs/:id/control`, `POST /api/runs/:id/control` | Replays only: read or set `{ paused, speed }` |
| `GET /api/recordings` | The recordings available for replay |
