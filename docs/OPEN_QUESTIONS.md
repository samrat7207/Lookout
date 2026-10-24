# Open Questions

Each question has a proposed default. If nobody objects, we go with the default.

| # | Question | Default |
|---|---|---|
| Q1 | Demo persona? | **Decided:** male, B.Tech Computer Engineering, OBC, Maharashtra, labelled "sample student" in the UI. Matches PM YASASVI (college), PM-USP CSSS, MahaDBT OBC schemes and HDFC Parivartan ECSS. **Year of study: 2nd year (decided, closed).** So "first-year only" schemes (e.g. Reliance UG) are excluded, and PM-USP CSSS is a renewal case. |
| Q2 | Is a TinyFish API key in hand, and is there wallet balance? (Monitor and Agent use the wallet. Search and Fetch have a free tier.) | Recon on 2026-10-24 ran through the TinyFish MCP connector, not our own key. No `server/.env` exists yet. **Needed before `npm run capture` and Stage 3.** Check the wallet in Stage 3 step 1. |
| Q3 | Team size and split? | If 2 or more people: one on web (Stages 1, 2 and 4), one on server (Stages 3 and 5). Stage 1 needs no server, and Stage 2 builds against `fake-run.jsonl`. |
| Q4 | Public URL for Monitor webhooks (cloudflared or ngrok)? | Optional. We use run-now and our own diff. Add a tunnel only if time allows. |
| Q5 | Plain JS or TypeScript? | Plain JS (ESM) with JSDoc on the event types, for speed. Switch to TS only if the team prefers it. |
| Q6 | Category list in the form? | General, OBC, SC, ST, EWS, Minority, plus gender and disability toggles |
| Q7 | Course list in the form? | Class 9–12, Diploma, B.Tech/BE, Other UG, PG, PhD |
| Q8 | Do we deploy anywhere, or only run on localhost for the demo? | Localhost on the demo laptop. Mock mode needs no network. |
| Q9 | Character names? | Nisha (NSP), Mahi (MahaDBT), Fauzi (Foundations), Hacky (Opportunities), Wardu (Watchtower), Mayor Tara, Dabba (Deep Diver) |
| Q10 | Hackathon deadline semantics: Devfolio and MLH listings publish start dates, not registration close. Is "Hackathon starts" an acceptable deadline? | Yes. Show the real label (EVENT_SCHEMA `deadlineLabel`) and never invent a registration date. Fetch Devfolio detail pages for real close dates only if time allows. |
| Q11 | Should Buddy4Study-listed items that just mirror a government scheme (e.g. "Post-Matric Scholarship to OBC Students, Maharashtra") be shown? | Dedupe them into the MahaDBT/NSP item, and use the Buddy4Study date only as a `snippet`-confidence hint, since the official page is the source of truth. |
