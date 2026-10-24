# Open Questions

Each question has a proposed default. If nobody objects, we go with the default.

| # | Question | Default |
|---|---|---|
| Q1 | Demo persona? | **Decided:** male, B.Tech Computer Engineering, OBC, Maharashtra, labelled "sample student" in the UI. Matches PM YASASVI (college), PM-USP CSSS, MahaDBT OBC schemes and HDFC Parivartan ECSS. Year of study is not fixed yet. It matters for "first-year only" schemes (e.g. Reliance UG) and for PM-USP renewal. Default: 2nd year. |
| Q2 | Is a TinyFish API key in hand, and is there wallet balance? (Monitor and Agent use the wallet. Search and Fetch have a free tier.) | Recon on 2026-10-24 ran through the TinyFish MCP connector, not our own key. No `server/.env` exists yet. **Needed before `npm run capture` and M3.** Check the wallet in M3 step 1. |
| Q3 | Team size and split? | If 2 or more people: one on server (M1, then M3), one on web (M2 can start as soon as EVENT_SCHEMA is frozen, using `fake-run.jsonl`). |
| Q4 | Public URL for Monitor webhooks (cloudflared or ngrok)? | Optional. We use run-now and our own diff. Add a tunnel only if time allows. |
| Q5 | Plain JS or TypeScript? | Plain JS (ESM) with JSDoc on the event types, for speed. Switch to TS only if the team prefers it. |
| Q6 | Category list in the form? | General, OBC, SC, ST, EWS, Minority, plus gender and disability toggles |
| Q7 | Course list in the form? | Class 9–12, Diploma, B.Tech/BE, Other UG, PG, PhD |
| Q8 | Do we deploy anywhere, or only run on localhost for the demo? | Localhost on the demo laptop. Mock mode needs no network. |
| Q9 | Character names? | Nisha (NSP), Mahi (MahaDBT), Fauzi (Foundations), Hacky (Opportunities), Wardu (Watchtower), Mayor Tara, Dabba (Deep Diver) |
| Q10 | Hackathon deadline semantics: Devfolio and MLH listings publish start dates, not registration close. Is "Hackathon starts" an acceptable deadline? | Yes. Show the real label (EVENT_SCHEMA `deadlineLabel`) and never invent a registration date. Fetch Devfolio detail pages for real close dates only if time allows. |
| Q11 | Should Buddy4Study-listed items that just mirror a government scheme (e.g. "Post-Matric Scholarship to OBC Students, Maharashtra") be shown? | Dedupe them into the MahaDBT/NSP item, and use the Buddy4Study date only as a `snippet`-confidence hint, since the official page is the source of truth. |
