Draft prepared with Claude for Aman Kumar. The author must read it, verify it, and edit it before committing.

# Data verification log

Every number, date and eligibility rule that the pitch or the app uses, where it is used, and what to check. The values come from the repo docs and code as of 2026-10-25. Nothing in this table has been checked by the author yet.

How to use it:
- Open the official source and compare it with the value we use.
- Fill in the last column: your name, the date you checked, and the result: confirmed, wrong (give the correct value and the page it is on), or not found.
- If a value is wrong, tell Samrat which file needs the change. Do not edit server or web code from this file.
- Where the source column says "source link to find", the repo has no official link. Find one before the value is used anywhere.

Files referred to:
- Pitch: `UI-Present.md` (repo root) and `docs/DEMO_AND_RISKS.md`.
- Recon: `docs/RECON_FINDINGS.md`.
- Rule data: `eligibility-rules.json` (repo root, draft, every rule `verified: false`).
- Code: under `server/src/`.

## 1. NSP 2026-27 dates

| Item | Value we use | Where it is used | Official source to check | What to confirm | Verified by / date / result |
|---|---|---|---|---|---|
| NSP student application closing date | 31-10-2026 | Plan headline banner and countdown. NSP item deadlines. `.ics` export. Kit step "Submit before". Pitch opening line in `UI-Present.md` and `docs/DEMO_AND_RISKS.md`. Read live by `server/src/parse/nsp.js` (`findStudentClosingDate`, `parseAllScholarships`). | https://scholarships.gov.in/ (announcement) and https://scholarships.gov.in/All-Scholarships (per scheme) | Still 31-10-2026, or extended. Which schemes it covers: the home page sentence is about CSSS and J&K renewals, while the All-Scholarships list shows it per scheme. | |
| NSP institute verification closing date | 15-11-2026 | Kit step "Ask your institute to verify your application before ..." (`server/src/kit/buildKit.js`, from `verificationTill`). `docs/RECON_FINDINGS.md` section 1. | https://scholarships.gov.in/ and https://scholarships.gov.in/All-Scholarships | Still 15-11-2026 for the schemes the plan shows. | |
| NSP defective application verification | 15-11-2026 | `docs/RECON_FINDINGS.md` section 1 (sample block). Not shown on the plan screen. | https://scholarships.gov.in/All-Scholarships | Still 15-11-2026. | |
| NSP district / state (L2, DNO/SNO/MNO) verification | 30-11-2026 | `docs/RECON_FINDINGS.md` section 1 and the NSP test fixture. Not shown on the plan screen. | https://scholarships.gov.in/ ("L2 verification") and https://scholarships.gov.in/All-Scholarships ("DNO/SNO/MNO Verification Open till") | Still 30-11-2026. | |
| NSP portal open for AY 2026-27 | from 1 June 2026 (scheme open date 01-06-2026) | `docs/RECON_FINDINGS.md` section 1. `openFrom` in NSP items. | https://scholarships.gov.in/ | Same date on the page. | |
| PM YASASVI Top Class Education in Schools: dates | open 22-10-2026, apply till 30-11-2026 | `docs/RECON_FINDINGS.md` section 1. Shown under "Not applicable" (school level). | https://scholarships.gov.in/All-Scholarships | Both dates. | |
| Number of NSP schemes listed | 31 scheme blocks in the saved fixture ("about 30" seen in recon, "30+" in `docs/DEMO_AND_RISKS.md`) | Pitch problem line ("NSP alone lists 31 schemes") in `UI-Present.md`. `docs/RECON_FINDINGS.md` section 1. | https://scholarships.gov.in/All-Scholarships | Count the schemes on the day of the pitch. Use one number everywhere. | |
| NSP one-merit-scheme rule | "Students may apply for one merit-based scholarship scheme and one or more welfare-based scholarship schemes from AY 2026–27" | Conflict warning 1 (`server/src/rank/conflicts.js`, rule `nsp-one-merit-scheme`). `eligibility-rules.json` `global_rules`. | https://scholarships.gov.in/ | The sentence is still on the home page, word for word. The app quotes it only when a live run finds it. | |

## 2. Other dates and counts in the pitch and docs

| Item | Value we use | Where it is used | Official source to check | What to confirm | Verified by / date / result |
|---|---|---|---|---|---|
| HDFC Parivartan ECSS (UG) deadline | 31-Oct-2026 | `docs/RECON_FINDINGS.md` section 3. `docs/PRD.md` section 2. Plan item from Buddy4Study. | https://www.buddy4study.com/page/hdfc-bank-parivartans-ecss-programme | Deadline for the 2026-27 UG block, not a past-year block. | |
| SDEF India Scholarship deadline | 30-Nov-2026 | `docs/RECON_FINDINGS.md` section 3 only. | source link to find | Date and whether it is open to a 2nd-year B.Tech student. | |
| Raman Kant Munjal Scholarship deadline | 30-Oct-2026 | `docs/RECON_FINDINGS.md` section 3 only. | source link to find | Date and eligibility. | |
| Buddy4Study "Post-Matric Scholarship to OBC Students, Maharashtra" | 30 Sep 2026 (already missed) | `docs/RECON_FINDINGS.md` section 3. `docs/OPEN_QUESTIONS.md` Q11. | source link to find (it mirrors the MahaDBT scheme) | Whether it is the same scheme as the MahaDBT one. | |
| MahaDBT AY 2026-27 route | "Fresh and renewal applications for the Academic Year 2026-27 will be accepted only through the MahaDBT 2.0 Portal". No deadline on the scheme pages. | MahaDBT plan note and kit steps (`server/src/kit/buildKit.js`). Pitch line in `UI-Present.md`. | https://mahadbt.maharashtra.gov.in/ (notice) and https://mahadbt2.maharashtra.gov.in/ (returned `proxy_error` in recon) | The notice is still there. Whether MahaDBT 2.0 now publishes a deadline. If it does, tell Samrat. Do not type the date into the app. | |
| TinyFish calls per fresh live run | 8 API calls for 21 page or search reads | `docs/JUDGE_QA_TECH.md` Q7 (from `plan.sources.gatekeeper` in the recording). | `recordings/real-run.jsonl` (the `plan.ready` event) | The numbers match the current recording. | |
| Items in the real recording | 18 items, all verified at capture | `docs/JUDGE_QA_TECH.md` Q10. | `recordings/real-run.jsonl` | Count again after any new `npm run capture`. | |
| City draw calls | Old pitch draft says 29. `docs/MILESTONES.md` now says 122-123 draw calls, 2.6 ms (Day) and 3.0 ms (Dusk) per frame. | Pitch slide 10 in the old draft. `docs/MILESTONES.md`. | `?stats` in the running app | Use the current figure, or drop the number. | |

## 3. Statistics in the pitch that are not in the repo

The repo has no value and no source for these. Do not say any of these numbers on stage until this table is filled in from an official publication.

| Item | Value we use | Where it is used | Official source to check | What to confirm | Verified by / date / result |
|---|---|---|---|---|---|
| OBC students figure | not in the repo | pitch (add the slide or line here) | source link to find | Exact figure, year it refers to, publisher, page or table number. | |
| Higher-education enrolment figure | not in the repo | pitch (add the slide or line here) | source link to find | Exact figure, year, publisher, page or table number. | |
| NSP 2020-21 applications received | not in the repo | pitch (add the slide or line here) | source link to find | Exact count and the year it covers. | |
| NSP 2020-21 applications verified | not in the repo | pitch (add the slide or line here) | source link to find | Exact count. Check that "verified" means the same stage as in our app (institute or district verification). | |
| Rajya Sabha answer: amount allocated | not in the repo | pitch (add the slide or line here) | source link to find (question number and date) | Scheme name, year, amount, unit (crore or lakh). | |
| Rajya Sabha answer: amount spent | not in the repo | pitch (add the slide or line here) | source link to find (same answer) | Same scheme and year as the allocated figure, so the two can be compared. | |

## 4. Eligibility rules for named schemes

These rules are in the code. The official source is the URL recorded for that rule in `eligibility-rules.json`. That file was drafted from reads on 2026-10-24 and every rule has `verified: false`.

| Item | Value we use | Where it is used | Official source to check | What to confirm | Verified by / date / result |
|---|---|---|---|---|---|
| PM YASASVI (college): category | OBC, EBC or DNT | `server/src/rank/rules.js` (KNOWN, reason line). `eligibility-rules.json`. | https://scholarships.gov.in/public/schemeGuidelines/ApprovedmodifieddraftofTopClassCollege.pdf | Category list. | |
| PM YASASVI (college): income | family income at most ₹2.5 lakh | `rules.js` reason line. `server/src/rank/rejudge.js` `INCOME_LIMITS` (Re-run drops the scheme above it). | same PDF | Ceiling and whether it is per year. | |
| PM YASASVI (college): institute | only notified "Top Class" institutes | `rules.js` reason line. Profiler unknown "Institute". | same PDF (the institute list itself was not read) | Where the notified list is published. | |
| PM YASASVI (college): 2nd year | "2nd year: leftover slots only" | `rules.js` reason line. | same PDF | This phrase is in the code. `eligibility-rules.json` only says years 1 to 4. Find the exact clause or ask Samrat to remove the phrase. | |
| PM-USP CSSS: renewal only | a 2nd-year student can apply only as a renewal (won CSSS in 1st year) | `rules.js` reason line. | https://scholarships.gov.in/public/schemeGuidelines/FAQ_DOHE_CSSS.pdf | Renewal rule. `eligibility-rules.json` marks "renewal allowed for B.Tech" as unclear: the FAQ seems to contradict the guideline. | |
| PM-USP CSSS: income | at most ₹4.5 lakh | `rules.js` reason line. `rejudge.js` `INCOME_LIMITS`. | https://scholarships.gov.in/public/schemeGuidelines/CSSS_GUIDLINES_07022024_updated.pdf | Ceiling. | |
| PM-USP CSSS: no state fee reimbursement | not with a state scholarship, fee waiver or reimbursement (guideline 4(iv) per `eligibility-rules.json`) | `rules.js` reason line. Conflict warning 2. | same guideline PDF | Clause number and wording. | |
| PM-USP CSSS: marks and attendance | at least 50% marks, 75% attendance | `eligibility-rules.json` only (not in the code). | same guideline PDF | Both values. | |
| AICTE Swanath: who qualifies | orphans, Covid-bereaved, wards of martyred armed forces or CAPF personnel, critical-illness or accident cases | `rules.js` reason line. | https://scholarships.gov.in/public/schemeGuidelines/AICTE/AICTE_3039_G.pdf | Exact list. | |
| AICTE Swanath: income | at most ₹8 lakh | `rules.js` reason line. `rejudge.js` `INCOME_LIMITS`. | same PDF | Ceiling. | |
| AICTE Swanath: other rules | AICTE-approved institution, regular mode. Not with any Central, State or AICTE scholarship. | `eligibility-rules.json` only. | same PDF | Both clauses. | |
| MahaDBT Post Matric Scholarship to OBC Students: income | at most ₹2.5 lakh | `rejudge.js` `INCOME_LIMITS`. | https://mahadbt.maharashtra.gov.in/SchemeData/SchemeData?str=E9DDFA703C38E51AB02E984835E89FEFDB316E301CE6A991F41C5D42B01A7D7E | Ceiling. | |
| MahaDBT Post Matric OBC: CAP admission | needs admission through CAP | `rejudge.js` `NEEDS_CAP`. Profiler unknown "CAP admission". | same page | Wording on the page. | |
| MahaDBT Post Matric OBC: other rules | OBC, Maharashtra domicile, 75% attendance, at most 2 children of the same parents (boys), stops when another scholarship is accepted | `eligibility-rules.json`. Domicile in `rejudge.js` (`NEEDS_DOMICILE`, all MahaDBT items). | same page | Each clause. | |
| MahaDBT Tuition Fees and Examination Fees to OBC Students | CAP admission. Courses include B.Tech. Not a deemed university. Income ceiling not stated on the page (unclear). | `rejudge.js` `NEEDS_CAP`. `eligibility-rules.json`. | https://mahadbt.maharashtra.gov.in/SchemeData/SchemeData?str=E9DDFA703C38E51A19A7691F3B40AD4EE0F3DDA5DE324AC54819922BB3D36B63 | Whether any income ceiling applies (the documents list asks for an income or non-creamy-layer certificate). | |
| HDFC Parivartan ECSS (UG) | income at most ₹2.5 lakh. At least 55% marks. B.Tech is among the courses. | `rejudge.js` `INCOME_LIMITS` (income). `eligibility-rules.json` (marks, courses). | https://www.buddy4study.com/page/hdfc-bank-parivartans-ecss-programme | All three, for the 2026-27 block. | |
| Tata Capital Pankh (general graduation) | income at most ₹4 lakh. At least 60% marks. Whether B.Tech is covered is unclear. | `rejudge.js` `INCOME_LIMITS`. `eligibility-rules.json`. | https://www.buddy4study.com/page/the-tata-capital-pankh-scholarship-programme | Whether a B.Tech student qualifies at all. | |
| ServiceScape Scholarship 2026 | enrolled at an accredited college, university or trade school | `eligibility-rules.json`. | https://www.buddy4study.com/scholarship/servicescape-scholarship | Rule and deadline. | |
| Rajarshri Chhatrapati Shahu Maharaj Fee Reimbursement | for EBC/EWS (read from the Overview, not the Eligibility list), income at most ₹8 lakh, CAP. Shown as not for the OBC sample student. | `server/src/fake/reconData.js` (`MAHADBT_SKIPPED`). `docs/PRD.md` section 2. `eligibility-rules.json`. | https://mahadbt.maharashtra.gov.in/SchemeData/SchemeData?str=E9DDFA703C38E51A7F4D327BDEB7125DE0BA4AE1C51180C272281017EBEF6F7C | Whether an OBC student is excluded. See `rules-update-guide.md`, section 9. | |
| Dr Panjabrao Deshmukh Hostel Maintenance Allowance | General and SEBC only, income at most ₹8 lakh. Shown as not for the OBC sample student. | `reconData.js` (`MAHADBT_SKIPPED`). `docs/PRD.md` section 2. `eligibility-rules.json`. | https://mahadbt.maharashtra.gov.in/SchemeData/SchemeData?str=E9DDFA703C38E51A3D30C2CB15631E4E31F4E2AFF5E4258B33E89887D583052E | Category list. See `rules-update-guide.md`, section 9. | |
| AICTE Pragati (Technical Degree) | girls only | `rules.js` keyword rule. `reconData.js` `NOT_APPLICABLE`. | https://scholarships.gov.in/All-Scholarships | Still girls only. | |
| Reliance Foundation UG 2026-27 | 1st year only, applications closed | `eligibility-rules.json`. `server/src/liveRun.js` `SOURCES_NOT_USED`. | https://www.scholarships.reliancefoundation.org/UG_Scholarship | Both points. | |
| JSW UDAAN renewal (Vidyasaarathi) | Odisha students only, renewal | `eligibility-rules.json` (read from a search snippet only). | https://www.vidyasaarathi.co.in/Vidyasaarathi/scholarship (the scheme page link: source link to find) | Open the scheme page itself. | |

## 5. Keyword rules (no official source)

These are code heuristics in `server/src/rank/rules.js` (`assessByName`, `assessPageText`) and `server/src/parse/opps.js` (`assessEvent`). They are not read from any official page. Every item they decide is marked "needs verification" in the plan, except the diploma rule. To check them, take a few real scheme or event names from the last run and confirm the result is sensible.

| Item | Value we use | Where it is used | Official source to check | What to confirm | Verified by / date / result |
|---|---|---|---|---|---|
| Diploma-only scheme | not applicable (B.Tech degree) | `rules.js` | none (keyword rule) | No degree-level scheme is caught by mistake. | |
| Girls / women / Pragati in the name | not applicable (male profile) | `rules.js`, `rejudge.js` | none (keyword rule) | Same as above. | |
| Disability words (Saksham, divyang, PwD) | not applicable (no disability stated) | `rules.js` | none (keyword rule) | Same as above. | |
| School, pre-matric, class 9-12 | not applicable (in college) | `rules.js` | none (keyword rule) | Same as above. | |
| PG, PhD, M.Tech, research, fellowship | not applicable (undergraduate) | `rules.js` | none (keyword rule) | Same as above. | |
| Wards of specific workers or personnel | not applicable unless the profile says so | `rules.js` | none (keyword rule) | Same as above. | |
| North East or another state named | not applicable (Maharashtra) | `rules.js` | none (keyword rule) | Same as above. | |
| SC, ST, minority, tribal without OBC | not applicable (OBC) | `rules.js` | none (keyword rule) | Same as above. | |
| OBC plus college-level words | conditional | `rules.js` | none (keyword rule) | The guideline for each such scheme. | |
| Technical, engineering, degree words only | unclear | `rules.js` | none (keyword rule) | The guideline for each such scheme. | |
| Buddy4Study page names B.Tech or engineering | conditional | `rules.js` `assessPageText` | none (keyword rule) | The eligibility block on the page. | |
| Hackathon online | match | `server/src/parse/opps.js` | none | Rules page of a sample event. | |
| Hackathon in person in Maharashtra / elsewhere in India / abroad | match / conditional / not applicable | `opps.js` | none | Same. | |
| HackerEarth `end_tz` used as the deadline | challenge end, marked "needs verification" | `opps.js`. `opportunities-source-report.md`. | https://www.hackerearth.com/chrome-extension/events/ | Whether `end_tz` is the registration close. | |

## 6. Kit documents not read from a page

| Item | Value we use | Where it is used | Official source to check | What to confirm | Verified by / date / result |
|---|---|---|---|---|---|
| Generic document list | caste certificate, non-creamy-layer certificate (OBC), income certificate, previous year marksheet, fee receipt or bonafide, domicile certificate (MahaDBT), photo. Shown as "usually needed · needs verification". | `server/src/kit/buildKit.js` (`documentsFor`, `from: null`) | each scheme's own page (MahaDBT pages have a "Documents Required" section) | Per scheme, which documents the official page actually lists. | |
