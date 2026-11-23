// Notes workspace: notes with [[links]], daily journal, research journal, scratchpad, code-snippet library
// and in-app clipboard history.
import { api } from '../api.js';
import { h, clear, debounce, relTime, fmtDate, toast, toastError, confirmBox, promptBox, subtabs, empty, copyText, todayStr, formModal } from '../ui.js';
import { bus } from '../state.js';
import { mdEditor } from '../editor.js';
import { SNIPPETS, EXPERIMENT_TEMPLATE } from '../../../shared/reference.mjs';

const st = { tab: 'notes', id: null, q: '', date: todayStr(), editor: null };
let root = null, off = null;
const TABS = [['notes', 'Notes'], ['journal', 'Daily journal'], ['research_journal', 'Research journal'], ['scratch', 'Scratchpad'], ['snippets', 'Code snippets'], ['clipboard', 'Clipboard history']];

async function noteEditor(n, wrap, { titleEditable = true } = {}) {
  st.editor = mdEditor({ value: n.content, showOutline: false, onSave: async (content) => { await api.notes.update(n.id, { content }); } });
  const [courses, projects] = await Promise.all([api.courses.list({ sort: 'name', dir: 'ASC' }), api.research.list({})]);
  wrap.append(h('div.row.wrap', titleEditable ? h('input.grow', { value: n.title, style: { fontSize: '1.08em', fontWeight: 600 }, onchange: async (e) => { await api.notes.update(n.id, { title: e.target.value || 'Untitled' }); bus.emit('changed', 'notes'); } }) : h('b.grow', n.title),
    h('select', { title: 'Link to course', onchange: (e) => api.notes.update(n.id, { course_id: e.target.value ? Number(e.target.value) : null }) }, [h('option', { value: '' }, 'no course'), ...courses.map((c) => h('option', { value: c.id, selected: n.course_id === c.id }, c.code || c.name))]),
    h('select', { title: 'Link to project', onchange: (e) => api.notes.update(n.id, { project_id: e.target.value ? Number(e.target.value) : null }) }, [h('option', { value: '' }, 'no project'), ...projects.map((p) => h('option', { value: p.id, selected: n.project_id === p.id }, p.name))]),
    h(`button.btn.sm${n.pinned ? '.on' : ''}`, { onclick: async () => { await api.notes.update(n.id, { pinned: !n.pinned }); draw(); } }, n.pinned ? '📌 pinned' : 'pin'),
    h('button.btn.sm', { onclick: async () => { await st.editor.flush(); const f = await api.system.saveFile({ kind: 'md', defaultName: `${n.title.replace(/[^\w-]+/g, '_')}.md`, content: st.editor.getValue() }); if (f) toast('Exported ' + f, 'ok'); } }, 'Export .md'),
    h('button.btn.sm.danger', { onclick: async () => { if (await confirmBox(`Delete “${n.title}”?`, { danger: true })) { await api.notes.remove(n.id); st.id = null; bus.emit('changed', 'notes'); draw(); } } }, '✕')),
  st.editor.el, h('div.dim.small', `created ${fmtDate(n.created_at, true)} · updated ${relTime(n.updated_at)} · link other notes with [[Title]] — clicking a missing link creates the note`));
}

async function notesTab(wrap) {
  let list = (await api.notes.list({ filter: { kind: 'note', q: st.q || undefined }, limit: 2000 }));
  list = [...list.filter((n) => n.pinned), ...list.filter((n) => !n.pinned)];
  if (!st.id || !list.find((n) => n.id === st.id)) { const cur = st.id ? await api.notes.get(st.id) : null; if (cur && cur.kind !== 'note') { st.tab = cur.kind === 'snippet' ? 'snippets' : cur.kind; if (/journal/.test(cur.kind)) st.date = cur.title.slice(-10); st.id = null; return draw(); } st.id = cur && !st.q ? cur.id : list[0]?.id || null; }
  const left = h('div.col', h('div.row', h('input.grow', { placeholder: 'Search notes…', value: st.q, oninput: debounce((e) => { st.q = e.target.value; draw(); }, 200) }), h('button.btn.primary', { onclick: newNote }, '+')),
    h('div.panel.scroll', { style: { maxHeight: 'calc(100vh - 300px)' } }, list.length ? h('div.list', list.map((n) => h(`div.item.clickable${n.id === st.id ? '.sel' : ''}`, { onclick: async () => { if (st.editor) await st.editor.flush(); st.id = n.id; draw(); } }, n.pinned ? h('span.warn', '📌') : null, h('div.grow', { style: { minWidth: 0 } }, h('div.ellipsis', n.title), h('div.dim.small.ellipsis', (n.content || '').replace(/[#*`>\-[\]]/g, '').slice(0, 80))), h('span.meta', relTime(n.updated_at))))) : h('div.panel-b.muted', 'No notes.')),
    h('button.btn.sm', { onclick: async () => { const n = await api.notes.create({ title: 'Experimental design — ' + todayStr(), content: EXPERIMENT_TEMPLATE }); st.id = n.id; draw(); } }, '+ Experimental design template'));
  const right = h('div.col');
  if (st.id) { const n = list.find((x) => x.id === st.id) || (await api.notes.get(st.id)); await noteEditor(n, right); } else right.append(empty('Create your first note.', h('button.btn.primary', { onclick: newNote }, '+ New note')));
  wrap.append(h('div.split', left, right));
}
async function newNote() {
  const t = await promptBox('New note', 'Title', '');
  if (t === null) return;
  const n = await api.notes.create({ title: t.trim() || 'Untitled', content: t.trim() ? `# ${t.trim()}\n\n` : '' });
  st.tab = 'notes'; st.id = n.id; bus.emit('changed', 'notes'); draw();
}

async function journalTab(wrap, kind) {
  const n = await api.notes.journal(st.date, kind);
  const shift = (d) => { const x = new Date(st.date + 'T12:00'); x.setDate(x.getDate() + d); st.date = fmtDate(x.toISOString()); draw(); };
  const recent = (await api.notes.list({ filter: { kind }, limit: 30, sort: 'title', dir: 'DESC' }));
  wrap.append(h('div.toolbar', h('button.btn.sm', { onclick: () => shift(-1) }, '◀'), h('input', { type: 'date', value: st.date, onchange: (e) => { st.date = e.target.value || todayStr(); draw(); } }), h('button.btn.sm', { onclick: () => shift(1) }, '▶'), h('button.btn.sm', { onclick: () => { st.date = todayStr(); draw(); } }, 'Today'),
    h('span.muted.small', kind === 'research_journal' ? 'Log analyses, decisions, data issues and supervisor feedback.' : 'One entry per day.'), h('span.right.small.muted', 'Recent: '), recent.slice(0, 7).map((r) => h('button.chip', { onclick: () => { st.date = r.title.slice(-10); draw(); } }, r.title.slice(-5)))));
  const box = h('div.col'); wrap.append(box);
  await noteEditor(n, box, { titleEditable: false });
}
async function scratchTab(wrap) {
  const n = await api.notes.scratch();
  st.editor = mdEditor({ value: n.content, mode: 'edit', onSave: (content) => api.notes.update(n.id, { content }), placeholder: 'Scratchpad — anything goes. Autosaved. Terminal: qn <text> appends a quick note here.' });
  wrap.append(st.editor.el);
  setTimeout(() => st.editor && st.editor.focus(), 30);
}
async function snippetsTab(wrap) {
  const list = await api.notes.list({ filter: { kind: 'snippet' }, sort: 'title', dir: 'ASC' });
  const add = async (s = {}) => {
    const v = await formModal({ title: s.id ? 'Edit snippet' : 'New snippet', size: 'wide', values: s, extraActions: s.id ? [{ label: 'Delete', danger: true, onClick: async (m) => { await api.notes.remove(s.id); m.close(); draw(); } }] : [], fields: [{ key: 'title', label: 'Title', required: true }, { key: 'language', label: 'Language', type: 'select', options: ['r', 'sas', 'python', 'sh', 'text', 'sql', 'fortran', 'julia'] }, { key: 'tags', label: 'Tags', type: 'tags' }, { key: 'content', label: 'Code', type: 'textarea', rows: 14, full: true }] });
    if (!v) return; s.id ? await api.notes.update(s.id, v) : await api.notes.create({ ...v, kind: 'snippet' }); draw();
  };
  wrap.append(h('div.toolbar', h('button.btn.primary', { onclick: () => add() }, '+ Snippet'), !list.length ? h('button.btn', { onclick: async () => { for (const s of SNIPPETS) await api.notes.create({ ...s, kind: 'snippet' }); draw(); } }, 'Add starter snippets (R, SAS, BLUPF90, PLINK)') : null),
    list.length ? h('div.dash', list.map((s) => h('div.panel', h('div.panel-h', h('span.t', s.title), h('span.dim', s.language), h('span.right.row', h('button.btn.sm', { onclick: () => copyText(s.content, 'snippet') }, 'Copy'), h('button.btn.sm', { onclick: () => add(s) }, 'Edit'))), h('pre', { style: { margin: 0, padding: '8px 10px', maxHeight: '220px', overflow: 'auto', fontSize: '.9em' } }, s.content)))) : empty('No snippets yet.'));
}
async function clipboardTab(wrap) {
  const list = await api.clipboard.list(100);
  wrap.append(h('div.toolbar', h('span.muted.small', 'Items copied from inside Gene OS (citations, paths, results, snippets). Stored locally, last 100.'), h('span.right'), h('button.btn.sm.danger', { onclick: async () => { await api.clipboard.clear(); draw(); } }, 'Clear history')),
    list.length ? h('div.panel', h('div.list', list.map((c) => h('div.item.clickable', { onclick: () => copyText(c.content, c.source) }, h('span.dim.small', (c.source || '').padEnd(10)), h('span.grow.ellipsis', c.content.replace(/\n/g, ' ⏎ ')), h('span.meta', relTime(c.created_at)))))) : empty('Nothing copied yet.'));
}

async function draw() {
  if (!root) return;
  if (st.editor) { await st.editor.flush(); st.editor = null; }
  const wrap = h('div');
  clear(root).append(subtabs(TABS, st.tab, (t) => { st.tab = t; draw(); }), wrap);
  try {
    if (st.tab === 'notes') await notesTab(wrap);
    else if (st.tab === 'journal' || st.tab === 'research_journal') await journalTab(wrap, st.tab);
    else if (st.tab === 'scratch') await scratchTab(wrap);
    else if (st.tab === 'snippets') await snippetsTab(wrap);
    else await clipboardTab(wrap);
  } catch (e) { toastError(e); }
}

export default {
  id: 'notes',
  async mount(el, params = {}) {
    root = el;
    if (params.tab) st.tab = params.tab;
    if (params.id) { st.tab = 'notes'; st.id = params.id; }
    await draw();
    if (params.create) newNote();
    off = bus.on('changed', (e) => { if (e === 'notes' && st.tab === 'clipboard') draw(); });
  },
  unmount() { if (st.editor) st.editor.flush(); st.editor = null; root = null; off && off(); },
};
