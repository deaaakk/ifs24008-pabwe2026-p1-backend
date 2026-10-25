import { Database } from 'bun:sqlite';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

mkdirSync(fileURLToPath(new URL('../data', import.meta.url)), { recursive: true });

const path = process.env.DB_PATH ?? fileURLToPath(new URL('../data/reservasi.db', import.meta.url));
if(path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
export const db = new Database(path, { create: true });

db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

db.run(`
  CREATE TABLE IF NOT EXISTS rooms (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    location    TEXT    NOT NULL,
    capacity    INTEGER NOT NULL CHECK (capacity > 0),
    facilities  TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS reservations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id       INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    borrower_name TEXT    NOT NULL,
    purpose       TEXT    NOT NULL,
    date          TEXT    NOT NULL,           -- YYYY-MM-DD
    start_time    TEXT    NOT NULL,           -- HH:MM
    end_time      TEXT    NOT NULL,           -- HH:MM
    status        TEXT    NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','cancelled')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

db.run('CREATE INDEX IF NOT EXISTS idx_res_room_date ON reservations(room_id, date)');

// Migrasi aman untuk database dari versi sebelumnya.
db.run(`CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'mahasiswa' CHECK(role IN ('mahasiswa','ketua','dosen','admin')),
 class_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
if (!db.query('PRAGMA table_info(reservations)').all().some(c => c.name === 'user_id')) {
 db.run('ALTER TABLE reservations ADD COLUMN user_id INTEGER REFERENCES users(id)');
}
db.run(`CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
)`);
