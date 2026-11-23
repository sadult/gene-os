'use strict';
// Notification center: a lightweight scanner runs every minute and records due items once (dedupe by nkey).
const { Notification } = require('electron');
const database = require('../db/database');
const settings = require('./settings');
const log = require('../logger');
const d = () => database.get();

let timer = null;
let emit = () => {};

function insert(n) {
  const info = d().prepare('INSERT OR IGNORE INTO notifications (nkey, kind, title, body, entity, entity_id, read, created_at) VALUES (@nkey,@kind,@title,@body,@entity,@entity_id,0,@created_at)')
    .run({ body: '', entity: '', entity_id: null, ...n, created_at: new Date().toISOString() });
  return info.changes > 0;
}

function scan() {
  if (!d()) return [];
  const s = settings.getAll();
  if (!s['notifications.enabled']) return [];
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const soonIso = new Date(nowMs + (s['notifications.dueSoonHours'] || 24) * 3600e3).toISOString();
  const open = "status IN ('backlog','planned','in_progress','on_hold')";
  const fresh = [];
  const add = (n) => { if (insert(n)) fresh.push(n); };

  for (const t of d().prepare(`SELECT id, title, deadline FROM tasks WHERE ${open} AND deadline IS NOT NULL AND deadline < ?`).all(nowIso))
    add({ nkey: `overdue:${t.id}:${t.deadline}`, kind: 'overdue', title: `Overdue: ${t.title}`, body: `Deadline was ${t.deadline.slice(0, 16).replace('T', ' ')}`, entity: 'task', entity_id: t.id });
  for (const t of d().prepare(`SELECT id, title, deadline FROM tasks WHERE ${open} AND deadline >= ? AND deadline < ?`).all(nowIso, soonIso))
    add({ nkey: `due:${t.id}:${t.deadline}`, kind: 'deadline', title: `Due soon: ${t.title}`, body: `Deadline ${t.deadline.slice(0, 16).replace('T', ' ')}`, entity: 'task', entity_id: t.id });
  for (const t of d().prepare(`SELECT id, title, reminder_at FROM tasks WHERE ${open} AND reminder_at IS NOT NULL AND reminder_at <= ?`).all(nowIso))
    add({ nkey: `reminder:${t.id}:${t.reminder_at}`, kind: 'reminder', title: `Reminder: ${t.title}`, entity: 'task', entity_id: t.id });
  const in3 = new Date(nowMs + 3 * 864e5).toISOString();
  for (const m of d().prepare("SELECT m.id, m.title, m.end_date, p.name, p.id pid FROM milestones m JOIN projects p ON p.id=m.project_id WHERE m.status <> 'done' AND m.end_date IS NOT NULL AND m.end_date < ?").all(in3))
    add({ nkey: `milestone:${m.id}:${m.end_date}`, kind: 'milestone', title: `Milestone: ${m.title}`, body: `${m.name} · ends ${m.end_date.slice(0, 10)}`, entity: 'project', entity_id: m.pid });
  const in2 = new Date(nowMs + 2 * 864e5).toISOString();
  for (const a of d().prepare("SELECT t.id, t.title, t.due_date, c.name, c.id cid FROM course_topics t JOIN courses c ON c.id=t.course_id WHERE t.kind='assignment' AND t.done=0 AND t.due_date IS NOT NULL AND t.due_date < ?").all(in2))
    add({ nkey: `assignment:${a.id}:${a.due_date}`, kind: 'assignment', title: `Assignment: ${a.title}`, body: `${a.name} · due ${a.due_date.slice(0, 10)}`, entity: 'course', entity_id: a.cid });
  const in7 = new Date(nowMs + 7 * 864e5).toISOString().slice(0, 10);
  for (const c of d().prepare("SELECT id, name, exam_date FROM courses WHERE status='active' AND exam_date IS NOT NULL AND exam_date >= ? AND exam_date <= ?").all(nowIso.slice(0, 10), in7))
    add({ nkey: `exam:${c.id}:${c.exam_date}`, kind: 'exam', title: `Exam soon: ${c.name}`, body: `Exam on ${c.exam_date.slice(0, 10)}`, entity: 'course', entity_id: c.id });
  if (s['notifications.backupReminder']) {
    const last = s['backup.last'];
    if (!last || nowMs - Date.parse(last) > 7 * 864e5)
      add({ nkey: `backup:${nowIso.slice(0, 10)}`, kind: 'backup', title: 'Backup reminder', body: last ? `Last backup ${last.slice(0, 10)}` : 'No backup has been made yet', entity: 'settings' });
  }

  if (fresh.length) {
    emit(fresh);
    if (s['notifications.native'] && Notification.isSupported()) {
      const shown = fresh.slice(0, 3);
      for (const n of shown) { try { new Notification({ title: n.title, body: n.body || 'Gene OS', silent: true }).show(); } catch (e) { log.warn('native notification failed', e.message); } }
    }
  }
  return fresh;
}

const notifications = {
  list: (limit = 100) => d().prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT ?').all(limit),
  unread: () => d().prepare('SELECT COUNT(*) c FROM notifications WHERE read = 0').get().c,
  markRead: (id) => d().prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id).changes > 0,
  markAllRead: () => d().prepare('UPDATE notifications SET read = 1').run().changes,
  remove: (id) => d().prepare('DELETE FROM notifications WHERE id = ?').run(id).changes > 0,
  clear: () => d().prepare('DELETE FROM notifications WHERE read = 1').run().changes,
  scan: () => scan(),
};

function start(onNew) {
  emit = onNew || emit;
  stop();
  setTimeout(() => { try { scan(); } catch (e) { log.error('notification scan', e); } }, 4000);
  timer = setInterval(() => { try { scan(); } catch (e) { log.error('notification scan', e); } }, 60 * 1000);
}
function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { notifications, start, stop };
