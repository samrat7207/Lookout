Draft prepared with Claude for Aniket Gupta. The author must read it, verify it, and edit it before committing.

# Technical Q&A and demo runbook

For the next round. Based on the code and docs as of 2026-10-25. Longer answers are in `docs/JUDGE_QA_TECH.md` and `docs/TECHNICAL_OVERVIEW.md`. Re-check every "built" claim against `docs/MILESTONES.md` on the day.

## 1. Lookout in plain words

A student's scholarship and hackathon deadlines are spread over many websites. Lookout reads those public pages for one student profile and returns one list, sorted by deadline. Every item shows the page it came from and when that page was read. The 3D city is a picture of the work happening: each character is a small program reading one source, and each building is a source.

Lookout never logs in anywhere. It never submits a form, and never asks for a password, OTP or Aadhaar number. For each scholarship it gives a read-only checklist (the Application Kit), and the student applies on the official portal.

## 2. Five-fact cheat sheet

1. **Sources:**
   - NSP, MahaDBT 1.0 and Buddy4Study detail pages for scholarships.
   - The Devpost and HackerEarth JSON feeds for hackathons.
   - All read with TinyFish Search and Fetch only.
2. **Dates:** a deadline comes only from text on a fetched page. If there is none, the app says "deadline not published".
3. **Ranking:** soonest deadline first, then fit (match, then conditional, then unclear). Nothing else. Every row says why it is where it is.
4. **Safety:** no login, no form submission, no passwords, OTPs or Aadhaar numbers. The server refuses to build a kit that holds any of them.
5. **Modes:**
   - Live reads the web now.
   - Replay plays a real run recorded earlier.
   - Mock plays a scripted run.
   - If Live cannot start, the app switches to Replay by itself and says so on screen.

## 3. Fifteen likely technical questions

**1. What is the architecture?**
- One Node.js (Express) server and one React web app.
- On the server, an orchestrator (the "Mayor") starts several workers in parallel. Each worker reads one source.
- Every step is an event. Events go to the browser over Server-Sent Events, and are also written to a file.
- The city and the plan screen are both built from those events. (Samrat)

**2. Is there an AI model making decisions?**
No. There is no LLM anywhere. Reading dates, applying eligibility rules and sorting are plain deterministic JavaScript. "Agent" here means a named worker with a job and a character in the city.

**3. How does the browser get live updates? What if the connection drops?**
- Server-Sent Events. Every event has a sequence number.
- If the connection drops, the browser reconnects with `Last-Event-ID` and gets only the events it missed. The client also drops duplicates.
- A page reload resumes the same run. (Samrat)

**4. Why TinyFish Search and Fetch, and not the Agent API?**
- Our sources can be read as pages or JSON feeds, so Fetch is enough.
- The Agent API is for sites that need clicks or forms. It is slower, costs more and is less predictable, which is risky in a live demo.
- We do not use it, and we never use anything to log in or submit.

**5. Do you use TinyFish Monitor for re-checks?**
- No. The Watchtower re-checks only when you press "Re-check now" on the plan.
- Scheduled re-checks with notifications are planned, not built.

**6. How is the ranking decided?**
- Deadline first, then fit, then title. The same input always gives the same order.
- Every row has a "Why this ranking" line.
- That is also why a replay looks exactly like the live run.

**7. How do you avoid hammering or getting blocked by websites?**
Every web call goes through one module, the Gatekeeper:
- a 30-minute cache;
- at most 2 calls at once;
- spacing between calls to the same host;
- backoff with jitter on 429/503;
- robots.txt is read and followed.

If a site blocks us (403, 429, `bot_blocked`, captcha), we stop calling that host for 30 minutes, show it in red, and never try to get around the block. (Samrat)

**8. What is mock and what is real?**
- **Live** reads real pages now.
- **Replay** plays back a real live run recorded on 2026-10-24 (`recordings/real-run.jsonl`).
- **Mock** is a scripted run built from earlier recon data. Its Verifier says "could not verify (mock)".

The badge in the top bar always shows which one is running.

**9. What happens if TinyFish or the Wi-Fi fails during the demo?**
- If Live cannot start (no key, a bad key, or no network), the server replays the last real recording and shows "Replaying recorded run" with the reason.
- If one source fails during a run, that source shows in red and the rest of the plan still builds.
- Replay and Mock need no internet.

**10. How do you know a date is right?**
- A parser written for that source reads the date from the fetched text, and the exact line is kept as evidence.
- The Verifier then re-opens the page and checks that the scheme name and that date are still there. The result is a badge: verified, changed, or could not verify. (Aman for examples)

**11. Why does one item say "Verified" and "needs verification" at the same time?**
They answer different questions:
- "Verified" means the date is still on the source page.
- "needs verification" means we decided you may qualify from the scheme name or a few keywords, so the student should confirm eligibility on the official guideline. (Aman)

**12. Where is data stored? Do you have a database?**
- There is no database (planned).
- A run lives in server memory for an hour.
- Recordings are JSONL files.
- The last 20 finished runs are saved in a JSON file for the History view.
- The student profile is not stored anywhere else.

**13. How would this scale? CDN, load balancer?**
- Not built (planned). Today it is one process on one laptop.
- The design helps: the expensive part, reading sources, is the same for every student, so it is cached and shared. Per-student work is a few milliseconds of local code.
- Next steps would be a shared cache, a database, and scheduled re-checks. A CDN and a load balancer only matter after that. (Samrat)

**14. How is the TinyFish key protected? Do you use a TEE or other secure enclave?**
- The key is in `server/.env`, which git ignores. Only one file on the server reads it. The browser never talks to TinyFish.
- We checked that the key is not in any commit or recording.
- No TEE or secure enclave (not built, planned). We hold no student secrets to protect: we never collect passwords, OTPs or Aadhaar numbers.

**15. What does not work yet?**
- MahaDBT 2.0 (where Maharashtra's AY 2026-27 applications go) does not load through the proxy, so MahaDBT deadlines say "not published".
- Eligibility is rule- and keyword-based, so it can be wrong at the edges. That is why the app shows "needs verification".
- One sample profile drives the demo. Only income, CAP admission and domicile proof can be edited.
- Not built:
  - Unstop, Devfolio, MLH and Hack2skill in the live run;
  - scheduled re-checks;
  - a database;
  - parsing each scheme's document list.

## 4. Demo runbook (3 minutes)

### Before the round (10 minutes early)

```powershell
# terminal 1: server
cd server
npm install        # first time only
npm start          # http://localhost:8787

# terminal 2: web app
cd web
npm install        # first time only
npm run dev        # http://localhost:5173
```

Open http://localhost:5173 in the browser. Add `?guided` for on-screen captions.

Choose the mode in the top bar:
- **Live** only if the venue Wi-Fi worked in the last 10 minutes and `server/.env` has the key.
- **Replay** otherwise. It is a real recorded run, so say so.
- **Mock** only if Replay is broken.

For a quick rehearsal, `http://localhost:5173/?demo` plays Replay at 2x and opens the plan.

### On stage

| Time | Click | Say | Who |
|---|---|---|---|
| 0:00 | Nothing. The city is idle. | "Scholarship and hackathon deadlines are spread over many sites. Lookout reads them for one student and gives back one dated list." | Aniket |
| 0:15 | Choose the mode, press **Start run** | "Our sample student: male, B.Tech Computer Engineering, 2nd year, OBC, Maharashtra. Each character is a program reading one source." | Aniket |
| 0:35 | Point at the red State Scholarships building | "MahaDBT 2.0 did not load. We show the failure instead of inventing a date." | Aman |
| 0:50 | Open **System view** | "Every call goes through one gatekeeper: cache, rate limits, robots.txt. These counts come from the event stream." | Samrat |
| 1:05 | Close it, press **View plan** when the run ends | "One list, soonest deadline first. Most NSP schemes close on 31 October." | Aman |
| 1:20 | Point at one row: "Why this ranking", "Verified", "needs verification" | "Verified means the date is still on the page. Needs verification means check that you qualify." | Aman |
| 1:40 | Point at **Check before you apply** | "Two schemes that may not be combinable. We say check the current NSP rules; we do not state a rule we have not read." | Aman |
| 1:55 | Open one **Application Kit** | "Documents, prefilled fields, steps, deadline and source. It never logs in or submits." | Aniket |
| 2:10 | **Opportunities** tab | "Hackathons from the Devpost and HackerEarth feeds, in the same list." | Aniket |
| 2:20 | Profile panel: income 600000, **Re-run Judge and Ranker** | "With ₹6 lakh income, schemes with a lower ceiling move to Not applicable, with the limit stated. Nothing is re-fetched." | Aman |
| 2:40 | (Live only) **Re-check now** | "The Watchtower re-reads the sources on request." | Samrat |
| 2:50 | Back to the plan | "One profile, a city of agents, one plan with a source for every date. Next: more sources, scheduled re-checks, a full profile form." | Samrat |

### If something fails

| Problem | Do this | Say |
|---|---|---|
| Live does not start | Nothing. The app falls back to Replay and shows the badge. | "No network here, so this is a real run we recorded earlier." |
| Wi-Fi drops in the middle | Choose **Replay** and press **Start run** again. | Same line. |
| A source turns red in Live | Carry on. | "That site failed just now; the rest of the plan still builds." |
| The page is blank | Refresh the browser. Check that both terminals are still running. | Nothing; Samrat takes the next question while Aniket fixes it. |
| Re-check now fails | Skip it. It needs the key and the network. | "Re-check needs the network; it is on request only." |

## 5. Who answers what

| Topic | Who |
|---|---|
| What Lookout is, who it helps, the demo walkthrough, the kit and the safety promise, the hackathon sources | Aniket |
| Dates, numbers, eligibility rules, "needs verification", conflicts, Re-run with income | Aman |
| Architecture, SSE, TinyFish use, Gatekeeper, modes, scaling, security, closing | Samrat |

If you do not know an answer, hand it to the right teammate:
- Aniket: "Aman checked the data for that; Aman?" or "Samrat built that part; Samrat?"
- Aman: "That is how the server works; Samrat?" or "Aniket tested those sources; Aniket?"
- Samrat: "Aman verified those rules; Aman?"

Never guess a number. "We have not measured that" is a fine answer.
