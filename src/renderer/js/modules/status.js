// Status: the analytical overview (formerly the v1 dashboard). KPI strip + configurable widgets
// (drag to reorder, hide/restore) fed by a single summary query.
import { api } from '../api.js';
import { h, clear, bar, kv, relTime, fmtDate, priorityGlyph, toastError, toast, isOverdue } from '../ui.js';
import { settings, bus } from '../state.js';
import { icon } from '../icons.js';
import { openEntity } from '../palette.js';

const WIDGETS = {
  research: 'Research overview', tasks: 'Task overview', academic: 'Academic overview', stats: 'Research statistics',
  quick: 'Quick actions', activity: 'Activity feed', apps: 'Quick launch', deadlines: 'Upcoming deadlines',
};
const WIDGET_ICONS = { research: 'research', tasks: 'tasks', academic: 'courses', stats: 'chart', quick: 'zap', activity: 'activity', apps: 'apps', deadlines: 'calendar' };
const DEFAULT = Object.keys(WIDGETS);
let root = null, editing = false, off = null;

async function quick(action) {
  const { nav } = window.__os;
  try {
    if (action === 'task') (await import('./tasks.js')).quickTaskDialog();
    else if (action === 'note') nav('notes', { create: true });
    else if (action === 'paper') (await import('./library.js')).importDialog({ doc_type: 'article' });
    else if (action === 'project') (await import('./research.js')).newProjectDialog();
    else if (action === 'import') (await import('./library.js')).importDialog();
    else if (action === 'app') (await import('./apps.js')).addAppsDialog();
    else if (action === 'terminal') nav('terminal');
    else if (action === 'journal') nav('notes', { tab: 'journal' });
  } catch (e) { toastError(e); }
}

function widget(id, title, body, extra) {
  const hidden = editing ? h('button.btn.sm.ghost', { title: 'Hide widget', onclick: () => hide(id) }, '✕') : null;
  const w = h('div.panel.widget', { dataset: { id }, draggable: editing ? 'true' : null }, h('div.panel-h', editing ? h('span.dim', '⠿') : null, icon(WIDGET_ICONS[id] || 'layers', 14, 'ph'), h('span.t.noglyph', title), h('span.right.row', extra || null, hidden)), h('div.panel-b', body));
  if (editing) {
    w.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/gos-widget', id); w.classList.add('dragging'); });
    w.addEventListener('dragend', () => w.classList.remove('dragging'));
    w.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/gos-widget')) { e.preventDefault(); w.classList.add('over'); } });
    w.addEventListener('dragleave', () => w.classList.remove('over'));
    w.addEventListener('drop', async (e) => {
      e.preventDefault(); w.classList.remove('over');
      const from = e.dataTransfer.getData('text/gos-widget'); if (!from || from === id) return;
      const order = layout().filter((x) => x !== from); order.splice(order.indexOf(id), 0, from);
      await settings.set('dashboard.layout', order); draw();
    });
  }
  return w;
}
const layout = () => { const l = settings.get('dashboard.layout') || DEFAULT; return [...l.filter((x) => WIDGETS[x]), ...DEFAULT.filter((x) => !l.includes(x))]; };
const hiddenSet = () => new Set(settings.get('dashboard.hidden') || []);
async function hide(id) { await settings.set('dashboard.hidden', [...hiddenSet(), id]); draw(); }

async function draw() {
  if (!root) return;
  let d, active, prog = null, tstats;
  try {
    [d, active, tstats] = await Promise.all([api.dashboard.summary(), api.research.active(), api.tasks.stats()]);
    if (active) prog = await api.research.progress(active.id);
  } catch (e) { toastError(e); return; }
  const c = d.counts; const hid = hiddenSet();
  const body = {
    research: () => widget('research', 'Research overview', active ? h('div.col',
      h('div', h('b', active.name), active.title ? h('div.muted.small', active.title) : null),
      kv([['Status', h('span.accent', active.status)], ['Target', active.target_date ? `${active.target_date} (${relTime(active.target_date)})` : '—'], ['Proposal', bar(prog.proposalPct)], ['Timeline', bar(prog.timelinePct)], ['Checklist', bar(prog.checklistPct)], ['Words', prog.words]]),
      d.projects.length > 1 ? h('div.small.muted', 'Other: ', d.projects.filter((p) => !p.active).map((p) => h('a', { onclick: () => window.__os.nav('research', { id: p.id }), style: { marginRight: '10px' } }, p.name))) : null,
    ) : h('div.empty', 'No research project yet.', h('div', { style: { marginTop: '8px' } }, h('button.btn.primary', { onclick: () => quick('project') }, '+ New thesis / proposal'))), h('button.btn.sm', { onclick: () => window.__os.nav('research') }, 'OPEN')),
    tasks: () => widget('tasks', 'Task overview', h('div.col',
      h('div.grid.g4', [['Today', c.tasksToday, ''], ['Overdue', c.tasksOverdue, c.tasksOverdue ? 'err' : ''], ['Open', c.tasksOpen, ''], ['Done today', c.tasksDoneToday, 'ok']].map(([l, v, cls]) => h('div.stat', h(`div.v${cls ? '.' + cls : ''}`, v), h('div.l', l)))),
      h('div', bar(c.tasksTotal ? (c.tasksDone / c.tasksTotal) * 100 : 0, 28), h('span.muted.small', `  ${c.tasksDone}/${c.tasksTotal} completed · focus today ${tstats.focusToday} min`)),
      h('div.list', d.todayTasks.length ? d.todayTasks.map((t) => h('div.item.clickable', { onclick: () => window.__os.nav('tasks', { open: t.id }) },
        h('input', { type: 'checkbox', onclick: async (e) => { e.stopPropagation(); await api.tasks.complete(t.id); toast('Completed', 'ok', 1200); bus.emit('changed', 'tasks'); } }),
        h(`span.p-${t.priority}`, priorityGlyph(t.priority)), h('span.grow.ellipsis.title', t.title), t.deadline ? h(`span.meta${isOverdue(t.deadline) ? '.err' : ''}`, relTime(t.deadline)) : null)) : h('div.muted.small', 'Nothing due today. ✓')),
    ), h('button.btn.sm', { onclick: () => quick('task') }, '+ TASK')),
    academic: () => widget('academic', 'Academic overview', h('div.col',
      d.courses.length ? h('div.list', d.courses.map((co) => h('div.item.clickable', { onclick: () => window.__os.nav('courses', { id: co.id }) }, h('span', { style: { color: co.color } }, '■'), h('span.grow', `${co.code ? co.code + ' · ' : ''}${co.name}`), co.exam_date ? h('span.meta', `exam ${relTime(co.exam_date)}`) : null))) : h('div.muted', 'No active courses.'),
      h('div.small.muted', `Study / focus time this week: ${d.studyMinutesWeek} min`),
      ...d.deadlines.filter((x) => x.entity === 'assignment' || x.entity === 'exam').slice(0, 4).map((x) => h('div.small', h('span.warn', x.entity === 'exam' ? '✦ ' : '✎ '), x.title, h('span.muted', ` · ${relTime(x.date)}`))),
    ), h('button.btn.sm', { onclick: () => window.__os.nav('courses') }, 'OPEN')),
    stats: () => widget('stats', 'Research statistics', h('div.grid.g3', [['Papers', c.papers], ['Books', c.books], ['Documents', c.documents], ['Projects', c.projects], ['Notes', c.notes], ['Bookmarks', c.bookmarks]].map(([l, v]) => h('div.stat', h('div.v.accent', v), h('div.l', l))))),
    quick: () => widget('quick', 'Quick actions', h('div.qa', [['task', '+ New task', 'Ctrl+N'], ['note', '+ New note', 'Ctrl+⇧+N'], ['paper', '+ Add paper', ''], ['project', '+ Add project', ''], ['import', '⇪ Import file', ''], ['app', '▶ Register app', ''], ['terminal', '>_ Open terminal', 'Ctrl+`'], ['journal', '✎ Today\'s journal', 'Ctrl+J']].map(([a, l, k]) => h('button.btn', { onclick: () => quick(a) }, l, k ? h('span.dim.small', `  ${k}`) : null)))),
    activity: () => widget('activity', 'Activity feed', h('div.list', d.activity.length ? d.activity.map((a) => h('div.item.clickable', { onclick: () => openEntity(a.entity, a.entity_id) }, h(`span.${a.action === 'deleted' ? 'err' : a.action === 'created' ? 'ok' : 'accent2'}`, a.action === 'created' ? '+' : a.action === 'deleted' ? '−' : '~'), h('span.dim.small', a.entity.padEnd(8)), h('span.grow.ellipsis', a.label), h('span.meta', relTime(a.created_at)))) : h('div.muted', 'Activity appears as you work.'))),
    apps: () => widget('apps', 'Quick launch', d.favApps.length ? h('div.app-grid', d.favApps.map((a) => h('div.app-tile', { onclick: () => api.apps.launch(a.id).then(() => toast(`▶ ${a.name}`, 'ok', 1200)).catch(toastError) }, a.icon ? h('img', { src: a.icon, alt: '' }) : h('div.app-ico', a.name[0]), h('div.nm', a.name)))) : h('div.muted', 'Mark apps as favorites in the Apps module to pin them here.'), h('button.btn.sm', { onclick: () => window.__os.nav('apps') }, 'APPS')),
    deadlines: () => widget('deadlines', 'Upcoming deadlines (14 days)', h('div.list', d.deadlines.length ? d.deadlines.map((x) => h('div.item.clickable', { onclick: () => (x.entity === 'task' ? window.__os.nav('tasks', { open: x.id }) : x.entity === 'milestone' ? window.__os.nav('research', { tab: 'timeline' }) : window.__os.nav('courses', { id: x.id })) },
      h('span.dim.small', x.entity.padEnd(10)), h('span.grow.ellipsis', x.title), h(`span.meta${isOverdue(x.date) ? '.err' : ''}`, `${fmtDate(x.date)} · ${relTime(x.date)}`))) : h('div.muted', 'No deadlines in the next two weeks.'))),
  };
  const files = h('div.small.muted', 'Recent files: ', d.recentFiles.length ? d.recentFiles.map((f) => h('a', { onclick: () => window.__os.nav('library', { id: f.id }), style: { marginRight: '12px' } }, f.name)) : 'none yet');
  const grid = h(`div.dash${editing ? '.editing' : ''}`, layout().filter((id) => !hid.has(id)).map((id) => body[id]()));
  const kpi = (ic, label, value, color, go) => h('div.kpi', { style: { '--kc': color, cursor: go ? 'pointer' : 'default' }, onclick: go || null }, h('span.ki', icon(ic, 17)), h('div', h('div.kv2', String(value)), h('div.kl', label)));
  const nav = window.__os.nav;
  const kpis = h('div.kpis',
    kpi('tasks', 'Open tasks', c.tasksOpen, '#98C379', () => nav('tasks')),
    kpi('alert', 'Overdue', c.tasksOverdue, c.tasksOverdue ? '#E06C75' : '#5d6b7c', () => nav('tasks', { view: 'overdue' })),
    kpi('check', 'Done today', c.tasksDoneToday, '#59D5C3'),
    kpi('research', 'Projects', c.projects, '#B48EAD', () => nav('research')),
    kpi('courses', 'Active courses', c.courses, '#E0AF68', () => nav('courses')),
    kpi('library', 'Library files', c.documents, '#FF9E64', () => nav('library')),
    kpi('timer', 'Study (7 days)', `${d.studyMinutesWeek}m`, '#7AA2F7'),
    kpi('apps', 'Apps', c.apps, '#C099FF', () => nav('apps')));
  clear(root).append(kpis,
    h('div.toolbar', h('span.section-title', { style: { margin: 0 } }, icon('layers', 13), 'Widgets'), files, h('span.right'),
      editing && hid.size ? h('span.row.small', 'Hidden:', [...hid].map((id) => h('button.chip', { onclick: async () => { await settings.set('dashboard.hidden', [...hid].filter((x) => x !== id)); draw(); } }, '+ ' + WIDGETS[id]))) : null,
      editing ? h('button.btn.sm', { onclick: async () => { await settings.set('dashboard.layout', DEFAULT); await settings.set('dashboard.hidden', []); draw(); } }, 'Reset layout') : null,
      h(`button.btn.sm${editing ? '.on' : ''}`, { onclick: () => { editing = !editing; draw(); } }, editing ? 'Done' : 'Customize')),
    grid);
}

export default {
  id: 'status',
  async mount(el) { root = el; await draw(); off = bus.on('changed', () => draw()); },
  unmount() { root = null; off && off(); },
};
