'use strict';
const fs = require('fs');
const Database = require('better-sqlite3');
const migrations = require('./migrations');
const log = require('../logger');

let db = null;

function open(file) {
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  migrate(db);
  return db;
}

function migrate(conn) {
  const current = conn.pragma('user_version', { simple: true });
  const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  for (const m of pending) {
    log.info(`Applying migration v${m.version}: ${m.name}`);
    conn.transaction(() => {
      m.up(conn);
      conn.pragma(`user_version = ${m.version}`);
    })();
  }
  return { from: current, to: conn.pragma('user_version', { simple: true }), applied: pending.length };
}

function close() {
  if (db) { try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ } db.close(); db = null; }
}

// Validate that a file is a Gene OS SQLite database before restoring it.
function validateFile(file) {
  const header = Buffer.alloc(16);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, header, 0, 16, 0); } finally { fs.closeSync(fd); }
  if (header.toString('utf8', 0, 15) !== 'SQLite format 3') throw new Error('Not a SQLite database file.');
  const probe = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const t = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tasks','settings','files')").all();
    if (t.length < 3) throw new Error('File is a SQLite database but not a Gene OS backup.');
    return { version: probe.pragma('user_version', { simple: true }) };
  } finally { probe.close(); }
}

const now = () => new Date().toISOString();

module.exports = { open, close, migrate, validateFile, get: () => db, now, latestVersion: () => Math.max(...migrations.map((m) => m.version)) };
