import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkItem, dateForms, verifyItems } from '../src/verify/verifier.js';
import { parseAllScholarships } from '../src/parse/nsp.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const NSP = fixture('nsp-all-scholarships.md');
const B4S = fixture('b4s-tata-pankh.md');
const yasasvi = parseAllScholarships(NSP).find((s) => /Top Class Education In College For OBC/.test(s.name));
const nspItem = { opportunityId: 'nsp:y', title: yasasvi.name, deadline: yasasvi.applyTill, source: 'nsp', sourceUrl: 'https://scholarships.gov.in/All-Scholarships' };
const b4sItem = { opportunityId: 'b4s:tata', title: 'Tata Capital Pankh Scholarship Program 2026-27', deadline: '2026-10-26', source: 'buddy4study', sourceUrl: 'https://www.buddy4study.com/page/the-tata-capital-pankh-scholarship-programme' };

test('date forms cover the ways pages write a date', () => {
  const f = dateForms('2026-10-31');
  for (const s of ['31 10 2026', '31 oct 2026', 'october 31 2026', '31st october 2026', '2026 10 31']) assert.ok(f.includes(s), s);
  assert.ok(dateForms('2026-11-02').includes('2nd november 2026'));
});

test('verified: name and deadline still on the page (NSP list and a Buddy4Study page)', () => {
  assert.equal(checkItem(nspItem, NSP).status, 'verified');
  assert.equal(checkItem(b4sItem, B4S).status, 'verified');
  assert.equal(checkItem({ ...nspItem, deadline: null }, NSP).status, 'verified');
});

test('changed: the deadline moved, or the scheme is gone', () => {
  const moved = NSP.replaceAll('31-10-2026', '15-11-2026');
  const r = checkItem(nspItem, moved);
  assert.equal(r.status, 'changed');
  assert.match(r.reason, /deadline 2026-10-31 is no longer on the page/);
  const gone = checkItem({ ...b4sItem, title: 'Some Scholarship That Was Removed 2026-27' }, B4S);
  assert.equal(gone.status, 'changed');
  assert.match(gone.reason, /name no longer appears/);
});

test('verifyItems: re-fetches with the cache bypassed, never drops an item, marks failures as could-not-verify', async () => {
  const calls = [];
  const gatekeeper = {
    async fetchPages({ urls, ttl }) {
      calls.push({ urls, ttl });
      return {
        results: urls.filter((u) => u.includes('scholarships.gov.in')).map((url) => ({ url, text: NSP, fetchedAt: '2026-10-24T18:00:00.000Z' })),
        errors: urls.filter((u) => !u.includes('scholarships.gov.in')).map((url) => ({ url, error: 'bot_blocked', status: 403, blocked: true })),
      };
    },
  };
  const items = [nspItem, b4sItem, { ...nspItem, opportunityId: 'nsp:z' }];
  const out = await verifyItems(items, gatekeeper);
  assert.equal(out.size, 3, 'nothing dropped');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ttl, 0, 'a real re-check, not a cache read');
  assert.equal(calls[0].urls.length, 2, 'each distinct URL fetched once');
  assert.equal(out.get('nsp:y').status, 'verified');
  assert.equal(out.get('nsp:y').checkedAt, '2026-10-24T18:00:00.000Z');
  assert.equal(out.get('b4s:tata').status, 'unverified');
  assert.match(out.get('b4s:tata').reason, /bot_blocked \(403\), host blocked/);

  const stale = await verifyItems([nspItem], { fetchPages: async ({ urls }) => ({ results: urls.map((url) => ({ url, text: NSP, stale: true, fetchedAt: '2026-10-24T10:00:00.000Z' })), errors: [] }) });
  assert.equal(stale.get('nsp:y').status, 'unverified', 'an old cached copy is not a fresh check');
});
