# Event Schema (v2)

The backend and the city both build against this contract. Mock recordings use it too. If you change it, bump `v` and update the reducer and the recordings.

v2 changes from v1: **Finding** is replaced by **Opportunity** (it covers scholarships, hackathons and events). A new `kit.ready` event carries an **ApplicationKit**. The Plan is now **one list sorted by deadline** instead of groups. There are new IDs for the Foundations building and the Opportunities district.

## Envelope

```jsonc
{
  "v": 2,
  "seq": 17,                       // per-run, starts at 1, strictly increasing
  "runId": "run_2026-10-24T10-15-03_ab12",
  "ts": "2026-10-24T10:15:09.412Z",
  "t": 6412,                       // ms since run.started (used by replay timing)
  "kind": "agent.found",           // event kind (not the same thing as Opportunity.kind)
  "agentId": "nsp-scout",          // optional for run-level events
  "building": "nsp",               // see IDs
  "replay": false,                 // true when coming from a recording
  "payload": { /* kind-specific */ }
}
```

IDs:
- **agentId**: `nsp-scout`, `mahadbt-scout`, `foundations-scout`, `opps-scout`, `watchman`, `mayor`, `deep-diver`
- **building**: `nsp`, `mahadbt`, `foundations`, `opportunities`, `watchtower`, `townhall`

`opps-scout` and `opportunities` appear only when the Opportunities add-on is on. `run.started.payload.agents` is the source of truth for which agents (and so which buildings) exist in this run.

## Kinds

| kind | Emitted when | payload |
|---|---|---|
| `run.started` | The run is created | `{ profile, mode, today: "2026-10-24", agents: [agentId...] }` |
| `agent.spawned` | An agent appears at Town Hall | `{ name, role }` |
| `agent.walking` | The agent heads to a building | `{ to: building, reason: "Checking NSP scheme list" }` |
| `agent.working` | A TinyFish call starts | `{ tool: "search"|"fetch"|"agent"|"monitor", target: url or query, label: "Fetch All-Scholarships" }` |
| `agent.progress` | Sub-step or Agent API PROGRESS | `{ text, tool?, tinyfishRunId? }` |
| `agent.found` | A useful fact is extracted | **Opportunity** (below), or a **Note** `{ note: true, text, sourceUrl, bubble }` for facts that are not an opportunity (e.g. the MahaDBT 2.0 notice) |
| `agent.error` | A TinyFish call or parse failed (not fatal) | `{ tool, code, message, retrying: bool, requestId? }` |
| `agent.done` | The agent has finished its job | `{ findings: n, durationMs }` |
| `agent.returning` | The agent walks back to Town Hall | `{ to: "townhall" }` |
| `plan.updated` | The ranker has re-run with new findings | **Plan** (below) |
| `plan.ready` | The first complete plan is ready (scouts done) | **Plan** |
| `kit.ready` | Town Hall has built an Application Kit for a scholarship in the plan | **ApplicationKit** (below) |
| `watchtower.checked` | A Monitor run finished with no date changes | `{ monitorId, checkedAt, schemesTracked: n }` |
| `watchtower.change` | A date differs from the last snapshot | `{ monitorId, changes: [{ scheme, field, from, to }], sourceUrl }` |
| `run.complete` | Everything has settled (the Deep Diver may still be out) | `{ durationMs, findings: n, errors: n }` |
| `run.failed` | An unrecoverable error occurred (should be rare) | `{ message }` |

The frontend must **ignore unknown kinds** without crashing.

## Opportunity

One shape for everything the plan can list. Required fields come first. The rest are optional, depending on the source.

```jsonc
{
  // required
  "id": "nsp:pm-yasasvi-college-obc-ebc-dnt",          // "<source>:<slug>", stable across runs
  "kind": "scholarship",                    // scholarship | hackathon | event
  "title": "PM YASASVI Central Sector Scheme Of Top Class Education In College For OBC, EBC And DNT Students",
  "deadline": "2026-10-31",                 // ISO date, or null when no date is published
  "deadlineLabel": "Student application closes",   // what the date means at this source (see table)
  "sourceUrl": "https://scholarships.gov.in/All-Scholarships",
  "matchReason": "OBC + B.Tech (college) + closes in 7 days",   // one human line, shown as "why"

  // provenance (all kinds)
  "source": "nsp",                          // nsp | mahadbt | buddy4study | vidyasaarathi | devfolio | mlh | devpost | hackerearth | unstop
  "dateSource": "parsed",                   // parsed (from the fetched page) | snippet (from a search result) | none
  "evidence": "Student Application Open till : 31-10-2026",   // the exact line, for audit and the bubble
  "matchedOn": ["category=OBC", "course=btech"],
  "bubble": "PM YASASVI (OBC, college): closes 31 Oct!",      // ≤ 60 chars, shown above the character
  "via": "fetch",                           // search | fetch | agent | monitor
  "cached": false,

  // scholarship only
  "scholarship": {
    "portal": "nsp",                        // where the student applies: nsp | mahadbt | mahadbt2 | external
    "schemeType": "Merit",                  // Merit | Welfare | null
    "openFrom": "2026-06-01",
    "verificationTill": "2026-11-15",
    "conditional": false,                   // true if eligibility needs a fact we don't ask for (e.g. Swanath: orphan)
    "kitId": "kit:nsp:pm-yasasvi-college-obc-ebc-dnt"   // set once kit.ready has been emitted
  },

  // hackathon / event only
  "event": {
    "startsOn": "2026-10-31", "endsOn": "2026-11-01",
    "mode": "in-person",                    // online | in-person | hybrid | null
    "location": "New Delhi, IN",
    "organiser": "hackCBS"
  }
}
```

`deadlineLabel` per source. Use whatever date the source really publishes. Never invent a registration deadline.

| source | `deadline` is | `deadlineLabel` |
|---|---|---|
| nsp | "Student Application Open till" | Student application closes |
| mahadbt | null (not published on scheme pages) | Not published (apply on MahaDBT 2.0) |
| buddy4study | "Deadline Date: DD-Mon-YYYY" / "Application Deadline: …" | Application closes |
| vidyasaarathi | "Valid Upto" | Application closes |
| devfolio | "Starts DD/MM/YY" (the listing shows no registration close) | Hackathon starts |
| mlh | first day of the event | Event starts |
| devpost | end of `submission_period_dates` | Submissions close |
| hackerearth | `end_tz` | Challenge ends |
| unstop | "Registration Deadline" from the snippet or detail page | Registration closes |

## ApplicationKit

Built by Town Hall (deterministic, no LLM) for each `kind: scholarship` item in the plan. **It is read-only and prefill-only.** Lookout never submits a form, and never asks for, enters or stores passwords, OTPs or Aadhaar numbers. Sensitive fields appear only as "do this yourself on the official portal" lines, with `value: null`.

```jsonc
{
  "id": "kit:nsp:pm-yasasvi-college-obc-ebc-dnt",
  "opportunityId": "nsp:pm-yasasvi-college-obc-ebc-dnt",
  "title": "PM YASASVI … In College For OBC, EBC And DNT Students",
  "deadline": "2026-10-31",
  "daysLeft": 7,
  "sourceUrl": "https://scholarships.gov.in/All-Scholarships",   // where the scheme and dates were read
  "applyUrl": "https://scholarships.gov.in/",                    // where the student goes to apply
  "documents": [
    { "name": "Caste certificate (OBC)", "why": "category=OBC", "from": "https://scholarships.gov.in/" },
    { "name": "Income certificate", "why": "scheme is means-tested", "from": "https://scholarships.gov.in/" },
    { "name": "Previous year marksheet", "why": "merit scheme", "from": "https://scholarships.gov.in/" },
    { "name": "Fee receipt / bonafide certificate", "why": "college scheme", "from": null }
  ],
  "fields": [
    { "label": "Course", "value": "B.Tech Computer Engineering", "from": "persona" },
    { "label": "Category", "value": "OBC", "from": "persona" },
    { "label": "Domicile state", "value": "Maharashtra", "from": "persona" },
    { "label": "Gender", "value": "Male", "from": "persona" },
    { "label": "Annual family income", "value": null, "from": "student" },
    { "label": "Institute (AISHE code)", "value": null, "from": "student" },
    { "label": "Aadhaar number", "value": null, "from": "student", "sensitive": true, "note": "Enter on NSP yourself. Lookout never asks for it." },
    { "label": "Bank account", "value": null, "from": "student", "sensitive": true, "note": "Enter on NSP yourself." }
  ],
  "steps": [
    "Complete OTR (One Time Registration) on NSP, which is Aadhaar based. Do this yourself on scholarships.gov.in.",
    "Log in with your OTR ID and choose 'PM YASASVI … In College'.",
    "Fill the fields above; upload the documents.",
    "Submit before 31 Oct 2026, then ask your institute to verify before 15 Nov 2026."
  ],
  "safety": "Lookout never submits forms and never asks for, enters or stores passwords, OTPs or Aadhaar numbers.",
  "generatedFrom": ["https://scholarships.gov.in/", "https://scholarships.gov.in/All-Scholarships"]
}
```

Rules:
- `fields[].from` is `persona` (prefilled from the profile), or `student` (left blank for the student to fill on the portal).
- Every field with `sensitive: true` has `value: null`, always. The server refuses to build a kit that breaks this (it is a unit test).
- `documents[].from` is the page the requirement was read from. For MahaDBT this is the scheme page's "Documents Required" section. For NSP, Buddy4Study and Vidyasaarathi it is the page's own documents or eligibility text where present. Generic items (e.g. a fee receipt) have `from: null` and are shown as "usually needed".

## Plan

```jsonc
{
  "generatedAt": "2026-10-24T10:16:40Z",
  "today": "2026-10-24",
  "headline": { "text": "NSP student applications close 31 Oct 2026", "date": "2026-10-31", "daysLeft": 7, "sourceUrl": "https://scholarships.gov.in/" },
  "items": [PlanItem],        // ALL kinds merged, sorted by deadline ascending; deadline null last
  "missed": [PlanItem],       // deadline < today
  "counts": { "scholarship": 7, "hackathon": 5, "event": 0 },
  "notes": ["MahaDBT: AY 2026-27 applications only via MahaDBT 2.0 (mahadbt2.maharashtra.gov.in)"]
}
```

`PlanItem = { rank, opportunityId, kind, title, source, deadline, deadlineLabel, daysLeft, bucket, score, why, sourceUrl, action, kitId? }`

- **Sort:** by `deadline` ascending, then by `score` descending. Items with `deadline: null` go last, ordered by score. `rank` is the position in this list.
- `bucket` is `"this-week" | "this-month" | "later" | "no-date"`. It is only a divider label in the list, not a separate group.
- `score` (APPROACH D5) decides what gets in (items below the threshold are dropped) and breaks ties. It does not override deadline order.
- `kitId` is present for scholarships once `kit.ready` has been emitted.
- Example `action` values: "Apply on NSP (OTR required)", "Apply on MahaDBT 2.0", "Apply on Buddy4Study", "Register on Devfolio".

## Example sequence (abbreviated)

```
run.started
agent.spawned       nsp-scout
agent.spawned       mahadbt-scout
agent.spawned       foundations-scout
agent.spawned       opps-scout          (only if the add-on is on)
agent.spawned       watchman
agent.walking       nsp-scout → nsp
agent.walking       mahadbt-scout → mahadbt
agent.walking       foundations-scout → foundations
agent.walking       opps-scout → opportunities
agent.working       nsp-scout  search "scholarship last date 2026" site scholarships.gov.in
agent.found         nsp-scout  headline: closing date 31-10-2026 (snippet)
agent.working       nsp-scout  fetch /All-Scholarships
agent.found ×N      nsp-scout  one Opportunity per matching scheme
agent.working       mahadbt-scout fetch landing
agent.found         mahadbt-scout  Note: "AY 2026-27 only on MahaDBT 2.0"
agent.working       mahadbt-scout fetch 6 SchemeData pages
agent.found ×N      mahadbt-scout
agent.working       foundations-scout search site:buddy4study.com, then fetch detail pages
agent.found ×N      foundations-scout
agent.working       opps-scout fetch devfolio + mlh + devpost + hackerearth, search unstop
agent.found ×N      opps-scout  kind: hackathon
agent.returning     nsp-scout → townhall
plan.updated
agent.walking       watchman → watchtower
agent.working       watchman monitor run-now
watchtower.checked
plan.ready
kit.ready ×N        mayor  one per scholarship in the plan
run.complete
```
