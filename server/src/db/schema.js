// Schema migrations, one list per dialect (Postgres and the local SQLite fallback).
// Applied in order and recorded in schema_migrations, so each runs once per database.
// Rules the schema enforces:
//   - plan_items.source_url and plan_items.last_checked are NOT NULL (every item has a source and a read time)
//   - plan_items.deadline is nullable: a deadline is never invented, "not published" goes in deadline_note
//   - plan_items.status is one of match | conditional | unclear | no
//   - profiles keep only what matching needs; unknown facts stay NULL

const STATUS = "CHECK (status IN ('match', 'conditional', 'unclear', 'no'))";

export const MIGRATIONS = [
  {
    id: '001_init',
    postgres: `
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        label TEXT,
        state TEXT,
        category TEXT,
        course TEXT,
        year INTEGER,
        extra JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK (mode IN ('live', 'replay', 'mock', 'fake')),
        profile_id TEXT REFERENCES profiles(id),
        started_at TIMESTAMPTZ NOT NULL,
        finished_at TIMESTAMPTZ,
        status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed'))
      );
      CREATE TABLE IF NOT EXISTS plan_items (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        scheme_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL ${STATUS},
        deadline DATE,
        deadline_note TEXT,
        amount TEXT,
        source_url TEXT NOT NULL,
        last_checked TIMESTAMPTZ NOT NULL,
        verifier_status TEXT,
        rank INTEGER,
        why_ranked TEXT
      );
      CREATE INDEX IF NOT EXISTS plan_items_run ON plan_items(run_id);
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT,
        kind TEXT NOT NULL,
        used BOOLEAN NOT NULL,
        not_used_reason TEXT,
        last_checked TIMESTAMPTZ
      );`,
    sqlite: `
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        label TEXT,
        state TEXT,
        category TEXT,
        course TEXT,
        year INTEGER,
        extra TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK (mode IN ('live', 'replay', 'mock', 'fake')),
        profile_id TEXT REFERENCES profiles(id),
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed'))
      );
      CREATE TABLE IF NOT EXISTS plan_items (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        scheme_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL ${STATUS},
        deadline TEXT CHECK (deadline IS NULL OR deadline GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        deadline_note TEXT,
        amount TEXT,
        source_url TEXT NOT NULL,
        last_checked TEXT NOT NULL,
        verifier_status TEXT,
        rank INTEGER,
        why_ranked TEXT
      );
      CREATE INDEX IF NOT EXISTS plan_items_run ON plan_items(run_id);
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT,
        kind TEXT NOT NULL,
        used INTEGER NOT NULL CHECK (used IN (0, 1)),
        not_used_reason TEXT,
        last_checked TEXT
      );`,
  },
];
