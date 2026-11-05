import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve(import.meta.dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'joblist.db');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS departments (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort INTEGER NOT NULL DEFAULT 0
  );

  -- A team is one block in the joblist (a person, a pair, or a unit such as "Video").
  CREATE TABLE IF NOT EXISTS teams (
    id            INTEGER PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES departments(id),
    name          TEXT NOT NULL,
    sort          INTEGER NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    UNIQUE (department_id, name)
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'head', 'member')),
    department_id INTEGER REFERENCES departments(id),
    team_id       INTEGER REFERENCES teams(id),
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One sheet tab of the old workbook = one week.
  CREATE TABLE IF NOT EXISTS weeks (
    id         INTEGER PRIMARY KEY,
    week_start TEXT NOT NULL UNIQUE, -- Monday, YYYY-MM-DD
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id            INTEGER PRIMARY KEY,
    week_id       INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
    team_id       INTEGER NOT NULL REFERENCES teams(id),
    sort          INTEGER NOT NULL DEFAULT 0,
    title         TEXT NOT NULL,
    servicing     TEXT,
    monday_status TEXT,
    friday_status TEXT,
    notes         TEXT,
    updated_by    INTEGER REFERENCES users(id),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS jobs_week ON jobs(week_id, team_id, sort);

  CREATE TABLE IF NOT EXISTS job_log (
    id         INTEGER PRIMARY KEY,
    job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id),
    action     TEXT NOT NULL,
    detail     TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
