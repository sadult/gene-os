// Command palette (Ctrl+K) and global search (Ctrl+Shift+F) share this overlay.
// Static items: navigation, actions (from the shared command registry), apps, tools. Dynamic: full-text search.
import { api } from './api.js';
import { h, clear, debounce, esc, modal, toastError } from './ui.js';
import { MODULES } from './app.js';
import { appIcon } from './appicon.js';

const KIND_LABEL = { task: 'Task', project: 'Project', section: 'Proposal', course: 'Course', topic: 'Topic', note: 'Note', file: 'File', app: 'App', bookmark: 'Bookmark' };

export function fuzzy(q, text) {
  q = q.toLowerCase(); const t = text.toLowerCase();
  if (!q) return 1;
  const idx = t.indexOf(q); if (idx >= 0) return 100 - idx;
  let ti = 0, score = 0;
  for (const c of q) { const f = t.indexOf(c, ti); if (f < 0) return 0; score += f === ti ? 3 : 1; ti = f + 1; }
  return score;
}

export async function openEntity(kind, id, { secondary = false } = {}) {
  const { nav } = window.__os;
  try {
    if (kind === 'task') return nav('tasks', { open: id });
    if (kind === 'project') return nav('research', { id });
    if (kind === 'section') { const s = await api.research.getSection(id); return nav('research', { id: s.project_id, tab: 'proposal', section: id }); }
    if (kind === 'course') return nav('courses', { id });
    if (kind === 'topic') { const t = await api.courses.getTopic(id); return nav('courses', { id: t.course_id, tab: t.kind === 'lecture' ? 'lectures' : t.kind === 'assignment' ? 'assignments' : 'topics' }); }
    if (kind === 'note') return nav('notes', { id });
    if (kind === 'file') return secondary ? api.library.open(id) : nav('library', { id });
    if (kind === 'app') return secondary ? api.apps.launch(id) : nav('apps', { id });
    if (kind === 'bookmark') { if (secondary) return nav('bookmarks', { id }); const b = await api.bookmarks.get(id); return api.system.openExternal(b.url); }
  } catch (e) { toastError(e); }
}

export async function openPalette({ mode = 'commands', query = '' } = {}) {
  const { commands } = await import('./commands.js');
  const [apps] = await Promise.all([api.apps.list({ sort: 'name', dir: 'ASC' }).catch(() => [])]);
  const { CALCULATORS, WORKSPACES } = await import('../../shared/genetics.mjs');
  const { nav } = window.__os;
  const staticItems = [
    ...MODULES.map((m) => ({ kind: 'Go to', label: m.label, hint: m.key ? `Alt+${m.key}` : '', run: () => nav(m.id) })),
    ...commands.filter((c) => c.palette).map((c) => ({ kind: 'Action', label: c.palette, hint: c.name, run: () => c.paletteRun ? c.paletteRun() : null })),
    ...apps.map((a) => ({ kind: 'Launch', label: a.name, app: a, hint: 'launch', run: () => api.apps.launch(a.id).catch(toastError) })),
    ...apps.map((a) => ({ kind: 'App', label: `${a.name} — details`, app: a, run: () => nav('apps', { id: a.id }) })),
    ...[...CALCULATORS, ...WORKSPACES].map((c) => ({ kind: 'Tool', label: c.name, run: () => nav('tools', { id: c.id }) })),
  ];
  let sel = 0, items = [], dyn = [], lastQ = null;
  const input = h('input', { placeholder: mode === 'search' ? 'Search tasks, notes, files, papers, projects, courses, bookmarks, apps…' : 'Type a command, module, app, tool… (> for terminal command)', value: query, autofocus: true });
  const results = h('div.results');
  const m = modal({ title: mode === 'search' ? 'Global search' : 'Command palette', size: 'palette', body: h('div', input, results, h('div.foot', h('span', '↑↓ navigate'), h('span', '↵ open'), h('span', 'Ctrl+↵ secondary action'), h('span', '> run terminal command'), h('span', 'Esc close'))) });
  m.el.classList.add('palette');
  m.el.querySelector('.modal-b').style.padding = '0';

  const searchDyn = debounce(async (q) => {
    if (!q || q.startsWith('>')) { dyn = []; draw(); return; }
    try { dyn = (await api.search.query(q, { limit: 30 })).map((r) => ({ kind: KIND_LABEL[r.entity] || r.entity, label: r.title, snippet: r.snippet, entity: r.entity, id: r.id })); } catch { dyn = []; }
    if (q === input.value.trim()) draw();
  }, 120);

  function compute() {
    const q = input.value.trim();
    if (q.startsWith('>')) { items = [{ kind: 'Run', label: q.slice(1).trim() || 'help', run: async () => { const t = await import('./modules/terminal.js'); nav('terminal'); setTimeout(() => t.execute(q.slice(1).trim() || 'help'), 60); } }]; return; }
    const st = mode === 'search' ? [] : staticItems.map((it) => ({ it, s: fuzzy(q, it.label) + (it.kind === 'Go to' ? 2 : 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, q ? 40 : 30).map((x) => x.it);
    items = mode === 'search' ? dyn : [...st.slice(0, 14), ...dyn, ...st.slice(14)];
  }
  function draw() {
    compute();
    if (sel >= items.length) sel = Math.max(0, items.length - 1);
    clear(results);
    if (!items.length) results.append(h('div.res.muted', input.value.trim() ? 'No results' : 'Start typing…'));
    items.forEach((it, i) => {
      const snip = it.snippet ? h('div.snip', { html: esc(it.snippet).replace(/\[\[/g, '<mark>').replace(/\]\]/g, '</mark>') }) : null;
      results.append(h(`div.res${i === sel ? '.sel' : ''}`, { onmousemove: () => { if (sel !== i) { sel = i; draw(); } }, onclick: () => choose(i) },
        h('span.kind', it.kind), it.app ? appIcon(it.app, 16) : null, h('div.grow', h('div.ellipsis', it.label), snip), it.hint ? h('span.dim.small', it.hint) : null));
    });
    results.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }
  async function choose(i, secondary = false) {
    const it = items[i]; if (!it) return;
    m.close();
    if (it.entity) return openEntity(it.entity, it.id, { secondary });
    try { await it.run(); } catch (e) { toastError(e); }
  }
  input.addEventListener('input', () => { sel = 0; const q = input.value.trim(); if (q !== lastQ) { lastQ = q; searchDyn(q); } draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel, e.ctrlKey); }
  });
  draw();
  if (query) searchDyn(query);
}
