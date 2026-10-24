# How the Lookout team works

Three people, one repo, one rule: **everyone commits their own work under their own name.**

| Member | Role | Folder |
|---|---|---|
| Samrat Kunte | Lead: city, backend, integration | [team/samrat/](samrat/README.md), `web/`, `server/` |
| Aman Kumar | Application Kit data and eligibility rules | `team/aman/` (Aman creates it) |
| Aniket Gupta | Opportunities research, pitch and demo script | `team/aniket/` (Aniket creates it) |

The build plan is in [docs/MILESTONES.md](../docs/MILESTONES.md) (6 stages). Who did what is recorded in [CONTRIBUTORS.md](../CONTRIBUTORS.md).

## Samrat Kunte: lead, city, backend, integration
- Owns `web/` (the 3D city and UI) and `server/` (event stream, TinyFish scouts, ranker, kit builder).
- Integrates teammates' data: Aman's rules and kits feed the Stage 3 ranker and the Stage 4 kit drawer; Aniket's source report shapes the Stage 5 Opportunities scout.
- Reviews pull requests into `main`.

## Aman Kumar: Application Kit data and eligibility rules
- Owns `team/aman/application-kits.json` and `team/aman/eligibility-rules.json`.
- Every fact needs its official source URL and the date it was read. Anything not read from a real page is marked `"needs_verification": true`. Set `"verified": true` only after checking the official page yourself.
- Never put a real Aadhaar number, bank detail, password or OTP in any file, not even as an example.

## Aniket Gupta: opportunities research, pitch and demo script
- Owns `team/aniket/opportunities-source-report.md` and `team/aniket/pitch-and-demo-script.md`.
- Every claim about a source comes from a real test, with the URL and the date. The pitch claims only what is committed in the repo.
- Rehearses the demo and keeps it within time.

## Git workflow

1. **Clone**
   ```sh
   git clone https://github.com/samrat7207/Lookout.git
   cd Lookout
   ```
2. **Set your own identity in this repo.** Use an email that is **verified on your GitHub account**; otherwise GitHub cannot link the commits to you.
   ```sh
   git config user.name  "Your Full Name"
   git config user.email "you@example.com"
   git config user.name; git config user.email   # check before your first commit
   ```
3. **Branch** from an up-to-date `main`, named `<yourname>/<topic>`:
   ```sh
   git switch main && git pull
   git switch -c aman/application-kits     # e.g. aniket/source-report, samrat/stage-2-stream
   ```
4. **Commit often, under your own name**, with messages that say what changed:
   ```sh
   git add team/aman/application-kits.json
   git commit -m "Aman: verify NSP kits against official pages"
   ```
5. **Push and open a pull request into `main`.** Fill in the template (what changed, how to verify, linked task).
   ```sh
   git push -u origin aman/application-kits
   ```
6. **Review.** `.github/CODEOWNERS` requests a review from the folder's owner. Samrat merges once the checks in the PR template are done.

## Rules

- **Nobody commits on someone else's behalf.** Not with their name, not with their email, not "just this once". If a teammate is stuck, pair with them while they commit.
- **Claude Code (or any AI tool) must never author commits under a teammate's name.** AI-assisted work is committed by the person who used the tool, under that person's own identity, after they have read and checked it.
- **No secrets in git.** `.env` is gitignored; never commit API keys. Never commit Aadhaar numbers, bank details, passwords or OTPs.
- **Small PRs.** One topic per branch. Do not edit another member's folder; open an issue or ask them instead.
