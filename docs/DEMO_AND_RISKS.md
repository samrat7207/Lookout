# Demo Script and Risks

## 3-minute demo script

| Time | Say | Show |
|---|---|---|
| 0:00 | "Scholarship deadlines in India are spread across portals. NSP alone has 30+ schemes. The main NSP deadline is **7 days from today**." | City idling, slow camera orbit |
| 0:20 | "Our sample student is in B.Tech Computer Engineering, from Maharashtra, OBC. He types that once." | Fill the form, press **Run (LIVE)** |
| 0:30 | "Each little character is a TinyFish agent. Blue goes to the National Scholarship Portal, red to MahaDBT." | Characters walk. The NSP building shows the 🔍 icon. |
| 0:40 | "TinyFish Search already found the headline: **31 October**." | Countdown banner appears, blue character glows |
| 0:50 | "Now TinyFish Fetch reads every scheme and its dates from the live portal." | 📄 icon, a burst of bubbles: "PM YASASVI (OBC, college): closes 31 Oct!" |
| 1:10 | "MahaDBT found state OBC schemes, plus a catch: AY 2026-27 applications are only on MahaDBT 2.0. We say that plainly. We don't invent a date." | Red character's bubble, the plan note |
| 1:30 | "The Watchtower is a TinyFish Monitor on the NSP scheme page. It re-checks every morning and flags any date change." | Watchtower lamp lights, "checked 10:16" |
| 1:45 | "Town Hall puts scholarships and hackathons into one list, soonest deadline first. Every item links to its source." | Plan panel. Click a source link and the real portal opens. |
| 2:00 | "Each scholarship has an Application Kit: documents, his details prefilled, steps. It never submits anything, and never asks for passwords, OTPs or Aadhaar." | Open the PM YASASVI kit, and point at the safety notice |
| 2:15 | (Optional) "The purple diver is a full TinyFish browser agent on MahaDBT 2.0. It's slow, so the plan never waits for it." | Deep Diver bubble with a PROGRESS line |
| 2:30 | "If the Wi-Fi dies, MOCK MODE replays a recorded real run. Same events, same city." | Flip the toggle, show the mode badge |
| 2:45 | "Lookout: one form, a city of agents, one plan with dates and sources." | Final plan view |

**Default on stage:** start in **LIVE** only if the venue Wi-Fi tested fine within the last 10 minutes. Otherwise start in MOCK and say so. Honesty plays better with judges.

## Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Venue network flaky | High | High | MOCK MODE with the golden run. Disk cache in live mode. Phone hotspot as a backup. |
| R2 | Government site slow or down during the demo | Med | High | Fetch timeout of 150 s, retry once, disk cache fallback, then mock |
| R3 | NSP page format changes | Low | High | The parser is tested against a fixture. If it finds 0 schemes, show raw evidence with the date marked "unparsed". The Watchtower would flag it. |
| R4 | Agent API takes 4 to 9 minutes or fails | High | Low | Never on the critical path. 7-minute cap, then cancel. It's a bonus character. |
| R5 | Wallet empty, so Monitor or Agent fail with 402 | Med | Med | Check `GET /v1/wallet` in Stage 3 step 1. Watchtower and Deep Diver stand down gracefully. Scouts use the free tier. |
| R6 | MahaDBT SchemeData URLs are opaque, so name→URL mapping is hard | Med | Med | Get the html format of the landing page for anchor text. Fallback: fetch a fixed shortlist of OBC/SC/ST pages discovered in recon. |
| R7 | Rate limit (Search 30/min) during repeated rehearsals | Low | Low | Cache. Only about 3 searches per run. |
| R8 | API key leaks to the browser or git | Low | Critical | Server-only client, `.env` gitignored, a grep check in the Stage 3 acceptance (passing as of the current code) |
| R9 | 3D scope creep | High | Med | 5 buildings plus one cuttable district, primitives only, a design freeze at the end of Stage 2 (the city itself is frozen at the end of Stage 1) |
| R10 | The deadline passes (31 Oct) before judging | Low | Med | The hackathon is 24 to 25 Oct, so we are fine. The countdown logic uses `today` from the event (the recording keeps its own date). |
| R11 | The scheme matching looks wrong to a judge | Med | Med | Show "why it matches" (the keywords) on every item. Show the eligibility evidence line. |

## Fallback ladder (on stage)
1. LIVE run
2. LIVE run, served from cache (`cached` badge)
3. MOCK: golden run at 1.5×
4. A screen recording of the golden run (record one in Stage 6)
