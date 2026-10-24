// LIVE mode, thin slice (Stage 3): real TinyFish Search + Fetch only. No Agent API,
// no Monitor, no logins, no form submissions. Sources are the ones that passed the
// 2026-10-24 recon (RECON_FINDINGS §3), NSP first:
//   nsp-scout          Search (headline) + Fetch NSP All-Scholarships and home
//   mahadbt-scout      Fetch MahaDBT 1.0 landing + 2 OBC scheme pages, try MahaDBT 2.0 once
//   foundations-scout  Search Buddy4Study, Fetch up to 4 detail pages
// Not used tonight (see SOURCES_NOT_USED): Vidyasaarathi, hackathon boards, the Watchtower.
// Deadlines come only from fetched page text; otherwise "deadline not published".

import * as tinyfish from './tinyfish/client.js';
import { findStudentClosingDate, parseAllScholarships, NSP_ALL_SCHOLARSHIPS_URL, slugify } from './parse/nsp.js';
import { parseBuddy4Study } from './parse/buddy4study.js';
import { assessByName, assessPageText } from './rank/rules.js';
import { CONFLICT_RULES, findRuleEvidence } from './rank/conflicts.js';
import { buildPlan, istToday } from './rank/ranker.js';
import { buildKit } from './kit/buildKit.js';
import * as recon from './fake/reconData.js';

const NSP_HOME = 'https://scholarships.gov.in/';
const MAHADBT_HOME = 'https://mahadbt.maharashtra.gov.in/';
const MAX_B4S_PAGES = 4;

export const SOURCES_NOT_USED = [
  { name: 'Vidyasaarathi', reason: 'Passed recon but most schemes seen were closed or state-restricted; left out of tonight\'s thin slice.' },
  { name: 'Hackathon boards (Devfolio, MLH, Devpost, HackerEarth, Unstop)', reason: 'Stage 5 (Opportunities) is skipped tonight.' },
  { name: 'Watchtower (TinyFish Monitor)', reason: 'Stage 5 is skipped tonight.' },
  { name: 'AICTE portals', reason: 'Fetch returned 403 in recon (blocked); the AICTE schemes are on NSP anyway.' },
  { name: 'Karnataka, UP and West Bengal portals', reason: 'Unreachable in recon (proxy_error).' },
  { name: 'Telangana ePASS', reason: 'Loaded in recon but has no dates.' },
  { name: 'Reliance Foundation', reason: 'No date on the page in recon; first-year only and closed.' },
];

/** Thrown before any event is emitted when live mode cannot start (no key, bad key, no network). */
export class LiveUnavailableError extends Error {}

const FATAL = new Set(['NO_API_KEY', 'NETWORK', 'TIMEOUT']);
const isFatal = (err) => FATAL.has(err.code) || err.status === 401 || err.status === 403;

const AGENTS = {
  'nsp-scout': { name: 'Nisha', role: 'NSP Researcher', building: 'nsp' },
  'mahadbt-scout': { name: 'Mahi', role: 'State Verifier', building: 'mahadbt' },
  'foundations-scout': { name: 'Fauzi', role: 'Foundations Researcher', building: 'foundations' },
  mayor: { name: 'Mayor Tara', role: 'Orchestrator', building: 'townhall' },
};

/**
 * @param {ReturnType<import('./bus.js').createRun>} run
 * @param {{ profile?: object, client?: {search: Function, fetchPages: Function}, today?: string, onLive?: Function }} [opts]
 *   onLive runs once the preflight passed, before the first event (the server starts recording there)
 */
export async function runLive(run, opts = {}) {
  const { profile = recon.SAMPLE_STUDENT, client = tinyfish, today = istToday(), onLive = () => {} } = opts;
  const startedAt = Date.now();
  const now = () => new Date().toISOString();

  // Preflight: the NSP Search is the first real call. If it fails for a fatal reason
  // nothing has been emitted yet, so the server can fall back to a recording cleanly.
  let nspSearch;
  try {
    nspSearch = await client.search({ query: 'closing dates for student application 2026-27', include_domains: 'scholarships.gov.in' });
  } catch (err) {
    if (isFatal(err)) throw new LiveUnavailableError(`${err.code}${err.status ? ` (${err.status})` : ''}: ${err.message}`);
    nspSearch = { error: err };
  }
  const searchCheckedAt = now();

  const found = [];
  const notApplicable = [];
  const notes = [];
  const ledger = []; // every source call: { name, url, ok, checkedAt, error? }
  const ruleEvidence = {};
  let headline = null;
  let errors = 0;

  onLive();
  const agentIds = Object.keys(AGENTS);
  run.emit('run.started', { payload: { profile, mode: 'live', today, agents: agentIds, sourcesNotUsed: SOURCES_NOT_USED } });
  for (const id of agentIds) {
    run.emit('agent.spawned', { agentId: id, building: 'townhall', payload: { name: AGENTS[id].name, role: AGENTS[id].role } });
  }

  const as = (agentId) => {
    const { building } = AGENTS[agentId];
    const emit = (kind, payload, at = building) => run.emit(kind, { agentId, building: at, payload });
    return {
      walk: (reason) => emit('agent.walking', { to: building, reason }, 'townhall'),
      work: (tool, target, label) => emit('agent.working', { tool, target, label }),
      progress: (text, tool) => emit('agent.progress', { text, ...(tool && { tool }) }),
      found: (opp) => {
        if (!opp.note) found.push(opp);
        emit('agent.found', opp);
      },
      error: (tool, target, err, retrying = false) => {
        errors++;
        emit('agent.error', { tool, target, code: err.code ?? 'error', message: err.message ?? String(err), retrying, ...(err.requestId && { requestId: err.requestId }) });
      },
      done: (n, t0) => emit('agent.done', { findings: n, durationMs: Date.now() - t0 }),
      back: () => emit('agent.returning', { to: 'townhall' }),
    };
  };
  const log = (name, url, ok, error) => ledger.push({ name, url, ok, checkedAt: now(), ...(error && { error }) });

  /** Fetch with per-URL results; failures become agent.error and ledger entries, never crashes. */
  async function fetchAll(a, label, entries, opts2 = {}) {
    a.work('fetch', entries.length === 1 ? entries[0].url : `${entries.length} pages`, label);
    try {
      const { results, errors: errs } = await client.fetchPages({ urls: entries.map((e) => e.url), format: 'markdown', per_url_timeout_ms: 45_000, ...opts2 });
      const byUrl = new Map(results.map((r) => [r.url, r]));
      for (const e of entries) {
        const r = byUrl.get(e.url);
        const err = errs.find((x) => x.url === e.url);
        if (r?.text) {
          log(e.name, e.url, true);
          r.checkedAt = now();
        } else {
          const why = err ? `${err.error}${err.status ? ` (${err.status})` : ''}` : 'empty page';
          log(e.name, e.url, false, why);
          a.error('fetch', e.url, { code: err?.error ?? 'empty', message: `${e.name} did not load: ${why}` });
        }
      }
      return byUrl;
    } catch (err) {
      for (const e of entries) log(e.name, e.url, false, err.code);
      a.error('fetch', entries[0].url, err);
      return new Map();
    }
  }

  const opp = (o) => ({
    kind: 'scholarship',
    dateSource: o.deadline ? 'parsed' : 'none',
    via: 'fetch',
    cached: false,
    matchedOn: [],
    ...o,
    deadlineLabel: o.deadline ? o.deadlineLabel : 'deadline not published',
  });

  async function nspScout() {
    const a = as('nsp-scout');
    const t0 = Date.now();
    a.walk('Checking the national scholarship list');
    a.work('search', 'closing dates for student application 2026-27 (scholarships.gov.in)', 'Search NSP');
    if (nspSearch.error) {
      ledger.push({ name: 'NSP Search', url: NSP_HOME, ok: false, checkedAt: searchCheckedAt, error: nspSearch.error.code });
      a.error('search', NSP_HOME, nspSearch.error);
    } else {
      ledger.push({ name: 'NSP Search', url: NSP_HOME, ok: true, checkedAt: searchCheckedAt });
      for (const r of nspSearch.results ?? []) {
        const hit = findStudentClosingDate(`${r.title ?? ''} ${r.snippet ?? ''}`);
        if (hit && hit.date >= today) {
          headline = { text: `NSP student applications close ${hit.date.split('-').reverse().join('-')}`, date: hit.date, sourceUrl: r.url, evidence: hit.evidence, dateSource: 'snippet' };
          break;
        }
      }
    }

    const pages = await fetchAll(a, 'Fetch NSP scheme list and home', [
      { name: 'NSP All-Scholarships', url: NSP_ALL_SCHOLARSHIPS_URL },
      { name: 'NSP home', url: NSP_HOME },
    ]);
    const home = pages.get(NSP_HOME);
    if (home?.text) {
      const hit = findStudentClosingDate(home.text);
      if (hit) headline = { text: `NSP student applications close ${hit.date.split('-').reverse().join('-')}`, date: hit.date, sourceUrl: NSP_HOME, evidence: hit.evidence, dateSource: 'parsed' };
      for (const rule of CONFLICT_RULES) {
        const ev = findRuleEvidence(rule, home.text);
        if (ev) ruleEvidence[rule.id] = { ...ev, sourceUrl: NSP_HOME, checkedAt: home.checkedAt };
      }
    }
    if (headline) a.found({ note: true, headline: true, text: headline.evidence, sourceUrl: headline.sourceUrl, bubble: `NSP closes ${headline.date.slice(8)}/${headline.date.slice(5, 7)}` });

    const list = pages.get(NSP_ALL_SCHOLARSHIPS_URL);
    let n = 0;
    if (list?.text) {
      const schemes = parseAllScholarships(list.text);
      const kept = [];
      for (const s of schemes) {
        const fit = assessByName(s.name, profile);
        if (fit.fit === 'not_applicable') notApplicable.push({ title: s.name, reason: fit.reason, sourceUrl: NSP_ALL_SCHOLARSHIPS_URL, checkedAt: list.checkedAt });
        else kept.push([s, fit]);
      }
      a.progress(`Parsed ${schemes.length} schemes from the live page; ${kept.length} may fit, ${schemes.length - kept.length} do not`, 'fetch');
      for (const [s, fit] of kept) {
        n++;
        a.found(opp({
          id: `nsp:${s.slug}`,
          fit: fit.fit,
          title: s.name,
          deadline: s.applyTill,
          deadlineLabel: s.renewalOnly ? 'Student application closes (renewals)' : 'Student application closes',
          sourceUrl: NSP_ALL_SCHOLARSHIPS_URL,
          checkedAt: list.checkedAt,
          matchReason: fit.reason,
          needsVerification: fit.needsVerification,
          source: 'nsp',
          evidence: s.evidence,
          amount: null,
          bubble: `${s.name.slice(0, 38)}…${s.applyTill ? ` ${s.applyTill.slice(8)}/${s.applyTill.slice(5, 7)}` : ''}`,
          scholarship: { portal: 'nsp', schemeType: s.schemeType, openFrom: s.openFrom, verificationTill: s.verificationTill, conditional: fit.fit !== 'match' },
        }));
      }
    }
    a.done(n, t0);
    a.back();
  }

  async function mahadbtScout() {
    const a = as('mahadbt-scout');
    const t0 = Date.now();
    a.walk('Checking Maharashtra state schemes');
    const pages = await fetchAll(a, 'Fetch MahaDBT landing and 2 OBC scheme pages', [
      { name: 'MahaDBT 1.0 landing', url: MAHADBT_HOME },
      ...recon.mahadbt.map((o) => ({ name: o.title, url: o.sourceUrl })),
    ]);
    const landing = pages.get(MAHADBT_HOME);
    if (landing?.text && /mahadbt\s*2\.0|mahadbt2/i.test(landing.text)) {
      const line = landing.text.match(/[^\n.]*MahaDBT\s*2\.0[^\n.]*/i)?.[0].trim();
      notes.push(`MahaDBT: ${line ?? 'applications are on MahaDBT 2.0'}`);
      a.found({ note: true, text: line ?? 'MahaDBT 2.0 notice', sourceUrl: MAHADBT_HOME, bubble: 'AY 2026-27: apply on MahaDBT 2.0' });
    }
    let n = 0;
    for (const o of recon.mahadbt) {
      const page = pages.get(o.sourceUrl);
      if (!page?.text) continue;
      n++;
      a.found(opp({
        ...o,
        fit: 'conditional',
        deadline: null, // scheme pages publish no deadline
        checkedAt: page.checkedAt,
        needsVerification: false,
        evidence: page.title ?? o.title,
        dateSource: 'none',
      }));
    }
    for (const s of recon.MAHADBT_SKIPPED) {
      notApplicable.push({ title: s.title, reason: `${s.reason[0].toUpperCase()}${s.reason.slice(1)} (rule read on 2026-10-24).`, sourceUrl: s.sourceUrl, checkedAt: recon.RECON_CHECKED_AT });
    }
    // MahaDBT 2.0 failed twice in recon; one honest try, no retries loop
    const m2 = await fetchAll(a, 'Try MahaDBT 2.0 (for deadlines)', [{ name: 'MahaDBT 2.0', url: recon.MAHADBT2_FAILURE.url }], { per_url_timeout_ms: 25_000 });
    if (m2.get(recon.MAHADBT2_FAILURE.url)?.text) a.progress('MahaDBT 2.0 loaded; its deadlines are not parsed yet', 'fetch');
    a.done(n, t0);
    a.back();
  }

  async function foundationsScout() {
    const a = as('foundations-scout');
    const t0 = Date.now();
    a.walk('Checking private and foundation scholarships');
    a.work('search', 'B.Tech engineering scholarship 2026-27 deadline (buddy4study.com)', 'Search Buddy4Study');
    let urls = [];
    try {
      const res = await client.search({ query: 'scholarship 2026-27 engineering B.Tech students deadline date', include_domains: 'buddy4study.com' });
      ledger.push({ name: 'Buddy4Study Search', url: 'https://www.buddy4study.com/', ok: true, checkedAt: now() });
      urls = [...new Set((res.results ?? []).map((r) => r.url).filter((u) => /buddy4study\.com\/(page|scholarship)\//.test(u)))].slice(0, MAX_B4S_PAGES);
    } catch (err) {
      ledger.push({ name: 'Buddy4Study Search', url: 'https://www.buddy4study.com/', ok: false, checkedAt: now(), error: err.code });
      a.error('search', 'https://www.buddy4study.com/', err);
    }
    let n = 0;
    if (urls.length) {
      const pages = await fetchAll(a, `Fetch ${urls.length} Buddy4Study pages`, urls.map((url) => ({ name: `Buddy4Study ${url.split('/').pop()}`, url })));
      for (const url of urls) {
        const page = pages.get(url);
        if (!page?.text) continue;
        const p = parseBuddy4Study(page.text, today);
        const title = p.title ?? page.title ?? url.split('/').pop();
        if (p.pastDeadline) {
          notApplicable.push({ title, reason: `Closed: the last deadline on the page (${p.pastDeadline}) has passed.`, sourceUrl: url, checkedAt: page.checkedAt });
          continue;
        }
        const fit = assessPageText(title, p.main, profile);
        if (fit.fit === 'not_applicable') {
          notApplicable.push({ title, reason: fit.reason, sourceUrl: url, checkedAt: page.checkedAt });
          continue;
        }
        n++;
        a.found(opp({
          id: `buddy4study:${slugify(url.split('/').pop())}`,
          fit: fit.fit,
          title,
          deadline: p.deadline,
          deadlineLabel: 'Application closes',
          sourceUrl: url,
          checkedAt: page.checkedAt,
          matchReason: fit.reason,
          needsVerification: true,
          source: 'buddy4study',
          evidence: p.evidence,
          amount: p.amount,
          bubble: `${title.slice(0, 40)}…`,
          scholarship: { portal: 'external', schemeType: null, openFrom: null, verificationTill: null, conditional: fit.fit !== 'match' },
        }));
      }
    } else {
      a.progress('No Buddy4Study detail pages found by Search', 'search');
    }
    a.done(n, t0);
    a.back();
  }

  const sources = () => {
    const failed = ledger.filter((l) => !l.ok).length;
    const times = ledger.map((l) => l.checkedAt).sort();
    return { checked: ledger.length, failed, lastChecked: times.at(-1) ?? null, list: ledger, notUsed: SOURCES_NOT_USED };
  };
  const planNow = (extra = {}) => buildPlan(found, { today, headline, notes, notApplicable, ruleEvidence, sources: sources(), ...extra });
  const mayorPlan = (kind, extra) => run.emit(kind, { agentId: 'mayor', building: 'townhall', payload: planNow(extra) });

  await Promise.all([
    nspScout().then(() => mayorPlan('plan.updated')),
    mahadbtScout().then(() => mayorPlan('plan.updated')),
    foundationsScout().then(() => mayorPlan('plan.updated')),
  ]);

  const kitIds = new Map();
  const planned = new Set(planNow().items.map((i) => i.opportunityId));
  for (const o of found.filter((x) => x.kind === 'scholarship' && planned.has(x.id))) {
    const kit = buildKit(o, profile, { today });
    kitIds.set(o.id, kit.id);
    run.emit('kit.ready', { agentId: 'mayor', building: 'townhall', payload: kit });
  }
  mayorPlan('plan.ready', { kitIds });
  run.emit('run.complete', { payload: { durationMs: Date.now() - startedAt, findings: found.length, errors } });
}
