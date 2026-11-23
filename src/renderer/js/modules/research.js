// Research & proposal management: projects, structured proposal editor with autosave + version history,
// milestones with Gantt view, thesis checklist, literature matrix and project notes.
import { api } from '../api.js';
import { h, clear, bar, kv, fmtDate, relTime, toast, toastError, formModal, confirmBox, modal, subtabs, promptBox, empty, copyText, esc, isOverdue } from '../ui.js';
import { bus } from '../state.js';
import { mdEditor } from '../editor.js';
import { render, wordCount } from '../../../shared/markdown.mjs';
import { LIT_MATRIX_COLUMNS } from '../../../shared/reference.mjs';

const STATUS = [['planning', 'Planning'], ['proposal', 'Proposal'], ['approved', 'Approved'], ['data', 'Data collection'], ['analysis', 'Analysis'], ['writing', 'Writing'], ['defense', 'Defense'], ['completed', 'Completed'], ['on_hold', 'On hold'], ['archived', 'Archived']];
const SEC_STATUS = [['todo', 'To do'], ['draft', 'Draft'], ['review', 'In review'], ['done', 'Done']];
const MS_STATUS = [['planned', 'Planned'], ['in_progress', 'In progress'], ['done', 'Done'], ['blocked', 'Blocked']];
const SEC_GLYPH = { todo: '○', draft: '◐', review: '◑', done: '●' };
const st = { projectId: null, tab: 'overview', sectionId: null, editor: null };
let root = null, off = null;

const projectFields = [
  { key: 'name', label: 'Project name', required: true, autofocus: true },
  { key: 'title', label: 'Research title', type: 'textarea', rows: 2 },
  { key: 'kind', label: 'Type', type: 'select', options: [['thesis', 'MSc thesis'], ['proposal', 'Research proposal'], ['paper', 'Paper / manuscript'], ['project', 'Research project']] },
  { key: 'status', label: 'Status', type: 'select', options: STATUS },
  { key: 'supervisor', label: 'Supervisor(s)' },
  { key: 'field', label: 'Research field', placeholder: 'Quantitative genetics' },
  { key: 'keywords', label: 'Keywords', type: 'tags' },
  { key: 'start_date', label: 'Start date', type: 'date' },
  { key: 'target_date', label: 'Target completion', type: 'date' },
  { key: 'abstract', label: 'Abstract', type: 'textarea', rows: 4, full: true },
  { key: 'objectives', label: 'Research objectives', type: 'textarea', rows: 3, full: true },
  { key: 'questions', label: 'Research questions', type: 'textarea', rows: 3, full: true },
  { key: 'hypotheses', label: 'Hypotheses', type: 'textarea', rows: 3, full: true },
  { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, full: true },
];

export async function newProjectDialog() {
  const v = await formModal({ title: 'New research project / proposal', size: 'wide', fields: projectFields, values: { status: 'planning', kind: 'thesis', field: 'Animal Breeding & Genetics' }, submitLabel: 'Create' });
  if (!v) return null;
  try { const p = await api.research.create(v); bus.emit('changed', 'projects'); toast('Project created with the full proposal structure', 'ok'); window.__os.nav('research', { id: p.id }); return p; } catch (e) { toastError(e); return null; }
}

async function overview(p, wrap) {
  const g = await api.research.progress(p.id);
  const ms = await api.research.milestones(p.id);
  const next = ms.filter((m) => m.status !== 'done' && m.end_date).sort((a, b) => a.end_date.localeCompare(b.end_date)).slice(0, 5);
  wrap.append(h('div.grid.g2',
    h('div.panel', h('div.panel-h', h('span.t', 'Project'), h('span.right.row', !p.active ? h('button.btn.sm', { onclick: async () => { await api.research.setActive(p.id); bus.emit('changed', 'projects'); draw(); } }, 'Set active') : h('span.ok.small', '● ACTIVE'), h('button.btn.sm', { onclick: () => editProject(p) }, 'Edit'))),
      h('div.panel-b.col', h('h2', p.title || p.name), kv([['Type', p.kind], ['Status', h('span.accent', STATUS.find((s) => s[0] === p.status)?.[1] || p.status)], ['Supervisor', p.supervisor], ['Field', p.field], ['Keywords', (p.keywords || []).join(', ') || '—'], ['Start', p.start_date], ['Target', p.target_date ? `${p.target_date} (${relTime(p.target_date)})` : '—']]),
        ...[['Abstract', p.abstract], ['Objectives', p.objectives], ['Research questions', p.questions], ['Hypotheses', p.hypotheses], ['Notes', p.notes]].filter(([, v]) => v).map(([l, v]) => h('div', h('div.section-title', l), h('div.md', { html: render(v) }))))),
    h('div.col',
      h('div.panel', h('div.panel-h', h('span.t', 'Progress')), h('div.panel-b', kv([['Proposal', bar(g.proposalPct, 24)], ['Timeline', bar(g.timelinePct, 24)], ['Checklist', bar(g.checklistPct, 24)], ['Sections', `${g.doneSections} done · ${g.draftSections} drafted · ${g.sections} total`], ['Words', g.words.toLocaleString()], ['Milestones', `${g.milestonesDone}/${g.milestones}`]]))),
      h('div.panel', h('div.panel-h', h('span.t', 'Next milestones')), h('div.panel-b', next.length ? h('div.list', next.map((m) => h('div.item', h('span.grow', m.title), h(`span.meta${isOverdue(m.end_date) ? '.err' : ''}`, `${m.end_date} · ${relTime(m.end_date)}`)))) : h('div.muted', 'No open milestones. Add them in Timeline.'))),
      h('div.panel', h('div.panel-h', h('span.t', 'Export & actions')), h('div.panel-b.row.wrap',
        h('button.btn', { onclick: () => exportProposal(p, 'md') }, 'Export proposal (.md)'),
        h('button.btn', { onclick: () => exportProposal(p, 'html') }, 'Export proposal (.html → print to PDF)'),
        h('button.btn', { onclick: async () => { const t = await import('./tasks.js'); t.quickTaskDialog({ project_id: p.id, category: 'Thesis' }); } }, '+ Task for this project'),
        h('button.btn.danger', { onclick: async () => { if (await confirmBox(`Delete project “${p.name}” including all proposal sections, versions and milestones?`, { danger: true, okLabel: 'Delete project' })) { await api.research.remove(p.id); st.projectId = null; bus.emit('changed', 'projects'); draw(); } } }, 'Delete project'))),
    )));
}
async function editProject(p) {
  const v = await formModal({ title: 'Edit project', size: 'wide', fields: projectFields, values: p });
  if (!v) return;
  try { await api.research.update(p.id, v); bus.emit('changed', 'projects'); draw(); } catch (e) { toastError(e); }
}
async function exportProposal(p, fmt) {
  try {
    const md = await api.research.exportMarkdown(p.id);
    const name = (p.name || 'proposal').replace(/[^\w-]+/g, '_');
    const content = fmt === 'md' ? md : `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.title || p.name)}</title><style>body{font:15px/1.65 Georgia,'Times New Roman',serif;max-width:800px;margin:40px auto;color:#111}h1,h2{font-family:Arial,sans-serif}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}pre{background:#f4f4f4;padding:8px}.math{font-style:italic}</style></head><body>${render(md)}</body></html>`;
    const f = await api.system.saveFile({ kind: fmt === 'md' ? 'md' : 'any', defaultName: `${name}.${fmt}`, content });
    if (f) toast(`Exported → ${f}`, 'ok', 4000);
  } catch (e) { toastError(e); }
}

async function proposal(p, wrap) {
  const secs = await api.research.sections(p.id);
  if (!st.sectionId || !secs.find((s) => s.id === st.sectionId)) st.sectionId = secs[0]?.id;
  const sec = secs.find((s) => s.id === st.sectionId);
  const total = secs.reduce((a, s) => a + wordCount(s.content), 0);
  const list = h('div.panel', h('div.panel-h', h('span.t', 'Sections'), h('span.right.small', `${total} words`)), h('div.list', secs.map((s) => h(`div.item.clickable${s.id === st.sectionId ? '.sel' : ''}`, { onclick: async () => { if (st.editor) await st.editor.flush(); st.sectionId = s.id; draw(); } },
    h(`span.${s.status === 'done' ? 'ok' : s.status === 'todo' ? 'dim' : 'accent'}`, SEC_GLYPH[s.status] || '○'), h('span.grow.ellipsis', s.title), h('span.meta', wordCount(s.content) || '')))),
  h('div.panel-b.row.wrap', h('button.btn.sm', { onclick: async () => { const t = await promptBox('Add section', 'Section title'); if (t) { const s = await api.research.addSection(p.id, t); st.sectionId = s.id; draw(); } } }, '+ Section'), h('button.btn.sm', { onclick: () => exportProposal(p, 'md') }, 'Export .md')));
  const right = h('div.col');
  if (sec) {
    st.editor = mdEditor({ value: sec.content, showOutline: true, onSave: async (content) => { await api.research.saveSection(sec.id, { content, status: sec.status === 'todo' && content.trim() ? 'draft' : sec.status }); if (sec.status === 'todo' && content.trim()) { sec.status = 'draft'; } } });
    right.append(
      h('div.row.wrap',
        h('input.grow', { value: sec.title, style: { fontSize: '1.1em', fontWeight: 600 }, onchange: async (e) => { await api.research.saveSection(sec.id, { title: e.target.value }); draw(); } }),
        h('select', { onchange: async (e) => { await api.research.saveSection(sec.id, { status: e.target.value }); draw(); } }, SEC_STATUS.map(([v, l]) => h('option', { value: v, selected: sec.status === v }, l))),
        h('button.btn.sm', { onclick: async () => { await st.editor.flush(); await api.research.saveSection(sec.id, { content: st.editor.getValue() + '' }, { snapshot: true }); toast('Snapshot saved to version history', 'ok'); } }, 'Snapshot'),
        h('button.btn.sm', { onclick: () => versions(sec) }, 'History'),
        h('button.btn.sm.danger', { onclick: async () => { if (await confirmBox(`Delete section “${sec.title}”?`, { danger: true })) { await api.research.removeSection(sec.id); st.sectionId = null; draw(); } } }, '✕')),
      st.editor.el,
      h('div.panel', h('div.panel-h', h('span.t', 'Outline')), h('div.panel-b', st.editor.outlineEl)),
    );
  } else right.append(empty('No sections.'));
  wrap.append(h('div.split', list, right));
}
async function versions(sec) {
  const list = await api.research.versions(sec.id);
  const viewer = h('div.md', { style: { maxHeight: '50vh', overflow: 'auto' } }, h('div.muted', 'Select a version to preview.'));
  let chosen = null;
  const m = modal({ title: `Version history — ${sec.title}`, size: 'wide', body: list.length ? h('div.split', h('div.list', list.map((v) => h('div.item.clickable', { onclick: async () => { chosen = await api.research.version(v.id); viewer.innerHTML = render(chosen.content); } }, h('span.grow', fmtDate(v.created_at, true)), h('span.meta', `${v.words} w`)))), viewer) : h('div.empty', 'No versions yet. Versions are captured automatically every 5 minutes of editing, or with “Snapshot”.'),
    actions: [{ label: 'Close' }, { label: 'Restore selected', primary: true, onClick: async () => { if (!chosen) return toast('Select a version first', 'warn'); await api.research.restoreVersion(chosen.id); m.close(); toast('Version restored (current text saved as a version)', 'ok'); draw(); } }] });
}

async function milestoneDialog(p, m = {}) {
  const all = await api.research.milestones(p.id);
  const v = await formModal({ title: m.id ? 'Edit milestone' : 'New milestone', values: { status: 'planned', progress: 0, ...m }, extraActions: m.id ? [{ label: 'Delete', danger: true, onClick: async (mm) => { await api.research.removeMilestone(m.id); mm.close(); draw(); } }] : [], fields: [
    { key: 'title', label: 'Title', required: true, autofocus: true },
    { key: 'start_date', label: 'Start', type: 'date' }, { key: 'end_date', label: 'End / due', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: MS_STATUS }, { key: 'progress', label: 'Progress %', type: 'number' },
    { key: 'depends_on', label: 'Depends on', type: 'custom', full: false, render: (val) => { const sel = h('select', { multiple: true, size: Math.min(6, Math.max(2, all.length)) }, all.filter((x) => x.id !== m.id).map((x) => h('option', { value: x.id, selected: (val || []).includes(x.id) }, x.title))); return { el: sel, get: () => [...sel.selectedOptions].map((o) => Number(o.value)) }; } },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ] });
  if (!v) return;
  if (v.start_date && v.end_date && v.end_date < v.start_date) return toast('End date is before start date', 'error');
  v.progress = Math.max(0, Math.min(100, Number(v.progress) || 0)); if (v.status === 'done') v.progress = 100;
  try { m.id ? await api.research.updateMilestone(m.id, v) : await api.research.addMilestone({ ...v, project_id: p.id }); bus.emit('changed', 'milestones'); draw(); } catch (e) { toastError(e); }
}
async function timeline(p, wrap) {
  const ms = await api.research.milestones(p.id);
  const dated = ms.filter((m) => m.start_date || m.end_date);
  const toT = (d) => Date.parse(d + 'T00:00');
  let min = Math.min(...dated.map((m) => toT(m.start_date || m.end_date)), p.start_date ? toT(p.start_date) : Infinity);
  let max = Math.max(...dated.map((m) => toT(m.end_date || m.start_date)), p.target_date ? toT(p.target_date) : -Infinity);
  const gantt = h('div.gantt');
  if (dated.length && Number.isFinite(min) && Number.isFinite(max)) {
    min -= 3 * 864e5; max += 7 * 864e5; const span = max - min;
    const months = []; const c = new Date(min); c.setDate(1);
    while (c.getTime() < max) { const s = Math.max(c.getTime(), min); const n = new Date(c); n.setMonth(n.getMonth() + 1); months.push([c.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), (Math.min(n.getTime(), max) - s) / span * 100]); c.setMonth(c.getMonth() + 1); }
    const nowPct = (Date.now() - min) / span * 100;
    gantt.append(h('div.gh', h('div.gl.muted.small', 'MILESTONE'), h('div.months', months.map(([l, w]) => h('span', { style: { width: w + '%' } }, l)))));
    for (const m of ms) {
      const s = toT(m.start_date || m.end_date), e = toT(m.end_date || m.start_date) + 864e5;
      const late = m.status !== 'done' && m.end_date && isOverdue(m.end_date + 'T23:59');
      const deps = (m.depends_on || []).map((id) => ms.find((x) => x.id === id)?.title).filter(Boolean);
      gantt.append(h('div.gr', h('div.gl', { title: deps.length ? 'after: ' + deps.join(', ') : '' }, m.title, deps.length ? h('span.dim.small', ` ← ${deps.join(', ')}`) : null),
        h('div.gt', nowPct >= 0 && nowPct <= 100 ? h('div.now', { style: { left: nowPct + '%' } }) : null,
          Number.isFinite(s) ? h(`div.gbar${m.status === 'done' ? '.done' : ''}${late ? '.late' : ''}`, { onclick: () => milestoneDialog(p, m), title: `${m.title}: ${m.start_date || ''} → ${m.end_date || ''} · ${m.progress}%`, style: { left: ((s - min) / span * 100) + '%', width: Math.max(0.8, (e - s) / span * 100) + '%' } }, h('i', { style: { width: (m.status === 'done' ? 100 : m.progress || 0) + '%' } })) : null)));
    }
  }
  wrap.append(
    h('div.toolbar', h('button.btn.primary', { onclick: () => milestoneDialog(p) }, '+ Milestone'), h('span.muted.small', 'Click a bar or row to edit · yellow line = today · red border = late')),
    ms.length ? h('div.panel', h('div.panel-b', gantt)) : empty('No milestones yet — e.g. Proposal defense, Data collection, REML analysis, Thesis draft, Defense.'),
    ms.length ? h('div.panel', { style: { marginTop: '10px' } }, h('table.tbl', h('tr', ['Milestone', 'Start', 'End', 'Status', 'Progress', 'Depends on'].map((x) => h('th', x))),
      ms.map((m) => h('tr', { style: { cursor: 'pointer' }, onclick: () => milestoneDialog(p, m) }, h('td', m.title), h('td', m.start_date || ''), h('td', m.end_date || ''), h('td', MS_STATUS.find((s) => s[0] === m.status)?.[1]), h('td', bar(m.status === 'done' ? 100 : m.progress, 10)), h('td.muted', (m.depends_on || []).map((id) => ms.find((x) => x.id === id)?.title).filter(Boolean).join(', ')))))) : null);
}

async function checklist(p, wrap) {
  const items = (p.checklist || []).map((x) => ({ ...x }));
  const save = async () => { await api.research.update(p.id, { checklist: items }); draw(); };
  const add = h('input.grow', { placeholder: '+ add checklist item (Enter)' });
  add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim()) { items.push({ title: add.value.trim(), done: false }); save(); } });
  const done = items.filter((x) => x.done).length;
  wrap.append(h('div.panel', h('div.panel-h', h('span.t', 'Thesis checklist'), h('span.right', bar(items.length ? done / items.length * 100 : 0, 16))),
    h('div.list', items.map((it, i) => h(`div.item${it.done ? '.done' : ''}`, h('input', { type: 'checkbox', checked: it.done, onchange: (e) => { it.done = e.target.checked; it.done_at = it.done ? new Date().toISOString() : null; save(); } }), h('span.grow.title', it.title), it.done_at ? h('span.meta', fmtDate(it.done_at)) : null,
      h('button.btn.sm.ghost', { onclick: () => { if (i > 0) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; save(); } } }, '↑'), h('button.btn.sm.ghost', { onclick: () => { items.splice(i, 1); save(); } }, '✕')))),
    h('div.panel-b.row', add)));
}

async function literature(p, wrap) {
  const files = await api.library.list({ filter: { project_id: p.id }, sort: 'year', dir: 'DESC' });
  const cols = LIT_MATRIX_COLUMNS;
  const keys = ['', '', 'species', 'n', 'traits', 'model', 'result', 'notes'];
  const cite = (f) => `${f.authors || 'Anon.'} (${f.year || 'n.d.'}). ${f.name}.${f.journal ? ' ' + f.journal + '.' : ''}${f.doi ? ' https://doi.org/' + f.doi.replace(/^https?:\/\/doi.org\//, '') : ''}`;
  wrap.append(h('div.toolbar',
    h('button.btn.primary', { onclick: async () => { const lib = await import('./library.js'); await lib.importDialog({ project_id: p.id, doc_type: 'article' }); draw(); } }, '+ Add papers to project'),
    h('button.btn', { onclick: () => linkExisting(p) }, 'Link existing library files'),
    h('button.btn', { onclick: () => copyText(files.map(cite).join('\n'), 'citations') }, 'Copy reference list'),
    h('button.btn', { onclick: async () => { const csv = [cols.join(','), ...files.map((f) => [f.name, f.year || '', ...keys.slice(2).map((k) => ((f.review || {}).matrix || {})[k] || '')].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n'); const out = await api.system.saveFile({ kind: 'csv', defaultName: 'literature-matrix.csv', content: csv }); if (out) toast('Saved ' + out, 'ok'); } }, 'Export matrix (.csv)'),
    h('span.muted.small', 'Cells are editable — click, type, then leave the cell to save.')));
  if (!files.length) return wrap.append(empty('No papers linked to this project yet.'));
  wrap.append(h('div.panel.scroll', h('table.tbl', h('tr', cols.map((c) => h('th', c))), files.map((f) => {
    const mx = { ...((f.review || {}).matrix || {}) };
    const cell = (k) => h('td', { contenteditable: 'true', onblur: async (e) => { const v = e.target.textContent.trim(); if ((mx[k] || '') === v) return; mx[k] = v; await api.library.update(f.id, { review: { ...(f.review || {}), matrix: mx } }); } }, mx[k] || '');
    return h('tr', h('td', h('a', { onclick: () => window.__os.nav('library', { id: f.id }) }, f.name), f.authors ? h('div.dim.small', f.authors) : null), h('td', f.year || ''), keys.slice(2).map(cell));
  }))));
}
async function linkExisting(p) {
  const all = await api.library.list({ limit: 1000, sort: 'name', dir: 'ASC' });
  const chosen = new Set();
  const q = h('input', { placeholder: 'Filter…', style: { width: '100%', marginBottom: '6px' } });
  const listEl = h('div.list.scroll', { style: { maxHeight: '50vh' } });
  const drawList = () => { clear(listEl); all.filter((f) => !q.value || (f.name + f.authors).toLowerCase().includes(q.value.toLowerCase())).slice(0, 300).forEach((f) => listEl.append(h('label.item', h('input', { type: 'checkbox', checked: chosen.has(f.id) || f.project_id === p.id, onchange: (e) => (e.target.checked ? chosen.add(f.id) : chosen.delete(f.id)) }), h('span.grow', f.name), h('span.meta', f.year || '')))); };
  q.addEventListener('input', drawList); drawList();
  modal({ title: 'Link library files to project', size: 'wide', body: h('div', q, listEl), actions: [{ label: 'Cancel' }, { label: 'Link selected', primary: true, onClick: async (m) => { for (const id of chosen) await api.library.update(id, { project_id: p.id }); m.close(); draw(); } }] });
}

async function projectNotes(p, wrap) {
  const notes = await api.notes.list({ filter: { project_id: p.id } });
  wrap.append(h('div.toolbar', h('button.btn.primary', { onclick: async () => { const t = await promptBox('New project note', 'Title', 'Meeting with supervisor ' + fmtDate(new Date().toISOString())); if (t) { const n = await api.notes.create({ title: t, project_id: p.id, kind: 'note' }); window.__os.nav('notes', { id: n.id }); } } }, '+ Note'), h('button.btn', { onclick: () => window.__os.nav('notes', { tab: 'research_journal' }) }, 'Research journal')),
    notes.length ? h('div.panel', h('div.list', notes.map((n) => h('div.item.clickable', { onclick: () => window.__os.nav('notes', { id: n.id }) }, h('span.grow', n.title), h('span.meta', relTime(n.updated_at)))))) : empty('No notes linked to this project.'));
}

async function draw() {
  if (!root) return;
  let projects;
  try { projects = await api.research.list({ sort: 'updated_at' }); } catch (e) { return toastError(e); }
  if (!projects.length) {
    clear(root).append(h('div.empty', { style: { padding: '50px' } }, h('span.big', '◆'), h('h2', 'Research & thesis workspace'), h('p.muted', 'Create a project to get the full proposal structure (16 sections), timeline, checklist and literature matrix.'), h('button.btn.primary', { onclick: newProjectDialog }, '+ New project')));
    return;
  }
  if (!st.projectId || !projects.find((p) => p.id === st.projectId)) st.projectId = (projects.find((p) => p.active) || projects[0]).id;
  const p = await api.research.get(st.projectId);
  const wrap = h('div');
  clear(root).append(
    h('div.toolbar', projects.map((x) => h(`button.chip${x.id === st.projectId ? '.on' : ''}`, { onclick: async () => { if (st.editor) await st.editor.flush(); st.projectId = x.id; st.sectionId = null; draw(); } }, x.active ? '● ' : '', x.name)), h('span.right'), h('button.btn.primary', { onclick: newProjectDialog }, '+ New project')),
    subtabs([['overview', 'Overview'], ['proposal', 'Proposal editor'], ['timeline', 'Timeline'], ['checklist', 'Checklist'], ['literature', 'Literature matrix'], ['notes', 'Notes']], st.tab, async (t) => { if (st.editor) await st.editor.flush(); st.tab = t; draw(); }),
    wrap);
  st.editor = null;
  try { await ({ overview, proposal, timeline, checklist, literature, notes: projectNotes })[st.tab](p, wrap); } catch (e) { toastError(e); }
}

export default {
  id: 'research',
  async mount(el, params = {}) {
    root = el;
    if (params.id) st.projectId = params.id;
    if (params.tab) st.tab = params.tab;
    if (params.section) { st.sectionId = params.section; st.tab = 'proposal'; }
    await draw();
    off = bus.on('changed', (e) => { if (e === 'projects' && st.tab === 'overview') draw(); });
  },
  unmount() { if (st.editor) st.editor.flush(); st.editor = null; root = null; off && off(); },
};
