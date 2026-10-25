// The repository: profiles, runs, planItems, sources. The rest of the server uses only
// this interface. One implementation over a small driver ({ dialect, query, exec, close }),
// so Postgres and the local SQLite fallback run the same SQL. Every query is
// parameterised ($1, $2, ...); values are never put into SQL text.

import { randomUUID } from 'node:crypto';
import { MIGRATIONS } from './schema.js';

export const ITEM_STATUSES = ['match', 'conditional', 'unclear', 'no'];

const iso = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
const day = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const json = (v) => (v == null ? {} : typeof v === 'string' ? JSON.parse(v) : v);

const profileRow = (r) =>
  r && { id: r.id, label: r.label, state: r.state, category: r.category, course: r.course, year: r.year == null ? null : Number(r.year), extra: json(r.extra), createdAt: iso(r.created_at) };
const runRow = (r) =>
  r && { id: r.id, mode: r.mode, profileId: r.profile_id, startedAt: iso(r.started_at), finishedAt: iso(r.finished_at), status: r.status, ...(r.items !== undefined && { items: Number(r.items) }) };
const itemRow = (r) => ({
  id: r.id,
  runId: r.run_id,
  schemeId: r.scheme_id,
  name: r.name,
  type: r.type,
  status: r.status,
  deadline: day(r.deadline),
  deadlineNote: r.deadline_note,
  amount: r.amount,
  sourceUrl: r.source_url,
  lastChecked: iso(r.last_checked),
  verifierStatus: r.verifier_status,
  rank: r.rank == null ? null : Number(r.rank),
  whyRanked: r.why_ranked,
});
const sourceRow = (r) => ({ id: r.id, name: r.name, url: r.url, kind: r.kind, used: Boolean(r.used), notUsedReason: r.not_used_reason, lastChecked: iso(r.last_checked) });

/** The four tables' operations over one query function (the pool, or a transaction). */
function tables(q) {
  const profiles = {
    async create(p) {
      const id = p.id ?? randomUUID();
      await q('INSERT INTO profiles (id, label, state, category, course, year, extra) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
        id,
        p.label ?? null,
        p.state ?? null,
        p.category ?? null,
        p.course ?? null,
        Number.isInteger(p.year) ? p.year : null,
        JSON.stringify(p.extra ?? {}),
      ]);
      return id;
    },
    async get(id) {
      return profileRow((await q('SELECT * FROM profiles WHERE id = $1', [id]))[0]) ?? null;
    },
  };

  const runs = {
    async create(r) {
      await q('INSERT INTO runs (id, mode, profile_id, started_at, finished_at, status) VALUES ($1, $2, $3, $4, $5, $6)', [
        r.id,
        r.mode,
        r.profileId ?? null,
        r.startedAt,
        r.finishedAt ?? null,
        r.status ?? 'running',
      ]);
      return r.id;
    },
    async finish(id, { finishedAt, status }) {
      await q('UPDATE runs SET finished_at = $1, status = $2 WHERE id = $3', [finishedAt, status, id]);
    },
    async get(id) {
      return runRow((await q('SELECT * FROM runs WHERE id = $1', [id]))[0]) ?? null;
    },
    /** Deletes a run, its plan items, and its profile when no other run uses it. */
    async remove(id) {
      const run0 = runRow((await q('SELECT * FROM runs WHERE id = $1', [id]))[0]);
      if (!run0) return false;
      await q('DELETE FROM plan_items WHERE run_id = $1', [id]);
      await q('DELETE FROM runs WHERE id = $1', [id]);
      if (run0.profileId) await q('DELETE FROM profiles WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM runs WHERE profile_id = $1)', [run0.profileId]);
      return true;
    },
    /** The newest completed run whose profile has the same state, category, course and year. */
    async lastCompletedFor(p, modes = ['live', 'replay']) {
      const rows = await q(
        `SELECT r.* FROM runs r JOIN profiles p ON p.id = r.profile_id
         WHERE r.status = 'complete' AND r.mode IN ($1, $2)
           AND COALESCE(p.state, '') = $3 AND COALESCE(p.category, '') = $4 AND COALESCE(p.course, '') = $5 AND COALESCE(p.year, -1) = $6
         ORDER BY r.finished_at DESC, r.id DESC LIMIT 1`,
        [modes[0], modes[1] ?? modes[0], p.state ?? '', p.category ?? '', p.course ?? '', Number.isInteger(p.year) ? p.year : -1],
      );
      return runRow(rows[0]) ?? null;
    },
    async list({ limit = 20 } = {}) {
      const n = Math.max(1, Math.min(100, Number(limit) || 20));
      const rows = await q(
        'SELECT r.*, (SELECT COUNT(*) FROM plan_items i WHERE i.run_id = r.id) AS items FROM runs r ORDER BY r.started_at DESC, r.id DESC LIMIT $1',
        [n],
      );
      return rows.map(runRow);
    },
  };

  const planItems = {
    async addMany(runId, items) {
      for (const i of items) {
        if (!ITEM_STATUSES.includes(i.status)) throw new Error(`plan item status must be one of ${ITEM_STATUSES.join(', ')}`);
        await q(
          `INSERT INTO plan_items (id, run_id, scheme_id, name, type, status, deadline, deadline_note, amount, source_url, last_checked, verifier_status, rank, why_ranked)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            `${runId}:${i.schemeId}`,
            runId,
            i.schemeId,
            i.name,
            i.type,
            i.status,
            i.deadline ?? null,
            i.deadlineNote ?? null,
            i.amount ?? null,
            i.sourceUrl,
            i.lastChecked,
            i.verifierStatus ?? null,
            i.rank ?? null,
            i.whyRanked ?? null,
          ],
        );
      }
      return items.length;
    },
    async listByRun(runId) {
      // ranked items first, in rank order; then the unranked (not applicable) ones
      const rows = await q('SELECT * FROM plan_items WHERE run_id = $1 ORDER BY CASE WHEN rank IS NULL THEN 1 ELSE 0 END, rank, name', [runId]);
      return rows.map(itemRow);
    },
  };

  const sources = {
    async upsertMany(list) {
      for (const s of list) {
        await q(
          `INSERT INTO sources (id, name, url, kind, used, not_used_reason, last_checked) VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET name = excluded.name, url = excluded.url, kind = excluded.kind, used = excluded.used,
             not_used_reason = excluded.not_used_reason, last_checked = COALESCE(excluded.last_checked, sources.last_checked)`,
          [s.id, s.name, s.url ?? null, s.kind, Boolean(s.used), s.notUsedReason ?? null, s.lastChecked ?? null],
        );
      }
      return list.length;
    },
    async list() {
      return (await q('SELECT * FROM sources ORDER BY used DESC, name')).map(sourceRow);
    },
  };

  return { profiles, runs, planItems, sources };
}

/**
 * @param {{ dialect: 'postgres'|'sqlite', query: (sql: string, params?: unknown[]) => Promise<object[]>,
 *   transaction: <T>(fn: (q: Function, exec: (sql: string) => Promise<void>) => Promise<T>) => Promise<T>,
 *   close: () => Promise<void> }} driver
 */
export function createSqlRepository(driver) {
  const base = tables((sql, params = []) => driver.query(sql, params));
  return {
    dialect: driver.dialect,
    async migrate() {
      await driver.transaction(async (q, exec) => {
        await exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY)');
        const done = new Set((await q('SELECT id FROM schema_migrations')).map((r) => r.id));
        for (const m of MIGRATIONS) {
          if (done.has(m.id)) continue;
          await exec(m[driver.dialect]);
          await q('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
        }
      });
    },
    ...base,
    /** Saves one finished run (profile, run, items, sources) in a single transaction. */
    saveRun({ profile, run, items, sources: srcs = [] }) {
      return driver.transaction(async (q) => {
        const t = tables(q);
        const profileId = profile ? await t.profiles.create(profile) : null;
        await t.runs.create({ ...run, profileId });
        await t.planItems.addMany(run.id, items);
        await t.sources.upsertMany(srcs);
        return { runId: run.id, profileId, items: items.length };
      });
    },
    close: () => driver.close(),
  };
}
