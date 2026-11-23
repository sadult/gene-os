// Apps: library (grid/list, search, categories, groups, sorting, recents) → click opens the application
// overview page (icon, name, description, metadata, LAUNCH). Editing covers name, icon, description,
// category, group, tags, launch arguments and working directory.
import { api } from '../api.js';
import { h, clear, debounce, relTime, fmtDate, fmtBytes, toast, toastError, modal, confirmBox, contextMenu, copyText, dropzone, empty, kv, buildForm, ibtn } from '../ui.js';
import { icon } from '../icons.js';
import { bus } from '../state.js';
import { appIcon } from '../appicon.js';

const st = { q: '', cat: 'all', view: 'grid', sort: 'name', group: 'category', fav: false, detail: null };
let root = null, off = null;
const GLYPHS = ['🧬', '📊', '📈', '🧪', '🐄', '🐑', '🐔', '🧮', '💻', '📚', '📝', '🔬', 'R', 'SAS', 'Py', 'Σ'];

export async function addAppsDialog() {
  const paths = await api.system.openFiles({ kind: 'apps', multi: true, title: 'Select applications (.exe) or shortcuts (.lnk)' });
  if (paths.length) await register(paths);
}
async function register(paths) {
  if (!paths.length) return;
  toast(`Inspecting ${paths.length} item(s)…`, 'info', 1200);
  try {
    const r = await api.apps.registerMany(paths);
    bus.emit('changed', 'apps');
    if (r.added.length === 1 && !r.errors.length) { toast(`Registered ${r.added[0].name}`, 'ok'); st.detail = r.added[0].id; draw(); }
    else toast(`Registered ${r.added.length}${r.errors.length ? ` · ${r.errors.length} skipped: ${r.errors.map((e) => e.error).join('; ')}` : ''}`, r.errors.length ? 'warn' : 'ok', 6000);
  } catch (e) { toastError(e); }
}
const launch = (a) => api.apps.launch(a.id).then(() => { toast(`▶ Launching ${a.name}`, 'ok', 1500); bus.emit('changed', 'apps'); }).catch(toastError);

// Icon editor used inside the edit dialog: preview + choose file / glyph / re-detect.
function iconEditor(a, onChange) {
  let cur = { ...a };
  const pv = h('div.pv');
  const draw2 = () => { clear(pv).append(appIcon(cur, 52)); };
  const glyph = h('input', { placeholder: 'emoji or 1–3 letters', style: { width: '140px' }, maxlength: 4, value: String(a.icon || '').startsWith('glyph:') ? a.icon.slice(6).split('|')[0] : '' });
  const color = h('input', { type: 'color', value: String(a.icon || '').startsWith('glyph:') ? a.icon.split('|')[1] || '#59D5C3' : '#59D5C3' });
  const set = (x) => { cur = x; draw2(); onChange(x); };
  const el = h('div.col', { style: { gap: '8px' } },
    h('div.icon-editor', pv, h('div.col', { style: { gap: '6px' } },
      h('div.row.wrap',
        ibtn('image', 'Choose file…', async () => { const p = await api.system.openFiles({ kind: 'icons', multi: false, title: 'Icon: .ico .png .jpg, or a program / shortcut to take its icon' }); if (p[0]) { try { set(await api.apps.setIcon(a.id, p[0])); toast('Icon updated', 'ok', 1200); } catch (e) { toastError(e); } } }, 'sm'),
        ibtn('refresh', 'Re-detect', async () => { try { set(await api.apps.resetIcon(a.id)); toast(cur.icon ? 'Icon re-extracted' : 'No icon found — using letter', cur.icon ? 'ok' : 'warn'); } catch (e) { toastError(e); } }, 'sm')),
      h('div.row.wrap', glyph, color, ibtn('check', 'Use glyph', async () => { try { set(await api.apps.setGlyph(a.id, glyph.value, color.value)); } catch (e) { toastError(e); } }, 'sm')),
      h('div.row.wrap', GLYPHS.map((g) => h('button.chip', { onclick: () => { glyph.value = g; } }, g))))),
    h('div.dim.small', 'Icons are extracted from the shortcut’s icon location, the target program or the file itself, and stored as 64 px PNG.'));
  draw2();
  return el;
}

async function editApp(a) {
  const [cats, groups] = await Promise.all([api.apps.categories(), api.apps.groups()]);
  let latest = a;
  const form = buildForm([
    { type: 'section', label: 'Identity' },
    { key: 'name', label: 'Display name', required: true },
    { key: 'description', label: 'Description', type: 'textarea', rows: 3 },
    { key: '_icon', label: 'Icon', type: 'custom', full: false, render: () => ({ el: iconEditor(a, (x) => { latest = x; }), get: () => undefined }) },
    { type: 'section', label: 'Organization' },
    { key: 'category', label: 'Category', type: 'custom', full: false, render: (v) => { const i = h('input', { value: v || '', list: 'gos-app-cats', placeholder: 'Statistics, Genetics, Office…' }); return { el: h('div', i, h('datalist#gos-app-cats', cats.map((c) => h('option', { value: c })))), get: () => i.value.trim() || 'General' }; } },
    { key: 'group_name', label: 'Custom group', type: 'custom', full: false, render: (v) => { const i = h('input', { value: v || '', list: 'gos-app-groups', placeholder: 'e.g. Thesis analysis toolkit' }); return { el: h('div', i, h('datalist#gos-app-groups', groups.map((c) => h('option', { value: c })))), get: () => i.value.trim() }; } },
    { key: 'tags', label: 'Tags', type: 'tags' },
    { key: 'favorite', label: 'Favorite (pin to Home)', type: 'checkbox' },
    { type: 'section', label: 'Launch' },
    { key: 'args', label: 'Arguments', placeholder: '--vanilla "C:\\data\\run.R"', hint: 'Quoted arguments are passed as one argument.' },
    { key: 'cwd', label: 'Working directory', placeholder: 'defaults to the program folder' },
  ], a);
  return new Promise((resolve) => {
    let done = false;
    const save = async (m) => {
      try { const v = form.values(); delete v._icon; await api.apps.update(a.id, v); done = true; m.close(); bus.emit('changed', 'apps'); resolve(true); } catch (e) { toastError(e); }
    };
    modal({ title: `Edit application — ${a.name}`, size: 'wide', body: form.el, onClose: () => { if (!done) { if (latest.icon !== a.icon) bus.emit('changed', 'apps'); resolve(false); } },
      actions: [{ label: 'Remove from library', danger: true, onClick: async (m) => { if (await confirmBox(`Remove “${a.name}” from the app library? Nothing is uninstalled.`, { danger: true })) { await api.apps.remove(a.id); done = true; m.close(); st.detail = null; bus.emit('changed', 'apps'); resolve(true); } } }, { label: 'Cancel', onClick: (m) => m.close() }, { label: 'Save', primary: true, onClick: save }] });
  });
}

function menu(e, a) {
  contextMenu(e, [
    { label: 'Open details', run: () => { st.detail = a.id; draw(); } },
    { label: 'Launch', run: () => launch(a) },
    { label: 'Edit…', run: () => editApp(a) },
    { label: a.favorite ? 'Remove from favorites' : 'Add to favorites', run: () => api.apps.update(a.id, { favorite: !a.favorite }).then(() => bus.emit('changed', 'apps')) },
    '-', { label: 'Open file location', run: () => api.apps.showInFolder(a.id) }, { label: 'Copy path', run: () => copyText(a.target_path || a.path, 'path') },
    { label: 'Re-detect metadata & icon', run: () => api.apps.refresh(a.id).then(() => { toast('Refreshed', 'ok'); bus.emit('changed', 'apps'); }).catch(toastError) },
    '-', { label: 'Remove from library', danger: true, run: async () => { if (await confirmBox(`Remove “${a.name}”?`, { danger: true })) { await api.apps.remove(a.id); bus.emit('changed', 'apps'); } } },
  ]);
}

// ── details page ──────────────────────────────────────────────────────────────
async function detail(id) {
  const a = await api.apps.get(id);
  if (!a) { st.detail = null; return draw(); }
  const m = a.metadata || {};
  const type = m.advertised ? 'Advertised shortcut (MSI / Store) — launched via Windows shell' : ({ exe: 'Program (.exe)', lnk: 'Shortcut (.lnk)', bat: 'Batch script', cmd: 'Command script', msc: 'Management console', url: 'Internet shortcut' }[m.type] || (a.path.split('.').pop() || '').toUpperCase());
  const chips = [a.category && h('span.chip', icon('layers', 11), a.category), a.group_name && h('span.chip', icon('folder', 11), a.group_name), ...(a.tags || []).map((t) => h('span.chip', '#' + t)), a.favorite && h('span.chip.on', '★ favorite'), a.broken ? h('span.chip', { style: { color: 'var(--err)', borderColor: 'var(--err)' } }, icon('alert', 11), 'broken path') : h('span.chip', { style: { color: 'var(--ok)', borderColor: 'color-mix(in srgb, var(--ok) 50%, transparent)' } }, icon('check', 11), 'ready')].filter(Boolean);
  clear(root).append(
    h('div.toolbar', ibtn('back', 'All apps', () => { st.detail = null; draw(); }, 'sm.ghost'), h('span.dim', '/'), h('b', a.name)),
    h('div.app-hero',
      h('div.big', appIcon(a, 64)),
      h('div', h('h1', a.name), h('div.desc', a.description || h('span.dim', 'No description — add one with Edit.')), h('div.chips', chips)),
      h('div.app-actions',
        h('button.launch-big', { disabled: a.broken, title: a.broken ? 'The program path is missing' : 'Launch application', onclick: () => launch(a) }, icon('play', 16), 'LAUNCH'),
        h('div.row', { style: { gap: '6px' } },
          ibtn('edit', 'Edit', async () => { if (await editApp(a)) detail(id); }, 'sm'),
          ibtn('star', a.favorite ? 'Unpin' : 'Pin', async () => { await api.apps.update(a.id, { favorite: !a.favorite }); bus.emit('changed', 'apps'); }, 'sm'),
          ibtn('folder', 'Location', () => api.apps.showInFolder(a.id), 'sm'),
          ibtn('more', '', (e) => menu(e, a), 'sm.ghost', { title: 'More' })))),
    h('div.grid.g3',
      h('div.panel', h('div.panel-h', icon('file', 14, 'ph'), h('span.t.noglyph', 'Location & launch')), h('div.panel-b', kv([['Type', type], ['Registered file', a.path], ['Target', a.target_path || '—'], ['Arguments', a.args || '—'], ['Working dir', a.cwd || '(program folder)'], ['Status', a.broken ? h('span.err', 'Path missing — re-link with Edit or remove') : h('span.ok', 'OK')]]))),
      h('div.panel', h('div.panel-h', icon('about', 14, 'ph'), h('span.t.noglyph', 'Version information')), h('div.panel-b', (m.ProductName || m.FileVersion || m.CompanyName) ? kv([['Product', m.ProductName], ['Description', m.FileDescription], ['Company', m.CompanyName], ['Version', m.ProductVersion || m.FileVersion], ['File version', m.FileVersion], ['Original name', m.OriginalFilename], ['Copyright', m.LegalCopyright], m.size ? ['Size', fmtBytes(m.size)] : null, m.modified ? ['Modified', fmtDate(m.modified)] : null].filter((x) => x && x[1])) : h('div.muted.small', 'No embedded version resource (shortcut targets and scripts often have none). Use “Re-detect” after the program is installed.'))),
      h('div.panel', h('div.panel-h', icon('chart', 14, 'ph'), h('span.t.noglyph', 'Usage')), h('div.panel-b', kv([['Launches', a.launch_count || 0], ['Last launched', a.last_launched_at ? `${fmtDate(a.last_launched_at, true)} (${relTime(a.last_launched_at)})` : 'never'], ['Added', fmtDate(a.created_at, true)], ['Updated', fmtDate(a.updated_at, true)], ['Icon', a.custom_icon ? 'custom' : a.icon ? 'detected' : 'letter (none found)']]),
        h('div.row', { style: { marginTop: '10px', gap: '6px' } }, ibtn('copy', 'Copy path', () => copyText(a.target_path || a.path, 'path'), 'sm'), ibtn('terminal', 'Command', () => copyText(`apps launch "${a.name}"`, 'command'), 'sm'))))));
}

// ── library view ──────────────────────────────────────────────────────────────
async function draw() {
  if (!root) return;
  if (st.detail) return detail(st.detail);
  let apps;
  try { apps = await api.apps.list({ sort: 'name', dir: 'ASC' }); } catch (e) { return toastError(e); }
  const cats = [...new Set(apps.map((a) => a.category || 'General'))].sort();
  let list = apps;
  if (st.q) { const q = st.q.toLowerCase(); list = list.filter((a) => [a.name, a.description, a.category, a.group_name, (a.tags || []).join(' ')].join(' ').toLowerCase().includes(q)); }
  if (st.cat !== 'all') list = list.filter((a) => (a.category || 'General') === st.cat);
  if (st.fav) list = list.filter((a) => a.favorite);
  const sorters = { name: (a, b) => a.name.localeCompare(b.name), used: (a, b) => (b.launch_count || 0) - (a.launch_count || 0), recent: (a, b) => String(b.last_launched_at || '').localeCompare(String(a.last_launched_at || '')) };
  list = [...list].sort(sorters[st.sort]);
  const recent = apps.filter((a) => a.last_launched_at).sort(sorters.recent).slice(0, 8);
  const groups = {};
  for (const a of list) (groups[(st.group === 'group' ? a.group_name || 'Ungrouped' : st.group === 'none' ? '' : a.category || 'General')] ||= []).push(a);
  const open = (a) => { st.detail = a.id; draw(); };
  const renderGroup = (items) => (st.view === 'grid'
    ? h('div.app-grid', items.map((a) => h(`div.app-tile${a.broken ? '.broken' : ''}`, { title: `${a.name}${a.description ? '\n' + a.description : ''}\nClick for details`, onclick: () => open(a), oncontextmenu: (e) => menu(e, a) },
      a.favorite ? h('span.fav', '★') : null, a.broken ? h('span.brk', 'BROKEN') : null, appIcon(a, 40), h('div.nm', a.name), h('div.ct', a.category || ''))))
    : h('div.panel', h('div.list', items.map((a) => h('div.item.clickable', { onclick: () => open(a), oncontextmenu: (e) => menu(e, a) },
      appIcon(a, 22), h('span.grow', h('b', a.name), a.description ? h('span.muted.small', '  ' + a.description) : null), a.broken ? h('span.err.small', 'BROKEN PATH') : null,
      (a.tags || []).map((t) => h('span.tag', t)), h('span.meta', a.category), h('span.meta', `${a.launch_count || 0}×`), h('span.meta', a.last_launched_at ? relTime(a.last_launched_at) : 'never'),
      h('button.go', { title: 'Launch', onclick: (e) => { e.stopPropagation(); launch(a); } }, icon('play', 11)))))));
  const broken = apps.filter((a) => a.broken).length;
  const body = h('div.col');
  const zone = h('div', { style: { minHeight: '70vh' } },
    h('div.toolbar',
      h('input.search-input', { placeholder: 'Search applications…', value: st.q, oninput: debounce((e) => { st.q = e.target.value; draw(); }, 150) }),
      h('select', { onchange: (e) => { st.sort = e.target.value; draw(); } }, [['name', 'Sort: name'], ['used', 'Sort: most used'], ['recent', 'Sort: recently used']].map(([v, l]) => h('option', { value: v, selected: st.sort === v }, l))),
      h('select', { onchange: (e) => { st.group = e.target.value; draw(); } }, [['category', 'Group: category'], ['group', 'Group: custom groups'], ['none', 'No grouping']].map(([v, l]) => h('option', { value: v, selected: st.group === v }, l))),
      h(`button.chip${st.fav ? '.on' : ''}`, { onclick: () => { st.fav = !st.fav; draw(); } }, '★ Favorites'),
      ibtn(st.view === 'grid' ? 'list' : 'grid', st.view === 'grid' ? 'List' : 'Grid', () => { st.view = st.view === 'grid' ? 'list' : 'grid'; draw(); }, 'sm'),
      broken ? h('span.err.small', `${broken} broken path(s)`) : null,
      h('span.right'),
      apps.length ? ibtn('refresh', 'Repair icons', async () => { toast('Re-extracting icons…', 'info', 1500); try { const r = await api.apps.repairIcons(); toast(`${r.fixed} icon(s) updated`, 'ok'); bus.emit('changed', 'apps'); } catch (e) { toastError(e); } }, 'sm', { title: 'Re-extract icons for apps without a custom icon' }) : null,
      ibtn('plus', 'Add .exe / .lnk', addAppsDialog, 'primary')),
    h('div.toolbar', h(`button.chip${st.cat === 'all' ? '.on' : ''}`, { onclick: () => { st.cat = 'all'; draw(); } }, `All (${apps.length})`), cats.map((c) => h(`button.chip${st.cat === c ? '.on' : ''}`, { onclick: () => { st.cat = c; draw(); } }, `${c} (${apps.filter((a) => (a.category || 'General') === c).length})`))),
    body);
  clear(root).append(zone);
  if (recent.length && !st.q && st.cat === 'all' && st.view === 'grid') body.append(h('div.section-title', icon('history', 13), 'Recently used'), h('div.row.wrap', recent.map((a) => h('button.btn', { onclick: () => open(a), oncontextmenu: (e) => menu(e, a), title: 'Open details' }, appIcon(a, 16), h('span', { style: { marginLeft: '6px' } }, a.name)))));
  if (!apps.length) body.append(empty('No applications yet. Add .exe programs or .lnk shortcuts (SAS, RStudio, VS Code, Zotero, PLINK, BLUPF90…) — or drag them here. Start-menu shortcuts live in %ProgramData%\\Microsoft\\Windows\\Start Menu\\Programs.', ibtn('plus', 'Add applications', addAppsDialog, 'primary')));
  else if (!list.length) body.append(empty('No apps match the filter.'));
  for (const [g, items] of Object.entries(groups)) { if (g) body.append(h('div.section-title', icon('layers', 13), `${g} (${items.length})`)); body.append(renderGroup(items)); }
  body.append(h('div.muted.small', { style: { marginTop: '12px' } }, 'Click an app for its overview and the Launch button · right-click for options · drop .exe/.lnk files here to register.'));
  dropzone(zone, (paths) => register(paths.filter((p) => /\.(exe|lnk|bat|cmd|msc|url)$/i.test(p))));
}

export default {
  id: 'apps',
  async mount(el, params = {}) { root = el; st.detail = params.id || null; await draw(); off = bus.on('changed', (e) => { if (!e || e === 'apps') draw(); }); },
  unmount() { root = null; off && off(); },
};
