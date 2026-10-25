// Opens the repository: Postgres when DATABASE_URL is set and reachable, otherwise the
// local SQLite fallback (server/.data/lookout.db). If Postgres fails later, the
// repository switches to the local fallback on the spot. The run history JSON
// (history/history.js) and the recordings keep working whatever happens here.
// info() says which one is in use and why; it never contains the URL or a password.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { postgresDriver, sqliteDriver } from './drivers.js';
import { createSqlRepository } from './sqlRepository.js';

export const LOCAL_DB_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.data', 'lookout.db');

// DATE columns come back as 'YYYY-MM-DD' strings, never shifted by a time zone
pg.types.setTypeParser(1082, (v) => v);

/** An error description safe to show: the error code only, never a message that might echo the URL. */
export const safeReason = (err) => err?.code ?? err?.name ?? 'error';

async function openLocal(file) {
  try {
    const repo = createSqlRepository(sqliteDriver(file));
    await repo.migrate();
    return { repo, engine: file === ':memory:' ? 'sqlite (memory)' : 'sqlite' };
  } catch (err) {
    // the file could not be opened (permissions, a broken file): keep going in memory
    const repo = createSqlRepository(sqliteDriver(':memory:'));
    await repo.migrate();
    return { repo, engine: 'sqlite (memory)', note: `local file unavailable (${safeReason(err)})` };
  }
}

/**
 * @param {{ databaseUrl?: string, localFile?: string, connectTimeoutMs?: number, pool?: object }} [opts]
 *   pool replaces pg.Pool (tests)
 */
export async function openRepository({ databaseUrl = process.env.DATABASE_URL, localFile = process.env.LOOKOUT_DB_FILE || LOCAL_DB_FILE, connectTimeoutMs = 3000, pool } = {}) {
  const info = { kind: 'local', engine: null, fallbackReason: null, switchedAt: null };
  let primary = null;
  if (databaseUrl || pool) {
    const p = pool ?? new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: connectTimeoutMs, max: 5 });
    p.on?.('error', () => {}); // idle-client errors are handled by the switch below
    try {
      primary = createSqlRepository(postgresDriver(p));
      await primary.migrate();
      Object.assign(info, { kind: 'postgres', engine: 'postgres' });
    } catch (err) {
      primary = null;
      info.fallbackReason = `Postgres unreachable (${safeReason(err)}); using the local fallback`;
      await p.end?.().catch(() => {});
    }
  }
  let local = null;
  const getLocal = async () => {
    if (!local) {
      local = await openLocal(localFile);
      if (info.kind === 'local') info.engine = local.engine;
      if (local.note) info.fallbackReason = [info.fallbackReason, local.note].filter(Boolean).join('; ');
    }
    return local.repo;
  };
  if (!primary) await getLocal();

  // every call goes to Postgres while it works; on an error, switch to local for good
  const call = async (path, args) => {
    if (primary) {
      try {
        return await path(primary)(...args);
      } catch (err) {
        if (err?.code && /^(23|22)/.test(err.code)) throw err; // constraint and data errors are ours, not an outage
        primary.close().catch(() => {});
        primary = null;
        Object.assign(info, { kind: 'local', fallbackReason: `Postgres failed during use (${safeReason(err)}); switched to the local fallback`, switchedAt: new Date().toISOString() });
      }
    }
    const repo = await getLocal();
    info.engine = local.engine;
    return path(repo)(...args);
  };
  const wrap = (table, methods) => Object.fromEntries(methods.map((m) => [m, (...a) => call((r) => r[table][m].bind(r[table]), a)]));

  return {
    info: () => ({ ...info }),
    profiles: wrap('profiles', ['create', 'get']),
    runs: wrap('runs', ['create', 'finish', 'get', 'list', 'lastCompletedFor']),
    planItems: wrap('planItems', ['addMany', 'listByRun']),
    sources: wrap('sources', ['upsertMany', 'list']),
    saveRun: (...a) => call((r) => r.saveRun.bind(r), a),
    async close() {
      await primary?.close().catch(() => {});
      await local?.repo.close().catch(() => {});
    },
  };
}
