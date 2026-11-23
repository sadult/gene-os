'use strict';
const E = require('./entities');
const database = require('../db/database');
const { now } = database;

const OPEN = ['backlog', 'planned', 'in_progress', 'on_hold'];

function addInterval(iso, rec) {
  const d = iso ? new Date(iso) : new Date();
  if (rec === 'daily') d.setDate(d.getDate() + 1);
  else if (rec === 'weekly') d.setDate(d.getDate() + 7);
  else if (rec === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (rec === 'weekdays') { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); } // Mon–Fri
  else if (rec === 'satwed') { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 4 || d.getDay() === 5); } // Sat–Wed (Iranian work week)
  else return null;
  return d.toISOString();
}

function stopTimerInternal(task) {
  if (!task.timer_started_at) return task;
  const mins = Math.max(0, (Date.now() - Date.parse(task.timer_started_at)) / 60000);
  database.get().prepare('INSERT INTO time_logs (task_id, kind, minutes, started_at, created_at) VALUES (?,?,?,?,?)')
    .run(task.id, 'timer', mins, task.timer_started_at, now());
  return E.tasks.update(task.id, { timer_started_at: null, actual_min: Math.round((task.actual_min || 0) + mins) });
}

const tasks = {
  ...E.crud(E.tasks),
  create(data) {
    if (!data || !String(data.title || '').trim()) throw new Error('Task title is required');
    return E.tasks.create({ status: 'planned', priority: 'medium', ...data, title: String(data.title).trim() });
  },
  update(id, patch) {
    const cur = E.tasks.get(id);
    if (!cur) throw new Error(`Task #${id} not found`);
    if (patch.status === 'completed' && cur.status !== 'completed') return tasks.complete(id, patch);
    if (patch.status && patch.status !== 'completed') patch.completed_at = null;
    return E.tasks.update(id, patch);
  },
  complete(id, extra = {}) {
    return database.get().transaction(() => {
      let t = E.tasks.get(id);
      if (!t) throw new Error(`Task #${id} not found`);
      if (t.timer_started_at) t = stopTimerInternal(t);
      const done = E.tasks.update(id, { ...extra, status: 'completed', completed_at: now() });
      let next = null;
      if (t.recurrence) {
        const deadline = addInterval(t.deadline, t.recurrence);
        next = E.tasks.create({
          ...t, id: undefined, status: 'planned', completed_at: null, actual_min: 0, timer_started_at: null, deadline,
          start_date: t.start_date ? addInterval(t.start_date, t.recurrence) : null,
          reminder_at: t.reminder_at ? addInterval(t.reminder_at, t.recurrence) : null,
          subtasks: (t.subtasks || []).map((s) => ({ ...s, done: false })),
        });
      }
      return { ...done, next };
    })();
  },
  reopen(id) { return E.tasks.update(id, { status: 'planned', completed_at: null }); },
  timerStart(id) {
    const running = E.tasks.list({ filter: {} }).filter((t) => t.timer_started_at && t.id !== id);
    running.forEach(stopTimerInternal); // only one running timer at a time
    return E.tasks.update(id, { timer_started_at: now(), status: 'in_progress' });
  },
  timerStop(id) { return stopTimerInternal(E.tasks.get(id)); },
  logTime(taskId, minutes, kind = 'pomodoro') {
    const m = Number(minutes);
    if (!(m > 0)) throw new Error('Minutes must be positive');
    database.get().prepare('INSERT INTO time_logs (task_id, kind, minutes, started_at, created_at) VALUES (?,?,?,?,?)')
      .run(taskId || null, kind, m, null, now());
    if (taskId) { const t = E.tasks.get(taskId); if (t) E.tasks.update(taskId, { actual_min: Math.round((t.actual_min || 0) + m) }); }
    return true;
  },
  stats() {
    const d = database.get();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);
    const ph = OPEN.map(() => '?').join(',');
    const q = (sql, ...p) => d.prepare(sql).get(...p).c;
    const perDay = d.prepare(`SELECT substr(completed_at,1,10) day, COUNT(*) c FROM tasks WHERE completed_at >= ? GROUP BY day`).all(weekAgo.toISOString());
    const focus = d.prepare(`SELECT COALESCE(SUM(minutes),0) m FROM time_logs WHERE created_at >= ?`).get(today.toISOString()).m;
    const focusWeek = d.prepare(`SELECT COALESCE(SUM(minutes),0) m FROM time_logs WHERE created_at >= ?`).get(weekAgo.toISOString()).m;
    return {
      total: q('SELECT COUNT(*) c FROM tasks'),
      open: q(`SELECT COUNT(*) c FROM tasks WHERE status IN (${ph})`, ...OPEN),
      completed: q("SELECT COUNT(*) c FROM tasks WHERE status = 'completed'"),
      overdue: q(`SELECT COUNT(*) c FROM tasks WHERE status IN (${ph}) AND deadline IS NOT NULL AND deadline < ?`, ...OPEN, new Date().toISOString()),
      dueToday: q(`SELECT COUNT(*) c FROM tasks WHERE status IN (${ph}) AND deadline >= ? AND deadline < ?`, ...OPEN, today.toISOString(), tomorrow.toISOString()),
      completedToday: q('SELECT COUNT(*) c FROM tasks WHERE completed_at >= ?', today.toISOString()),
      highPriority: q(`SELECT COUNT(*) c FROM tasks WHERE status IN (${ph}) AND priority IN ('high','critical')`, ...OPEN),
      perDay, focusToday: Math.round(focus), focusWeek: Math.round(focusWeek),
    };
  },
  templates: {
    list: () => E.taskTemplates.list({ sort: 'name', dir: 'ASC' }),
    save: (name, data) => E.taskTemplates.create({ name, data }),
    remove: (id) => E.taskTemplates.remove(id),
  },
  fromTemplate(templateId, overrides = {}) {
    const tpl = E.taskTemplates.get(templateId);
    if (!tpl) throw new Error('Template not found');
    return tasks.create({ ...tpl.data, ...overrides });
  },
};
// flatten nested template namespace for the IPC whitelist
tasks.templateList = tasks.templates.list;
tasks.templateSave = tasks.templates.save;
tasks.templateRemove = tasks.templates.remove;
delete tasks.templates;

module.exports = { tasks, OPEN };
