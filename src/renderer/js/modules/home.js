// Home — the Gene OS desktop. Bento grid with the gsh terminal as the focal point, surrounded by live
// widgets. Layouts: 4 presets (balanced / terminal / widgets / focus); every slot can hold any widget
// (drag a header onto another to swap, or pick from the slot menu). Assignments persist per preset.
// Data widgets refresh on change events; the gsh session survives re-layouts.
import { api } from '../api.js';
import { h, clear, relTime, fmtDate, fmtBytes, toast, toastError, isOverdue, priorityGlyph, debounce } from '../ui.js';
import { icon } from '../icons.js';
import { settings, bus } from '../state.js';
import { mountTerminal } from '../terminal/view.js';
import { appIcon } from '../appicon.js';
import { pomodoro } from '../pomodoro.js';
import { monthGrid, weekdayHeaders, jalaliOn, isoDay, dateToJalali, formatJalali, JALALI_MONTHS, dualDate } from '../calendar.js';

const st = { term: null, offs: [], timers: [], cpuHist: [], appQ: '', recentTab: 'files', bodies: {}, metrics: null, edit: false, calMonth: null, dragSlot: null };
let root = null;
const nav = (id, p) => window.__os.nav(id, p);
const greet = () => { const hr = new Date().getHours(); return hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };
const gib = (b) => (b / 1073741824).toFixed(1);

const gauge = (pct, color) => h('div.gauge', { style: { '--gc': color } }, h('i', { style: { width: `${Math.max(0, Math.min(100, pct || 0))}%` } }));
const link = (label, onclick, ic = 'chevron') => h('button.w-link', { onclick }, label, icon(ic, 11));

function avatar(p, cls = 'avatar') {
  const initials = (p.name || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  return h(`span.${cls}`, p.photo ? h('img', { src: p.photo, alt: '' }) : initials);
}

// ── widgets ───────────────────────────────────────────────────────────────────
function renderProfile(el) {
  const p = settings.get('profile') || {};
  const clock = h('div.clock'), date = h('div');
  const tick = () => { const d = new Date(); clock.textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); date.textContent = jalaliOn() ? `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatJalali(d, 'long')}` : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }); };
  tick(); clearInterval(st.profTimer); st.profTimer = setInterval(tick, 15000);
  clear(el).append(
    h('div.prof-card', avatar(p), h('div', { style: { minWidth: 0 } }, h('div.greet', `${greet()},`), h('div.nm', (p.name || 'User').toUpperCase()), h('div.rl', p.role || ''), h('div.un', p.university || ''))),
    h('div.prof-meta', h('div', clock, date), h('div', { style: { textAlign: 'right', alignSelf: 'flex-end' } }, h('div', p.telegram || ''), h('div.accent', 'Open profile →'))));
}

function sparkSvg(values, color) {
  const w = 200, ht = 34, n = Math.max(2, values.length);
  const pts = values.map((v, i) => `${((i / (n - 1)) * w).toFixed(1)},${(ht - 2 - (Math.max(0, Math.min(100, v)) / 100) * (ht - 4)).toFixed(1)}`).join(' ');
  const s = document.createElement('span');
  s.innerHTML = `<svg class="spark" viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none"><polyline points="0,${ht} ${pts} ${w},${ht}" fill="${color}22" stroke="none"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  return s;
}
async function renderSystem(el) {
  let m;
  try { m = await api.system.metrics(); } catch { return; }
  if (m.cpu !== null) { st.cpuHist.push(m.cpu); if (st.cpuHist.length > 40) st.cpuHist.shift(); }
  st.metrics = m;
  const memPct = (m.memUsed / m.memTotal) * 100;
  const diskPct = m.disk ? ((m.disk.total - m.disk.free) / m.disk.total) * 100 : 0;
  const up = Math.floor(m.appUptime / 60);
  clear(el).append(
    h('div.mini-stat', icon('cpu', 13), h('span', 'CPU'), h('span.v', m.cpu === null ? '…' : `${m.cpu.toFixed(0)}% · ${m.cores} cores`)),
    st.cpuHist.length > 1 ? sparkSvg(st.cpuHist, '#7AA2F7') : h('div', { style: { height: '34px' } }),
    h('div.mini-stat', icon('memory', 13), h('span', 'Memory'), h('span.v', `${gib(m.memUsed)} / ${gib(m.memTotal)} GB`), gauge(memPct, memPct > 85 ? '#E06C75' : '#98C379')),
    m.disk ? h('div.mini-stat', icon('disk', 13), h('span', 'Data drive'), h('span.v', `${gib(m.disk.free)} GB free`), gauge(diskPct, diskPct > 90 ? '#E06C75' : '#E0AF68')) : null,
    h('div.mini-stat', icon('dna', 13), h('span', 'Gene OS'), h('span.v', `${Math.round(m.appMem / 1048576)} MB · ${m.procs} proc`)),
    h('div.mini-stat', icon('database', 13), h('span', 'Database'), h('span.v', fmtBytes(m.dbSize))),
    h('div.mini-stat', icon('clock', 13), h('span', 'Session'), h('span.v', up >= 60 ? `${Math.floor(up / 60)}h ${up % 60}m` : `${up} min`)));
}

async function renderApps(el) {
  let apps = [];
  try { apps = await api.apps.list({ sort: 'name', dir: 'ASC' }); } catch (e) { return toastError(e); }
  const q = st.appQ.toLowerCase();
  const list = apps.filter((a) => !q || a.name.toLowerCase().includes(q) || (a.category || '').toLowerCase().includes(q))
    .sort((a, b) => (b.favorite - a.favorite) || String(b.last_launched_at || '').localeCompare(String(a.last_launched_at || '')) || a.name.localeCompare(b.name));
  const search = h('input', { placeholder: 'Find app…', value: st.appQ, style: { width: '100%', marginBottom: '6px' }, oninput: debounce((e) => { st.appQ = e.target.value; renderApps(el).then(() => el.querySelector('input')?.focus()); }, 150) });
  const rows = list.map((a) => h('div.launch-row', { title: `${a.name}${a.description ? ' — ' + a.description : ''}\nClick for details · ▶ to launch`, onclick: () => nav('apps', { id: a.id }) },
    appIcon(a, 22), h('span.nm', a.name, a.favorite ? h('span.warn', ' ★') : null, a.broken ? h('span.err.small', ' broken') : null),
    h('button.go', { title: `Launch ${a.name}`, onclick: (e) => { e.stopPropagation(); api.apps.launch(a.id).then(() => { toast(`▶ ${a.name}`, 'ok', 1200); bus.emit('changed', 'apps'); }).catch(toastError); } }, icon('play', 11))));
  clear(el).append(h('div', { style: { padding: '8px 10px 0' } }, search),
    apps.length ? h('div.launcher', rows.length ? rows : h('div.muted.small', { style: { padding: '8px 10px' } }, 'No match')) : h('div.empty', { style: { margin: '8px 10px' } }, 'No apps yet.', h('div', { style: { marginTop: '8px' } }, h('button.btn.sm', { onclick: async () => (await import('./apps.js')).addAppsDialog() }, '+ Add .exe / .lnk'))));
}

async function renderTasks(el) {
  const [list, s] = await Promise.all([api.tasks.list({ sort: 'deadline', dir: 'ASC' }), api.tasks.stats()]).catch((e) => { toastError(e); return [[], null]; });
  if (!s) return;
  const eod = new Date(); eod.setHours(23, 59, 59, 999);
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  const open = list.filter((t) => !['completed', 'cancelled'].includes(t.status))
    .sort((a, b) => (isOverdue(b.deadline) - isOverdue(a.deadline)) || ((a.deadline ? 0 : 1) - (b.deadline ? 0 : 1)) || String(a.deadline).localeCompare(String(b.deadline)) || rank[a.priority] - rank[b.priority]);
  const quick = h('input', { placeholder: '+ Quick task  !high #tag @fri ~30m', style: { width: '100%' } });
  quick.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !quick.value.trim()) return;
    const { parseQuick } = await import('./tasks.js');
    try { await api.tasks.create(parseQuick(quick.value)); quick.value = ''; bus.emit('changed', 'tasks'); } catch (err) { toastError(err); }
  });
  const chip = (label, v, cls) => h('span.small', h(`b${cls ? '.' + cls : ''}`, v), h('span.muted', ` ${label}  `));
  clear(el).append(
    h('div.row', { style: { marginBottom: '6px', gap: '6px' } }, chip('overdue', s.overdue, s.overdue ? 'err' : ''), chip('today', s.dueToday, 'warn'), chip('open', s.open, ''), chip('done today', s.completedToday, 'ok')),
    h('div.list', open.slice(0, 9).map((t) => h('div.item.clickable', { style: { padding: '3px 2px', minHeight: '24px' }, onclick: () => nav('tasks', { open: t.id }) },
      h('input', { type: 'checkbox', title: 'Complete', onclick: async (e) => { e.stopPropagation(); try { await api.tasks.complete(t.id); toast('✔ Completed', 'ok', 1200); bus.emit('changed', 'tasks'); } catch (err) { toastError(err); } } }),
      h(`span.p-${t.priority}`, priorityGlyph(t.priority)), h('span.grow.ellipsis', t.title),
      t.deadline ? h(`span.meta${isOverdue(t.deadline) ? '.err' : ''}`, relTime(t.deadline)) : null))),
    !open.length ? h('div.muted.small', { style: { margin: '6px 0' } }, 'Nothing pending — enjoy the calm. ✓') : null,
    h('div', { style: { marginTop: '6px' } }, quick));
}

async function renderProgress(el) {
  const [active, s, courses] = await Promise.all([api.research.active(), api.tasks.stats(), api.courses.list({ filter: { status: 'active' }, sort: 'name', dir: 'ASC' })]).catch(() => [null, null, []]);
  const rows = [];
  const row = (label, pct, color, sub) => h('div.prog-row', h('div.lbl', h('span', label), h('b', sub || `${Math.round(pct)}%`)), gauge(pct, color));
  if (active) {
    const g = await api.research.progress(active.id);
    rows.push(h('div.small', { style: { marginBottom: '6px' } }, h('span.purple', '◆ '), h('b', active.name), active.target_date ? h('span.muted', ` · target ${relTime(active.target_date)}`) : null));
    rows.push(row('Proposal', g.proposalPct, '#B48EAD', `${g.proposalPct}% · ${g.words} words`), row('Timeline', g.timelinePct, '#7AA2F7'), row('Thesis checklist', g.checklistPct, '#59D5C3'));
  } else rows.push(h('div.muted.small', { style: { marginBottom: '6px' } }, 'No active research project. ', h('a', { onclick: () => nav('research') }, 'Create one →')));
  if (s) {
    const goal = Number(settings.get('home.focusGoal')) || 120;
    rows.push(row('Focus today', (s.focusToday / goal) * 100, '#E0AF68', `${s.focusToday} / ${goal} min`));
    const week = (s.perDay || []).reduce((a, x) => a + x.c, 0);
    rows.push(row('Tasks this week', s.total ? (s.completed / s.total) * 100 : 0, '#98C379', `${week} done · ${s.completed}/${s.total} total`));
  }
  for (const c of courses.slice(0, 2)) { const o = await api.courses.overview(c.id); rows.push(row(c.code || c.name, o.progress, c.color || '#E0AF68')); }
  clear(el).append(...rows);
}

function renderQuick(el) {
  const q = (ic, label, color, run, hint) => h('button.qbtn', { style: { '--qc': color }, title: hint || label, onclick: () => Promise.resolve(run()).catch(toastError) }, icon(ic, 17), label);
  clear(el).append(h('div.qgrid',
    q('tasks', 'New task', '#98C379', async () => (await import('./tasks.js')).quickTaskDialog(), 'Ctrl+N'),
    q('notes', 'New note', '#89DDFF', () => nav('notes', { create: true }), 'Ctrl+Shift+N'),
    q('import', 'Add paper', '#FF9E64', async () => (await import('./library.js')).importDialog({ doc_type: 'article' })),
    q('research', 'New project', '#B48EAD', async () => (await import('./research.js')).newProjectDialog()),
    q('calendar', 'Journal', '#E0AF68', () => nav('notes', { tab: 'journal' }), 'Ctrl+J'),
    q('edit', 'Scratchpad', '#56B6C2', () => nav('notes', { tab: 'scratch' }), 'Ctrl+Shift+S'),
    q('tools', 'Tools', '#4FD6BE', () => nav('tools'), 'Alt+O'),
    q('save', 'Backup', '#7AA2F7', async () => { const r = await api.backup.create({}); toast(`Backup saved (${fmtBytes(r.size)})`, 'ok'); }),
    q('command', 'Commands', '#C099FF', async () => (await import('../palette.js')).openPalette(), 'Ctrl+K')));
}

async function renderRecent(el) {
  const tabs = [['files', 'Files'], ['notes', 'Notes'], ['projects', 'Projects']];
  const head = h('div.row', { style: { gap: '4px', marginBottom: '6px' } }, tabs.map(([id, l]) => h(`button.chip${st.recentTab === id ? '.on' : ''}`, { onclick: () => { st.recentTab = id; renderRecent(el); } }, l)));
  let rows = [];
  try {
    if (st.recentTab === 'files') {
      const d = await api.dashboard.summary();
      rows = d.recentFiles.map((f) => h('div.item.clickable', { style: { minHeight: '24px', padding: '3px 2px' }, onclick: () => nav('library', { id: f.id }), ondblclick: () => api.library.open(f.id).catch(toastError) }, h('span.dim', icon('file', 13)), h('span.dim.small', (f.ext || '').toUpperCase().padEnd(4)), h('span.grow.ellipsis', f.name), h('span.meta', relTime(f.last_opened_at || f.created_at))));
    } else if (st.recentTab === 'notes') {
      rows = (await api.notes.list({ limit: 8 })).map((n) => h('div.item.clickable', { style: { minHeight: '24px', padding: '3px 2px' }, onclick: () => nav('notes', { id: n.id }) }, h('span.dim', icon('notes', 13)), h('span.grow.ellipsis', n.title), h('span.meta', `${n.kind} · ${relTime(n.updated_at)}`)));
    } else {
      rows = (await api.research.list({ sort: 'updated_at' })).slice(0, 8).map((p) => h('div.item.clickable', { style: { minHeight: '24px', padding: '3px 2px' }, onclick: () => nav('research', { id: p.id }) }, h('span.purple', icon('research', 13)), h('span.grow.ellipsis', p.name, p.active ? h('span.ok.small', '  ● active') : null), h('span.meta', `${p.status} · ${relTime(p.updated_at)}`)));
    }
  } catch (e) { toastError(e); }
  clear(el).append(head, rows.length ? h('div.list', rows) : h('div.muted.small', 'Nothing here yet.'));
}

async function renderDeadlines(el) {
  const d = await api.dashboard.summary().catch(() => null);
  if (!d) return;
  const col = { task: '#98C379', milestone: '#B48EAD', assignment: '#E0AF68', exam: '#E06C75' };
  const go = (x) => (x.entity === 'task' ? nav('tasks', { open: x.id }) : x.entity === 'milestone' ? nav('research', { tab: 'timeline' }) : nav('courses', { id: x.id }));
  clear(el).append(d.deadlines.length ? d.deadlines.slice(0, 9).map((x) => h('div.dl-row', { onclick: () => go(x), title: `${x.entity} · ${fmtDate(x.date, true)}` }, h('span.dl-dot', { style: { background: col[x.entity] || '#7AA2F7' } }), h('span.ellipsis', x.title), h(`span.meta${isOverdue(x.date) ? '.err' : ''}`, relTime(x.date)))) : h('div.muted.small', 'No deadlines in the next 14 days.'));
}

async function renderFocus(el) {
  const p = pomodoro.status();
  const s = await api.tasks.stats().catch(() => null);
  const goal = Number(settings.get('home.focusGoal')) || 120;
  const total = p.running ? p.minutes * 60e3 : 1, left = p.running ? Math.max(0, p.remainingMs) : 0;
  const frac = p.running ? 1 - left / total : Math.min(1, (s ? s.focusToday : 0) / goal);
  const R = 30, C = 2 * Math.PI * R, color = p.running && p.mode === 'break' ? '#98C379' : '#E0AF68';
  const ring = document.createElement('span');
  ring.innerHTML = `<svg width="76" height="76" viewBox="0 0 76 76"><circle cx="38" cy="38" r="${R}" fill="none" stroke="var(--border)" stroke-width="6"/><circle cx="38" cy="38" r="${R}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}" transform="rotate(-90 38 38)"/></svg>`;
  clear(el).append(h('div.focus-ring', ring, h('div',
    h('div.focus-big', p.running ? p.remaining : `${s ? s.focusToday : 0}m`),
    h('div.muted.small', p.running ? `${p.mode === 'break' ? 'Break' : 'Focus'}${p.taskTitle ? ' · ' + p.taskTitle : ''}` : `focus today · goal ${goal}m`))),
  h('div.row', { style: { marginTop: '8px', gap: '6px', flexWrap: 'wrap' } },
    p.running ? h('button.btn.sm', { onclick: () => pomodoro.stop() }, icon('x', 12), h('span', 'Stop'))
      : [h('button.btn.sm', { onclick: () => pomodoro.start(settings.get('pomodoro.work') || 25) }, icon('timer', 12), h('span', `${settings.get('pomodoro.work') || 25}m`)), h('button.btn.sm', { onclick: () => pomodoro.start(50) }, h('span', '50m'))],
    h('button.btn.sm', { title: 'Hide header & dock (Ctrl+.)', onclick: () => document.body.classList.toggle('focus') }, icon('focus', 12), h('span', 'Focus mode'))));
}

async function renderQuickNote(el) {
  let n; try { n = await api.notes.scratch(); } catch (e) { return toastError(e); }
  const ta = h('textarea', { rows: 3, placeholder: 'Jot something… (Ctrl+Enter appends to the scratchpad)', style: { width: '100%', resize: 'none' } });
  const save = async () => {
    const v = ta.value.trim(); if (!v) return;
    const stamp = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    try { const cur = await api.notes.scratch(); await api.notes.update(cur.id, { content: `${cur.content ? cur.content.replace(/\s+$/, '') + '\n' : ''}- ${stamp} — ${v}` }); ta.value = ''; toast('Added to scratchpad', 'ok', 1000); bus.emit('changed', 'notes'); } catch (e) { toastError(e); }
  };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); save(); } });
  const lines = String(n.content || '').split('\n').filter((l) => l.trim()).slice(-4);
  clear(el).append(ta, h('div.row', { style: { margin: '6px 0', gap: '6px' } }, h('button.btn.sm.primary', { onclick: save }, icon('plus', 12), h('span', 'Append')), h('button.btn.sm', { onclick: () => nav('notes', { tab: 'scratch' }) }, 'Open scratchpad')),
    lines.length ? h('div.small.muted', lines.map((l) => h('div.ellipsis', l.replace(/^[-*]\s*/, '· ')))) : h('div.small.dim', 'Scratchpad is empty.'));
}

async function renderMiniCal(el) {
  const now = new Date();
  if (!st.calMonth) st.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const m = st.calMonth;
  const tasks = await api.tasks.list({}).catch(() => []);
  // deadlines are stored as ISO UTC; map them to local days
  const dueLocal = {}; for (const t of tasks) if (t.deadline && !['completed', 'cancelled'].includes(t.status)) { const k = isoDay(new Date(t.deadline)); dueLocal[k] = (dueLocal[k] || 0) + 1; }
  const g = monthGrid({ y: m.getFullYear(), m: m.getMonth() });
  const jal = jalaliOn();
  const today = isoDay(now);
  const shift = (k) => { st.calMonth = new Date(m.getFullYear(), m.getMonth() + k, 1); renderMiniCal(el); };
  const sub = jal ? (() => { const a = dateToJalali(g.first), b = dateToJalali(new Date(m.getFullYear(), m.getMonth() + 1, 0)); return `${JALALI_MONTHS[a.jm - 1]}${a.jm !== b.jm ? '–' + JALALI_MONTHS[b.jm - 1] : ''} ${b.jy}`; })() : '';
  clear(el).append(
    h('div.row', { style: { marginBottom: '4px', gap: '4px' } }, h('button.w-link', { onclick: () => shift(-1), title: 'Previous month' }, icon('back', 11)), h('b.small', g.title), sub ? h('span.dim.small', sub) : null, h('span.right'), h('button.w-link', { onclick: () => { st.calMonth = null; renderMiniCal(el); }, title: 'This month' }, 'today'), h('button.w-link', { onclick: () => shift(1), title: 'Next month' }, icon('chevron', 11))),
    h('div.mini-cal', weekdayHeaders(2).map((d) => h('span.mh', d)), g.cells.map((c) => {
      const k = isoDay(c.date), n = dueLocal[k] || 0;
      return h(`span.md${!c.inMonth ? '.out' : ''}${k === today ? '.now' : ''}${n ? '.due' : ''}`, { title: `${c.date.toDateString()}${jal ? ' · ' + formatJalali(c.date, 'long') : ''}${n ? ` · ${n} task(s) due` : ''}`, onclick: () => nav('tasks', { view: 'calendar' }) },
        String(c.date.getDate()), jal ? h('i', dateToJalali(c.date).jd) : null);
    })));
}

async function renderBookmarks(el) {
  const list = await api.bookmarks.list({ sort: 'sort', dir: 'ASC' }).catch(() => []);
  const fav = [...list.filter((b) => b.favorite), ...list.filter((b) => !b.favorite)].slice(0, 10);
  clear(el).append(fav.length ? h('div.list', fav.map((b) => h('div.item.clickable', { style: { minHeight: '24px', padding: '3px 2px' }, title: b.url, onclick: () => api.system.openExternal(b.url).catch(toastError) },
    h('span', { style: { width: '18px', textAlign: 'center' } }, b.icon || h('span.dim', icon('globe', 12))), h('span.grow.ellipsis', b.name, b.favorite ? h('span.warn', ' ★') : null), h('span.meta.ellipsis', { style: { maxWidth: '45%' } }, b.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))))) : h('div.muted.small', 'No bookmarks yet. ', h('a', { onclick: () => nav('bookmarks') }, 'Add some →')));
}

// ── widget registry & layouts ─────────────────────────────────────────────────
const WIDGETS = {
  prof: { title: 'Researcher', icon: 'profile', color: '#59D5C3', render: renderProfile, link: ['Profile', 'profile'], click: 'profile' },
  sys: { title: 'System overview', icon: 'cpu', color: '#7AA2F7', render: renderSystem, link: ['top', 'terminal', 'terminal'] },
  apps: { title: 'App launcher', icon: 'apps', color: '#C099FF', render: renderApps, link: ['All apps', 'apps'], flush: true },
  tasks: { title: 'Pending tasks', icon: 'tasks', color: '#98C379', render: renderTasks, link: ['Tasks', 'tasks'] },
  prog: { title: 'Progress tracker', icon: 'target', color: '#B48EAD', render: renderProgress, link: ['Research', 'research'] },
  quick: { title: 'Quick shortcuts', icon: 'zap', color: '#E0AF68', render: renderQuick },
  recent: { title: 'Recent', icon: 'history', color: '#FF9E64', render: renderRecent, link: ['Library', 'library'] },
  dl: { title: 'Deadlines · 14 days', icon: 'calendar', color: '#E06C75', render: renderDeadlines, link: ['Status', 'status'] },
  focus: { title: 'Focus', icon: 'timer', color: '#E0AF68', render: renderFocus },
  qnote: { title: 'Quick note', icon: 'edit', color: '#89DDFF', render: renderQuickNote, link: ['Notes', 'notes'] },
  cal: { title: 'Calendar', icon: 'calendar', color: '#7DCFFF', render: renderMiniCal, link: ['Tasks', 'tasks'] },
  bm: { title: 'Bookmarks', icon: 'bookmarks', color: '#E0879A', render: renderBookmarks, link: ['All', 'bookmarks'] },
};
export const PRESETS = {
  balanced: { label: 'Balanced', desc: 'Terminal in the middle, 9 widgets around it',
    cols: 'minmax(230px, 1.05fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(260px, 1.15fr)', rows: 'auto minmax(150px, 1fr) minmax(150px, 1fr) minmax(170px, auto)',
    areas: '"s1 term term term s2" "s3 term term term s4" "s3 term term term s5" "s6 s7 s7 s8 s9"', slots: ['prof', 'sys', 'apps', 'tasks', 'prog', 'quick', 'recent', 'dl', 'focus'] },
  terminal: { label: 'Terminal', desc: 'A large terminal with a compact side column',
    cols: 'minmax(250px, 1fr) repeat(4, minmax(0, 1fr))', rows: 'auto minmax(150px, 1fr) minmax(150px, 1fr) minmax(160px, auto)',
    areas: '"s1 term term term term" "s2 term term term term" "s3 term term term term" "s4 s4 s5 s5 s6"', slots: ['prof', 'tasks', 'apps', 'quick', 'recent', 'focus'] },
  widgets: { label: 'Widgets', desc: '12 widgets, smaller terminal',
    cols: 'repeat(5, minmax(0, 1fr))', rows: 'minmax(170px, auto) minmax(150px, 1fr) minmax(150px, 1fr) minmax(170px, auto)',
    areas: '"s1 s2 s3 s4 s5" "s6 term term term s7" "s8 term term term s9" "s10 s11 s11 s12 s12"', slots: ['prof', 'sys', 'tasks', 'prog', 'dl', 'apps', 'cal', 'focus', 'qnote', 'quick', 'recent', 'bm'] },
  focus: { label: 'Focus', desc: 'Terminal plus three essentials',
    cols: 'repeat(4, minmax(0, 1fr)) minmax(270px, 1.1fr)', rows: 'auto minmax(180px, 1fr) minmax(180px, 1fr)',
    areas: '"term term term term s1" "term term term term s2" "term term term term s3"', slots: ['prof', 'tasks', 'focus'] },
};
const presetId = () => (PRESETS[settings.get('home.preset')] ? settings.get('home.preset') : 'balanced');
function slotsFor(pid) {
  const def = PRESETS[pid].slots;
  const saved = ((settings.get('home.slots') || {})[pid] || []).filter((w) => WIDGETS[w]);
  const out = def.map((d, i) => saved[i] || d);
  // de-duplicate: a widget may appear only once; fill holes with unused widgets
  const seen = new Set(); const unused = Object.keys(WIDGETS).filter((w) => !out.includes(w));
  return out.map((w) => { if (seen.has(w)) w = def.find((d) => !seen.has(d) && !out.includes(d)) || unused.shift() || w; seen.add(w); return w; });
}
async function saveSlots(pid, slots) { await settings.set('home.slots', { ...(settings.get('home.slots') || {}), [pid]: slots }); }
async function assign(slotIdx, widgetId) {
  const pid = presetId(); const slots = slotsFor(pid);
  const other = slots.indexOf(widgetId);
  if (other === slotIdx) return;
  if (other >= 0) slots[other] = slots[slotIdx];
  slots[slotIdx] = widgetId;
  await saveSlots(pid, slots); build();
}

function widgetEl(id, slotIdx) {
  const w = WIDGETS[id];
  const body = h(`div.w-b${w.flush ? '.flush' : ''}`);
  st.bodies[id] = body;
  const right = st.edit
    ? h('select.w-pick', { title: 'Show another widget in this slot', onchange: (e) => assign(slotIdx, e.target.value), onclick: (e) => e.stopPropagation() }, Object.entries(WIDGETS).map(([k, v]) => h('option', { value: k, selected: k === id }, v.title)))
    : w.link ? h('button.w-link', { onclick: (e) => { e.stopPropagation(); nav(w.link[1]); } }, w.link[0], icon(w.link[2] || 'chevron', 11)) : null;
  const head = h('div.w-h', st.edit ? h('span.dim', { title: 'Drag onto another widget to swap' }, '⠿') : null, icon(w.icon, 13), h('span', w.title), h('span.r', right));
  const el = h(`div.w.w-${id}${st.edit ? '.editing' : ''}`, { style: { '--wc': w.color, '--area': `s${slotIdx + 1}` }, dataset: { slot: slotIdx } }, head, body);
  if (w.click && !st.edit) el.addEventListener('click', (e) => { if (!e.target.closest('button, input, textarea, select, a')) nav(w.click); });
  if (st.edit) {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => { st.dragSlot = slotIdx; e.dataTransfer.setData('text/gos-slot', String(slotIdx)); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', (e) => { if (st.dragSlot !== null) { e.preventDefault(); el.classList.add('over'); } });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); const from = st.dragSlot; st.dragSlot = null; if (from === null || from === slotIdx) return; const slots = slotsFor(presetId()); assign(slotIdx, slots[from]); });
  }
  return el;
}

const refresh = (keys) => { for (const k of keys) { const b = st.bodies[k]; if (b && root && b.isConnected !== false) Promise.resolve(WIDGETS[k].render(b)).catch((e) => console.error(e)); } };

function editBar() {
  const pid = presetId();
  return h('div.home-edit',
    h('span.row', { style: { gap: '8px' } }, icon('grid', 14), h('b', 'Customize desktop')),
    h('div.row.wrap', { style: { gap: '6px' } }, Object.entries(PRESETS).map(([k, p]) => h(`button.chip${k === pid ? '.on' : ''}`, { title: p.desc, onclick: async () => { await settings.set('home.preset', k); build(); } }, p.label))),
    h('span.muted.small', 'Drag a widget onto another to swap them, or pick a widget from each slot’s menu.'),
    h('span.right.row', { style: { gap: '6px' } },
      h('button.btn.sm', { onclick: async () => { const sl = { ...(settings.get('home.slots') || {}) }; delete sl[pid]; await settings.set('home.slots', sl); build(); } }, icon('refresh', 12), h('span', 'Reset this layout')),
      h('button.btn.sm.primary', { onclick: () => { st.edit = false; build(); } }, icon('check', 12), h('span', 'Done'))));
}

function build() {
  if (!root) return;
  if (st.term) { st.term.destroy(); st.term = null; }
  st.bodies = {};
  const pid = presetId(); const P0 = PRESETS[pid]; const slots = slotsFor(pid);
  const termBody = h('div.w-b.flush');
  const grid = h(`div.bento.p-${pid}${st.edit ? '.editing' : ''}`, { style: { '--cols': P0.cols, '--rows': P0.rows, '--areas': P0.areas } },
    h('div.w.w-term', { style: { '--wc': '#A9B1D6', '--area': 'term' } }, termBody),
    slots.map((id, i) => widgetEl(id, i)));
  clear(root).append(
    st.edit ? editBar() : null, grid,
    st.edit ? null : h('button.home-fab', { title: 'Customize desktop — layouts & widgets', onclick: () => { st.edit = true; build(); } }, icon('grid', 15)));
  st.term = mountTerminal(termBody, { compact: true });
  refresh(slots);
  if (!st.edit) setTimeout(() => st.term && st.term.focus(), 60);
}

export default {
  id: 'home',
  mount(el, params = {}) {
    root = el; st.edit = !!params.edit;
    build();
    st.timers.push(setInterval(() => refresh(['sys']), Math.max(1000, Number(settings.get('home.metricsMs')) || 2000)));
    st.timers.push(setInterval(() => { if (pomodoro.status().running) refresh(['focus']); }, 1000));
    st.offs.push(bus.on('changed', (e) => {
      if (e === 'apps') refresh(['apps']);
      else if (e === 'tasks' || e === 'notifications') refresh(['tasks', 'prog', 'dl', 'focus', 'cal']);
      else if (e === 'files') refresh(['recent']);
      else if (e === 'notes') refresh(['recent', 'qnote']);
      else if (e === 'bookmarks') refresh(['bm']);
      else if (e === 'projects' || e === 'milestones' || e === 'courses') refresh(['prog', 'recent', 'dl']);
      else refresh(['tasks', 'prog', 'dl', 'recent']);
    }));
    st.offs.push(bus.on('settings', ({ key }) => { if (key === 'profile') refresh(['prof']); if (key.startsWith('calendar.')) refresh(['cal', 'prof']); }));
    st.offs.push(bus.on('pomodoro', () => refresh(['focus'])));
  },
  unmount() {
    if (st.term) st.term.destroy(); st.term = null;
    st.offs.forEach((f) => f()); st.offs = [];
    st.timers.forEach((t) => clearInterval(t)); st.timers = []; clearInterval(st.profTimer);
    st.edit = false; root = null;
  },
};
