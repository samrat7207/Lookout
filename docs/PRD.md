# PRD: Lookout, "Scholarship Season"

## 1. Problem

An Indian student who wants a scholarship has to check several government portals and private listings, each with its own layout, scheme list and deadline. The National Scholarship Portal (NSP) alone lists 30+ schemes. Each has an "open from" date, a "student application open till" date and verification dates. State portals like MahaDBT add dozens more, and corporate and foundation scholarships (listed on Buddy4Study, Vidyasaarathi and similar) add more again. Eligibility depends on course, state, category (SC/ST/OBC/EWS/General/Minority), gender, disability and income.

Students miss deadlines because:
- the information is spread across portals and PDFs
- the dates are buried in announcement text
- nobody tells them which 3 schemes are worth their time this week
- even once they pick a scheme, they don't know which documents to gather before the portal asks for them

A Computer Engineering student also has a second stream of deadlines: hackathons and tech events, spread across Devfolio, Unstop, MLH, Devpost and HackerEarth.

## 2. User

**Primary:** an undergraduate or diploma student in India. For the demo, this is a student in Maharashtra, so NSP (central), MahaDBT (state) and private/foundation listings all apply.

**Demo persona:** male, B.Tech Computer Engineering, **2nd year**, OBC, Maharashtra. The UI labels this persona **"sample student"**, with no invented name.
- On NSP he matches PM YASASVI Top Class Education in College (OBC, EBC, DNT) and PM-USP CSSS (merit, renewal). AICTE Swanath (Technical Degree) is listed as conditional, because it is for orphans and wards of armed forces martyrs. AICTE Pragati (girls) is **excluded** for this persona.
- On MahaDBT he conditionally matches two OBC schemes: Post Matric Scholarship to OBC Students and Tuition Fees and Examination Fees to OBC Students (income, CAP admission and attendance are not in the profile). The Rajarshri Chhatrapati Shahu Maharaj Fee Reimbursement (meant for EBC/EWS) and the Dr Panjabrao Deshmukh Hostel Maintenance Allowance (General and SEBC only) are **not** for him.
- The plan warns about two conflicts: PM YASASVI (college) vs PM-USP CSSS (NSP allows one merit scheme), and CSSS vs a state fee reimbursement or freeship.
- On private listings he matches open B.Tech or UG schemes such as HDFC Parivartan ECSS (deadline 31-Oct-2026 on Buddy4Study).
- On hackathon boards he matches online events, and in-person events in India, that are open to undergraduate students.

## 3. Product in one sentence

Enter course, state and category once. Watch a tiny city of TinyFish agents go and read the real sources. Get back one plan in which every scholarship, hackathon and event has a deadline, a days-left count and a source link, sorted by deadline. Each scholarship has an Application Kit so the student can apply on the official site without guessing.

## 4. Must-haves (P0)

| # | Requirement | Acceptance check |
|---|---|---|
| P0-1 | Single input form: course, state, category (plus optional gender and disability toggles) | One submit starts a run. No other input is needed. |
| P0-2 | Backend holds the TinyFish key and streams events over SSE | Search the built web bundle and the network tab for the key. It is not there. |
| P0-3 | NSP Scout uses TinyFish **Search + Fetch** on scholarships.gov.in | The plan shows NSP schemes with the real "Student Application Open till" dates |
| P0-4 | MahaDBT Scout uses TinyFish **Search + Fetch** on mahadbt.maharashtra.gov.in | The plan shows MahaDBT schemes with eligibility and a source URL |
| P0-4b | Foundations Scout uses TinyFish **Search** (to discover pages) **+ Fetch** (to read them) on the private listings that passed recon: Buddy4Study detail pages and Vidyasaarathi scheme pages (RECON_FINDINGS §3) | The plan shows private/foundation scholarships with the deadline read from the page, and a source URL |
| P0-5 | Town Hall produces **one dated, sourced plan**. All kinds (scholarship, hackathon, event) are merged into **one list sorted by deadline** (soonest first, "no date published" last). Ineligible and closed items are filtered out. | Each item shows: kind badge, title, source, deadline (or "not published"), days left, why it matches, source URL, and for scholarships a "View Application Kit" button |
| P0-6 | NSP student last date **31-10-2026** is shown first and loudest | It is the top banner or top-ranked item, with a countdown |
| P0-7 | Isometric low-poly 3D city with 5 labelled landmarks: **Central Scholarships Hall (NSP)**, **State Scholarships**, **Private & Foundation Scholarships**, **Watchtower** and **Town Hall** (CITY_DESIGN §2). Characters are driven by the **real event stream**. No portal other than NSP is named in the UI. | Characters move only in response to events, never on fixed timers. Hovering a landmark shows its name. |
| P0-8 | Characters light up and show a speech bubble with what they found | Every `agent.found` event shows a bubble |
| P0-9 | **MOCK MODE** toggle replays a recorded real run | It works with Wi-Fi off. The visuals are the same as live. |
| P0-10 | **Application Kit** for each scholarship in the plan: required documents, the form fields with the persona's values prefilled, a step list, the deadline and the source link. **Read-only and prefill-only.** | The kit panel shows the notice "Lookout never submits forms and never asks for, enters or stores passwords, OTPs or Aadhaar numbers." Sensitive fields (Aadhaar, OTP, password, bank account) are listed as "enter this yourself on the official portal" and are never prefilled. |
| P0-11 | The persona is labelled **"sample student"** wherever it appears in the UI | No invented name appears in the UI |

**Build order.** These requirements are delivered across the 6 stages in MILESTONES: P0-7 city (Stage 1); P0-8 characters and bubbles on the stream (Stage 2); P0-2, P0-3, P0-4 and P0-4b real data (Stage 3); P0-5, P0-6, P0-10 and P0-11 plan, kit and persona UI (Stage 4); P1-1 and P1-6 Watchtower and Opportunities (Stage 5); P0-9 mock mode and the remaining P1s (Stage 6). P0-1 (the form) lands in Stage 4. Until then, Stage 2 uses a "Run (fake)" button.

## 5. Should-haves (P1)

| # | Requirement |
|---|---|
| P1-1 | Watchtower uses TinyFish **Monitor** on the NSP All-Scholarships page, and shows "last checked" and any date changes |
| P1-2 | One narrow, optional **Agent API** task (e.g. read the AY 2026-27 notice on MahaDBT 2.0). It is shown as a "deep diver" character. The plan never waits for it. |
| P1-3 | Playback speed control in mock mode (1×, 2×, 4×) |
| P1-4 | Export the plan as Markdown or copy it to the clipboard |
| P1-5 | Click a building to see the raw findings from that portal |
| P1-6 | **Opportunities district**: an Opportunities Scout uses TinyFish **Search + Fetch only** on the hackathon sources that passed recon (Devfolio, MLH, Devpost, HackerEarth, Unstop; RECON_FINDINGS §4). Its items join the same deadline-sorted plan as `kind: hackathon` or `kind: event`. **It can be cut:** with `OPPORTUNITIES=off` the agent is not spawned, the district is not drawn, and the plan holds scholarships only. Nothing else changes. |

## 6. Non-goals

- Applying for scholarships, logging in, OTR or Aadhaar flows. **Lookout never submits forms, and never asks for, enters or stores passwords, OTPs or Aadhaar numbers.** The Application Kit is a checklist, not an autofill bot.
- Registering for hackathons on the student's behalf.
- More than 1 city, or more than 5 buildings plus the Opportunities district.
- States other than Maharashtra for the state portal. Other states get NSP plus private listings, with an honest "state portal not covered" note. The Karnataka, UP, West Bengal and Telangana portals all failed recon (RECON_FINDINGS §3).
- Ranking with an LLM. Ranking is deterministic and explainable (see APPROACH).
- Accounts, persistence of user profiles, mobile-native app.
- External 3D assets, textures or models.

## 7. Success criteria for judging

1. **TinyFish is the engine, not decoration.** Search, Fetch, Monitor (and Agent, optionally) each have a visible job in the city.
2. **Real data.** Every plan item links to the page it came from. Every Application Kit cites the page its documents list came from.
3. **It never breaks on stage.** Mock mode is one toggle away and looks the same.
4. **Clear value in 10 seconds.** "You have 7 days. Apply to these 3 first."

## 8. Constraints

- 24 hours, from scratch.
- Agent API runs take 4 to 9 minutes and are unreliable on complex government forms, so they are never on the critical path.
- TinyFish limits: Search 30 requests per minute; Fetch 150 URLs per minute and 10 URLs per request. See TINYFISH_INTEGRATION.
- Government sites can be slow, so allow up to 150 s per Fetch request on the client side.
