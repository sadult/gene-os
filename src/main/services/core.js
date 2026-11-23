'use strict';
// Search, activity, clipboard, command history/aliases, and the dashboard summary (one round-trip).
const database = require('../db/database');
const E = require('./entities');
const { now } = database;
const d = () => database.get();

function ftsQuery(q) {
  const toks = String(q || '').normalize('NFKC').match(/[\p{L}\p{N}_]+/gu) || [];
  return toks.slice(0, 8).map((t) => `"${t.replace(/"/g, '')}"*`).join(' ');
}

const search = {
  query(q, { limit = 40, entity } = {}) {
    const m = ftsQuery(q);
    if (!m) return [];
    const params = [m];
    let sql = `SELECT entity, entity_id id, title, snippet(search_fts, 3, '[[', ']]', ' … ', 12) snippet, bm25(search_fts, 0, 0, 5.0, 1.0) score
               FROM search_fts WHERE search_fts MATCH ?`;
    if (entity) { sql += ' AND entity = ?'; params.push(entity); }
    sql += ' ORDER BY score LIMIT ?'; params.push(limit);
    try { return d().prepare(sql).all(...params); } catch { return []; }
  },
  rebuild() {
    return d().transaction(() => {
      d().prepare('DELETE FROM search_fts').run();
      let n = 0;
      for (const repo of Object.values(E.all)) n += repo.reindexAll();
      return n;
    })();
  },
};

const activity = {
  recent(limit = 25) { return d().prepare('SELECT * FROM activity ORDER BY id DESC LIMIT ?').all(limit); },
  log(action, entity, entityId, label) {
    d().prepare('INSERT INTO activity (action, entity, entity_id, label, created_at) VALUES (?,?,?,?,?)').run(action, entity, entityId || null, label || '', now());
    return true;
  },
  clear() { d().prepare('DELETE FROM activity').run(); return true; },
};

const clipboard = {
  add(content, source = '') {
    const c = String(content || '');
    if (!c) return false;
    d().prepare('INSERT INTO clipboard (content, source, created_at) VALUES (?,?,?)').run(c.slice(0, 20000), source, now());
    d().prepare('DELETE FROM clipboard WHERE id NOT IN (SELECT id FROM clipboard ORDER BY id DESC LIMIT 100)').run();
    return true;
  },
  list: (limit = 50) => d().prepare('SELECT * FROM clipboard ORDER BY id DESC LIMIT ?').all(limit),
  clear() { d().prepare('DELETE FROM clipboard').run(); return true; },
};

const shellHistory = {
  add(line) {
    d().prepare('INSERT INTO command_history (line, created_at) VALUES (?, ?)').run(String(line).slice(0, 2000), now());
    d().prepare('DELETE FROM command_history WHERE id NOT IN (SELECT id FROM command_history ORDER BY id DESC LIMIT 500)').run();
    return true;
  },
  list: (limit = 500) => d().prepare('SELECT line FROM command_history ORDER BY id ASC LIMIT ?').all(limit).map((r) => r.line),
  clear() { d().prepare('DELETE FROM command_history').run(); return true; },
  aliases: () => d().prepare('SELECT * FROM aliases ORDER BY name').all(),
  setAlias(name, expansion) {
    if (!/^[a-z][\w-]*$/i.test(name)) throw new Error('Alias names must start with a letter and contain only letters, digits, - or _');
    d().prepare('INSERT INTO aliases (name, expansion) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET expansion = excluded.expansion').run(name.toLowerCase(), expansion);
    return true;
  },
  removeAlias(name) { return d().prepare('DELETE FROM aliases WHERE name = ?').run(String(name).toLowerCase()).changes > 0; },
};

function dashboard() {
  const db = d();
  const nowIso = new Date().toISOString();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const in14 = new Date(today); in14.setDate(in14.getDate() + 14);
  const open = "status IN ('backlog','planned','in_progress','on_hold')";
  const c = (sql, ...p) => db.prepare(sql).get(...p).c;
  const deadlines = [
    ...db.prepare(`SELECT 'task' entity, id, title, deadline date, priority FROM tasks WHERE ${open} AND deadline IS NOT NULL AND deadline < ? ORDER BY deadline LIMIT 12`).all(in14.toISOString()),
    ...db.prepare(`SELECT 'milestone' entity, m.id, m.title || ' · ' || p.name title, m.end_date date, '' priority FROM milestones m JOIN projects p ON p.id = m.project_id WHERE m.status <> 'done' AND m.end_date IS NOT NULL AND m.end_date < ? ORDER BY m.end_date LIMIT 8`).all(in14.toISOString()),
    ...db.prepare(`SELECT 'assignment' entity, t.course_id id, t.title || ' · ' || c.name title, t.due_date date, '' priority FROM course_topics t JOIN courses c ON c.id = t.course_id WHERE t.kind = 'assignment' AND t.done = 0 AND t.due_date IS NOT NULL AND t.due_date < ? ORDER BY t.due_date LIMIT 8`).all(in14.toISOString()),
    ...db.prepare(`SELECT 'exam' entity, id, 'Exam · ' || name title, exam_date date, '' priority FROM courses WHERE status = 'active' AND exam_date IS NOT NULL AND exam_date >= ? AND exam_date < ? ORDER BY exam_date`).all(today.toISOString().slice(0, 10), in14.toISOString()),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    counts: {
      tasksOpen: c(`SELECT COUNT(*) c FROM tasks WHERE ${open}`),
      tasksOverdue: c(`SELECT COUNT(*) c FROM tasks WHERE ${open} AND deadline IS NOT NULL AND deadline < ?`, nowIso),
      tasksToday: c(`SELECT COUNT(*) c FROM tasks WHERE ${open} AND deadline >= ? AND deadline < ?`, today.toISOString(), tomorrow.toISOString()),
      tasksDone: c("SELECT COUNT(*) c FROM tasks WHERE status = 'completed'"),
      tasksDoneToday: c('SELECT COUNT(*) c FROM tasks WHERE completed_at >= ?', today.toISOString()),
      tasksTotal: c('SELECT COUNT(*) c FROM tasks'),
      papers: c("SELECT COUNT(*) c FROM files WHERE doc_type = 'article' AND archived = 0"),
      books: c("SELECT COUNT(*) c FROM files WHERE doc_type = 'book' AND archived = 0"),
      documents: c('SELECT COUNT(*) c FROM files WHERE archived = 0'),
      projects: c("SELECT COUNT(*) c FROM projects WHERE status NOT IN ('archived')"),
      notes: c('SELECT COUNT(*) c FROM notes'),
      bookmarks: c('SELECT COUNT(*) c FROM bookmarks'),
      apps: c('SELECT COUNT(*) c FROM apps'),
      courses: c("SELECT COUNT(*) c FROM courses WHERE status = 'active'"),
    },
    todayTasks: db.prepare(`SELECT id, title, priority, status, deadline FROM tasks WHERE ${open} AND (deadline < ? OR status = 'in_progress' OR priority = 'critical') ORDER BY CASE WHEN deadline IS NULL THEN 1 ELSE 0 END, deadline, CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 10`).all(tomorrow.toISOString()),
    projects: db.prepare("SELECT id, name, title, status, target_date, active FROM projects WHERE status <> 'archived' ORDER BY active DESC, updated_at DESC LIMIT 5").all(),
    courses: db.prepare("SELECT id, name, code, color, exam_date FROM courses WHERE status = 'active' ORDER BY name LIMIT 8").all(),
    recentFiles: db.prepare('SELECT id, name, ext, last_opened_at, created_at FROM files WHERE archived = 0 ORDER BY COALESCE(last_opened_at, created_at) DESC LIMIT 6').all(),
    studyMinutesWeek: Math.round(db.prepare("SELECT COALESCE(SUM(minutes),0) m FROM time_logs WHERE created_at >= ?").get(new Date(Date.now() - 7 * 864e5).toISOString()).m),
    deadlines: deadlines.slice(0, 12),
    activity: activity.recent(14),
    favApps: db.prepare('SELECT id, name, icon FROM apps WHERE favorite = 1 ORDER BY launch_count DESC, name LIMIT 12').all(),
  };
}

module.exports = { search, activity, clipboard, shellHistory, dashboard };
