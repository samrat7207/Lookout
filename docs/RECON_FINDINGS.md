# Recon Findings (live TinyFish calls, 2026-10-24)

Sections 1 and 2 are the first 3 calls made while planning (Search on NSP, then Fetch on 4 URLs). Sections 3 and 4 are the scope-expansion tests run the same day, before any parser was written: other scholarship sources, and hackathon sources. **Rule: a source is kept only if Fetch returns real content with dates.** All calls went through TinyFish Search and Fetch.

## 1. NSP: scholarships.gov.in (backbone)

### Home page (`/`), Fetch in about 1.4 s
Announcement text contains:
> Renewal applications for the "PM-USP – Central Sector Scheme Of Scholarship For College And University Students (CSSS) (Merit Based Scheme)" and "PM USP Special Scholarship Scheme For Jammu Kashmir And Ladakh" is currently open in NSP. **Closing dates for student application is 31-10-2026** and closing date for institute verification is : 15-11-2026 and closing date for L2 verification is : 30/11/2026

> The Portal is open for Academic year 2026-27 from 1'st June 2026 onwards.

> Students may apply for one merit-based scholarship scheme and one or more welfare-based scholarship schemes from AY 2026–27

> PM YASASVI ... Top Class Education In Schools ... now open for Fresh applications. Students who do not belong to Rajasthan, Keralam and Karnataka can submit...

Other useful facts for "action" lines: an OTR (One Time Registration, 14-digit, Aadhaar-based) is required. CSC centres can file for Rs 30. Disabled students must give consent on UDID first.

### All-Scholarships (`/All-Scholarships`), Fetch in about 1.9 s. **This is the main data source.**
Repeating block (markdown):
```
###### AICTE - Pragati Scholarship Scheme For Girl Students ( Technical Degree) (Merit Based Scheme)

Scheme Open from : 01-06-2026
Student Application Open till : 31-10-2026
Defective Application Verification Open till:15-11-2026
Institute Verification Open till:15-11-2026
DNO/SNO/MNO Verification Open till:30-11-2026
```
Variants the parser must handle:
- `Scheme Open from (for Renewal): 01-06-2026`: a "(for Renewal)" suffix on every label (PM-USP CSSS, NEC Merit)
- inconsistent spacing: `Open till : ` vs `Open till:`
- stray empty `######` headings
- two dates that differ from the rest: **PM YASASVI (Schools)** open 22-10-2026, apply till **30-11-2026**; PM USP J&K open from 22-10-2026

Parser regex sketch:
```js
const block = /######\s+(.+?)\s*\((Merit|Welfare) Based Scheme\)([\s\S]*?)(?=######|$)/g;
const field = (label) => new RegExp(label + "(?:\\s*\\(for Renewal\\))?\\s*:\\s*(\\d{2}-\\d{2}-\\d{4})");
// labels: "Scheme Open from", "Student Application Open till", "Institute Verification Open till"
```

About 30 schemes were seen. 31 scheme blocks in the saved fixture (`server/test/fixtures/nsp-all-scholarships.md`). Ones relevant to the earlier female persona are below. For the current persona (male, B.Tech CE, OBC, Maharashtra), Pragati drops out and PM YASASVI College becomes the lead item:
| Scheme | Apply till |
|---|---|
| AICTE Pragati (Girls, Technical Degree) | 31-10-2026 |
| PM YASASVI Top Class Education in College for OBC, EBC, DNT | 31-10-2026 |
| PM-USP CSSS (renewal) | 31-10-2026 |
| AICTE Swanath (Technical Degree), welfare (orphans and similar, check eligibility) | 31-10-2026 |

Persona variants for testing: SC → "Central Sector Scholarship Of Top Class Education For SC Students". Disability → Saksham, Pre/Post Matric for Students With Disabilities. PG → National Scholarship For Post Graduate Studies.

### Search with `include_domains=scholarships.gov.in`
The top 3 results are home, /Students and /All-Scholarships. The snippets already contain "Closing dates for student application is 31-10-2026". **This gives a headline finding in a few seconds**, before the full Fetch lands, which is good for demo pacing.

## 2. MahaDBT: mahadbt.maharashtra.gov.in

### Landing page (`/`), Fetch in about 3.1 s
- Lists about 45 Post Matric scholarship scheme names grouped by department (Social Justice, Tribal, DHE, DTE, OBC/SEBC/VJNT/SBC Welfare, Minority, ...).
- With `links: true` it returns about 58 `SchemeData/SchemeData?str=<hex>` URLs. **These are the scheme detail pages.** The `str` tokens look like encrypted IDs, so treat them as opaque and discover them on every run. Do not hardcode them. Cache the last good set.
- ⚠ The link order seems to follow the menu order, but the mapping from name to URL is not given in the markdown. Option: fetch with `format: "html"` and pair each `<a>` text with its href, or fetch a candidate set and read each title. **Decision for Stage 3: run the landing fetch once in html to build the name→URL map.**
- There are also links to `mahadbt2.maharashtra.gov.in`, `prematric.mahait.org` and others.

### Scheme page example: "Government of India Post-Matric Scholarship", Fetch in about 2.8 s
Sections in the markdown: `### Department Name`, `### Overview`, `### Benefits`, `### Eligibility` (numbered list), `### Documents Required`.
Eligibility example: family income ≤ Rs 2,50,000. SC / Navbouddha. Maharashtra resident. Passed SSC.
**No application deadline on the scheme page.**

### Important notice (on every page)
> The MahaDBT 1.0 portal is currently active for acceptance of fresh applications for the Academic Year 2025-26 ... **Fresh and renewal applications for the Academic Year 2026-27 will be accepted only through the MahaDBT 2.0 Portal** (https://mahadbt2.maharashtra.gov.in/)

**What this means for the plan:** MahaDBT items show "Apply on MahaDBT 2.0, deadline not published on scheme page". The Deep Diver (Agent API) goal is to find the AY 2026-27 date on MahaDBT 2.0. **Checked 2026-10-24: `mahadbt2.maharashtra.gov.in` returned `proxy_error` on two attempts.** Retry once in Stage 3. Until then, MahaDBT 2.0 is a link and a note, not a data source. The 1.0 landing page still fetches fine (3.6 s, about 45 Post Matric scheme names).

## 3. Other scholarship sources (scope expansion, 2026-10-24)

Tested with Search (`include_domains` per source) and then Fetch (markdown, 60 to 90 s per-URL timeout). Failures that returned `proxy_error` were retried once.

### Kept ✅

| Source | What works | Date pattern | Notes |
|---|---|---|---|
| **NSP** `scholarships.gov.in/All-Scholarships` | Fetch, 2.3 s, 31 schemes | `Student Application Open till : DD-MM-YYYY` | The backbone (section 1) |
| **MahaDBT 1.0** landing + SchemeData pages | Fetch, 3.6 s | none (no deadline on scheme pages) | Section 2. Kept for scheme names, eligibility and **Documents Required** (for the kit). |
| **Buddy4Study detail pages** `/page/<slug>`, `/scholarship/<slug>` | Fetch, 0.5 to 20 s (the `/page/` ones are slow) | `Deadline Date: 26-Oct-2026` (`/page/`, once per sub-scheme), or `Application Deadline: 30th September 2026` (`/scholarship/`) | **Listing page `/scholarships/engineering` renders only the footer**, so discovery must use Search `include_domains=buddy4study.com` (snippets already carry "Deadline Date: …"). Fixture: `server/test/fixtures/b4s-tata-pankh.md`. `/page/` pages also list "related" scholarships with `*Deadline Date: DD-Mon-YYYY*`, so parse only the main blocks. ⚠ Each `/page/` keeps **past-year blocks** too (e.g. Tata Pankh back to 2021-22), with the label `EligibilityDeadline : 13-Mar-2026` as well as `EligibilityDeadline Date: 26-Oct-2026`. Accept both, and keep only blocks whose title says 2026-27 and whose deadline is not past. |
| **Vidyasaarathi scheme pages** `/Vidyasaarathi/resources/<n>/<id>.html` | Fetch, 0.9 s | table rows `Start Date From \| 22/07/2026`, `Valid Upto \| 21/09/2026`, plus "Eligible State", "Course Level" | **Listing page says "Currently No Schemes are Available"** (JS-driven), so discover through Search `include_domains=vidyasaarathi.co.in`. Most schemes seen were closed or state-restricted (Gujarat, Odisha). Low yield, but clean. |

Persona-relevant examples seen: HDFC Parivartan ECSS (Buddy4Study, **Deadline 31-Oct-2026**), SDEF India Scholarship (30-Nov-2026), Raman Kant Munjal (30-Oct-2026), Buddy4Study "Post-Matric Scholarship to OBC Students, Maharashtra" (30 Sep 2026, already **missed**, and a mirror of the MahaDBT scheme; see OPEN_QUESTIONS Q11).

### Dropped ❌

| Source | Result | Why dropped |
|---|---|---|
| AICTE `fellowship.aicte.gov.in`, `yashasvi.aicte.gov.in`, `www.aicte.gov.in/schemes/...` | Fetch **403** | Blocked. Search snippets do carry dates, but the main AICTE UG schemes (Pragati, Saksham, Swanath) are on NSP anyway. |
| AICTE `aicte-india.org/bureaus/rifd/Scholarship-Schemes` | `proxy_error`, then `target_unreachable` | Unreachable |
| Karnataka SSP `ssp.postmatric.karnataka.gov.in` | `proxy_error` | Unreachable, and it is a login page anyway |
| UP `scholarship.up.gov.in` | Search returned 0 results, Fetch `proxy_error` ×2 | Unreachable |
| West Bengal SVMCM `svmcm.wbhed.gov.in` | `proxy_error` | Unreachable |
| Telangana ePASS `telanganaepass.cgg.gov.in` | Fetch OK, 1 KB, **no dates** | No content with dates |
| MahaDBT 2.0 `mahadbt2.maharashtra.gov.in` | `proxy_error` ×2 | Unreachable (retry in Stage 3) |
| Reliance Foundation `scholarships.reliancefoundation.org/UG_Scholarship` | Fetch OK, full content, but **no date on the page**: "Applications for the 2026-27 scholarships are now closed" | No date. It is also first-year only, and closed (5 Oct 2026 per snippets). |
| Buddy4Study listing `/scholarships/engineering` | Fetch OK, footer only | Empty. Use detail pages (kept above). |
| Vidyasaarathi listing `/Vidyasaarathi/scholarship` | "Currently No Schemes are Available" | Empty. Use scheme pages (kept above). |

## 4. Hackathon and event sources (Opportunities add-on, 2026-10-24)

| Source | URL that works | Result | Date pattern | Verdict |
|---|---|---|---|---|
| **Devfolio** | `https://devfolio.co/hackathons` | Fetch 0.9 s, 13 open + 3 upcoming, mostly Indian | `### <Name>` … `Offline\|Online` … `Starts 30/10/26` / `Opens 15/11/26` | ✅ Keep. Start date only, no registration close on the listing. |
| **MLH** | `https://mlh.io/seasons/2027/events` (redirects to mlh.com) | Fetch 1.8 s, about 80 upcoming | `#### <Name>` / `OCT 31 - NOV 01` / `City, Region, CC` / `In-Person` | ✅ Keep. Filter `, IN` or online. Only **hackCBS 9.O (New Delhi, Oct 31 – Nov 1)** is in India this season. The year comes from the `### 2026` / `### 2027` headings. |
| **Devpost** | `https://devpost.com/api/hackathons?status[]=upcoming&status[]=open` (JSON) | Fetch 0.25 s, 9 hackathons | `"submission_period_dates":"Aug 26 - Oct 30, 2026"`, `"time_left_to_submission":"6 days left"`, `displayed_location` | ✅ Keep the **JSON endpoint**. The HTML listing `/hackathons` renders filters only. ⚠ Fetch returns the JSON as "markdown" with `\_` escapes, so unescape `\_`→`_` before `JSON.parse`. |
| **HackerEarth** | `https://www.hackerearth.com/chrome-extension/events/` (JSON) | Fetch 1 s | `"status":"ONGOING"`, `"end_tz":"2026-11-13 23:59:00+05:30"`, `"challenge_type"` | ✅ Keep the **JSON endpoint** (same `\_` unescape). `/challenges/hackathon/` HTML is an empty shell. |
| **Unstop** | Search `include_domains=unstop.com`, then Fetch detail pages with `include_selectors: ["main"]` | Search snippets carry "Registration Deadline: November 15, 2026". Detail Fetch 8 s shows stage dates and "13 days left". | snippet text, or detail `DD Mon YY, HH:MM AM` stage dates | ✅ Keep (Search + detail Fetch). `/hackathons` listing returns "Cookies are disabled". The public JSON API returned **stale 2023–2025** items, so don't use it. |

## Takeaways
1. Search and Fetch alone are enough for a working, real demo. The Agent API is a bonus.
2. The NSP parser is the highest-value code. Write it against a saved copy of this markdown, with unit tests.
3. Save the raw markdown from these pages to `server/test/fixtures/` (done; `npm run capture` refreshes them). This keeps the parsers testable offline.
4. Private listings and hackathon boards: **listing pages are often empty shells, but detail pages and JSON endpoints work.** Discover with Search, then read with Fetch.
5. Every state portal we tried except MahaDBT 1.0 failed. NSP plus private listings is the honest coverage for students outside Maharashtra.
