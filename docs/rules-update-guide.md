Draft prepared with Claude for Aman Kumar. The author must read it, verify it, and edit it before committing.

# Rules and kit data: how they work and how to update them

Written from the code as of 2026-10-25. File paths are relative to the repo root.

## 1. Where the rules live

There are two places, and they are not connected yet.

| Place | What it is | Read by the app at runtime? |
|---|---|---|
| `eligibility-rules.json` (repo root) | Draft rule data: one entry per scheme, each criterion with a quote, source URL, read date and `clarity`. Every rule has `verified: false`. | No. It is reference data. Loading it into the server is planned. |
| `application-kits.json` (repo root) | Draft kit data: documents, fields and steps per scheme, with sources. | No. Loading it into the kit builder is planned. |
| `server/src/rank/rules.js` | The Eligibility Judge. `KNOWN` holds the rules for schemes whose official guidelines were read (PM YASASVI college, PM-USP CSSS, AICTE Swanath). `assessByName` and `assessPageText` hold the keyword rules for everything else. | Yes |
| `server/src/rank/rejudge.js` | Rules that need a profile value: `INCOME_LIMITS` (per scheme, in lakh), `NEEDS_CAP`, `NEEDS_DOMICILE`. Used by "Re-run Judge and Ranker" (`POST /api/rejudge`). | Yes |
| `server/src/rank/conflicts.js` | The two conflict warnings (section 6). | Yes |
| `server/src/profile/profiler.js` | The list of unknown profile fields (section 5). | Yes |
| `server/src/kit/buildKit.js` | Builds each Application Kit: steps per portal (NSP, MahaDBT 2.0, provider site), a generic document list, prefilled fields, and the safety check `assertKitSafe`. | Yes |

The JSON files hold the evidence. The `.js` files hold what the app actually does. When you confirm or fix a rule, update the JSON entry, and tell Samrat if the `.js` value has to change. The `server/` folder is owned by Samrat in `.github/CODEOWNERS`, so code changes go through him or a pull request he reviews.

## 2. Structure of a rule

In `eligibility-rules.json` (see its `schema` block for the full list):

```
rule:      id, title, category, source, source_url, read_on, scheme_type,
           criteria[], conflicts_with[], matches_persona, verified, needs_verification
criterion: field, op, value, persona_field, quote, from, read_on, clarity, needs_verification
```

- `id` is `<source>:<slug>`, the same as the plan item id.
- `clarity: "unclear"` means the page is ambiguous. The app must not hard-fail a student on an unclear criterion.
- `quote` is a short exact phrase from the page. If you cannot find the phrase on the page, the criterion is not verified.

In the code, the Judge returns for each scheme:

```
{ fit: 'match' | 'conditional' | 'unclear' | 'not_applicable', reason: '...', needsVerification: true | false }
```

- `reason` is the "why" line shown on the plan.
- `needsVerification: true` shows the yellow "needs verification" chip. Rules in `KNOWN` return `false`. All keyword rules return `true`, except the diploma rule.

## 3. Structure of a kit

The shape is `ApplicationKit` in `docs/EVENT_SCHEMA.md`. `buildKit.js` fills it:

- `steps`: per portal. NSP: OTR first (done by the student), log in, fill, submit, institute verification. MahaDBT 2.0: register there, deadline not published. Provider site: open the source page and apply there.
- `documents`: a generic list with `from: null`, shown as "usually needed · needs verification", unless the scout passed real documents with a source URL.
- `fields`: persona values (course, branch, category, domicile state, gender), then fields the student fills (income, institute, marks) with `value: null`, then sensitive fields (Aadhaar, OTP, password, bank details) with `value: null` and `sensitive: true`.
- `assertKitSafe` throws if any sensitive field has a value, or if the safety notice is missing. Never add a real Aadhaar number, password, OTP or bank detail to any file, not even as an example.

## 4. Adding or changing a rule

1. Open the official page. Copy the exact phrase. Note the URL and today's date.
2. Update `eligibility-rules.json`: the criterion's `value`, `quote`, `from`, `read_on`, `clarity`.
3. Decide which code value changes, and ask Samrat to change it (or open a pull request):
   - Income ceiling: one line in `INCOME_LIMITS` in `server/src/rank/rejudge.js`, for example `{ test: /scheme name/i, max: 2.5 * LAKH }`. The comment at the top of that file records where the ceilings were read.
   - A full rule for a named scheme: an entry in `KNOWN` in `server/src/rank/rules.js` with `test`, `fit` and `reason`. Write the reason in plain words, with the condition the student must meet.
   - CAP admission: the `NEEDS_CAP` pattern in `rejudge.js`. Domicile: `NEEDS_DOMICILE` (today: every MahaDBT item).
4. If a test checks the old value, update that test in the same commit (section 5 below lists them).
5. Run the tests. All must pass.
6. Never add a deadline by hand. Deadlines come only from fetched page text. If a page gives none, the app says "deadline not published".

## 5. Running the tests

```powershell
cd server
npm install
npm test          # all server tests (47 at the time of writing)

cd ..\web
npm install
npm test          # reducer, timeline, filters, .ics (8)
```

One file only:

```powershell
cd server
node --env-file=test/test.env --test test/history.test.js
```

Tests that touch rules:
- `server/test/history.test.js`: the Re-run test. It checks that ₹6 lakh income drops PM YASASVI college (₹2.5 lakh) and CSSS (₹4.5 lakh) but keeps Swanath (₹8 lakh). It also checks that a ₹2 lakh income gives "Income within the ₹2.5 lakh limit", that CAP "no" drops the MahaDBT OBC schemes, and that a re-run never changes a deadline.
- `server/test/live.test.js` and `server/test/fake.test.js`: the plan, the conflicts and the kits on saved fixtures.
- `server/test/history-api.test.js`: Re-run through the API.

## 6. Marking a rule as verified

- In `eligibility-rules.json`: set a criterion's `needs_verification` to `false` only after you found its quote on the official page. Set the rule's `verified` to `true` only after you checked every criterion. Put your check in `team/aman/data-verification-log.md` (who, date, result).
- In the app there is no "rule verified" flag yet (planned). The yellow chip goes away only when a scheme moves from the keyword rules into `KNOWN` in `rules.js`, which is a code change.
- Do not confuse this with the green "Verified" badge. That badge comes from the Verifier (`server/src/verify/verifier.js`). It means the page was re-opened and the scheme name and deadline are still on it. It says nothing about eligibility. One item can show both "Verified" and "needs verification".

## 7. Unknown fields

The sample profile does not state these. The Profiler (`server/src/profile/profiler.js`) lists them as "unknown, needs your input" and never guesses them. A scheme that depends on one stays "conditional".

| Field | How the plan shows it while unknown | What Re-run does with a value |
|---|---|---|
| Annual family income | In the profile panel under "Unknown (N): needs your input, never guessed". The input box shows "unknown, needs your input". Kit field "Annual family income" is empty. | Above a scheme's ceiling: the scheme moves to "Not applicable" with "Family income ₹X lakh is above this scheme's ₹Y lakh limit." Within it: the why line starts "Income within the ₹Y lakh limit". |
| CAP admission (Maharashtra) | Listed as unknown. Choice: unknown / yes / no. | "no" drops Post Matric Scholarship to OBC Students and Tuition Fees and Examination Fees to OBC Students with "Needs admission through CAP; the profile says no." |
| Maharashtra domicile certificate | Listed as unknown. Choice: unknown / yes / no. Kit lists "Domicile certificate (Maharashtra)" as usually needed for MahaDBT. | "no" drops every MahaDBT item with "State scheme: needs a Maharashtra domicile certificate; the profile says no." |
| Marks in the last exam | Listed as unknown. | Not used by Re-run yet (planned). |
| Scholarships already held (for example CSSS in 1st year) | Listed as unknown. | Not used by Re-run yet (planned). |
| Institute (AISHE code, notified "Top Class" or not) | Listed as unknown. | Not used by Re-run yet (planned). |

Re-run uses the same fetched data and fetches nothing new.

## 8. The two conflict warnings

Both use the same text (`CONFLICT_TEXT` in `server/src/rank/conflicts.js`):

> These may not be combinable. Check the current NSP rules before applying.

| Rule id | Pair | When the app quotes an official rule |
|---|---|---|
| `nsp-one-merit-scheme` | PM YASASVI (college) and PM-USP CSSS | Only when the live run finds the "one merit-based scheme" sentence on the fetched NSP home page. Then the warning quotes it and links it. |
| `csss-vs-state-fee-reimbursement` | PM-USP CSSS and a MahaDBT fee reimbursement or freeship (Post Matric OBC, Tuition Fees OBC) | Never. The rule is in the CSSS guideline PDF, which the app does not fetch (`pattern: null`). |

Do not change the warning to state a hard rule unless the official page says so. If you confirm the CSSS clause (guideline 4(iv) according to `eligibility-rules.json`), record the quote and URL in the log. Showing it in the app would need the PDF to be fetched, which is planned.

## 9. Known wrong or risky items

| Item | Risk | Current state | What to do |
|---|---|---|---|
| Rajarshri Chhatrapati Shahu Maharaj Fee Reimbursement | An earlier draft listed it as a match for the OBC sample student. The EBC/EWS target appears only in the scheme's Overview, not in the numbered Eligibility list (`eligibility-rules.json` `unclear_rules`). | Shown as "skipped", not a match (`MAHADBT_SKIPPED` in `server/src/fake/reconData.js`), with "unclear, not a hard fail". | Read the full scheme page. Confirm whether an OBC student is excluded, and log the quote. |
| Dr Panjabrao Deshmukh Hostel Maintenance Allowance | An earlier draft listed it as a match. The page says General and SEBC only. | Shown as "skipped" with "only General and SEBC category admissions are eligible". | Confirm the category list on the page and log it. |
| PM YASASVI (college) "2nd year: leftover slots only" | The phrase is in `rules.js` but not in `eligibility-rules.json`. | Shown in the why line. | Find the clause, or ask Samrat to remove the phrase. |
| PM-USP CSSS renewal for B.Tech | The FAQ seems to contradict the guideline. | Marked unclear in `eligibility-rules.json`. The app says "Renewal only". | Read both PDFs and log which one applies. |
| Tuition Fees to OBC: income | The scheme page states no income ceiling. | No ceiling in `INCOME_LIMITS`. | Confirm. Do not add a ceiling without a quote. |
| Tata Capital Pankh (general graduation) | Its course list may not include B.Tech. | Kept with an income ceiling of ₹4 lakh. | Confirm whether B.Tech students qualify. |
| Generic kit documents | Not read from any page. | Shown as "usually needed · needs verification". | For each scheme, list the documents its page actually asks for. |
