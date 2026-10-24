# TinyFish Integration

Checked against docs.tinyfish.ai on 2026-10-24: authentication, the Search, Fetch and Agent references, the run-sse, run-async and get-run OpenAPI pages, and the Monitor API reference. Anything marked **⚠** was ambiguous or missing in the docs, so code defensively there.

## Auth (all APIs)

- Header: `X-API-Key: <key>`. The key comes from `TINYFISH_API_KEY` in `server/.env`.
- Error body (Agent and auth): `{"error": {"code": "INVALID_API_KEY", "message": "..."}, "request_id": "..."}`
- Wallet out of funds returns **402** `INSUFFICIENT_CREDITS` (with `details.reason: "wallet_out_of_funds"`). Agent and Monitor draw on the wallet, so **check the balance before the demo** (`GET https://agent.tinyfish.ai/v1/wallet`).
- Node SDK exists (`@tiny-fish/sdk`), but we use raw `fetch` so the formats below are exactly what goes over the wire.

## 1. Search (critical path)

```
GET https://api.search.tinyfish.ai?query=...&location=IN&language=en&include_domains=scholarships.gov.in
X-API-Key: ...
```
Params: `query` (required), `purpose`, `location`, `language`, `include_domains`, `exclude_domains` (comma-separated), `recency_minutes` | `after_date`/`before_date` (YYYY-MM-DD), `domain_type` (web|news|research_paper), `page` (0–10).

Response:
```json
{ "query": "...", "results": [ { "position": 1, "site_name": "...", "title": "...", "snippet": "...", "url": "...", "date": "optional" } ], "total_results": 10, "page": 0 }
```
- Limits: **30 req/min**, free up to 12,000/day.
- ⚠ There is no max-results parameter. The server sets the result count. The error body shape is not documented, so use the HTTP status.

**Our use:**
- NSP: `query="scholarship student application last date 2026-27"`, `include_domains=scholarships.gov.in`, `location=IN`. The snippet already carries "Closing dates for student application is 31-10-2026", which gives an early headline finding in seconds.
- MahaDBT: `query="<category> <course> scholarship"`, `include_domains=mahadbt.maharashtra.gov.in`. This finds the SchemeData URLs that are most relevant.
- Foundations: `query="scholarship 2026-27 <course> <category> <state> deadline"`, `include_domains=buddy4study.com` (and a second one for `vidyasaarathi.co.in`). Their listing pages render empty, so Search is the discovery step.
- Opportunities: `query="hackathon registration deadline <month> 2026 India students"`, `include_domains=unstop.com`.

## 2. Fetch (critical path)

```
POST https://api.fetch.tinyfish.ai
X-API-Key: ...
Content-Type: application/json

{ "urls": ["https://scholarships.gov.in/All-Scholarships"], "format": "markdown", "links": false, "per_url_timeout_ms": 60000 }
```
Fields: `urls` (≤10, required), `format` (markdown default | html | json), `links`, `image_links`, `iframe_links`, `ttl` (seconds; 0 = live), `per_url_timeout_ms` (≤110000), `include_selectors` / `exclude_selectors`, `purpose`, conditional-request fields.

Response:
```json
{ "results": [ { "url", "final_url", "title", "description", "language", "text", "links": [], "latency_ms", "format" } ],
  "errors":  [ { "url", "error": "timeout|bot_blocked|page_not_found|...", "status" } ] }
```
- **Errors for individual URLs come back inside a 200 response.** Always check `errors[]`.
- Limits: **150 URLs/min**, 10 URLs per request, free up to 1,000 URLs/day.
- Per-URL backend timeout is 110 s and the CDN ceiling is 120 s. **Set the client timeout to at least 150 s.**
- JS rendering is automatic. There is no toggle.

**Our use:**
| Agent | URLs | Options |
|---|---|---|
| NSP Scout | `https://scholarships.gov.in/All-Scholarships`, `https://scholarships.gov.in/` | markdown |
| MahaDBT Scout | `https://mahadbt.maharashtra.gov.in/` | markdown, `links: true` (to discover the SchemeData URLs) |
| MahaDBT Scout | up to 10 matching `.../SchemeData/SchemeData?str=...` | markdown, `include_selectors` to try later (the page has a lot of boilerplate) |
| Foundations Scout | up to 10 Buddy4Study `/page/…` or `/scholarship/…` and Vidyasaarathi `/resources/…` URLs found by Search | markdown, `per_url_timeout_ms: 60000` (Buddy4Study `/page/` takes up to 20 s) |
| Opportunities Scout (cuttable) | `devfolio.co/hackathons`, `mlh.io/seasons/2027/events`, `devpost.com/api/hackathons?status[]=upcoming&status[]=open`, `hackerearth.com/chrome-extension/events/` in one request, then the top Unstop detail pages | markdown. JSON endpoints come back as markdown text with `_` escapes, so unescape before `JSON.parse`. Unstop needs `include_selectors: ["main"]`. |

## 3. Agent (optional side quest only)

| Method | Endpoint |
|---|---|
| POST | `https://agent.tinyfish.ai/v1/automation/run-sse` (we use this one) |
| POST | `https://agent.tinyfish.ai/v1/automation/run-async` → `{ run_id, error }` |
| GET | `https://agent.tinyfish.ai/v1/runs/{id}` (poll after an SSE disconnect) |
| POST | `https://agent.tinyfish.ai/v1/runs/{id}/cancel` |

Body:
```json
{
  "url": "https://mahadbt2.maharashtra.gov.in/",
  "goal": "Read the notices on this page only. Do not log in or fill any form. Return the last date for Academic Year 2026-27 scholarship applications if it is stated, with the exact sentence.",
  "output_schema": { "type": "object", "properties": { "lastDate": { "type": "string" }, "sentence": { "type": "string" }, "found": { "type": "boolean" } }, "required": ["found"] },
  "browser_profile": "lite",
  "agent_config": { "max_duration_seconds": 420 }
}
```
SSE events (`data: <json>` lines):
- `STARTED {run_id}`
- `STREAMING_URL {streaming_url}`. Optionally show it as a "live view" link on the Deep Diver.
- `PROGRESS {purpose}`. Map this to `agent.progress` and a speech bubble.
- `TF_API_RESULT`. ⚠ This is only in the OpenAPI spec.
- `HEARTBEAT`
- `COMPLETE {status: COMPLETED|FAILED|CANCELLED, result, error}`. ⚠ `error` may be a string or an object, so handle both.

There is no `Last-Event-ID` resume. On disconnect, poll `GET /v1/runs/{id}` until the status is terminal.

Rules for us:
- Never block `plan.ready` on it. If it finishes later, emit `plan.updated`.
- Hard cap of 7 minutes, then cancel.
- `max_steps` and `mode: strict` are beta-gated (403), so do not send them.

## 4. Monitor (Watchtower)

| Method | Endpoint | Notes |
|---|---|---|
| POST | `https://agent.tinyfish.ai/v1/monitors` | 201. The response includes `monitor` and a baseline `run` (with page text). |
| GET | `/v1/monitors`, `/v1/monitors/{id}` | |
| PATCH | `/v1/monitors/{id}` | `{"status":"paused"}` / `{"status":"active"}`. Do not mix with other fields. |
| DELETE | `/v1/monitors/{id}` | |
| POST | `/v1/monitors/{id}/runs` | Run now. 201 `{ run: { id, is_baseline, results[], errors[] } }`. **Does not send a webhook.** |

Create body for our Watchtower:
```json
{
  "type": "fetch",
  "name": "Lookout Watchtower - NSP deadlines",
  "config": { "url": "https://scholarships.gov.in/All-Scholarships", "format": "markdown" },
  "schedule_cron": "CRON_TZ=Asia/Kolkata 0 9 * * *",
  "purpose": "Any scheme's 'Student Application Open till' date changes, or a new scheme appears",
  "webhook_url": "https://<tunnel>/api/webhooks/monitor"
}
```
- Webhook payload (page monitor): `{ fetch_monitor_id, id, is_baseline, results: [...], errors: [] }`. ⚠ There is no explicit "changed" flag, so **we diff the parsed dates ourselves**.
- There is no REST endpoint for run history, so keep our own snapshot in `server/.cache/watchtower.json`.
- Create the monitor **once** with a setup script (`npm run setup:monitor`). Save `MONITOR_ID` to `.env`, so runs do not create duplicates.
- ⚠ The status enum is not formally documented (`active`, `paused`, `failed` appear in prose).

## 5. Budget for one live run

| Call | Count | Notes |
|---|---|---|
| Search | 4–6 | well within 30/min |
| Fetch | 5–6 requests / ~30 URLs | well within 150/min |
| Monitor run-now | 1 | wallet |
| Agent | 0–1 | wallet, optional |

Rehearse 20+ runs a day and still stay under the free Search and Fetch tiers.

## 6. Failure handling

| Failure | Behaviour |
|---|---|
| 429 | Back off for 2 s, then 4 s, then use the cache |
| 402 | Emit `agent.error` "wallet empty". Watchtower and Deep Diver stand down. Scouts continue (Search and Fetch have a free tier). |
| Fetch `errors[]` timeout or bot_blocked | Retry once with `ttl` omitted (allow cache), then fall back to the disk cache |
| Parse finds 0 schemes | Emit a finding with the raw evidence and `dateSource: "none"`, plus `agent.error` "parser". The demo continues. |
| Network down | Mock mode (one toggle in the UI) |
