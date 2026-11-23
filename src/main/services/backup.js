'use strict';
// Backup / restore / export / import / reset.
// Backups are consistent SQLite snapshots made with the online backup API (safe while the app runs).
// Restore is staged: the chosen file is validated, copied to pending-restore.db and applied on next start
// (the current database is kept as backups/pre-restore-<timestamp>.db).
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const database = require('../db/database');
const paths = require('../paths');
const settings = require('./settings');
const log = require('../logger');

const TABLES = ['settings', 'tasks', 'task_templates', 'projects', 'proposal_sections', 'section_versions', 'milestones', 'courses', 'course_topics', 'flashcards', 'notes', 'collections', 'files', 'apps', 'bookmarks', 'activity', 'notifications', 'clipboard', 'command_history', 'aliases', 'time_logs', 'tool_runs'];
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

let timer = null;

const backup = {
  async create({ dest, auto = false } = {}) {
    const file = dest || path.join(paths.backupsDir(), `${auto ? 'auto' : 'manual'}-gene-os-${stamp()}.db`);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await database.get().backup(file);
    settings.set('backup.last', new Date().toISOString());
    if (auto) await prune();
    log.info('backup created', file);
    return { file, size: fs.statSync(file).size };
  },
  list() {
    const dir = paths.backupsDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.db')).map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { name: f, file: path.join(dir, f), size: st.size, created_at: st.mtime.toISOString(), auto: f.startsWith('auto-') };
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async remove(file) {
    if (path.dirname(path.resolve(file)) !== path.resolve(paths.backupsDir())) throw new Error('Only files in the backups folder can be deleted here.');
    await fsp.rm(file, { force: true });
    return true;
  },
  // Stage a restore; caller relaunches the app.
  stageRestore(file) {
    const info = database.validateFile(file);
    if (info.version > database.latestVersion()) throw new Error('This backup was created by a newer version of Gene OS.');
    fs.copyFileSync(file, paths.pendingRestore());
    return { staged: true, version: info.version };
  },
  // Called at startup BEFORE the database is opened.
  applyPendingRestore() {
    const pending = paths.pendingRestore();
    if (!fs.existsSync(pending)) return false;
    const db = paths.dbFile();
    if (fs.existsSync(db)) fs.copyFileSync(db, path.join(paths.backupsDir(), `pre-restore-${stamp()}.db`));
    for (const ext of ['', '-wal', '-shm']) { try { fs.rmSync(db + ext, { force: true }); } catch { /* ignore */ } }
    fs.renameSync(pending, db);
    log.info('restore applied from staged backup');
    return true;
  },
  exportJson() {
    const d = database.get();
    const out = { format: 'gene-os-export', version: d.pragma('user_version', { simple: true }), exported_at: new Date().toISOString(), tables: {} };
    for (const t of TABLES) out.tables[t] = d.prepare(`SELECT * FROM ${t}`).all();
    return JSON.stringify(out, null, 1);
  },
  // Replaces all data with the content of a JSON export (single transaction: all-or-nothing).
  importJson(text) {
    const data = JSON.parse(text);
    if (!['gene-os-export', 'gene-terminal-export'].includes(data.format) || !data.tables) throw new Error('Not a Gene OS JSON export.');
    const d = database.get();
    d.transaction(() => {
      for (const t of TABLES) d.prepare(`DELETE FROM ${t}`).run();
      for (const t of TABLES) {
        const rows = data.tables[t] || [];
        if (!rows.length) continue;
        const cols = d.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
        for (const r of rows) {
          const keys = Object.keys(r).filter((k) => cols.includes(k));
          d.prepare(`INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => r[k]));
        }
      }
    })();
    return { ok: true };
  },
  reset({ keepProfile = true } = {}) {
    const d = database.get();
    d.transaction(() => {
      for (const t of TABLES) {
        if (t === 'settings' && keepProfile) d.prepare("DELETE FROM settings WHERE key <> 'profile' AND key NOT LIKE 'security.%'").run();
        else d.prepare(`DELETE FROM ${t}`).run();
      }
      d.prepare('DELETE FROM search_fts').run();
    })();
    return true;
  },
};

async function prune() {
  const keep = Math.max(1, Number(settings.get('backup.keep')) || 10);
  const autos = backup.list().filter((b) => b.auto);
  for (const b of autos.slice(keep)) await fsp.rm(b.file, { force: true });
}

function startScheduler() {
  stopScheduler();
  const check = async () => {
    try {
      const freq = settings.get('backup.auto');
      if (!freq || freq === 'off') return;
      const last = settings.get('backup.last');
      const span = freq === 'daily' ? 864e5 : freq === 'monthly' ? 30 * 864e5 : 7 * 864e5;
      if (!last || Date.now() - Date.parse(last) >= span) await backup.create({ auto: true });
    } catch (e) { log.error('scheduled backup failed', e); }
  };
  setTimeout(check, 30 * 1000);
  timer = setInterval(check, 60 * 60 * 1000);
}
function stopScheduler() { if (timer) clearInterval(timer); timer = null; }

module.exports = { backup, startScheduler, stopScheduler };
