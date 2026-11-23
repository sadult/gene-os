// Task manager: list, kanban, calendar, today, upcoming, overdue, completed and priority-matrix views.
import { api } from '../api.js';
import { h, clear, debounce, fmtDate, relTime, isOverdue, priorityGlyph, toast, toastError, formModal, confirmBox, modal, contextMenu, subtabs, todayStr, copyText } from '../ui.js';
import { bus } from '../state.js';
import { parseWhen } from '../../../shared/cmdparse.mjs';
import { pomodoro } from '../pomodoro.js';
import { monthGrid, weekdayHeaders, jalaliOn, isoDay, dateToJalali, formatJalali, JALALI_MONTHS } from '../calendar.js';

export const CATEGORIES = ['Academic', 'Research', 'Thesis', 'Personal', 'Programming', 'Reading', 'Analysis', 'Exam preparation'];
export const STATUSES = [['backlog', 'Backlog'], ['planned', 'Planned'], ['in_progress', 'In progress'], ['on_hold', 'On hold'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
export const PRIORITIES = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']];
const RECUR = [['', 'None'], ['daily', 'Daily'], ['weekdays', 'Weekdays (Mon–Fri)'], ['satwed', 'Iranian work week (Sat–Wed)'], ['weekly', 'Weekly'], ['monthly', 'Monthly']];
const OPEN = new Set(['backlog', 'planned', 'in_progress', 'on_hold']);
const PR_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const VIEWS = [['list', 'List'], ['kanban', 'Kanban'], ['calendar', 'Calendar'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['overdue', 'Overdue'], ['completed', 'Completed'], ['matrix', 'Priority matrix']];

const st = { view: 'list', q: '', category: 'all', priority: 'all', sort: 'smart', month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), tasks: [] };
let root = null, off = null;

// "Read Mrode ch.3 !high #thesis @fri ~45m" → title, priority, tags, deadline, estimate
export function parseQuick(text) {
  let title = String(text || ''); const out = { tags: [] };
  title = title.replace(/(^|\s)!(low|medium|high|critical|l|m|h|c)\b/i, (_, s, p) => { out.priority = { l: 'low', m: 'medium', h: 'high', c: 'critical' }[p.toLowerCase()] || p.toLowerCase(); return s; });
  title = title.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_, s, t) => { out.tags.push(t); return s; });
  title = title.replace(/(^|\s)@(\S+)/, (m, s, w) => { const d = parseWhen(w); if (d) { out.deadline = d; return s; } return m; });
  title = title.replace(/(^|\s)~(\d+)(m|h)\b/, (_, s, n, u) => { out.estimate_min = Number(n) * (u === 'h' ? 60 : 1); return s; });
  out.title = title.replace(/\s+/g, ' ').trim();
  return out;
}

export async function quickTaskDialog(defaults = {}) {
  const r = await formModal({ title: 'New task', submitLabel: 'Create', fields: [
    { key: 'title', label: 'Task', required: true, autofocus: true, placeholder: 'Read Mrode ch.3 !high #thesis @fri ~45m' },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORIES, default: defaults.category || 'Research' },
    { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, default: 'medium' },
    { key: 'deadline', label: 'Deadline', type: 'datetime' },
  ], values: defaults });
  if (!r) return null;
  const q = parseQuick(r.title);
  try {
    const t = await api.tasks.create({ ...defaults, ...r, ...q, priority: q.priority || r.priority, deadline: q.deadline || r.deadline, tags: [...(defaults.tags || []), ...q.tags] });
    toast(`Task #${t.id} created`, 'ok', 1500); bus.emit('changed', 'tasks'); return t;
  } catch (e) { toastError(e); return null; }
}

function subtasksField(value) {
  let items = (value || []).map((s) => ({ ...s }));
  const box = h('div.col', { style: { gap: '4px' } });
  const draw = () => {
    clear(box);
    items.forEach((s, i) => box.append(h('div.row', h('input', { type: 'checkbox', checked: s.done, onchange: (e) => { s.done = e.target.checked; } }), h('input.grow', { value: s.title, oninput: (e) => { s.title = e.target.value; } }), h('button.btn.sm.ghost', { onclick: () => { items.splice(i, 1); draw(); } }, '✕'))));
    const add = h('input.grow', { placeholder: '+ add subtask (Enter)' });
    add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim()) { e.preventDefault(); e.stopPropagation(); items.push({ title: add.value.trim(), done: false }); draw(); box.querySelector('input.grow:last-of-type')?.focus(); } });
    box.append(h('div.row', h('span.dim', '+'), add));
    if (items.length) box.append(h('div.small.muted', `${items.filter((x) => x.done).length}/${items.length} done`));
  };
  draw();
  return { el: box, get: () => items.filter((s) => s.title.trim()) };
}
function attachmentsField(value) {
  let ids = [...(value || [])];
  const box = h('div.col', { style: { gap: '4px' } });
  const draw = async () => {
    clear(box);
    for (const id of ids) {
      const f = await api.library.get(id).catch(() => null);
      box.append(h('div.row', h('a', { onclick: () => api.library.open(id).catch(toastError) }, f ? `${f.name}.${f.ext}` : `#${id} (missing)`), h('button.btn.sm.ghost', { onclick: () => { ids = ids.filter((x) => x !== id); draw(); } }, '✕')));
    }
    box.append(h('div', h('button.btn.sm', { onclick: async () => { const p = await api.system.openFiles({ kind: 'docs', multi: true }); if (!p.length) return; const r = await api.library.importPaths(p, { allowDuplicates: false }); ids.push(...r.imported.map((x) => x.id), ...r.duplicates.map((d) => d.existing.id)); ids = [...new Set(ids)]; draw(); } }, '+ Attach files (added to library)')));
  };
  draw();
  return { el: box, get: () => ids };
}

export async function openTask(id, defaults = {}) {
  const t = id ? await api.tasks.get(id) : { status: 'planned', priority: 'medium', category: 'Research', ...defaults };
  if (!t) return toast('Task not found', 'error');
  const [courses, projects] = await Promise.all([api.courses.list({ sort: 'name', dir: 'ASC' }), api.research.list({})]);
  const extra = [];
  if (id) {
    extra.push({ label: 'Delete', danger: true, onClick: async (m) => { if (await confirmBox(`Delete “${t.title}”?`, { danger: true, okLabel: 'Delete' })) { await api.tasks.remove(id); m.close(); bus.emit('changed', 'tasks'); } } });
    extra.push({ label: 'Save as template', onClick: async () => { const { id: _i, created_at, updated_at, completed_at, timer_started_at, actual_min, deadline, ...data } = t; await api.tasks.templateSave(t.title, data); toast('Template saved', 'ok'); } });
    extra.push({ label: '◷ Pomodoro', onClick: (m) => { pomodoro.start(undefined, t); m.close(); } });
    extra.push({ label: t.timer_started_at ? '⏹ Stop timer' : '⏱ Start timer', onClick: async (m) => { await (t.timer_started_at ? api.tasks.timerStop(id) : api.tasks.timerStart(id)); m.close(); bus.emit('changed', 'tasks'); } });
  }
  const r = await formModal({ title: id ? `Task #${id}` : 'New task', size: 'wide', extraActions: extra, values: t, fields: [
    { key: 'title', label: 'Title', required: true, autofocus: !id },
    { key: 'description', label: 'Description', type: 'textarea', rows: 3 },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORIES },
    { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
    { key: 'status', label: 'Status', type: 'select', options: STATUSES },
    { key: 'deadline', label: 'Deadline', type: 'datetime' },
    { key: 'start_date', label: 'Start date', type: 'date' },
    { key: 'reminder_at', label: 'Reminder', type: 'datetime', hint: 'A notification is raised at this time.' },
    { key: 'recurrence', label: 'Repeat', type: 'select', options: RECUR, hint: 'When completed, the next occurrence is created automatically.' },
    { key: 'estimate_min', label: 'Estimated (min)', type: 'number' },
    { key: 'actual_min', label: 'Actual (min)', type: 'number', hint: t.timer_started_at ? `⏱ timer running since ${fmtDate(t.timer_started_at, true)}` : 'Updated by the timer and pomodoro.' },
    { key: 'tags', label: 'Tags', type: 'tags' },
    { key: 'course_id', label: 'Course', type: 'select', numeric: true, options: [['', '—'], ...courses.map((c) => [c.id, `${c.code ? c.code + ' · ' : ''}${c.name}`])] },
    { key: 'project_id', label: 'Project', type: 'select', numeric: true, options: [['', '—'], ...projects.map((p) => [p.id, p.name])] },
    { key: 'subtasks', label: 'Subtasks', type: 'custom', render: subtasksField },
    { key: 'attachments', label: 'Attachments', type: 'custom', render: attachmentsField },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, full: true },
  ] });
  if (!r) return;
  try {
    const saved = id ? await api.tasks.update(id, r) : await api.tasks.create(r);
    if (saved && saved.next) toast(`Recurring task: next due ${fmtDate(saved.next.deadline, true)}`, 'info');
    bus.emit('changed', 'tasks');
  } catch (e) { toastError(e); }
}

function filtered() {
  let l = st.tasks;
  if (st.q) { const q = st.q.toLowerCase(); l = l.filter((t) => (t.title + ' ' + (t.description || '') + ' ' + (t.tags || []).join(' ')).toLowerCase().includes(q)); }
  if (st.category !== 'all') l = l.filter((t) => t.category === st.category);
  if (st.priority !== 'all') l = l.filter((t) => t.priority === st.priority);
  const sorters = {
    smart: (a, b) => (OPEN.has(b.status) - OPEN.has(a.status)) || ((a.deadline ? 0 : 1) - (b.deadline ? 0 : 1)) || String(a.deadline).localeCompare(String(b.deadline)) || PR_RANK[a.priority] - PR_RANK[b.priority],
    deadline: (a, b) => String(a.deadline || '9').localeCompare(String(b.deadline || '9')),
    priority: (a, b) => PR_RANK[a.priority] - PR_RANK[b.priority],
    created: (a, b) => b.created_at.localeCompare(a.created_at),
    title: (a, b) => a.title.localeCompare(b.title),
  };
  return [...l].sort(sorters[st.sort]);
}

function taskItem(t) {
  const sub = t.subtasks || [];
  const el = h(`div.item.clickable${t.status === 'completed' ? '.done' : ''}`, {
    onclick: () => openTask(t.id),
    oncontextmenu: (e) => contextMenu(e, [
      { label: 'Open', run: () => openTask(t.id) },
      t.status === 'completed' ? { label: 'Reopen', run: () => api.tasks.reopen(t.id).then(() => bus.emit('changed', 'tasks')) } : { label: 'Complete', run: () => api.tasks.complete(t.id).then(() => bus.emit('changed', 'tasks')) },
      { label: t.timer_started_at ? 'Stop timer' : 'Start timer', run: () => (t.timer_started_at ? api.tasks.timerStop(t.id) : api.tasks.timerStart(t.id)).then(() => bus.emit('changed', 'tasks')) },
      { label: 'Start pomodoro', run: () => pomodoro.start(undefined, t) },
      '-', ...STATUSES.filter(([s]) => s !== t.status).map(([s, l]) => ({ label: '→ ' + l, run: () => api.tasks.update(t.id, { status: s }).then(() => bus.emit('changed', 'tasks')) })),
      '-', { label: 'Copy title', run: () => copyText(t.title, 'task') },
      { label: 'Delete', danger: true, run: async () => { if (await confirmBox(`Delete “${t.title}”?`, { danger: true })) { await api.tasks.remove(t.id); bus.emit('changed', 'tasks'); } } },
    ]),
  },
  h('input', { type: 'checkbox', checked: t.status === 'completed', onclick: async (e) => { e.stopPropagation(); try { const r = e.target.checked ? await api.tasks.complete(t.id) : await api.tasks.reopen(t.id); if (r.next) toast(`Next occurrence created (${fmtDate(r.next.deadline)})`, 'info'); bus.emit('changed', 'tasks'); } catch (err) { toastError(err); } } }),
  h(`span.p-${t.priority}`, { title: t.priority }, priorityGlyph(t.priority)),
  h('span.grow.ellipsis.title', t.title, ' ', (t.tags || []).map((x) => h('span.tag', x))),
  t.timer_started_at ? h('span.warn.small', '⏱') : null,
  t.recurrence ? h('span.dim.small', { title: 'Recurring: ' + t.recurrence }, '↻') : null,
  sub.length ? h('span.meta', `☑ ${sub.filter((s) => s.done).length}/${sub.length}`) : null,
  h('span.meta.dim', t.category),
  h('span.meta', STATUSES.find(([s]) => s === t.status)?.[1] || t.status),
  t.deadline ? h(`span.meta${OPEN.has(t.status) && isOverdue(t.deadline) ? '.err' : ''}`, { style: { minWidth: '120px', textAlign: 'right' } }, `${fmtDate(t.deadline)} · ${relTime(t.deadline)}`) : h('span.meta', { style: { minWidth: '120px' } }, ''));
  return el;
}
const listOf = (tasks, emptyMsg) => (tasks.length ? h('div.panel', h('div.list', tasks.map(taskItem))) : h('div.empty', emptyMsg));

function kanban(tasks) {
  return h('div.kanban', STATUSES.map(([s, label]) => {
    const col = tasks.filter((t) => t.status === s);
    const body = h('div.kb', col.map((t) => {
      const c = h(`div.kcard.p-${t.priority}`, { draggable: 'true', onclick: () => openTask(t.id) }, h('div', t.title), h('div.meta', (t.tags || []).map((x) => '#' + x).join(' '), t.deadline ? ` · ${relTime(t.deadline)}` : ''));
      c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/gos-task', String(t.id)));
      return c;
    }));
    const colEl = h('div.kcol', h('div.kh', label, h('span.right', col.length)), body);
    colEl.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/gos-task')) { e.preventDefault(); colEl.classList.add('over'); } });
    colEl.addEventListener('dragleave', () => colEl.classList.remove('over'));
    colEl.addEventListener('drop', async (e) => { e.preventDefault(); colEl.classList.remove('over'); const id = Number(e.dataTransfer.getData('text/gos-task')); if (id) { try { await api.tasks.update(id, { status: s }); bus.emit('changed', 'tasks'); } catch (err) { toastError(err); } } });
    return colEl;
  }));
}

function calendar(tasks) {
  const m = st.month;
  const grid = monthGrid({ y: m.getFullYear(), m: m.getMonth() });
  const today = todayStr();
  const byDay = {}; for (const t of tasks) if (t.deadline) (byDay[fmtDate(t.deadline)] ||= []).push(t);
  const jal = jalaliOn();
  const cells = grid.cells.map(({ date: d, inMonth }) => {
    const key = isoDay(d);
    const evs = (byDay[key] || []).sort((a, b) => PR_RANK[a.priority] - PR_RANK[b.priority]);
    const jd = jal ? dateToJalali(d) : null;
    return h(`div.day${!inMonth ? '.other' : ''}${key === today ? '.today' : ''}`, { ondblclick: () => openTask(null, { deadline: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59).toISOString() }) },
      h('div.dn', d.getDate(), jd ? h('span.dim', { style: { float: 'right', fontSize: '.9em' }, title: formatJalali(d, 'long') }, jd.jd === 1 ? `${jd.jd} ${JALALI_MONTHS[jd.jm - 1].slice(0, 3)}` : jd.jd) : null),
      evs.slice(0, 5).map((t) => h(`span.ev${t.status === 'completed' ? '.done' : OPEN.has(t.status) && isOverdue(t.deadline) ? '.overdue' : ''}`, { onclick: () => openTask(t.id), title: t.title }, t.title)), evs.length > 5 ? h('span.dim.small', `+${evs.length - 5} more`) : null);
  });
  const firstJ = jal ? dateToJalali(new Date(m.getFullYear(), m.getMonth(), 1)) : null, lastJ = jal ? dateToJalali(new Date(m.getFullYear(), m.getMonth() + 1, 0)) : null;
  return h('div.col',
    h('div.row', h('button.btn.sm', { onclick: () => { st.month = new Date(m.getFullYear(), m.getMonth() - 1, 1); draw(); } }, '◀'), h('b', grid.title), jal ? h('span.muted', `· ${JALALI_MONTHS[firstJ.jm - 1]}${firstJ.jm !== lastJ.jm ? '–' + JALALI_MONTHS[lastJ.jm - 1] : ''} ${lastJ.jy}`) : null, h('button.btn.sm', { onclick: () => { st.month = new Date(m.getFullYear(), m.getMonth() + 1, 1); draw(); } }, '▶'), h('button.btn.sm', { onclick: () => { const n = new Date(); st.month = new Date(n.getFullYear(), n.getMonth(), 1); draw(); } }, 'Today'), h('span.muted.small', 'Double-click a day to add a task due that day · week start & Jalali dates: Settings → Appearance')),
    h('div.cal', weekdayHeaders().map((d) => h('div.dh', d)), cells));
}

function matrix(tasks) {
  const open = tasks.filter((t) => OPEN.has(t.status));
  const soon = Date.now() + 3 * 864e5;
  const urgent = (t) => t.deadline && Date.parse(t.deadline) <= soon;
  const important = (t) => t.priority === 'high' || t.priority === 'critical';
  const q = [['Do first — urgent & important', open.filter((t) => urgent(t) && important(t)), 'err'], ['Schedule — important, not urgent', open.filter((t) => !urgent(t) && important(t)), 'accent'], ['Delegate / quick — urgent, less important', open.filter((t) => urgent(t) && !important(t)), 'warn'], ['Later — neither', open.filter((t) => !urgent(t) && !important(t)), 'dim']];
  return h('div.col', h('div.muted.small', 'Urgent = due within 3 days or overdue · Important = high/critical priority'), h('div.matrix', q.map(([title, list, cls]) => h('div.panel.q', h('div.panel-h', h(`span.${cls}`, '■'), h('span', title), h('span.right', list.length)), h('div.list', list.map(taskItem))))));
}

async function draw() {
  if (!root) return;
  try { st.tasks = await api.tasks.list({ sort: 'updated_at', limit: 10000 }); } catch (e) { toastError(e); return; }
  const stats = await api.tasks.stats().catch(() => null);
  const all = filtered();
  const now = Date.now(); const eod = new Date(); eod.setHours(23, 59, 59, 999);
  const quickInput = h('input.grow', { placeholder: 'Quick add:  Analyse WWG data !high #thesis @fri ~90m   (Enter)', style: { minWidth: '320px' } });
  quickInput.addEventListener('keydown', async (e) => { if (e.key === 'Enter' && quickInput.value.trim()) { const q = parseQuick(quickInput.value); if (!q.title) return; try { await api.tasks.create(q); quickInput.value = ''; bus.emit('changed', 'tasks'); } catch (err) { toastError(err); } } });
  const search = h('input.search-input', { placeholder: 'Filter…', value: st.q, oninput: debounce((e) => { st.q = e.target.value; draw(); }, 200) });
  const perDay = (stats?.perDay || []);
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); const k = fmtDate(d.toISOString()); return [d.toLocaleDateString('en-US', { weekday: 'narrow' }), (perDay.find((x) => x.day === k) || {}).c || 0]; });
  const maxD = Math.max(1, ...days.map((d) => d[1]));
  let content;
  const open = all.filter((t) => OPEN.has(t.status));
  switch (st.view) {
    case 'kanban': content = kanban(all); break;
    case 'calendar': content = calendar(all); break;
    case 'matrix': content = matrix(all); break;
    case 'today': content = listOf(open.filter((t) => (t.deadline && Date.parse(t.deadline) <= eod.getTime()) || t.status === 'in_progress'), 'Nothing due today.'); break;
    case 'upcoming': content = listOf(open.filter((t) => t.deadline && Date.parse(t.deadline) > eod.getTime()).sort((a, b) => a.deadline.localeCompare(b.deadline)), 'No upcoming deadlines.'); break;
    case 'overdue': content = listOf(open.filter((t) => t.deadline && Date.parse(t.deadline) < now), 'No overdue tasks. ✓'); break;
    case 'completed': content = listOf(all.filter((t) => t.status === 'completed').sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at))), 'No completed tasks yet.'); break;
    default: content = listOf(all.filter((t) => t.status !== 'cancelled' || st.q), 'No tasks. Use quick add above or press Ctrl+N.');
  }
  clear(root).append(
    h('div.row.wrap', { style: { marginBottom: '8px' } },
      stats ? [['open', stats.open], ['overdue', stats.overdue, stats.overdue ? 'err' : ''], ['due today', stats.dueToday], ['done today', stats.completedToday, 'ok'], ['focus today', stats.focusToday + 'm'], ['focus 7d', stats.focusWeek + 'm']].map(([l, v, c]) => h('span.small', h('span.muted', l + ' '), h(`b${c ? '.' + c : ''}`, v), '   ')) : null,
      h('span.small.muted', { title: 'Completed per day (last 7 days)' }, 'last 7d ', days.map(([d, n]) => h('span', { title: `${n}` }, '▁▂▃▄▅▆▇█'[Math.round((n / maxD) * 7)] || '▁'))),
      h('span.right.row', h('button.btn.sm', { onclick: templatesDialog }, 'Templates'), h('button.btn.sm', { onclick: () => pomodoro.status().running ? pomodoro.stop() : pomodoro.start() }, pomodoro.status().running ? '◼ Stop pomodoro' : '◷ Pomodoro'), h('button.btn.primary', { onclick: () => openTask(null) }, '+ New task'))),
    h('div.toolbar', quickInput),
    subtabs(VIEWS, st.view, (v) => { st.view = v; draw(); }),
    h('div.toolbar', search,
      h('select', { onchange: (e) => { st.category = e.target.value; draw(); } }, [['all', 'All categories'], ...CATEGORIES.map((c) => [c, c])].map(([v, l]) => h('option', { value: v, selected: st.category === v }, l))),
      h('select', { onchange: (e) => { st.priority = e.target.value; draw(); } }, [['all', 'All priorities'], ...PRIORITIES].map(([v, l]) => h('option', { value: v, selected: st.priority === v }, l))),
      h('select', { onchange: (e) => { st.sort = e.target.value; draw(); } }, [['smart', 'Sort: smart'], ['deadline', 'Sort: deadline'], ['priority', 'Sort: priority'], ['created', 'Sort: newest'], ['title', 'Sort: title']].map(([v, l]) => h('option', { value: v, selected: st.sort === v }, l))),
      h('span.muted.small.right', `${all.length} task(s) · right-click for actions`)),
    content);
}

async function templatesDialog() {
  const list = await api.tasks.templateList();
  const m = modal({ title: 'Task templates', body: list.length ? h('div.list', list.map((t) => h('div.item', h('span.grow', t.name), h('span.meta', t.data.category || ''), h('button.btn.sm', { onclick: async () => { m.close(); const nt = await api.tasks.fromTemplate(t.id, {}); bus.emit('changed', 'tasks'); openTask(nt.id); } }, 'Create'), h('button.btn.sm.danger', { onclick: async () => { await api.tasks.templateRemove(t.id); m.close(); templatesDialog(); } }, '✕')))) : h('div.empty', 'No templates yet. Open a task and choose “Save as template”.') });
}

export default {
  id: 'tasks',
  async mount(el, params = {}) {
    root = el; if (params.view) st.view = params.view;
    await draw();
    off = bus.on('changed', (e) => { if (!e || ['tasks', 'notifications'].includes(e)) draw(); });
    if (params.open) openTask(params.open);
  },
  unmount() { root = null; off && off(); },
};
