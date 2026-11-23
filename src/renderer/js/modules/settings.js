// Settings & personalization: profile, appearance, behavior & login, terminal, notifications,
// data (DB location, backup/restore, export/import, reset), keyboard shortcut configuration.
import { api } from '../api.js';
import { h, clear, kv, fmtBytes, fmtDate, toast, toastError, confirmBox, modal, subtabs, promptBox, buildForm, ibtn } from '../ui.js';
import { icon } from '../icons.js';
import { bus } from '../state.js';
import { settings, THEMES, ACCENTS, applyAppearance } from '../state.js';
import { DEFAULT_KEYS, KEY_LABELS, MODULES, keymap, comboOf } from '../app.js';

const st = { section: 'profile' };
let root = null;
const S = (k) => settings.get(k);
const set = async (k, v) => { await settings.set(k, v); };
const row = (label, control, hint) => [h('label', label), h('div', control, hint ? h('div.dim.small', hint) : null)];
const toggle = (k) => h('input', { type: 'checkbox', checked: !!S(k), onchange: (e) => set(k, e.target.checked) });
const select = (k, options, numeric = false) => h('select', { onchange: (e) => set(k, numeric ? Number(e.target.value) : e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: String(S(k)) === String(v) }, l)));

function appearance(w) {
  const custom = S('appearance.customTheme') || { ...THEMES['gene-dark'] };
  w.append(h('div.form',
    ...row('Theme', select('appearance.theme', [...Object.entries(THEMES).map(([k, t]) => [k, t.name]), ['custom', 'Custom…']]), 'All themes are dark by design.'),
    ...row('Accent color', h('div.row', ACCENTS.map((c) => h('button.chip', { style: { background: c, borderColor: S('appearance.accent') === c ? 'var(--text)' : c, width: '26px' }, onclick: async () => { await set('appearance.accent', c); draw(); } }, ' ')), h('input', { type: 'color', value: S('appearance.accent'), onchange: (e) => set('appearance.accent', e.target.value) }))),
    ...row('Terminal font', h('input', { value: S('appearance.font'), onchange: (e) => set('appearance.font', e.target.value.trim() || 'JetBrains Mono') }), 'Any installed monospaced font, e.g. JetBrains Mono, Cascadia Code, IBM Plex Mono, Consolas.'),
    ...row('Font size', h('div.row', h('input', { type: 'range', min: 10, max: 20, value: S('appearance.fontSize'), oninput: (e) => { set('appearance.fontSize', Number(e.target.value)); e.target.nextSibling.textContent = e.target.value + 'px'; } }), h('span', S('appearance.fontSize') + 'px'))),
    ...row('UI scaling', h('div.row', h('input', { type: 'range', min: 0.7, max: 1.6, step: 0.05, value: S('appearance.zoom'), onchange: (e) => { set('appearance.zoom', Number(e.target.value)); e.target.nextSibling.textContent = Math.round(e.target.value * 100) + '%'; } }), h('span', Math.round(S('appearance.zoom') * 100) + '%'))),
    ...row('Compact mode', toggle('appearance.compact'), 'Denser rows and padding.'),
    ...row('Module colors', toggle('appearance.moduleColors'), 'Give every module its own accent color and identity (headers, buttons, highlights).'),
    ...row('Animations', toggle('appearance.animations'), 'DNA header animation and transitions. Disable for maximum performance.'),
    ...row('Transparency', toggle('appearance.transparency'), 'Slightly translucent background (visible only where the OS composites the window).'),
  ), h('div.section-title', icon('calendar', 13), 'Calendar & region'), h('div.form',
    ...row('Week starts on', select('calendar.weekStart', [['sat', 'Saturday (Iran)'], ['sun', 'Sunday'], ['mon', 'Monday (ISO)']]), 'Used by the task calendar, the Home mini-calendar and `cal` in gsh.'),
    ...row('Show Jalali (Solar Hijri) dates', toggle('calendar.jalali'), 'Adds Jalali dates next to Gregorian ones: Home, calendars, lock screen, `cal`. Convert any date with `jdate` or Tools → Date converter.'),
    ...row('Recurring tasks', h('span.muted.small', 'Choose “Iranian work week (Sat–Wed)” as the repeat rule of a task to skip Thursday and Friday.')),
  ));
  if (S('appearance.theme') === 'custom') {
    w.append(h('div.section-title', 'Custom theme'), h('div.form', ['bg', 'bg2', 'panel', 'panel2', 'border', 'border2', 'text', 'muted', 'dim'].flatMap((k) => row(k, h('input', { type: 'color', value: custom[k] || '#000000', onchange: async (e) => { custom[k] = e.target.value; await set('appearance.customTheme', { ...custom }); } })))), h('button.btn.sm', { onclick: async () => { await set('appearance.customTheme', { ...THEMES['gene-dark'] }); draw(); } }, 'Reset custom theme'));
  }
}
function behavior(w) {
  w.append(h('div.form',
    ...row('Fullscreen on startup', toggle('behavior.fullscreen'), 'Otherwise starts maximized. F11 toggles at any time.'),
    ...row('Boot animation', toggle('behavior.bootAnimation'), 'The DNA startup sequence (skippable with any key).'),
    ...row('Start minimized', toggle('behavior.startMinimized')),
    ...row('Default landing page', select('behavior.landing', MODULES.map((m) => [m.id, m.label]))),
    ...row('Home layout', h('div.row', select('home.preset', [['balanced', 'Balanced — 9 widgets'], ['terminal', 'Terminal — large terminal'], ['widgets', 'Widgets — 12 widgets'], ['focus', 'Focus — terminal + 3']]), ibtn('grid', 'Customize…', () => window.__os.nav('home', { edit: true }), 'sm')), 'Swap widgets between slots by dragging their headers in customize mode.'),
    ...row('Confirm before deletion', toggle('behavior.confirmDelete')),
    ...row('Autosave delay', select('behavior.autosaveMs', [[600, '0.6 s'], [1200, '1.2 s'], [3000, '3 s'], [8000, '8 s']], true), 'Editors also save on blur and with Ctrl+S.'),
    ...row('Preload modules', h('div.row.wrap', MODULES.filter((m) => !m.hidden).map((m) => h('label.chip', h('input', { type: 'checkbox', checked: (S('behavior.preload') || []).includes(m.id), onchange: (e) => { const s = new Set(S('behavior.preload') || []); e.target.checked ? s.add(m.id) : s.delete(m.id); set('behavior.preload', [...s]); } }), m.label))), 'Startup modules loaded in the background after launch for instant switching.'),
    ...row('Pomodoro', h('div.row', 'work', h('input', { type: 'number', value: S('pomodoro.work'), style: { width: '70px' }, onchange: (e) => set('pomodoro.work', Number(e.target.value) || 25) }), 'min · break', h('input', { type: 'number', value: S('pomodoro.break'), style: { width: '70px' }, onchange: (e) => set('pomodoro.break', Number(e.target.value) || 5) }), 'min')),
  ));
}
function notificationsSec(w) {
  w.append(h('div.form',
    ...row('Enable notifications', toggle('notifications.enabled'), 'Deadlines, overdue tasks, reminders, milestones, assignments, exams.'),
    ...row('Windows notifications', toggle('notifications.native'), 'Also show a native toast (max 3 at once, silent).'),
    ...row('"Due soon" window', select('notifications.dueSoonHours', [[6, '6 hours'], [24, '24 hours'], [48, '2 days'], [72, '3 days']], true)),
    ...row('Backup reminder', toggle('notifications.backupReminder'), 'Remind when the last backup is older than 7 days.'),
  ), h('button.btn', { onclick: async () => { const n = await api.notifications.scan(); toast(`${n.length} new notification(s)`, 'info'); } }, 'Scan now'));
}
async function data(w) {
  const [info, status, backups] = await Promise.all([api.system.info(), api.system.status(), api.backup.list()]);
  w.append(
    h('div.section-title', 'Storage'), kv([['Database', info.paths.dbFile], ['Size', fmtBytes(status.dbSize)], ['Integrity', status.db], ['Schema version', status.schema], ['Library folder (managed copies)', info.paths.libraryDir], ['Backups folder', info.paths.backupsDir], ['Log file', info.log], ['Mode', info.paths.portable ? 'portable (data next to the .exe)' : 'installed']]),
    h('div.row.wrap', { style: { marginTop: '8px' } },
      h('button.btn', { onclick: () => api.system.openDataFolder() }, 'Open data folder'), h('button.btn', { onclick: () => api.system.openLogFolder() }, 'Open logs'),
      !info.paths.portable ? h('button.btn', { onclick: async () => { try { const d = await api.system.chooseDataDir(); if (d && await confirmBox(`Data will be used from ${d} after restart. Restart now?`, { okLabel: 'Restart' })) api.system.relaunch(); } catch (e) { toastError(e); } } }, 'Change database location…') : null,
      h('button.btn', { onclick: async () => { const n = await api.search.rebuild(); toast(`Search index rebuilt (${n} records)`, 'ok'); } }, 'Rebuild search index')),
    h('div.section-title', 'Library import'), h('div.form', ...row('Default import mode', select('library.importMode', [['linked', 'Link to originals (no copies)'], ['managed', 'Copy into library folder']]), 'Linked originals are never moved, renamed or deleted by Gene OS.')),
    h('div.section-title', 'Backup'),
    h('div.form', ...row('Automatic backups', select('backup.auto', [['off', 'Off'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']])), ...row('Keep automatic backups', select('backup.keep', [[3, '3'], [5, '5'], [10, '10'], [20, '20'], [50, '50']], true)), ...row('Last backup', h('span', S('backup.last') ? fmtDate(S('backup.last'), true) : 'never'))),
    h('div.row.wrap', { style: { margin: '8px 0' } },
      h('button.btn.primary', { onclick: async () => { try { const r = await api.backup.create({}); toast(`Backup saved (${fmtBytes(r.size)})`, 'ok'); draw(); } catch (e) { toastError(e); } } }, 'Backup now'),
      h('button.btn', { onclick: async () => { const f = await api.system.saveFile({ kind: 'db', defaultName: `gene-os-backup-${fmtDate(new Date().toISOString())}.db` }); if (f) { try { await api.backup.create({ dest: f }); toast('Backup saved to ' + f, 'ok'); } catch (e) { toastError(e); } } } }, 'Backup to file…'),
      h('button.btn', { onclick: async () => { const p = await api.system.openFiles({ kind: 'db', multi: false }); if (p[0]) restore(p[0]); } }, 'Restore from file…')),
    backups.length ? h('div.panel', h('table.tbl', h('tr', ['Backup', 'Created', 'Size', ''].map((x) => h('th', x))), backups.slice(0, 30).map((b) => h('tr', h('td', b.name), h('td', fmtDate(b.created_at, true)), h('td', fmtBytes(b.size)), h('td', h('button.btn.sm', { onclick: () => restore(b.file) }, 'Restore'), ' ', h('button.btn.sm.danger', { onclick: async () => { if (await confirmBox(`Delete backup ${b.name}?`, { danger: true })) { await api.backup.remove(b.file); draw(); } } }, '✕')))))) : h('div.muted.small', 'No backups yet.'),
    h('div.section-title', 'Export / import'),
    h('div.row.wrap',
      h('button.btn', { onclick: async () => { try { const json = await api.backup.exportJson(); const f = await api.system.saveFile({ kind: 'json', defaultName: `gene-os-export-${fmtDate(new Date().toISOString())}.json`, content: json }); if (f) toast('Exported ' + f, 'ok'); } catch (e) { toastError(e); } } }, 'Export all data (JSON)'),
      h('button.btn', { onclick: async () => { const p = await api.system.openFiles({ kind: 'json', multi: false }); if (!p[0]) return; if (!(await confirmBox('Importing REPLACES all current data with the content of the export file. A backup is made first. Continue?', { danger: true, okLabel: 'Replace data', force: true }))) return; try { await api.backup.create({}); const text = await api.system.readTextFile(p[0]); await api.backup.importJson(text); toast('Import complete — reloading', 'ok'); setTimeout(() => location.reload(), 800); } catch (e) { toastError(e); } } }, 'Import from JSON (replace)…')),
    h('div.section-title.err', 'Danger zone'),
    h('button.btn.danger', { onclick: async () => { if (!(await confirmBox('Reset Gene OS? All tasks, projects, courses, notes, library records, apps and bookmarks are deleted. Your profile and the files on disk are kept. A backup is created first.', { danger: true, okLabel: 'Continue', force: true }))) return; const typed = await promptBox('Confirm reset', 'Type RESET to confirm'); if (typed !== 'RESET') return toast('Reset cancelled', 'info'); try { await api.backup.create({}); await api.backup.reset({ keepProfile: true }); toast('Application reset — reloading', 'ok'); setTimeout(() => location.reload(), 800); } catch (e) { toastError(e); } } }, 'Reset application…'),
  );
}
async function restore(file) {
  if (!(await confirmBox(`Restore from ${file}? Gene OS restarts; your current database is kept as a pre-restore backup.`, { danger: true, okLabel: 'Restore & restart', force: true }))) return;
  try { await api.backup.stageRestore(file); api.system.relaunch(); } catch (e) { toastError(e); }
}
function keyboard(w) {
  const map = keymap();
  const capture = (action) => {
    const label = h('div.center', { style: { fontSize: '1.4em', padding: '20px' } }, 'Press the new key combination…');
    const m = modal({ title: `Shortcut — ${KEY_LABELS[action]}`, body: label, actions: [{ label: 'Cancel' }] });
    const onKey = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { window.removeEventListener('keydown', onKey, true); m.close(); return; }
      const c = comboOf(e); if (!c) return;
      const clash = Object.entries(keymap()).find(([a, k]) => k === c && a !== action);
      if (clash) { label.textContent = `${c} is already used by “${KEY_LABELS[clash[0]]}”. Try another.`; return; }
      window.removeEventListener('keydown', onKey, true);
      await set('keyboard.bindings', { ...(S('keyboard.bindings') || {}), [action]: c }); m.close(); draw();
    };
    window.addEventListener('keydown', onKey, true);
  };
  w.append(h('div.panel', h('table.tbl', h('tr', h('th', 'Action'), h('th', 'Shortcut'), h('th', '')), Object.keys(DEFAULT_KEYS).map((a) => h('tr', h('td', KEY_LABELS[a]), h('td', h('span.kbd', map[a])), h('td', h('button.btn.sm', { onclick: () => capture(a) }, 'Change'), ' ', map[a] !== DEFAULT_KEYS[a] ? h('button.btn.sm.ghost', { onclick: async () => { const b = { ...(S('keyboard.bindings') || {}) }; delete b[a]; await set('keyboard.bindings', b); draw(); } }, 'reset') : null))))),
    h('div.row', { style: { marginTop: '8px' } }, h('button.btn.sm', { onclick: async () => { await set('keyboard.bindings', {}); draw(); } }, 'Reset all shortcuts')),
    h('div.section-title', 'Fixed shortcuts'),
    h('div.panel', h('table.tbl', [['1 … 9, 0', 'Home, Tasks, Research, Courses, Library, Apps, Terminal, Bookmarks, Tools, Profile (when not typing)'], ['Alt+letter', 'H home · S status · T tasks · R research · C courses · N notes · L library · B bookmarks · A apps · X terminal · O tools · P profile'], ['/', 'Global search (when not typing)'], ['?', 'This help'], ['Esc', 'Close dialog / palette / menu'], ['F11', 'Toggle fullscreen'], ['F12 / Ctrl+Shift+I', 'Developer tools'], ['Ctrl+S', 'Save the current editor'], ['Ctrl+B / Ctrl+I', 'Bold / italic in editors'], ['Terminal: ↑ ↓', 'Command history'], ['Terminal: Tab', 'Complete command'], ['Terminal: Ctrl+L', 'Clear'], ['Palette: Ctrl+Enter', 'Secondary action (open file externally, edit app/bookmark)']].map(([k, d]) => h('tr', h('td', h('span.kbd', k)), h('td', d))))));
}

const card = (title, ic, ...body) => h('div.set-card', h('div.hd', icon(ic, 13), title), h('div.bd', ...body));

async function profileSec(w) {
  const p = await api.profile.get();
  let photo = p.photo || '';
  const pv = h('div.lock-avatar', { style: { width: '92px', height: '92px', fontSize: '1.8em' } });
  const drawPv = () => { clear(pv).append(photo ? h('img', { src: photo, alt: '' }) : (p.name || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase()); };
  drawPv();
  const form = buildForm([
    { key: 'name', label: 'Name', required: true }, { key: 'role', label: 'Academic title / role' }, { key: 'university', label: 'University' },
    { key: 'developer', label: 'Developer alias' }, { key: 'telegram', label: 'Telegram' }, { key: 'website', label: 'Website' }, { key: 'github', label: 'GitHub' },
    { key: 'bio', label: 'Bio', type: 'textarea', rows: 4, full: true },
    { key: 'fields', label: 'Custom fields', type: 'custom', render: (val) => {
      const rows = (val || []).map((x) => ({ ...x })); const box = h('div.col', { style: { gap: '4px' } });
      const drawRows = () => { clear(box); rows.forEach((r, i) => box.append(h('div.row', h('input', { value: r.label, placeholder: 'Label (e.g. Student ID, ORCID)', oninput: (e) => { r.label = e.target.value; } }), h('input.grow', { value: r.value, placeholder: 'Value', oninput: (e) => { r.value = e.target.value; } }), h('button.btn.sm.ghost', { onclick: () => { rows.splice(i, 1); drawRows(); } }, '✕')))); box.append(h('div', h('button.btn.sm', { onclick: () => { rows.push({ label: '', value: '' }); drawRows(); } }, '+ field'))); };
      drawRows(); return { el: box, get: () => rows.filter((r) => r.label.trim()) };
    } },
  ], p);
  const save = async () => { try { const np = await api.profile.update({ ...form.values(), photo }); await settings.set('profile', np); bus.emit('settings', { key: 'profile' }); toast('Profile saved', 'ok', 1500); } catch (e) { toastError(e); } };
  w.append(h('div.set-grid',
    card('Identity', 'profile', form.el, h('div.row', { style: { marginTop: '10px' } }, ibtn('save', 'Save profile', save, 'primary'), ibtn('profile', 'View ID card', () => window.__os.nav('profile'), 'ghost'))),
    card('Photo', 'image', h('div.row', { style: { gap: '16px', alignItems: 'center' } }, pv, h('div.col',
      ibtn('image', photo ? 'Change photo…' : 'Choose photo…', async () => { const f = await api.system.openFiles({ kind: 'images', multi: false, title: 'Choose a profile image' }); if (!f[0]) return; try { photo = await api.system.readImageDataUrl(f[0]); drawPv(); toast('Photo selected — press “Save profile”', 'info'); } catch (e) { toastError(e); } }),
      ibtn('trash', 'Remove photo', () => { photo = ''; drawPv(); }, 'ghost'),
      h('div.dim.small', 'Shown on the ID card, the Home widget, the dock and the login screen. Stored locally (resized to 360 px).'))))));
}

async function terminalSec(w) {
  w.append(h('div.set-grid',
    card('Prompt & display', 'terminal', h('div.form',
      ...row('Prompt style', select('terminal.prompt', [['powerline', 'Powerline (two-line, segments)'], ['classic', 'Classic  [GENE·OS] ~/path 🧬 ❯'], ['minimal', 'Minimal  ❯']])),
      ...row('Syntax highlighting', toggle('terminal.highlight'), 'Colors commands, flags, strings, numbers and paths as you type.'),
      ...row('History suggestions', toggle('terminal.ghost'), 'Grey inline suggestion from history — press → to accept.'),
      ...row('Scrollback lines', select('terminal.maxLines', [[500, '500'], [1000, '1000'], [2000, '2000'], [5000, '5000']], true)))),
    card('Startup', 'power', h('div.form',
      ...row('Startup command', h('input', { value: S('terminal.startup') || '', placeholder: 'e.g. gfetch; task list --today', onchange: (e) => set('terminal.startup', e.target.value.trim()) }), 'Runs once when the first terminal opens in a session. Leave empty for none.'),
      ...row('Command history', h('button.btn.sm', { onclick: async () => { await api.shell.clear(); toast('History cleared', 'ok'); } }, 'Clear history')),
      ...row('Aliases', h('span.muted.small', 'Manage with alias name="command" and unalias name in the terminal.'))))));
}
async function securitySec(w) {
  const has = S('security.hasPin');
  w.append(h('div.section-title', icon('lock', 13), 'Login screen'), h('div.form',
    ...row('Show login screen on startup', toggle('behavior.loginScreen'), 'The OS-style sign-in screen after boot. Always shown when a PIN is set.'),
    ...row('PIN', h('div.row', h('span', has ? '🔒 PIN is set' : 'No PIN'),
      ibtn('lock', has ? 'Change PIN' : 'Set PIN', async () => {
        if (has) { const cur = await promptBox('Change PIN', 'Current PIN'); if (cur === null) return; if (!(await api.security.verifyPin(cur))) return toast('Incorrect PIN', 'error'); }
        const a = await promptBox('Set PIN', 'New PIN (4–8 digits)'); if (!a) return;
        const b = await promptBox('Set PIN', 'Repeat the new PIN'); if (a !== b) return toast('PINs do not match', 'error');
        try { await api.security.setPin(a); await settings.load(); toast('PIN set — Ctrl+Alt+L locks Gene OS', 'ok'); draw(); } catch (e) { toastError(e); }
      }, 'sm'),
      has ? ibtn('x', 'Remove PIN', async () => { const cur = await promptBox('Remove PIN', 'Current PIN'); if (cur === null) return; try { await api.security.clearPin(cur); await settings.load(); toast('PIN removed', 'ok'); draw(); } catch (e) { toastError(e); } }, 'sm.danger') : null),
    'A privacy screen for shared computers. It does not encrypt your data.'),
    ...row('Lock now', ibtn('lock', 'Lock Gene OS', () => window.__os.lock(), 'sm'), 'Shortcut: Ctrl+Alt+L · terminal: lock')));
}

async function draw() {
  if (!root) return;
  const w = h('div', { style: { maxWidth: '1180px' } });
  clear(root).append(subtabs([['profile', 'Profile'], ['appearance', 'Appearance'], ['behavior', 'Behavior & login'], ['terminal', 'Terminal'], ['notifications', 'Notifications'], ['data', 'Data & backup'], ['keyboard', 'Keyboard']], st.section, (s) => { st.section = s; draw(); }), w);
  try {
    if (st.section === 'behavior') { await behavior(w); await securitySec(w); }
    else await ({ profile: profileSec, appearance, terminal: terminalSec, notifications: notificationsSec, data, keyboard })[st.section](w);
  } catch (e) { toastError(e); }
}

export default {
  id: 'settings',
  async mount(el, params = {}) { root = el; if (params.section) st.section = params.section; await draw(); this._off = (await import('../state.js')).bus.on('settings', ({ key }) => { if (key === 'appearance.theme') draw(); applyAppearance(); }); },
  unmount() { root = null; this._off && this._off(); },
};
