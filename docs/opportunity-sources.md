Draft prepared with Claude for Aniket Gupta. The author must read it, verify it, and edit it before committing.

# Opportunity and event sources: used, not used, and why

The status of each hackathon and event source in the app as of 2026-10-25. The detailed test notes (fields, examples, gotchas) are in `opportunities-source-report.md` at the repo root. They are not repeated here. This file tracks what the code uses today and what you have confirmed.

In the code:
- The Opportunities scout is `oppsScout` in `server/src/liveRun.js`. On screen it is "Hacky", in the Opportunities district.
- Parsers: `server/src/parse/opps.js`.
- Persona filter: `assessEvent` in the same file.
- The whole district can be switched off with `OPPORTUNITIES=off` in `server/.env`.
- The "not used" reasons below are the ones the app prints in the plan's sources footer (`SOURCES_NOT_USED` in `liveRun.js`).

How to fill the last column: open the URL yourself, or run one TinyFish Fetch on it. Note your name, the date, and the result: still works, changed (say how), or fails (give the error).

## 1. Used in the live run

| Source | URL read | How it is read | Date we show | Caveat shown in the app | Confirmed by / date / result |
|---|---|---|---|---|---|
| Devpost (JSON feed) | https://devpost.com/api/hackathons?status[]=upcoming&status[]=open | TinyFish Fetch. The JSON comes back markdown-escaped and is unescaped before parsing (`parseFetchedJson`). | The end of `submission_period_dates` (submission close) | Prize shown only from `prize_amount` on the feed. Country and age rules are not in the feed. | |
| HackerEarth (JSON feed) | https://www.hackerearth.com/chrome-extension/events/ | TinyFish Fetch, same unescape | `end_tz` | Marked "needs verification": `end_tz` may be the challenge end, not the last day to register. | |

Persona filter for both (`assessEvent`):
- Online: match.
- In person in Maharashtra (Mumbai, Pune, Nagpur, Nashik, Thane): match.
- In person elsewhere in India: conditional ("needs travel").
- Outside India, invite-only, closed, or restricted to women: not applicable, with the reason shown.

## 2. Not used in the live run

| Source | URL tested | Why not used (as the app states it) | Confirmed by / date / result |
|---|---|---|---|
| Unstop | Search `include_domains=unstop.com`, then detail pages | Works only as Search plus one detail Fetch per event. Left out of the slim scout. The listing (https://unstop.com/hackathons) shows a cookie wall. The public API returned stale 2023-2025 items. | |
| Hack2skill | https://hack2skill.com/hackathons-listing | Readable, but deadlines are shown in US time zones (EST/EDT), which needs verification. | |
| Devfolio | https://devfolio.co/hackathons | Publishes start dates, not registration deadlines. We do not present a start date as a deadline. | |
| MLH | https://mlh.io/seasons/2027/events | Same reason as Devfolio (event dates only). | |
| Devpost detail pages | for example https://paypalaihackathon.devpost.com/ | `bot_blocked` in recon. We read the JSON feed instead and never work around a block. | |
| HackerEarth HTML listing | https://www.hackerearth.com/challenges/hackathon/ | Empty HTML shell. The JSON feed is used instead. | |
| GDG community events | https://gdg.community.dev/events/ | Renders an empty shell. | |
| Smart India Hackathon | https://www.sih.gov.in/ | `proxy_error` in recon. Worth one retry. | |

## 3. Adding a new source

A source goes into the app only if it passes a real test first. Rule from `docs/RECON_FINDINGS.md`: a source is kept only if Fetch returns real content with dates.

1. Test it.
   - Run one TinyFish Search (with `include_domains` set to the site) and one TinyFish Fetch on the listing or a detail page. Use the team key on Samrat's machine, or your own TinyFish account.
   - Never paste a key into a file, a chat or a commit.
2. Write down:
   - the exact URL that worked;
   - the date you tested it;
   - how long the Fetch took;
   - which date fields are on the page, with an example line copied from the result;
   - whether the date is the registration close or only the event start.
3. Reject it if any of these is true:
   - Fetch returns no dates.
   - The page needs a login.
   - The site blocks bots (403, `bot_blocked`, captcha).
   - robots.txt disallows the path.

   We do not work around blocks.
4. Add a row to section 2 of this file, and a section to `opportunities-source-report.md` with the test result.
5. Hand it to Samrat for the code. He will:
   - save the raw Fetch output as a fixture in `server/test/fixtures/`;
   - add a parser in `server/src/parse/opps.js` with a test;
   - add the URL to `oppsScout` in `server/src/liveRun.js`.

   All calls go through the Gatekeeper (cache, at most 2 concurrent calls, per-host spacing, robots.txt).
6. Date rule:
   - Use a close date only if the page publishes it.
   - If the page shows only a start date, label it "Hackathon starts" or "Event starts", never "Deadline".
   - If nothing is published, the app says "not published".
