// Drivers for the repository: Postgres (pg, used only when DATABASE_URL is set) and the
// local fallback (node:sqlite, built into Node 24, no flag needed). Both take SQL with
// $1, $2, ... placeholders and bound values only.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** A serial queue: transactions (and statements outside them) never interleave. */
function makeQueue() {
  let tail = Promise.resolve();
  return (fn) => {
    const next = tail.then(fn, fn);
    tail = next.catch(() => {});
    return next;
  };
}

/** @param {import('pg').Pool} pool */
export function postgresDriver(pool) {
  return {
    dialect: 'postgres',
    async query(sql, params = []) {
      return (await pool.query(sql, params)).rows;
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(async (sql, params = []) => (await client.query(sql, params)).rows, (sql) => client.query(sql).then(() => {}));
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

// SQLite numbers its parameters ?1, ?2, ... and has no boolean type.
const toSqlite = (sql) => sql.replace(/\$(\d+)/g, '?$1');
const bind = (params) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

/** @param {string} file a path, or ':memory:' */
export function sqliteDriver(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  const run = (sql, params) => {
    const stmt = db.prepare(toSqlite(sql));
    return /^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql) ? stmt.all(...bind(params)) : (stmt.run(...bind(params)), []);
  };
  const queue = makeQueue();
  return {
    dialect: 'sqlite',
    query: (sql, params = []) => queue(async () => run(sql, params)),
    transaction: (fn) =>
      queue(async () => {
        db.exec('BEGIN');
        try {
          const out = await fn(async (sql, params = []) => run(sql, params), async (sql) => db.exec(sql));
          db.exec('COMMIT');
          return out;
        } catch (err) {
          try {
            db.exec('ROLLBACK');
          } catch {
            /* already rolled back */
          }
          throw err;
        }
      }),
    close: async () => db.close(),
  };
}
