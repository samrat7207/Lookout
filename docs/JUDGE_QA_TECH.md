# Technical Q&A (short, honest answers)

**1. Why not LangGraph, CrewAI or another agent framework?**
Nothing in our pipeline needs an LLM to decide. Reading a date, applying an eligibility rule and sorting by deadline are deterministic jobs. Plain async functions plus an event bus give us parallel workers, retries and full observability, with no prompts that could make up a date. A framework would add a dependency without adding correctness.

**2. Why not one agent per student?**
The expensive part, reading the sources, is the same for every student: the NSP list is the same page for everyone. Per-student work (Profiler, Judge, Ranker, Kit) is cheap local code. So scouts read each source once, the shared cache serves it to other runs, and personalisation happens afterwards. One agent per student would refetch the same pages for every student.

**3. How do you avoid IP blocks?**
TinyFish does the fetching. On top of that, the Gatekeeper allows at most 2 calls at once, spaces calls to each host, backs off with jitter on 429/503, caches pages for 30 min, and honours robots.txt. If a site blocks us (403/429, `bot_blocked`, captcha text), we stop for that host and say so. We never rotate around a block. We also read feeds where they exist (Devpost and HackerEarth JSON) instead of scraping pages that block bots.

**4. What happens when TinyFish is down?**
Live mode falls back to the last real recording, and the UI shows a "Replaying recorded run" badge with the reason. Inside a run, a failed fetch can fall back to an older cached copy, clearly marked "fallback" and "stale". The Verifier treats a stale copy as "could not verify".

**5. How do you know a date is right?**
It is parsed from the fetched page by a parser for that source, the exact line is kept as `evidence`, and the page URL and fetch time travel with it. Then the Verifier re-fetches the page and checks that the name and the date are still there. If either fails, the item is flagged "changed" or "could not verify". If no date is published, we say "deadline not published".

**6. How does it scale?**
Sources are shared and students are cheap. Reads scale with the number of sources, not students, and the cache absorbs repeats. The per-student pipeline is milliseconds of CPU. To go further we would move the cache to a shared store, use TinyFish Monitor for scheduled re-checks, and run several stateless API instances behind a load balancer (planned, not built). Today it is one process: live runs stream from memory, and completed runs are saved to Postgres when `DATABASE_URL` is set, else to a local SQLite file.

**7. What does it cost per student?**
One fresh live run tonight made **8 TinyFish API calls** for 21 page or search reads (`plan.sources.gatekeeper` in the recording). With a warm cache, a second student costs close to zero calls for the same sources. We have not measured money per call; the TinyFish wallet shows the real figure.

**8. What about data privacy?**
When a run completes, only the facts matching needs (state, category, course, year, gender, disability, and income, CAP admission and domicile proof when given; unknown ones stay empty) are saved with the run in the database (Postgres, or the local SQLite fallback). No name, contact details or ID numbers. The run's events stay in memory for an hour and in recordings we choose to make. Recordings use the "sample student", not a real person. We never ask for, store or enter Aadhaar numbers, OTPs, passwords or bank details. `assertKitSafe` makes the server refuse any kit where a sensitive field has a value. The TinyFish key stays on the server and is read in one file only.

**9. Why deterministic ranking?**
Because a student must be able to trust and check it. The order is deadline, then fit (match, then conditional, then unclear), and nothing else. Each row says why it is where it is. The same input always gives the same plan, which is also what makes replay identical to live.

**10. What is mock and what is real?**
**Live** reads real pages now. **Replay** plays back a real live run recorded tonight (`recordings/real-run.jsonl`, about 50 s, 18 items, all verified at capture). **Mock** is a scripted run built from earlier recon data. Its Verifier says "could not verify: mock run, no network calls", and its Watchtower events are scripted. The UI badge always says which one you are watching.

**11. How is the API key protected?**
It is in `server/.env`, which is gitignored (checked with `git check-ignore`), and it is not in any commit or recording (we search for it). Only `server/src/tinyfish/client.js` reads it. `/api/health` reports only whether a key is present. The browser never talks to TinyFish.

**12. What would you build next?**
Official data partnerships, so we read data instead of pages. Scheduled Watchtower checks with notifications on real changes. Documents parsing for the kits. A profile form with the unknowns (income, CAP admission, domicile). More sources (Vidyasaarathi, Unstop, Hack2skill).
