// Gene OS shell: boot → (login) → desktop. Module router with lazy-loaded modules, grouped dock,
// page frame with per-module identity, keyboard shortcuts, status bar, global drag & drop.
import { api, native } from './api.js';
import { h, $$, clear, toast, toastError, closeTopModal, modalOpen, closeContext, fmtBytes } from './ui.js';
import { icon, svg } from './icons.js';
import { settings, bus, applyAppearance } from './state.js';
import { helixH, animate } from './helix.js';
import { runBoot } from './boot.js';
import { pomodoro } from './pomodoro.js';
import { showLock, isLocked } from './lock.js';

export const GROUPS = [
  { id: 'core', label: '' },
  { id: 'work', label: 'WORK' },
  { id: 'knowledge', label: 'KNOWLEDGE' },
  { id: 'system', label: 'SYSTEM' },
];
export const MODULES = [
  { id: 'home', label: 'Home', icon: 'home', color: '#59D5C3', group: 'core', digit: '1', key: 'H', desc: 'Desktop — terminal, launcher and live widgets', load: () => import('./modules/home.js') },
  { id: 'status', label: 'Status', icon: 'status', color: '#7AA2F7', group: 'core', key: 'S', desc: 'Workload, deadlines, statistics and activity at a glance', load: () => import('./modules/status.js') },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', color: '#98C379', group: 'work', digit: '2', key: 'T', desc: 'Plan, schedule and track academic and research work', load: () => import('./modules/tasks.js') },
  { id: 'research', label: 'Research', icon: 'research', color: '#B48EAD', group: 'work', digit: '3', key: 'R', desc: 'Thesis & proposals — sections, timeline, checklist and literature', load: () => import('./modules/research.js') },
  { id: 'courses', label: 'Courses', icon: 'courses', color: '#E0AF68', group: 'work', digit: '4', key: 'C', desc: 'Course workspaces, lectures, assignments and flashcards', load: () => import('./modules/courses.js') },
  { id: 'notes', label: 'Notes', icon: 'notes', color: '#89DDFF', group: 'work', key: 'N', desc: 'Notes, journals, scratchpad, code snippets and clipboard', load: () => import('./modules/notes.js') },
  { id: 'library', label: 'Library', icon: 'library', color: '#FF9E64', group: 'knowledge', digit: '5', key: 'L', desc: 'Papers, books, data files and scripts', load: () => import('./modules/library.js') },
  { id: 'bookmarks', label: 'Bookmarks', icon: 'bookmarks', color: '#E0879A', group: 'knowledge', digit: '8', key: 'B', desc: 'Journals, databases and web resources', load: () => import('./modules/bookmarks.js') },
  { id: 'apps', label: 'Apps', icon: 'apps', color: '#C099FF', group: 'system', digit: '6', key: 'A', desc: 'Your Windows programs and shortcuts', load: () => import('./modules/apps.js') },
  { id: 'terminal', label: 'Terminal', icon: 'terminal', color: '#A9B1D6', group: 'system', digit: '7', key: 'X', desc: 'gsh — the Gene OS shell', load: () => import('./modules/terminal.js') },
  { id: 'tools', label: 'Tools', icon: 'tools', color: '#4FD6BE', group: 'system', digit: '9', key: 'O', desc: 'Genetics, breeding and statistics toolbox', load: () => import('./modules/tools.js') },
  { id: 'profile', label: 'Profile', icon: 'profile', color: '#59D5C3', group: 'user', digit: '0', key: 'P', dockHidden: true, desc: 'Researcher ID card', load: () => import('./modules/profile.js') },
  { id: 'settings', label: 'Settings', icon: 'settings', color: '#8493A5', group: 'user', dockHidden: true, desc: 'Appearance, behavior, profile, terminal, data and keyboard', load: () => import('./modules/settings.js') },
  { id: 'about', label: 'About', icon: 'about', color: '#8493A5', group: 'user', dockHidden: true, desc: 'Version, developer, credits and licenses', load: () => import('./modules/about.js') },
];

export const DEFAULT_KEYS = {
  palette: 'Ctrl+K', search: 'Ctrl+Shift+F', newTask: 'Ctrl+N', newNote: 'Ctrl+Shift+N', terminal: 'Ctrl+`',
  settings: 'Ctrl+,', focus: 'Ctrl+.', notifications: 'Ctrl+Shift+B', scratchpad: 'Ctrl+Shift+S', journal: 'Ctrl+J',
  help: 'F1', nextTab: 'Ctrl+PageDown', prevTab: 'Ctrl+PageUp', pomodoro: 'Ctrl+Shift+P', lock: 'Ctrl+Alt+L', home: 'Ctrl+Shift+H',
};
export const KEY_LABELS = {
  palette: 'Command palette', search: 'Global search', newTask: 'New task', newNote: 'New note', terminal: 'Open terminal', settings: 'Settings',
  focus: 'Focus mode', notifications: 'Notification center', scratchpad: 'Scratchpad', journal: "Today's journal", help: 'Keyboard help',
  nextTab: 'Next module', prevTab: 'Previous module', pomodoro: 'Start / stop pomodoro', lock: 'Lock screen', home: 'Home desktop',
};

const state = { current: null, mod: null, params: {}, startedAt: Date.now(), info: null, status: null, active: null, helix: null, navToken: 0 };
const view = () => document.getElementById('view');
const groupLabel = (g) => (GROUPS.find((x) => x.id === g) || {}).label || '';

function pageHead(def) {
  return h('div.page-head',
    h('span.ph-ico', icon(def.icon, 17)),
    h('div', h('div.ph-title', def.label.toUpperCase()), h('div.ph-desc', def.desc)),
    h('div.ph-crumb', 'GENE OS', icon('chevron', 10), groupLabel(def.group) ? [groupLabel(def.group), icon('chevron', 10)] : null, h('b', def.label.toUpperCase()), def.key ? h('span.kbd', { style: { marginLeft: '8px' } }, `Alt+${def.key}`) : null));
}

export async function nav(id, params = {}) {
  const def = MODULES.find((m) => m.id === id) || (id === 'dashboard' ? MODULES[0] : null);
  if (!def) return toast(`Unknown module '${id}'`, 'error');
  const token = ++state.navToken;
  try {
    if (state.mod && state.mod.unmount) { try { state.mod.unmount(); } catch (e) { console.error(e); } }
    state.mod = null;
    const mod = (await def.load()).default;
    if (token !== state.navToken) return; // a newer navigation won
    state.current = def.id; state.mod = mod; state.params = params;
    $$('#dock .dock-item').forEach((t) => t.classList.toggle('active', t.dataset.id === def.id));
    const el = clear(view());
    el.style.setProperty('--mod', settings.get('appearance.moduleColors') === false ? 'var(--accent)' : def.color);
    if (def.id !== 'home') el.append(pageHead(def));
    const body = h(`div.page-body${def.id === 'home' ? '.home' : ''}`);
    el.append(body);
    await mod.mount(body, params, ctx);
    bus.emit('nav', def.id);
  } catch (e) { console.error(e); toastError(e); }
}
export const ctx = { nav, bus, settings, current: () => state.current, refreshStatus: () => refreshStatus(), lock: () => showLock({}), modules: MODULES };
window.__os = ctx; // for debugging from DevTools

function avatarNode(p, cls = 'avatar') {
  const initials = (p.name || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  return h(`span.${cls}`, p.photo ? h('img', { src: p.photo, alt: '' }) : initials);
}
function buildDock() {
  const dock = clear(document.getElementById('dock'));
  for (const g of GROUPS) {
    const items = MODULES.filter((m) => m.group === g.id && !m.dockHidden);
    if (!items.length) continue;
    dock.append(h('div.dock-group', g.label ? h('span.dock-label', g.label) : null, items.map((m) => h('button.dock-item', {
      dataset: { id: m.id }, style: { '--c': m.color }, title: `${m.label} — ${m.desc}\n${[m.digit ? m.digit : null, m.key ? 'Alt+' + m.key : null].filter(Boolean).join('  ·  ')}`, onclick: () => nav(m.id),
    }, icon(m.icon, 15), h('span', m.label)))));
  }
  const p = settings.get('profile') || {};
  dock.append(h('span.dock-spacer'), h('button.dock-profile', { title: 'Profile (0 / Alt+P)', onclick: () => nav('profile') }, avatarNode(p), h('span', p.name || 'Profile')));
  $$('#dock .dock-item').forEach((t) => t.classList.toggle('active', t.dataset.id === state.current));
}

function topbar() {
  for (const el of document.querySelectorAll('[data-ico]')) el.innerHTML = svg(el.dataset.ico, el.classList.contains('brand-mark') ? 17 : 14);
  document.getElementById('topbar').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'min') api.system.minimize();
    else if (act === 'max') api.system.toggleMaximize();
    else if (act === 'full') api.system.toggleFullscreen();
    else if (act === 'close') api.system.quit();
    else if (act === 'settings') nav('settings');
    else if (act === 'lock') showLock({});
    else if (act === 'palette') (await import('./palette.js')).openPalette();
    else if (act === 'search') (await import('./palette.js')).openPalette({ mode: 'search' });
    else if (act === 'notifications') (await import('./notify.js')).toggleDrawer();
  });
}

// ---- status bar (unchanged layout) & top status ----
async function refreshStatus() {
  try {
    const [status, active, unread] = await Promise.all([api.system.status(), api.research.active(), api.notifications.unread()]);
    state.status = status; state.active = active;
    const c = document.getElementById('notif-count');
    c.textContent = unread; c.classList.toggle('hot', unread > 0);
  } catch (e) { console.error(e); }
  renderStatus();
}
function renderStatus() {
  const s = state.status || {}; const now = new Date();
  const sess = Math.floor((Date.now() - state.startedAt) / 1000);
  const hms = [Math.floor(sess / 3600), Math.floor(sess / 60) % 60, sess % 60].map((x) => String(x).padStart(2, '0')).join(':');
  const date = now.toLocaleDateString('en-CA'), time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = pomodoro.status();
  const sb = document.getElementById('statusbar');
  clear(sb).append(
    h('span', h('i.dot'), 'SYSTEM ', h('b', 'ONLINE')),
    h('span.clickable', { onclick: () => nav('settings', { section: 'data' }), title: 'Local SQLite database' }, 'STORAGE ', h('b', `${s.db === 'ok' ? 'OK' : s.db || '…'} · ${fmtBytes(s.dbSize || 0)}`), s.portable ? h('span.dim', ' portable') : null),
    h('span.clickable', { onclick: () => nav('research'), title: 'Active research project' }, 'PROJECT ', h('b', state.active ? state.active.name : '—')),
    h('span', h('b', date), ' ', time),
    h('span', 'SESSION ', h('b', hms)),
    p.running ? h(`span.clickable.pomo${p.mode === 'break' ? '.break' : ''}`, { onclick: () => pomodoro.stop(), title: 'Click to stop' }, `◷ ${p.mode.toUpperCase()} ${p.remaining}`) : null,
    h('span.r.clickable', { onclick: () => nav('about') }, `GENE OS v${state.info ? state.info.version : ''}`),
  );
  const prof = settings.get('profile') || {};
  const ts = document.getElementById('top-status');
  clear(ts).append(h('span', 'SYSTEM ', h('b.ok', 'ONLINE')), h('span.sep', '│'), h('span', h('b', prof.name || '—'), ' @ ', prof.university ? prof.university.split(' ').map((w) => w[0]).join('') : 'gene-os'), h('span.sep', '│'), h('span.small', now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })));
}

// ---- keyboard ----
export function comboOf(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl'); if (e.altKey) parts.push('Alt'); if (e.shiftKey) parts.push('Shift');
  let k = e.key;
  if (e.code === 'Backquote') k = '`'; else if (e.code && e.code.startsWith('Digit')) k = e.code.slice(5); else if (e.code && /^Key[A-Z]$/.test(e.code)) k = e.code.slice(3); else if (k && k.length === 1) k = k.toUpperCase();
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return '';
  parts.push(k === ' ' ? 'Space' : k);
  return parts.join('+');
}
export function keymap() { return { ...DEFAULT_KEYS, ...(settings.get('keyboard.bindings') || {}) }; }
const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export async function runAction(action) {
  const pal = () => import('./palette.js');
  switch (action) {
    case 'palette': return (await pal()).openPalette();
    case 'search': return (await pal()).openPalette({ mode: 'search' });
    case 'newTask': return (await import('./modules/tasks.js')).quickTaskDialog();
    case 'newNote': return nav('notes', { create: true });
    case 'terminal': return nav('terminal');
    case 'home': return nav('home');
    case 'settings': return nav('settings');
    case 'focus': document.body.classList.toggle('focus'); return toast(document.body.classList.contains('focus') ? 'Focus mode on' : 'Focus mode off', 'info', 1200);
    case 'notifications': return (await import('./notify.js')).toggleDrawer();
    case 'scratchpad': return nav('notes', { tab: 'scratch' });
    case 'journal': return nav('notes', { tab: 'journal' });
    case 'help': return nav('settings', { section: 'keyboard' });
    case 'lock': return showLock({});
    case 'pomodoro': return pomodoro.status().running ? pomodoro.stop() : pomodoro.start();
    case 'nextTab': case 'prevTab': {
      const vis = MODULES.filter((m) => !m.dockHidden); const i = Math.max(0, vis.findIndex((m) => m.id === state.current));
      return nav(vis[(i + (action === 'nextTab' ? 1 : vis.length - 1)) % vis.length].id);
    }
  }
}

function keyboard() {
  window.addEventListener('keydown', (e) => {
    if (isLocked()) return;
    if (e.key === 'Escape') { closeContext(); if (closeTopModal()) { e.preventDefault(); return; } }
    if (modalOpen()) return;
    const combo = comboOf(e); if (!combo) return;
    const map = keymap();
    const action = Object.keys(map).find((a) => map[a] === combo);
    if (action) { e.preventDefault(); runAction(action); return; }
    const alt = /^Alt\+([A-Z0-9])$/.exec(combo);
    if (alt) { const m = MODULES.find((x) => x.key === alt[1] || x.digit === alt[1]); if (m) { e.preventDefault(); nav(m.id); } return; }
    if (/^[0-9]$/.test(combo) && !isTyping(document.activeElement)) { const m = MODULES.find((x) => x.digit === combo); if (m) { e.preventDefault(); nav(m.id); } }
    else if (combo === '/' && !isTyping(document.activeElement)) { e.preventDefault(); runAction('search'); }
    else if (combo === 'Shift+?' && !isTyping(document.activeElement)) { e.preventDefault(); runAction('help'); }
  });
  // files dropped anywhere outside a dedicated drop zone: programs → Apps, everything else → Library
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (e.target.closest && e.target.closest('.dropzone')) return;
    const paths = [...(e.dataTransfer?.files || [])].map((f) => native.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    try {
      if (paths.every((p) => /\.(exe|lnk)$/i.test(p))) { const r = await api.apps.registerMany(paths); toast(`Registered ${r.added.length} app(s)${r.errors.length ? `, ${r.errors.length} skipped` : ''}`, 'ok'); bus.emit('changed', 'apps'); }
      else { const r = await api.library.importPaths(paths, {}); toast(`Imported ${r.imported.length} file(s)${r.duplicates.length ? ` · ${r.duplicates.length} duplicate(s) skipped` : ''}`, 'ok'); bus.emit('changed', 'files'); }
    } catch (err) { toastError(err); }
  });
}

async function prepareDesktop() {
  document.getElementById('shell').hidden = false;
  buildDock(); topbar(); keyboard();
  const helixEl = document.getElementById('helix');
  state.helix = settings.get('appearance.animations') === false ? (helixEl.innerHTML = helixH(18, 2, 0), null) : animate(helixEl, (p) => helixH(18, 2, p), 6);
  bus.on('settings', ({ key, value }) => {
    if (key === 'appearance.animations') { if (value === false) state.helix && state.helix.stop(); else if (state.helix) state.helix.start(); }
    if (key === 'profile') { renderStatus(); buildDock(); }
    if (key === 'appearance.moduleColors') nav(state.current || 'home', state.params);
  });
  native.on('gos:notifications', (fresh) => { for (const n of fresh.slice(0, 3)) toast(`◉ ${n.title}`, n.kind === 'overdue' ? 'warn' : 'info', 4500); refreshStatus(); });
  bus.on('changed', () => refreshStatus());
  bus.on('pomodoro', renderStatus);
  await refreshStatus();
  setInterval(renderStatus, 1000);
  setInterval(refreshStatus, 60 * 1000);
  await nav(settings.get('behavior.landing') || 'home');
}

async function start() {
  try {
    await settings.load();
    applyAppearance();
    state.info = await api.system.info();
  } catch (e) { console.error(e); }
  const login = settings.get('behavior.loginScreen') !== false || settings.get('security.hasPin');
  let unlocked = Promise.resolve();
  await runBoot({
    animated: settings.get('behavior.bootAnimation') !== false, version: state.info ? state.info.version : '',
    // runs while the boot screen is still visible, so the hand-off reveals a finished desktop / login screen
    onReady: async () => { await prepareDesktop(); if (login) unlocked = showLock({ initial: true }); },
  });
  document.getElementById('boot').remove();
  await unlocked;
  const pre = settings.get('behavior.preload') || [];
  (window.requestIdleCallback || setTimeout)(() => pre.forEach((id) => MODULES.find((m) => m.id === id)?.load().catch(() => {})));
}

start();
