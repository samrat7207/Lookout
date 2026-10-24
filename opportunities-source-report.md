# Opportunities source report (hackathons and tech events)

| | |
|---|---|
| **What this is** | A tested report on where Lookout can read hackathons and tech events for a Computer Engineering student, and what it can truthfully show from each source. Every claim below comes from a live TinyFish Fetch or Search call; the date read is given for each. |
| **Owner** | Aniket Gupta. Commit to `team/aniket/opportunities-source-report.md` from your own git account. |
| **Lookout feature** | Opportunities district (PRD P1-6, MILESTONES Stage 5): the Opportunities Scout, `parse/opps.js`, and the hackathon rows in the deadline-sorted plan. |
| **Verify before committing** | (1) Re-run one Fetch per source on the day you commit; listings change daily. (2) The Hack2skill time zones (EST/EDT on an Indian site). (3) Whether HackerEarth `end_tz` is the registration deadline or only the challenge end. (4) Retry Smart India Hackathon (`proxy_error` today). (5) Anything marked **needs_verification**. |
| **Read on** | 2026-10-24 (all calls in this report unless stated otherwise) |

## How it was tested

- **Fetch:** `format: markdown`, `per_url_timeout_ms: 60000`, `ttl: 0` (live), `links: true` where we needed detail-page URLs.
- **Search:** `include_domains=<source>`, `location: IN`.
- **A source is "kept" only if** Fetch (or Search + Fetch) returns real event content with dates.
- **For each kept source we also opened detail pages,** because the listing date and the real registration deadline often differ.

## Summary

| Source | Verdict | What works (exact URL) | Date that is reliably readable | Registration close readable? |
|---|---|---|---|---|
| Devpost | ✅ Keep (JSON only) | `https://devpost.com/api/hackathons?status[]=upcoming&status[]=open` | Submission period (start–end) | **Yes**: the submission end is the real deadline |
| HackerEarth | ✅ Keep (JSON only) | `https://www.hackerearth.com/chrome-extension/events/` | `start_tz`, `end_tz` (ISO, IST) | Partly: `end_tz` is the challenge end (**needs_verification** whether registration closes earlier) |
| Unstop | ✅ Keep (Search + detail Fetch) | Search `include_domains=unstop.com`, then Fetch the detail page with `include_selectors: ["main"]` | Stage dates, "Registration Deadline" | **Yes**, on most snippets and detail pages |
| Hack2skill | ✅ Keep (new) | `https://hack2skill.com/hackathons-listing` | "Registrations Ends On" per event | **Yes**, but shown in EST/EDT (**needs_verification**) |
| Devfolio | ⚠️ Keep, with an honest label | `https://devfolio.co/hackathons` + `https://<slug>.devfolio.co/` | Listing: "Starts DD/MM/YY". Detail: "Runs from …", city or Online | **No**: "Applications close in" is a JS countdown that renders empty. Only free text sometimes states it. |
| MLH | ⚠️ Keep, India filter | `https://mlh.io/seasons/2027/events` (redirects to mlh.com) | Event dates ("OCT 31 - NOV 01"), city, country code | **No**: event sites (e.g. hackcbs.tech) say teams are shortlisted; no close date found |
| Unstop listing | ❌ Drop | `https://unstop.com/hackathons` returns "Cookies are disabled…" | none | none |
| Unstop public API | ❌ Drop | `/api/public/opportunity/search-result?...` returned 2023–2025 items in recon (2026-10-24, earlier run) | stale | stale |
| Devpost detail pages | ❌ Drop | `https://paypalaihackathon.devpost.com/` → `bot_blocked` | none | none |
| GDG community events | ❌ Drop | `https://gdg.community.dev/events/` renders an empty shell (321 chars) | none | none |
| Smart India Hackathon | ❌ Failed today, retry | `https://www.sih.gov.in/` → `proxy_error` | none | none |

## Source by source

### Devpost (keep the JSON endpoint)
- **Works:**
  - **URL:** `https://devpost.com/api/hackathons?status[]=upcoming&status[]=open`
  - **Result:** 9 hackathons, Fetch in 0.5 s.
- **Fails:**
  - **HTML listing:** `/hackathons` renders only the filters.
  - **Detail pages:** `bot_blocked` (tested `paypalaihackathon.devpost.com`).
- **Readable fields:** `title`, `url`, `open_state`, `submission_period_dates` (e.g. "Oct 01 - Nov 12, 2026"), `time_left_to_submission`, `displayed_location.location` ("Online"), `themes[]`, `prize_amount` (contains HTML, so strip tags), `prizes_counts`, `registrations_count`, `organization_name`, `invite_only`.
- **Not readable:** country or age eligibility. It isn't in the JSON, and the detail pages are blocked.
- **Parsing gotcha:** Fetch returns the JSON as "markdown" text with markdown punctuation escaped (`\_`, `\-` and others). Unescape **all** `\X` escapes before `JSON.parse`, not just `\_`; an underscore-only unescape failed today.
- **Example (read today):** PayPal AI Hackathon, Online, submissions Oct 01 – Nov 12, 2026, "19 days left".
- **Gap:** none. The submission end date *is* the deadline.
- **Lookout can say:** "Submissions close 12 Nov 2026 (Devpost, online)". It must **not** say "open to Indian students" unless that has been checked on the organiser's page.

### HackerEarth (keep the JSON endpoint)
- **Works:**
  - **URL:** `https://www.hackerearth.com/chrome-extension/events/`
  - **Result:** 3 events, Fetch in 1 s.
- **Fails:** `/challenges/hackathon/`, an HTML shell with no events.
- **Readable fields:** `title`, `description` (truncated), `url`, `status` (ONGOING/UPCOMING), `college` (bool), `start_tz` and `end_tz` (ISO with +05:30), `challenge_type`.
- **Examples:**
  - **Agentic Banking Hackathon:** ONGOING, 5 Oct – 13 Nov 2026.
  - **MKS AI & Data Hackathon:** UPCOMING, 26 Oct – 4 Nov 2026.
  - **GoDaddy Inclusive Innovation Hackathon 2026:** the description says it invites **female developers**, so the persona filter must exclude it.
- **Gap:** unknown. `end_tz` may be the challenge end rather than the last day to register (**needs_verification**).
- **Lookout can say:** "Challenge ends 13 Nov 2026 (HackerEarth)".

### Unstop (keep: Search to discover, Fetch to read)
- **Works:**
  - **Search:** `include_domains=unstop.com`. Snippets already carry dates, e.g. "Registration Deadline: November 15, 2026" (Next Horizon 2026) and "08 Nov 26, 06:29 PM CUT Registration Deadline" (CodeQuest).
  - **Detail Fetch** with `include_selectors: ["main"]` (tested on ChaosCore Hackathon 2026, 8 s): stage dates, "13 days left", team size, mode.
- **Fails:**
  - **Listing page:** cookie wall.
  - **Public API:** stale items.
- **Readable fields:** title, organiser, stage timeline (idea submission and final round dates), registration deadline, mode (online/offline), team size, fee (snippets often say "Free").
- **Gap example:** ChaosCore, where registration closes 6 Nov 2026 but the final round is 14–15 Nov 2026.
- **Caution:** dates are shown in "CUT" or "EDT" depending on the snippet. Normalise to IST and keep the original text as evidence.
- **Lookout can say:** "Registration closes 15 Nov 2026 (Unstop, online)", with `dateSource: snippet` until the detail page is fetched.

### Hack2skill (new: keep)
- **Works:**
  - **URL:** `https://hack2skill.com/hackathons-listing`
  - **Result:** 9 events per page, Fetch in 9.6 s.
- **Readable fields:** title, Free/Paid, mode (In Person / Hybrid / Virtual), **"Registrations Ends On: <date> (EST/EDT)"**, Register Now / Registration Closed.
- **Examples:**
  - **PromptWars x Sphoorthy Engineering College:** Free, Virtual, registrations end Tue, Dec 01, 2026.
  - **Future Health Digital Innovation Challenge:** Free, Hybrid, ends Tue, Nov 10, 2026.
- **Not readable on the listing:** city, eligibility, prizes. Open the detail page (not tested today).
- **Lookout can say:** "Registration closes 1 Dec 2026 (Hack2skill, virtual)".
- **Caution:** the time-zone label is odd for Indian events; confirm on one detail page (**needs_verification**).

### Devfolio (keep, but never call the start date a deadline)
- **Works:**
  - **Listing:** `https://devfolio.co/hackathons`, 2 s. Name, theme, online/offline, Open/Upcoming, "Starts DD/MM/YY" or "Opens DD/MM/YY".
  - **Detail:** `https://<slug>.devfolio.co/`, 1.5 s. "Runs from Oct 31 - Nov 2, 2026", "Happening: Online" or a city, prize pool, team size, fee ("Nada"), and the organiser's free text.
- **Fails:** the "Applications close in" countdown is rendered by JavaScript and comes back empty.
- **Gap examples (read today):**

  | Hackathon | Listing says | Detail page says | Gap |
  |---|---|---|---|
  | Version Beta 9.0 (Bhopal, offline) | "Open · Starts 30/10/26" | "Registration and Ideation Phase … ending on October 23rd" | **Registration closed 7 days before the start, while the listing still says Open** |
  | Hacknauts 2.0 (Ludhiana, in person) | "Open · Starts 14/11/26" | "PPT Submission Deadline: 30 October 2026", event Nov 14–15 | 15 days |
  | Lean In Hacks 8.0 (online) | "Open · Starts 31/10/26" | "at least 1 female in your team!" | Team rule the persona must know about |

- **Lookout can say:** "Hackathon starts 30 Oct 2026 (Devfolio). Registration close date not published on the listing."
- **Lookout must not say:** "Deadline 30 Oct".

### MLH (keep, filtered to India)
- **Works:**
  - **URL:** `https://mlh.io/seasons/2027/events`
  - **Result:** about 80 upcoming events, 5 s.
  - **Readable fields:** name, "OCT 31 - NOV 01", "City, Region, CC", In-Person, tags (HARDWARE, DIVERSITY, HIGH SCHOOL).
- **India events this season:**
  - **Upcoming:** hackCBS 9.O, New Delhi, 31 Oct – 1 Nov 2026.
  - **Already past:** Innohacks 4.0 (Ghaziabad) and HackBIOS (Bhilai).
- **Event site (hackcbs.tech):** confirms 31 Oct – 1 Nov 2026, in person at Shaheed Sukhdev College of Business Studies, students only (ID checked), no registration fee, teams of 2–4, teams shortlisted from the registration form. **No registration close date is published.**
- **Lookout can say:** "Event starts 31 Oct 2026 (MLH, New Delhi, in person, students only)".

### Dropped
- **GDG community events:** the page renders only navigation (321 chars).
- **Smart India Hackathon:** `proxy_error`. Worth one retry, because SIH matters to Indian CE students.
- **Unstop listing and API:** see above.

## The core problem: start date vs registration deadline

1. **Only Devpost, Unstop and Hack2skill publish a machine-readable registration or submission close date.**
2. **Devfolio and MLH publish start dates.** The real close date is either absent (MLH/hackCBS) or buried in organiser text (Devfolio).
3. **The listing status can be wrong.** Version Beta 9.0 showed "Open" a day after its registration closed.

**Rule for Lookout** (matches `deadlineLabel` in `docs/EVENT_SCHEMA.md`):
- Use the real close date when the source publishes one: label "Registration closes" or "Submissions close", `dateSource: parsed`.
- Otherwise show the start date with the label "Hackathon starts" or "Event starts", plus a visible note: "registration may close earlier".
- If the organiser text states an earlier close date (e.g. Devfolio free text), prefer it. If that date is past, drop the event.

## Recommended sources for the Opportunities district

| Priority | Source | Why |
|---|---|---|
| 1 | Devpost JSON | Online, real deadlines, one fast request |
| 2 | Unstop (Search + detail) | Most Indian student hackathons, real registration deadlines |
| 3 | Hack2skill listing | Real registration end dates, Indian events (time zone to verify) |
| 4 | HackerEarth JSON | Clean ISO dates, small list |
| 5 | Devfolio listing + detail | Big Indian list, but start dates only: label honestly |
| 6 | MLH | India filter leaves 1 upcoming event; useful as a credibility signal |

**Suggested addition:** `docs/EVENT_SCHEMA.md` has no `deadlineLabel` row for Hack2skill. Propose "Registration closes" to Samrat.

## Persona filter (B.Tech CE, 2nd year, male, Maharashtra; online OK)

Keep an event if **all** of these hold:
1. **Still open:** deadline or start date is today or later. For Devfolio, also check the organiser text for an earlier close.
2. **Location:** mode is online or virtual, or the location is in Maharashtra. In-person events elsewhere in India stay in the list, ranked lower and tagged "travel".
3. **Who may enter:** not restricted to women only (e.g. GoDaddy Inclusive Innovation), high-school only (MLH tag "HIGH SCHOOL"), first-years only, or invite-only (Devpost `invite_only`).
4. **Team rules:** show them as a caveat, not a filter (e.g. Lean In Hacks: "team needs at least one woman").

**Honest note:** no in-person hackathon located in Maharashtra appeared in today's samples. Every match was online or out of state (Bhopal, Ludhiana, New Delhi). The district will mostly show online events unless an Unstop or Hack2skill search finds a Maharashtra one. **needs_verification:** search Unstop with "Pune", "Mumbai" or "Nagpur" hackathon queries before the demo.

## Tasks for Aniket
- [ ] Re-run one Fetch per kept source on the day you commit and update the examples.
- [ ] Resolve the three needs_verification items (HackerEarth `end_tz` meaning, Hack2skill time zone, a Maharashtra in-person event).
- [ ] Retry Smart India Hackathon once.
- [ ] Add one more source if you find one that passes the same test (e.g. a college-fest listing). Record exactly what worked and what failed.
