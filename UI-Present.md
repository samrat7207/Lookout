# Pitch deck outline, demo script and judge Q&A

| | |
|---|---|
| **What this is** | The pitch deck outline, a 2-minute demo script for the mentor round and the final round, and 12 likely questions with honest answers. Every claim is backed by the repo or `docs/RECON_FINDINGS.md`. |
| **Owner** | Aniket Gupta. Commit to `team/aniket/pitch-and-demo-script.md` from your own git account. |
| **Lookout feature** | The whole product as presented: the city (Stage 1), the stream-driven characters (Stage 2), real data (Stage 3), the plan screen and Application Kit (Stage 4), the Opportunities district (Stage 5), mock mode (Stage 6). |
| **Status as of 2026-10-24** | **Built and committed:** Stage 1 city; server event bus, SSE stream with resume, JSONL recorder, scripted fake run, mock replay engine, NSP parser, TinyFish client skeleton, plan sorter, Application Kit builder (16 passing tests). **Not built yet:** characters on the stream (S2), live TinyFish scouts (S3), plan and kit screens (S4), Opportunities scout and Watchtower monitor (S5), mock-mode UI and golden recording (S6). |
| **Verify before presenting** | Re-check every "built" claim against `docs/MILESTONES.md` on the day. Move a beat from "final round" to "mentor round" only when its stage is committed. |

## Tasks for Aniket
- [ ] Rehearse the mentor-round script out loud 3 times with a timer. Cut lines until it fits **2:00** with 10 s to spare.
- [ ] Rehearse the final-round script once Stage 4 is committed; cut it the same way.
- [ ] Add your own notes under each beat (what to point at, what to say if something lags).
- [ ] Practise the 12 answers. Replace any answer whose facts change as stages land.
- [ ] Never demo a feature that is not committed. If unsure, say "planned for Stage N".

---

## Pitch deck outline (one line per slide)

1. **Lookout: Scholarship Season.** One form, a city of TinyFish agents, one plan with dates and sources.
2. **The problem.** NSP alone lists 31 schemes, each with its own dates (read 24 Oct 2026). State portals and private listings add more. Students miss deadlines.
3. **The hook.** Most NSP schemes close for students on **31 Oct 2026**, 7 days from the hackathon start.
4. **Who it's for.** A sample student: male, B.Tech Computer Engineering, 2nd year, OBC, Maharashtra.
5. **What Lookout does.** Agents read official pages live, Town Hall merges scholarships and hackathons into one list sorted by deadline, and each scholarship gets an Application Kit.
6. **Why TinyFish.** Search finds the pages, Fetch reads them (NSP list in about 2 s), Monitor watches for date changes, and the Agent API is an optional side quest.
7. **What we tested, honestly.** NSP and MahaDBT 1.0 work. Buddy4Study and Vidyasaarathi detail pages work. AICTE sites (403) and the Karnataka, UP and West Bengal portals failed; Telangana's loaded but had no dates.
8. **Accuracy over guessing.** Deterministic parsing and rules with a quote and source for every rule. Unclear rules are flagged, never guessed.
9. **Safety.** Lookout never submits forms and never asks for, enters or stores passwords, OTPs or Aadhaar numbers. The kit builder refuses to emit a kit that breaks this (unit-tested).
10. **The city.** An isometric low-poly city, where each landmark is a source and characters move only on real events. 29 draw calls.
11. **Architecture.** Server-only TinyFish key, SSE event stream, JSONL recordings, and mock mode replaying a real run.
12. **Status.** What is built, what is next (the stage list). No overclaiming.
13. **Team.** Samrat Kunte (lead, city, backend, integration), Aman Kumar (Application Kit data, eligibility rules), Aniket Gupta (opportunities research, pitch and demo).
14. **Ask / close.** "One form. A city of agents. A plan you can trust, with a source for every date."

---

## Demo script: mentor round (what exists today), 2:00

Open: `web/` running (`npm run dev`) and a terminal with `server/` running (`npm start`).

| Time | Say | Show |
|---|---|---|
| 0:00 | "Scholarship deadlines in India are scattered. NSP alone lists 31 schemes. Most close for students on 31 October, a week from now." | The city, idle |
| 0:15 | "This is Lookout's city. Each landmark is a source our TinyFish agents read." Hover **Central Scholarships Hall**: "NSP, the National Scholarship Portal." | Hover card on the NSP Hall |
| 0:30 | Hover **State Scholarships**: "State schemes. For Maharashtra that's MahaDBT; we tested four other state portals and they failed, so we say so." | Hover card |
| 0:40 | Hover **Private & Foundation**: "Corporate and foundation awards from listings like Buddy4Study." | Hover card |
| 0:50 | Hover **Watchtower**: "Planned: a TinyFish Monitor re-checks NSP dates and flags changes." Hover **Opportunities**: "Planned: hackathons for a CE student." | Beacon sweeping; district hover card |
| 1:05 | Hover **Town Hall**: "Town Hall builds the plan." Switch to the terminal: `curl -X POST …/api/runs -d '{"mode":"fake"}'` then `curl -N …/events`. "This is the event stream the city will animate from. It's a scripted run built from real recon data." | Events scrolling: agent.walking, agent.found, plan.ready, kit.ready |
| 1:30 | "One plan, all kinds, sorted by deadline. Every item has its source URL. Scholarships come with an Application Kit." | Point at a `plan.ready` line and a `kit.ready` line |
| 1:45 | "The kit never holds a password, OTP or Aadhaar number. A test fails if it ever does. Next: characters walking on this stream, then live TinyFish reads." | Optionally `npm test`: 16 passing |
| 2:00 | End | |

## Demo script: final round (target, only when Stages 2–6 are committed), 2:00

| Time | Say | Show |
|---|---|---|
| 0:00 | "Scholarship deadlines are scattered across portals; most NSP schemes close on 31 October." | City idle |
| 0:10 | "Our sample student: male, B.Tech CE, 2nd year, OBC, Maharashtra. He types that once." | Profile form ("sample student"), press Run |
| 0:20 | "Each character is a TinyFish agent." Blue walks to the **Central Scholarships Hall**: "Search finds NSP's notice; Fetch reads every scheme and its dates." | Bubble: "PM YASASVI (OBC, college): closes 31 Oct" |
| 0:40 | Red at **State Scholarships**: "MahaDBT's OBC schemes, plus a catch: AY 2026-27 applications are only on MahaDBT 2.0, and no deadline is published. We say that instead of inventing one." | Bubble and plan note |
| 0:55 | Green at **Private & Foundation**: "Buddy4Study detail pages, e.g. HDFC Parivartan, which names B.Tech, closes 31 Oct." | Bubble |
| 1:05 | Purple at the **Opportunities district**: "Hackathons too, labelled honestly: 'Submissions close' when the source says so, 'Starts' when that's all it says." | District lights up |
| 1:15 | **Watchtower** lamp: "A TinyFish Monitor watches NSP dates and flags changes." | Lamp, "checked at HH:MM" |
| 1:25 | **Town Hall** → plan screen: "One list, sorted by deadline, with tags and a 'why you match' line. CSSS warns it conflicts with the state freeship." | Plan panel |
| 1:40 | Open a kit: "Documents from the official page, his details prefilled, steps, the deadline. It never submits anything and never asks for Aadhaar, OTPs or passwords." | Kit drawer with the safety notice |
| 1:52 | "If the Wi-Fi dies, mock mode replays a recorded real run through the same stream." | Flip the MOCK toggle |
| 2:00 | "Lookout: one form, a city of agents, a plan with a source for every date." | |

---

## What the TinyFish Agent API can and cannot do here
(from `docs/TINYFISH_INTEGRATION.md` and `docs/APPROACH.md`)

**It can:**
- Run a browser agent on a real site from a goal, streaming progress (run-sse).
- Return structured output to a JSON schema.
- Read JavaScript-heavy pages that plain Fetch cannot.

**In Lookout, and its limits:**
- **Never on the critical path.** Runs take 4–9 minutes and are unreliable on complex government forms. It's an optional "Deep Diver" side quest (e.g. find the AY 2026-27 last date on MahaDBT 2.0), capped at 7 minutes, and the plan never waits for it.
- **Not used to log in or submit anything.** That's a product rule, not a technical limit.
- **No resume.** An SSE stream that drops cannot be resumed; we poll the run instead.
- **Uses wallet credit.** Search and Fetch have free tiers.
- **Not built yet:** the Deep Diver is planned for Stage 6, if time allows.

---

## 12 likely questions, with honest answers

1. **"Is the data live?"** The recon was live: TinyFish Search and Fetch on 24 Oct 2026, results in `docs/RECON_FINDINGS.md`. The live scouts are Stage 3 and need our API key in the server. Today's stream is a scripted run built from that real data.
2. **"How is this better than NSP's own eligibility page?"** NSP has an eligibility page for NSP schemes (linked from its menu). Lookout adds state and private sources and hackathons, and puts them all in one deadline-sorted list with documents to gather. We have not measured accuracy against NSP's checker.
3. **"What if a portal changes its layout?"** The NSP parser is tested against a saved copy of the page (31 of 31 schemes). If it finds nothing, we show the raw evidence instead of a fake date. The planned Watchtower re-checks NSP with a TinyFish Monitor.
4. **"How do you know someone is eligible?"** Deterministic rules, each with a quote and a source URL. Missing facts (income, marks) make a scheme "conditional", not a match. Unclear pages are flagged. Checking official pages caught our own mistake: our sample data listed two MahaDBT schemes the official pages exclude for OBC students.
5. **"Why not just use an LLM?"** We want every line explainable on stage: "we read this sentence, here's the link". Rules are free, fast and testable. An LLM could help read messy pages later, but it would not decide eligibility.
6. **"What about privacy and Aadhaar?"** Lookout never submits forms and never asks for, enters or stores passwords, OTPs or Aadhaar numbers. Kits only list those fields as "enter this yourself", and a unit test fails if one ever has a value. The TinyFish key stays on the server.
7. **"Isn't the 3D city a gimmick?"** The value is the plan. The city shows the agents' real work in real time: characters move only on stream events. It's cheap to run (29 draw calls) and degrades to mock mode.
8. **"What happens if the Wi-Fi fails during the demo?"** The replay engine exists and is tested: mock mode streams a recorded run through the same endpoint. The UI toggle and a recorded golden run are Stage 6.
9. **"Which states do you cover?"** Maharashtra's state portal (MahaDBT 1.0) works. We tested Karnataka SSP, UP, West Bengal and Telangana: three were unreachable and one had no dates. Everyone else gets NSP and private sources, and we say "state portal not covered".
10. **"How accurate are the hackathon deadlines?"** Only Devpost, Unstop and Hack2skill publish real close dates. Devfolio and MLH show start dates, so we label them "starts". We found one listed as "Open" after its registration had closed.
11. **"What does the Agent API add?"** See the section above: a slow, optional deep dive for pages Fetch cannot read. It's never on the critical path and never submits anything. Not built yet.
12. **"How did the team split the work, and what's next?"** Samrat built the city and backend. Aman owns the kit data and eligibility rules. Aniket owns opportunities research and the pitch, each committing under their own name. Next: Stage 2 (characters on the stream), then live data in Stage 3.

## Things never to say
- "It applies for you" or "it fills the form." It doesn't, by design.
- "All states covered", or "real-time" for anything that is still the scripted run.
- Any number not in the repo or the recon notes (no invented user counts, accuracy percentages or savings).
