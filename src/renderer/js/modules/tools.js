// Tools — the Gene OS scientific toolbox.
//  • Tools home: search, favorites, recent runs, category cards, preferences, reset-all.
//  • Calculator page: inputs | results, formula & assumptions, history of saved runs,
//    Load example · Reset to defaults · Calculate & save · Copy · Export (CSV / Markdown / JSON / note).
//  • Workspaces (BLUP, pedigree, selection index, mating, selection decision, …) share the same header.
import { api } from '../api.js';
import { h, clear, debounce, fmtNum, fmtDate, relTime, toast, toastError, copyText, empty, modal, confirmBox, ibtn } from '../ui.js';
import { icon } from '../icons.js';
import { settings, bus } from '../state.js';
import { CATEGORIES, CALCULATORS, WORKSPACES, runCalculator, isVisible } from '../../../shared/genetics.mjs';
import * as S from '../../../shared/stats.mjs';
import * as P from '../../../shared/pedigree.mjs';
import { evaluate, FUNCTION_NAMES } from '../../../shared/expr.mjs';
import { GLOSSARY, FORMULAS, ANOVA_GUIDE, STATS_GUIDE } from '../../../shared/reference.mjs';
import { render } from '../../../shared/markdown.mjs';

const EXTRA = [
  { id: 'expr', cat: 'util', name: 'Scientific calculator', desc: 'Expressions with variables and functions' },
  { id: 'csv', cat: 'util', name: 'CSV viewer & data preview', desc: 'Open a data file and get column statistics' },
  { id: 'ref_glossary', cat: 'ref', name: 'Genetics glossary' },
  { id: 'ref_formulas', cat: 'ref', name: 'Formula reference' },
  { id: 'ref_anova', cat: 'ref', name: 'ANOVA reference guide' },
  { id: 'ref_stats', cat: 'ref', name: 'Statistical reference' },
];
const ALL = [...CALCULATORS, ...WORKSPACES, ...EXTRA];
const CATS = [...CATEGORIES, { id: 'ref', name: 'Reference', icon: 'book', color: '#A9B1D6', desc: 'Glossary, formulas, ANOVA and statistics guides' }];
const catOf = (t) => CATS.find((c) => c.id === t.cat) || CATS[0];
const isWorkspace = (t) => !CALCULATORS.includes(t);
const st = { id: null, q: '', cat: null, collapsed: new Set(), history: false, last: null, report: null };
let root = null;
const draftKey = (id) => `geneos.tool.${id}`;
const loadDraft = (id) => { try { return JSON.parse(localStorage.getItem(draftKey(id)) || 'null'); } catch { return null; } };
const saveDraft = (id, v) => localStorage.setItem(draftKey(id), JSON.stringify(v));
const digits = () => Number(settings.get('tools.digits') ?? 4);
const fmtR = (r) => (r.text !== undefined ? r.text : fmtNum(r.value, r.digits === 4 || r.digits === undefined ? digits() : r.digits));
const favs = () => new Set(settings.get('tools.favorites') || []);
async function toggleFav(id) { const f = favs(); f.has(id) ? f.delete(id) : f.add(id); await settings.set('tools.favorites', [...f]); }

function resultView(out) {
  const box = h('div');
  for (const r of out.results) {
    if (r.table) box.append(h('div.section-title', r.label), h('div.scroll', { style: { maxHeight: '46vh' } }, h('table.tbl', h('tr', r.table.columns.map((c) => h('th', c))), r.table.rows.map((row) => h('tr', row.map((c) => h(typeof c === 'number' ? 'td.num' : 'td', typeof c === 'number' ? fmtNum(c, digits()) : String(c))))))));
    else if (r.text !== undefined && String(r.text).includes('\n')) box.append(h('div.section-title', r.label, h('button.btn.sm.ghost.right', { onclick: () => copyText(r.text, 'result') }, icon('copy', 12))), h('pre.formula', { style: { maxHeight: '240px', overflow: 'auto', color: 'var(--text)' } }, r.text));
    else box.append(h('div.result', h('span', r.label), h('span.v', fmtR(r), r.unit ? h('span.u', r.unit) : null)));
  }
  for (const w of out.warnings || []) box.append(h('div.warn.small', { style: { marginTop: '6px' } }, '⚠ ' + w));
  return box;
}

// ── report model + exporters ─────────────────────────────────────────────────
function scrape(container) {
  const results = [];
  for (const el of container.querySelectorAll('.result')) { const sp = el.querySelectorAll('span'); results.push({ label: (sp[0] && sp[0].textContent) || '', text: (el.querySelector('.v') || {}).textContent || '' }); }
  for (const t of container.querySelectorAll('table.tbl')) {
    const rows = [...t.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent));
    if (!rows.length) continue;
    let title = 'Table', prev = t.parentNode && t.parentNode.previousSibling; if (t.parentNode && t.parentNode.classList && !t.parentNode.classList.contains('scroll')) prev = t.previousSibling;
    if (prev && prev.classList && prev.classList.contains('section-title')) title = prev.textContent;
    results.push({ label: title, table: { columns: rows[0], rows: rows.slice(1) } });
  }
  return results;
}
function makeReport(tool, inputs, results, warnings = []) {
  return { tool: tool.id, name: tool.name, category: catOf(tool).name, date: new Date().toISOString(), inputs, results, warnings, formula: tool.formula || '', assumptions: tool.assumptions || '' };
}
function toMarkdown(r) {
  const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  const L = [`# ${r.name}`, '', `_${r.category} · Gene OS · ${fmtDate(r.date, true)}_`, ''];
  if (r.inputs.length) { L.push('## Inputs', '', '| Input | Value |', '|---|---|', ...r.inputs.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`), ''); }
  const scal = r.results.filter((x) => !x.table);
  if (scal.length) { L.push('## Results', '', '| Result | Value |', '|---|---|', ...scal.map((x) => `| ${cell(x.label)} | ${cell((x.text ?? fmtNum(x.value, digits())) + (x.unit ? ' ' + x.unit : ''))} |`), ''); }
  for (const t of r.results.filter((x) => x.table)) L.push(`### ${t.label}`, '', `| ${t.table.columns.map(cell).join(' | ')} |`, `|${t.table.columns.map(() => '---').join('|')}|`, ...t.table.rows.map((row) => `| ${row.map((c) => cell(typeof c === 'number' ? fmtNum(c, digits()) : c)).join(' | ')} |`), '');
  if (r.warnings.length) L.push('## Notes', '', ...r.warnings.map((w) => `- ${w}`), '');
  if (r.formula) L.push('## Formula', '', '```', r.formula, '```', '');
  if (r.assumptions) L.push(`_Assumptions:_ ${r.assumptions}`, '');
  return L.join('\n');
}
function toCSV(r) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const L = [['section', 'label', 'value', 'unit'].join(',')];
  for (const [k, v] of r.inputs) L.push(['input', k, v, ''].map(q).join(','));
  for (const x of r.results.filter((y) => !y.table)) L.push(['result', x.label, x.text ?? x.value, x.unit || ''].map(q).join(','));
  for (const t of r.results.filter((y) => y.table)) { L.push('', q(t.label), t.table.columns.map(q).join(',')); for (const row of t.table.rows) L.push(row.map(q).join(',')); }
  return L.join('\n');
}
const slugName = (r) => `${r.tool}-${fmtDate(r.date)}`;
async function doExport(r, fmt) {
  if (!r) return toast('Nothing to export yet — calculate first', 'warn');
  try {
    if (fmt === 'copy') return copyText(toMarkdown(r), 'tool');
    if (fmt === 'note') {
      const active = await api.research.active().catch(() => null);
      const n = await api.notes.create({ title: `${r.name} — ${fmtDate(r.date, true)}`, content: toMarkdown(r), tags: ['tool', r.tool], project_id: active ? active.id : null });
      bus.emit('changed', 'notes');
      return toast(`Saved to Notes${active ? ' (linked to ' + active.name + ')' : ''} — “${n.title}”`, 'ok', 4000);
    }
    const content = fmt === 'csv' ? toCSV(r) : fmt === 'md' ? toMarkdown(r) : JSON.stringify(r, null, 2);
    const f = await api.system.saveFile({ kind: fmt === 'csv' ? 'csv' : fmt === 'md' ? 'md' : 'json', defaultName: `${slugName(r)}.${fmt}`, content });
    if (f) toast(`Exported → ${f}`, 'ok', 4000);
  } catch (e) { toastError(e); }
}
function exportMenu(getReport) {
  const wrap = h('div.drop');
  const menu = h('div.drop-menu', { hidden: true },
    [['csv', 'export', 'CSV (.csv)'], ['md', 'file', 'Markdown (.md)'], ['json', 'file', 'JSON (.json)'], ['copy', 'copy', 'Copy as Markdown'], ['note', 'notes', 'Save to Notes']].map(([f, ic, l]) => h('button', { onclick: () => { menu.hidden = true; doExport(getReport(), f); } }, icon(ic, 13), l)));
  const btn = ibtn('export', 'Export', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; }, 'sm');
  document.addEventListener('mousedown', (e) => { if (!wrap.contains(e.target)) menu.hidden = true; });
  wrap.append(btn, menu);
  return wrap;
}

// ── shared tool header ────────────────────────────────────────────────────────
function toolHeader(t, { onExample, onReset, onSave, getReport }) {
  const c = catOf(t);
  const fav = favs().has(t.id);
  return h('div.tool-head', { style: { '--cc': c.color } },
    h('span', { style: { color: c.color } }, icon(c.icon || 'tools', 18)),
    h('h2', t.name), h('span.cat-chip', c.name),
    h(`button.star-btn${fav ? '.on' : ''}`, { title: fav ? 'Remove from favorites' : 'Add to favorites', onclick: async () => { await toggleFav(t.id); draw(); } }, fav ? '★' : '☆'),
    h('div.acts',
      onExample ? ibtn('sparkle', 'Load example', onExample, 'sm') : null,
      ibtn('refresh', 'Reset to defaults', onReset, 'sm', { title: 'Clear all inputs back to their defaults' }),
      onSave ? ibtn('save', 'Calculate & save', onSave, 'sm.primary', { title: 'Calculate and store this run in the history' }) : null,
      ibtn('copy', 'Copy', () => doExport(getReport(), 'copy'), 'sm'),
      exportMenu(getReport),
      ibtn('history', 'History', () => { st.history = !st.history; draw(); }, `sm${st.history ? '.on' : ''}`)));
}

async function historyPanel(t, onRestore) {
  const runs = await api.tools.runs(t.id, 30).catch(() => []);
  const list = h('div', runs.length ? runs.map((r) => h('div.run-row', { onclick: () => onRestore(r), title: 'Restore these inputs' },
    h('span', r.pinned ? h('span.warn', '📌 ') : null, r.title || fmtDate(r.created_at, true)), h('span.row', { style: { gap: '2px' } },
      h('span.dim.small', relTime(r.created_at)),
      h('button.btn.sm.ghost', { title: r.pinned ? 'Unpin' : 'Pin', onclick: async (e) => { e.stopPropagation(); await api.tools.pinRun(r.id, !r.pinned); draw(); } }, icon('pin', 11)),
      h('button.btn.sm.ghost', { title: 'Delete', onclick: async (e) => { e.stopPropagation(); await api.tools.removeRun(r.id); draw(); } }, icon('x', 11))),
    h('span.s', r.summary))) : h('div.muted.small', { style: { padding: '10px' } }, 'No saved runs yet. Use “Calculate & save”.'));
  return h('div.panel', h('div.panel-h', icon('history', 14, 'ph'), h('span.t.noglyph', `History (${runs.length})`), h('span.right.row',
    runs.length ? h('button.btn.sm', { onclick: async () => { const f = await api.system.saveFile({ kind: 'csv', defaultName: `${t.id}-history.csv`, content: await api.tools.exportRuns(t.id) }); if (f) toast('Saved ' + f, 'ok'); } }, 'CSV') : null,
    runs.length ? h('button.btn.sm.danger', { onclick: async () => { if (await confirmBox(`Clear the history of ${t.name}? Pinned runs are removed too.`, { danger: true })) { await api.tools.clearRuns(t.id); draw(); } } }, 'Clear') : null)),
  h('div.panel-b.flush.scroll', { style: { maxHeight: '38vh' } }, list));
}

// ── calculator page ───────────────────────────────────────────────────────────
const defaultsOf = (calc) => { const v = {}; for (const i of calc.inputs) if (i.type === 'select') v[i.k] = i.options[0][0]; return v; };
function calculator(calc, wrap) {
  const values = { ...defaultsOf(calc), ...(loadDraft(calc.id) || {}) };
  const auto = settings.get('tools.autoCalc') !== false;
  const form = h('div.form'); const resBox = h('div'); const errBox = h('div.err.small');
  const inputsList = () => calc.inputs.filter((i) => isVisible(i, values) && String(values[i.k] ?? '').trim() !== '').map((i) => [i.label + (i.unit ? ` [${i.unit}]` : ''), i.type === 'select' ? (i.options.find((o) => o[0] === values[i.k]) || [, values[i.k]])[1] : values[i.k]]);
  const compute = async (save = false) => {
    saveDraft(calc.id, values);
    clear(errBox); clear(resBox);
    const filled = calc.inputs.some((i) => i.type !== 'select' && String(values[i.k] ?? '').trim() !== '');
    if (!filled) { st.last = null; resBox.append(h('div.muted.small', 'Enter values, or press “Load example”.')); return; }
    try {
      const out = runCalculator(calc.id, values);
      st.last = makeReport(calc, inputsList(), out.results, out.warnings);
      resBox.append(resultView(out));
      if (save) {
        const summary = out.results.filter((r) => !r.table).slice(0, 4).map((r) => `${r.label} = ${fmtR(r)}${r.unit ? ' ' + r.unit : ''}`).join(' · ');
        await api.tools.saveRun(calc.id, { ...values }, summary, '');
        toast('Saved to history', 'ok', 1200);
        if (st.history) draw();
      }
    } catch (e) { st.last = null; errBox.textContent = e.message; if (save) toast(e.message, 'error'); }
  };
  const later = debounce(() => compute(false), 250);
  const onEdit = () => { if (auto) later(); else saveDraft(calc.id, values); };
  const buildInputs = () => {
    clear(form);
    for (const inp of calc.inputs) {
      if (!isVisible(inp, values)) continue;
      let el;
      if (inp.type === 'select') el = h('select', { onchange: (e) => { values[inp.k] = e.target.value; buildInputs(); onEdit(); } }, inp.options.map(([v, l]) => h('option', { value: v, selected: values[inp.k] === v }, l)));
      else if (inp.type === 'list' || inp.type === 'text') { el = h('textarea', { rows: inp.rows || 3, placeholder: inp.type === 'list' ? 'e.g. 12.1 13.4 11.8 …  (space, comma or new line)' : '', oninput: (e) => { values[inp.k] = e.target.value; onEdit(); } }); el.value = values[inp.k] ?? ''; }
      else el = h('input', { value: values[inp.k] ?? '', inputmode: 'decimal', placeholder: inp.optional ? 'optional' : inp.def !== undefined ? String(inp.def) : '', oninput: (e) => { values[inp.k] = e.target.value; onEdit(); } });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || el.tagName === 'INPUT')) { e.preventDefault(); compute(true); } });
      form.append(h('label', inp.label, inp.unit ? h('span.dim', ` [${inp.unit}]`) : null), el);
    }
  };
  const resetTo = (obj) => { for (const k of Object.keys(values)) delete values[k]; Object.assign(values, defaultsOf(calc), obj); buildInputs(); compute(false); };
  buildInputs();
  const restore = (run) => { resetTo(run.inputs || {}); toast('Inputs restored', 'info', 1000); };
  const left = h('div.col',
    h('div.panel', h('div.panel-h', icon('edit', 14, 'ph'), h('span.t.noglyph', 'Inputs'), h('span.right.dim.small', auto ? 'live · Enter = save' : 'Enter = calculate & save')), h('div.panel-b.col', form, errBox,
      h('div.row.wrap', auto ? null : ibtn('play', 'Calculate', () => compute(false), 'primary'), ibtn('terminal', 'Copy as command', () => copyText(`tool ${calc.id} ` + calc.inputs.filter((i) => isVisible(i, values) && values[i.k] !== undefined && values[i.k] !== '').map((i) => `${i.k}=${/\s/.test(String(values[i.k])) ? JSON.stringify(String(values[i.k])) : values[i.k]}`).join(' '), 'command'), 'sm.ghost')))),
    h('div.panel', h('div.panel-h', icon('sigma', 14, 'ph'), h('span.t.noglyph', 'Formula & assumptions')), h('div.panel-b.col', h('div.formula', calc.formula), h('div.muted.small', calc.assumptions || ''), h('div.dim.small', 'Example: ' + Object.entries(calc.example).filter(([, v]) => v !== '').map(([k, v]) => `${k} = ${String(v).replace(/\n/g, ' / ')}`).join(', ')))));
  const right = h('div.col', h('div.panel', h('div.panel-h', icon('chart', 14, 'ph'), h('span.t.noglyph', 'Results')), h('div.panel-b', resBox)));
  wrap.append(
    toolHeader(calc, { onExample: () => resetTo(Object.fromEntries(Object.entries(calc.example).map(([k, v]) => [k, String(v)]))), onReset: () => resetTo({}), onSave: () => compute(true), getReport: () => st.last }),
    h('div.grid.g2', left, right));
  if (st.history) historyPanel(calc, restore).then((p) => right.append(p));
  compute(false);
}

function workspacePage(t, wrap) {
  const body = h('div');
  const report = () => makeReport(t, Object.entries(loadDraft(t.id) || {}).map(([k, v]) => [k, v]), scrape(body));
  wrap.append(toolHeader(t, {
    onReset: () => { localStorage.removeItem(draftKey(t.id)); draw(); toast('Workspace reset to defaults', 'info', 1200); },
    onSave: !t.id.startsWith('ref_') && t.id !== 'csv' && t.id !== 'expr' ? async () => { const r = report(); const sum = r.results.filter((x) => !x.table).slice(0, 4).map((x) => `${x.label} = ${x.text}`).join(' · ') || `${r.results.filter((x) => x.table).length} table(s)`; await api.tools.saveRun(t.id, loadDraft(t.id) || {}, sum, ''); toast('Saved to history', 'ok', 1200); if (st.history) draw(); } : null,
    getReport: report,
  }), body);
  WS[t.id](body);
  if (st.history && !t.id.startsWith('ref_')) historyPanel(t, (run) => { saveDraft(t.id, run.inputs || {}); draw(); }).then((p) => { p.style.marginTop = '10px'; wrap.append(p); });
}

// ── tools home ────────────────────────────────────────────────────────────────
function toolCard(t) {
  const c = catOf(t);
  return h('div.tcard', { style: { '--cc': c.color }, onclick: () => { st.id = t.id; draw(); } },
    h('div.tc-h', h('span.tc-i', icon(c.icon || 'tools', 16)), h('div', h('b', t.name), h('div.tc-l', `${c.name}${isWorkspace(t) ? ' · workspace' : ''}`)), favs().has(t.id) ? h('span.warn.right', '★') : null),
    t.formula ? h('div.tc-d.ellipsis', t.formula) : t.desc ? h('div.tc-d', t.desc) : null);
}
async function home(wrap) {
  const q = st.q.toLowerCase();
  if (q) {
    const hits = ALL.filter((t) => (t.name + ' ' + (t.formula || '') + ' ' + catOf(t).name + ' ' + t.id).toLowerCase().includes(q));
    wrap.append(h('div.section-title', icon('search', 13), `${hits.length} tool(s) matching “${st.q}”`), hits.length ? h('div.tcards', hits.map(toolCard)) : empty('No tools match.'));
    return;
  }
  if (st.cat) {
    const c = CATS.find((x) => x.id === st.cat);
    wrap.append(h('div.toolbar', ibtn('back', 'All categories', () => { st.cat = null; draw(); }, 'sm.ghost'), h('b', { style: { color: c.color } }, c.name), h('span.muted.small', c.desc || '')), h('div.tcards', ALL.filter((t) => t.cat === c.id).map(toolCard)));
    return;
  }
  const [recent, usage] = await Promise.all([api.tools.recent(8).catch(() => []), api.tools.usage().catch(() => [])]);
  const f = ALL.filter((t) => favs().has(t.id));
  const most = usage.map((u) => ALL.find((t) => t.id === u.tool_id)).filter(Boolean).slice(0, 4);
  wrap.append(
    h('div.kpis', [['calc', 'Calculators', CALCULATORS.length, '#4FD6BE'], ['layers', 'Workspaces', WORKSPACES.length, '#98C379'], ['star', 'Favorites', f.length, '#E5B567'], ['history', 'Saved runs', usage.reduce((a, u) => a + u.n, 0), '#7AA2F7']].map(([ic, l, v, col]) => h('div.kpi', { style: { '--kc': col } }, h('span.ki', icon(ic, 17)), h('div', h('div.kv2', String(v)), h('div.kl', l))))),
    f.length ? [h('div.section-title', icon('star', 13), 'Favorites'), h('div.tcards', f.map(toolCard))] : null,
    !f.length && most.length ? [h('div.section-title', icon('flame', 13), 'Most used'), h('div.tcards', most.map(toolCard))] : null,
    recent.length ? [h('div.section-title', icon('history', 13), 'Recent runs'), h('div.panel', h('div.panel-b.flush', recent.map((r) => { const t = ALL.find((x) => x.id === r.tool_id); return t ? h('div.run-row', { onclick: () => { saveDraft(t.id, isWorkspace(t) ? r.inputs : { ...defaultsOf(t), ...r.inputs }); st.id = t.id; draw(); } }, h('span', h('b', t.name)), h('span.dim.small', relTime(r.created_at)), h('span.s', r.summary)) : null; })))] : null,
    h('div.section-title', icon('layers', 13), 'Categories'),
    h('div.tcards', CATS.map((c) => { const n = ALL.filter((t) => t.cat === c.id).length; return h('div.tcard', { style: { '--cc': c.color }, onclick: () => { st.cat = c.id; draw(); } }, h('div.tc-h', h('span.tc-i', icon(c.icon || 'tools', 17)), h('div', h('b', c.name), h('div.tc-l', `${n} tools`))), h('div.tc-d', c.desc || '')); })),
    h('div.section-title', icon('settings', 13), 'Preferences'),
    h('div.panel', h('div.panel-b.opt-row',
      h('label.row', 'Decimal places', h('select', { onchange: async (e) => { await settings.set('tools.digits', Number(e.target.value)); } }, [2, 3, 4, 5, 6, 8].map((d) => h('option', { value: d, selected: digits() === d }, d)))),
      h('label.row', h('input', { type: 'checkbox', checked: settings.get('tools.autoCalc') !== false, onchange: (e) => settings.set('tools.autoCalc', e.target.checked) }), 'Calculate while typing'),
      h('span.right'),
      ibtn('export', 'Export all history', async () => { const fpath = await api.system.saveFile({ kind: 'csv', defaultName: 'gene-os-tool-history.csv', content: await api.tools.exportRuns() }); if (fpath) toast('Saved ' + fpath, 'ok'); }, 'sm'),
      ibtn('refresh', 'Reset all tools to defaults', resetAll, 'sm.danger'))));
}
async function resetAll() {
  if (!(await confirmBox('Reset all tools? This clears every saved input (drafts), favorites and tool preferences. Saved runs in the history are kept unless you also clear them below.', { danger: true, okLabel: 'Reset tools', force: true }))) return;
  for (const k of Object.keys(localStorage)) if (k.startsWith('geneos.tool.')) localStorage.removeItem(k);
  await api.settings.resetPrefix('tools.');
  await settings.load();
  if (await confirmBox('Also delete the history of saved runs?', { danger: true, okLabel: 'Delete history', force: true })) await api.tools.clearRuns();
  st.id = null; st.cat = null; toast('Tools reset to defaults', 'ok'); draw();
}

function nav2() {
  const listEl = h('div.list');
  const f = favs();
  const item = (t) => h(`div.item.clickable${t.id === st.id ? '.sel' : ''}`, { onclick: () => { st.id = t.id; draw(); } }, h('span.grow.ellipsis', t.name), f.has(t.id) ? h('span.fv', '★') : null, isWorkspace(t) && t.cat !== 'ref' && t.cat !== 'util' ? h('span.dim.small', 'WS') : null);
  listEl.append(h(`div.item.clickable${!st.id ? '.sel' : ''}`, { style: { paddingLeft: '10px' }, onclick: () => { st.id = null; st.cat = null; draw(); } }, icon('home', 13), h('span', 'Tools home')));
  if (f.size) { listEl.append(h('div.cat', { style: { '--cc': '#E5B567' } }, icon('star', 12), 'Favorites')); ALL.filter((t) => f.has(t.id)).forEach((t) => listEl.append(item(t))); }
  for (const c of CATS) {
    const items = ALL.filter((t) => t.cat === c.id && (!st.q || t.name.toLowerCase().includes(st.q.toLowerCase())));
    if (!items.length) continue;
    const collapsed = st.collapsed.has(c.id) && !st.q && !items.some((t) => t.id === st.id);
    listEl.append(h('div.cat', { style: { '--cc': c.color }, onclick: () => { st.collapsed.has(c.id) ? st.collapsed.delete(c.id) : st.collapsed.add(c.id); draw(); } }, icon(c.icon || 'tools', 12), c.name, h('span.n', `${collapsed ? '▸' : '▾'} ${items.length}`)));
    if (!collapsed) items.forEach((t) => listEl.append(item(t)));
  }
  const q = h('input', { placeholder: `Search ${ALL.length} tools…`, value: st.q, style: { width: '100%' }, oninput: debounce((e) => { st.q = e.target.value; if (st.q) st.id = null; draw(); q.focus(); }, 160) });
  return { el: h('div.tnav', q, listEl), q };
}

function draw() {
  if (!root) return;
  const wrap = h('div', { style: { minWidth: 0 } });
  const n = nav2();
  clear(root).append(h('div.tools-wrap', n.el, wrap));
  if (st.q) setTimeout(() => { n.q.focus(); n.q.setSelectionRange(n.q.value.length, n.q.value.length); }, 0);
  const t = ALL.find((x) => x.id === st.id);
  st.last = null;
  try {
    if (!t) home(wrap).catch(toastError);
    else if (CALCULATORS.includes(t)) calculator(t, wrap);
    else if (WS[t.id]) workspacePage(t, wrap);
    else wrap.append(empty('Select a tool'));
  } catch (e) { toastError(e); }
}

// ---------- workspaces ----------
const EX_PED = 'id,sire,dam\n1,0,0\n2,0,0\n3,0,0\n4,1,0\n5,3,2\n6,1,2\n7,4,5\n8,3,6';
const EX_REC = 'id,group,y\n4,M,4.5\n5,F,2.9\n6,F,3.9\n7,M,3.5\n8,M,5.0';
function area(key, value, rows = 8, ph = '') { const t = h('textarea', { rows, placeholder: ph, style: { width: '100%' } }); t.value = value; t.dataset.k = key; return t; }
function csvDownload(name, rows) { const content = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); return api.system.saveFile({ kind: 'csv', defaultName: name, content }).then((f) => f && toast('Saved ' + f, 'ok')); }

function wsSelectionIndex(wrap) {
  const d = loadDraft('selection_index') || { names: 'WW, YW', P: '400 300\n300 900', G: '100 80\n80 300', a: '1 0.5', i: '1.4' };
  const names = h('input', { value: d.names, style: { width: '100%' } }), Pm = area('P', d.P, 4), Gm = area('G', d.G, 4), a = h('input', { value: d.a }), inten = h('input', { value: d.i });
  const out = h('div');
  const run = () => {
    clear(out);
    try {
      const v = { names: names.value, P: Pm.value, G: Gm.value, a: a.value, i: inten.value }; saveDraft('selection_index', v);
      const Pmat = S.parseMatrix(v.P), Gmat = S.parseMatrix(v.G), w = S.parseNumbers(v.a).values, i = S.parseNumber(v.i);
      const n = Pmat.length; const nm = v.names.split(',').map((s) => s.trim()).filter(Boolean);
      if (Pmat[0].length !== n || Gmat.length !== n || Gmat[0].length !== n || w.length !== n) throw new Error(`P and G must be ${n}×${n} and a must have ${n} weights`);
      const b = S.matVec(S.matInverse(Pmat), S.matVec(Gmat, w));
      const varI = S.dot(b, S.matVec(Pmat, b)), varH = S.dot(w, S.matVec(Gmat, w));
      if (!(varI > 0) || !(varH > 0)) throw new Error('Index or aggregate genotype variance is not positive — check matrices');
      const sI = Math.sqrt(varI), sH = Math.sqrt(varH), Gb = S.matVec(Gmat, b);
      out.append(h('div.section-title', 'Index weights b = P⁻¹Ga'), h('table.tbl', h('tr', h('th', 'Trait'), h('th.num', 'b'), h('th.num', 'Response ΔG = i·(Gb)ⱼ/σI'), h('th.num', 'Economic value of response')), b.map((bj, j) => h('tr', h('td', nm[j] || `T${j + 1}`), h('td.num', fmtNum(bj, 5)), h('td.num', fmtNum((i * Gb[j]) / sI, 4)), h('td.num', fmtNum((i * Gb[j] * w[j]) / sI, 4))))),
        resultView({ results: [{ label: 'σI', value: sI }, { label: 'σH (aggregate genotype)', value: sH }, { label: 'Accuracy r_IH = σI/σH', value: sI / sH }, { label: 'ΔH = i·σI (economic gain per generation)', value: i * sI }] }));
    } catch (e) { out.append(h('div.err', e.message)); }
  };
  wrap.append(h('div.grid.g2', h('div.panel', h('div.panel-h', h('span.t', 'Selection index (Hazel 1943)')), h('div.panel-b.col', h('label.muted.small', 'Trait names (comma separated)'), names, h('label.muted.small', 'P — phenotypic (co)variance matrix of index traits'), Pm, h('label.muted.small', 'G — genetic (co)variance matrix (index traits × breeding-goal traits)'), Gm, h('div.row', h('span.muted.small', 'Economic weights a'), a, h('span.muted.small', 'Intensity i'), inten), h('div.row', h('button.btn.primary', { onclick: run }, 'Compute index'), h('button.btn', { onclick: () => { localStorage.removeItem(draftKey('selection_index')); draw(); } }, 'Example')))),
    h('div.col', h('div.panel', h('div.panel-h', h('span.t', 'Results')), h('div.panel-b', out)), h('div.panel', h('div.panel-b.formula', 'b = P⁻¹ G a\nσ²I = b′Pb      σ²H = a′Ga\nr_IH = σI / σH   ΔH = i σI\nΔGⱼ = i (G b)ⱼ / σI')))));
  run();
}

// Seeded demo data for REML: founders + 4 generations, Mendelian sampling, 4 contemporary groups.
function simulateBlupData(seed = 2026, va = 40, ve = 60) {
  const rand = S.rng(seed); const norm = () => { let u = 0, v = 0; while (u === 0) u = rand(); v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const ped = [], bv = new Map(), recs = [];
  for (let i = 0; i < 20; i++) { const id = `F${i}`; ped.push(`${id},0,0`); bv.set(id, norm() * Math.sqrt(va)); }
  let sires = [...Array(8).keys()].map((i) => `F${i}`), dams = [...Array(12).keys()].map((i) => `F${i + 8}`);
  const mu = { H1: 100, H2: 110, H3: 95, H4: 105 };
  for (let g = 0; g < 4; g++) {
    const cur = [];
    for (let k = 0; k < 40; k++) {
      const s2 = sires[Math.floor(rand() * sires.length)], d2 = dams[Math.floor(rand() * dams.length)], id = `G${g + 1}_${k + 1}`;
      ped.push(`${id},${s2},${d2}`); const a = 0.5 * (bv.get(s2) + bv.get(d2)) + norm() * Math.sqrt(va / 2); bv.set(id, a); cur.push(id);
      const grp = `H${1 + Math.floor(rand() * 4)}`; recs.push(`${id},${grp},${(mu[grp] + a + norm() * Math.sqrt(ve)).toFixed(2)}`);
    }
    sires = cur.slice(0, 12); dams = cur.slice(12);
  }
  return { ped: 'id,sire,dam\n' + ped.join('\n'), rec: 'id,group,y\n' + recs.join('\n') };
}
function remlCurve(curve, best) {
  const pts = curve.filter((c) => Number.isFinite(c.m2logL));
  const ll = pts.map((c) => -0.5 * (c.m2logL - best.m2logL)); // log-likelihood relative to the maximum
  const lo = Math.max(-12, Math.min(...ll)); const W = 420, H = 120, X = (h2) => 30 + h2 * (W - 40), Y = (v) => 8 + ((0 - v) / (0 - lo || 1)) * (H - 24);
  const d = pts.map((c, i) => `${i ? 'L' : 'M'}${X(c.h2).toFixed(1)},${Y(Math.max(lo, ll[i])).toFixed(1)}`).join(' ');
  const el = document.createElement('div');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block">
    <line x1="30" y1="${H - 16}" x2="${W - 10}" y2="${H - 16}" stroke="var(--border2)"/><line x1="30" y1="8" x2="30" y2="${H - 16}" stroke="var(--border2)"/>
    ${[0, 0.25, 0.5, 0.75, 1].map((t) => `<text x="${X(t)}" y="${H - 3}" fill="var(--dim)" font-size="9" text-anchor="middle">${t}</text>`).join('')}
    <line x1="30" y1="${Y(-1.92)}" x2="${W - 10}" y2="${Y(-1.92)}" stroke="var(--warn)" stroke-dasharray="3 3" opacity=".6"/><text x="${W - 12}" y="${Y(-1.92) - 3}" fill="var(--warn)" font-size="9" text-anchor="end">95% (ΔlogL = −1.92)</text>
    <path d="${d}" fill="none" stroke="var(--mod)" stroke-width="1.8"/>
    <circle cx="${X(best.h2)}" cy="${Y(0)}" r="3.5" fill="var(--mod)"/><text x="${X(best.h2)}" y="${Y(0) + 14}" fill="var(--text)" font-size="10" text-anchor="middle">ĥ² = ${best.h2.toFixed(3)}</text>
    <text x="34" y="16" fill="var(--dim)" font-size="9">profile log L (relative)</text></svg>`;
  return el;
}
function wsBlup(wrap) {
  const d = loadDraft('blup') || { ped: EX_PED, rec: EX_REC, h2: '0.3333', method: 'profile' };
  const ped = area('ped', d.ped, 9, 'id,sire,dam (0 = unknown)'), rec = area('rec', d.rec, 7, 'id,group,value'), h2 = h('input', { value: d.h2, style: { width: '90px' } });
  const method = h('select', { title: 'REML algorithm' }, [['profile', 'REML · profile likelihood (fast)'], ['em', 'REML · EM algorithm (Mrode ch. 11)']].map(([v, l]) => h('option', { value: v, selected: (d.method || 'profile') === v }, l)));
  const out = h('div'); const remlBox = h('div'); let last = null; let sortKey = 'ebv'; let simulated = false;
  for (const t of [ped, rec]) t.addEventListener('input', () => { simulated = false; });
  const save = () => saveDraft('blup', { ped: ped.value, rec: rec.value, h2: h2.value, method: method.value });
  const draw2 = () => {
    clear(out); if (!last) return;
    const rows = [...last.animals].sort((x, y) => (sortKey === 'id' ? String(x.id).localeCompare(String(y.id), undefined, { numeric: true }) : y[sortKey] - x[sortKey]));
    const th = (k, l) => h('th.num.sortable', { onclick: () => { sortKey = k; draw2(); } }, l, sortKey === k ? ' ▾' : '');
    out.append(h('div.row.wrap', h('span.muted.small', `${last.animals.length} animals · ${last.fixed.length} fixed-effect levels · h² = ${fmtNum(1 / (1 + last.lambda), 4)} · λ = σ²e/σ²a = ${fmtNum(last.lambda, 4)}`), h('span.right'), h('button.btn.sm', { onclick: () => csvDownload('ebv.csv', [['id', 'sire', 'dam', 'records', 'EBV', 'reliability', 'accuracy', 'F'], ...last.animals.map((a) => [a.id, a.sire || 0, a.dam || 0, a.records, a.ebv, a.reliability, a.accuracy, a.F])]) }, 'Export CSV'), h('button.btn.sm', { onclick: () => { saveDraft('selection_decision', { data: last.animals.map((a) => `${a.id},${a.ebv.toFixed(5)},${a.accuracy.toFixed(3)}`).join('\n'), mode: 'p', p: '0.2' }); window.__os.nav('tools', { id: 'selection_decision' }); } }, 'Send EBVs to selection workspace')),
      h('div.section-title', 'Fixed effects (BLUE)'), h('table.tbl', h('tr', h('th', 'Level'), h('th.num', 'Solution')), last.fixed.map((f) => h('tr', h('td', f.group), h('td.num', fmtNum(f.solution, 4))))),
      last.missing.length ? h('div.warn.small', `Records for animals not in the pedigree were ignored: ${last.missing.join(', ')}`) : null,
      h('div.section-title', 'Breeding values (BLUP)'), h('div.scroll', { style: { maxHeight: '45vh' } }, h('table.tbl', h('tr', h('th.sortable', { onclick: () => { sortKey = 'id'; draw2(); } }, 'Animal'), h('th', 'Sire'), h('th', 'Dam'), th('records', 'Rec'), th('ebv', 'EBV'), th('reliability', 'Rel'), th('accuracy', 'Acc'), th('F', 'F')), rows.map((a) => h('tr', h('td', a.id), h('td.dim', a.sire || '0'), h('td.dim', a.dam || '0'), h('td.num', a.records), h('td.num.accent', fmtNum(a.ebv, 4)), h('td.num', fmtNum(a.reliability, 3)), h('td.num', fmtNum(a.accuracy, 3)), h('td.num', fmtNum(a.F, 4)))))));
  };
  const run = () => {
    save();
    clear(out); out.append(h('div.muted', 'Solving mixed-model equations…'));
    setTimeout(() => {
      try {
        const pd = P.parsePedigree(ped.value); const rr = P.parseRecords(rec.value);
        if (!rr.recs.length) throw new Error('No valid records');
        const t0 = performance.now(); last = P.animalModelBlup(pd.animals, rr.recs, S.parseNumber(h2.value)); last.ms = performance.now() - t0;
        draw2(); [...pd.warnings, ...rr.warnings].forEach((w) => out.prepend(h('div.warn.small', '⚠ ' + w)));
        out.prepend(h('div.dim.small', `solved in ${Math.round(last.ms)} ms`));
      } catch (e) { clear(out); out.append(h('div.err', e.message)); }
    }, 20);
  };
  let stopEM = false;
  const showReml = (r, ms, isEM) => {
    const se = r.se || null;
    const fmtSE = (v, k) => `${fmtNum(v, 4)}${se && se[k] !== undefined ? ` ± ${fmtNum(se[k], 4)}` : ''}`;
    clear(remlBox).append(
      resultView({ results: [
        { label: 'σ²a (additive genetic)', text: fmtSE(r.va, 'va') }, { label: 'σ²e (residual)', text: fmtSE(r.ve, 've') }, { label: 'σ²p', value: r.vp },
        { label: 'h²', text: fmtSE(r.h2, 'h2') }, { label: 'log L (REML, up to a constant)', value: r.logL },
        { label: 'Records / animals / fixed levels', text: `${r.N} / ${r.q} / ${r.rX}` },
        { label: isEM ? 'EM iterations' : 'Likelihood evaluations', text: `${isEM ? r.iterations + (r.converged ? ' (converged)' : r.stopped ? ' (stopped)' : ' (not converged)') : r.evaluations} · ${ms} ms` },
      ], warnings: [
        ...(simulated ? [`Simulated data: true σ²a = 40, σ²e = 60 (h² = 0.40). The estimate differs from the truth by sampling error — with ${r.N} records the SE of h² is about ${se ? fmtNum(se.h2, 2) : '0.15'}.`] : []),
        ...(r.boundary ? ['The estimate is at the boundary of the parameter space (h² ≈ 0 or 1): the data contain too little information about the genetic variance.'] : []),
        ...(isEM && !r.converged ? ['EM stopped before converging — EM converges slowly; the profile method reaches the same maximum much faster.'] : []),
        ...(se ? [] : !isEM ? ['Standard errors could not be computed (likelihood surface is flat at the estimate).'] : ['Standard errors are reported by the profile method.']),
      ] }),
      r.curve ? h('div', h('div.section-title', 'Profile likelihood of h²'), remlCurve(r.curve, r)) : null,
      h('div.row', { style: { marginTop: '6px' } }, h('button.btn.sm.primary', { onclick: () => { h2.value = r.h2.toFixed(4); run(); } }, 'Use ĥ² and solve BLUP')));
  };
  const reml = () => {
    save();
    const isEM = method.value === 'em';
    stopEM = false;
    const prog = h('span.muted.small', isEM ? ' EM-REML iterating…' : ' Maximizing the REML likelihood…');
    clear(remlBox).append(h('div.row', h('span.busy'), prog, isEM ? h('button.btn.sm', { onclick: () => { stopEM = true; } }, 'Stop') : null));
    setTimeout(async () => {
      try {
        const pd = P.parsePedigree(ped.value); const rr = P.parseRecords(rec.value);
        if (!rr.recs.length) throw new Error('No valid records');
        const t0 = performance.now();
        if (!isEM) return showReml(P.remlProfile(pd.animals, rr.recs), Math.round(performance.now() - t0), false);
        // EM in chunks so the interface stays responsive; progress is shown between chunks
        let state = null, total = 0, res = null;
        const h0 = Math.min(0.9, Math.max(0.05, S.parseNumber(h2.value) || 0.3));
        while (total < 5000) {
          res = P.remlAnimal(pd.animals, rr.recs, { h2Start: h0, start: state, tol: 1e-8, maxIter: 20, skipLogL: true });
          total += res.iterations; state = { va: res.va, ve: res.ve };
          prog.textContent = ` EM-REML · iteration ${total} · σ²a = ${fmtNum(res.va, 4)} · σ²e = ${fmtNum(res.ve, 4)} · h² = ${fmtNum(res.h2, 4)}`;
          if (res.converged || stopEM) break;
          await new Promise((r) => setTimeout(r, 0));
        }
        const fin = P.remlAnimal(pd.animals, rr.recs, { start: state, tol: 1e-8, maxIter: 1 });
        showReml({ ...fin, iterations: total, converged: res.converged, stopped: stopEM && !res.converged }, Math.round(performance.now() - t0), true);
      } catch (e) { clear(remlBox).append(h('div.err', e.message)); }
    }, 30);
  };
  wrap.append(h('div.grid.g2',
    h('div.col',
      h('div.panel', h('div.panel-h', h('span.t', 'Single-trait animal model')), h('div.panel-b.col', h('label.muted.small', 'Pedigree (id, sire, dam) — unknown parent: 0, NA or blank'), ped, h('label.muted.small', 'Records (id, contemporary group / fixed effect, value)'), rec,
        h('div.row.wrap', h('span.muted.small', 'h²'), h2, h('button.btn.primary', { onclick: run }, 'Solve MME (BLUP)'), h('button.btn', { onclick: () => { ped.value = EX_PED; rec.value = EX_REC; h2.value = '0.3333'; simulated = false; run(); clear(remlBox); } }, 'Mrode Example 3.1'), h('button.btn', { title: '180 animals, 160 records, true h² = 0.40 (a new random sample each click)', onclick: () => { const sim = simulateBlupData(Math.floor(Math.random() * 1e6)); ped.value = sim.ped; rec.value = sim.rec; h2.value = '0.4'; simulated = true; run(); reml(); } }, 'Simulated data (h² = 0.4)')),
        h('div.formula.small', 'y = Xb + Za + e,  Var(a) = Aσ²a,  Var(e) = Iσ²e\n[X′X  X′Z ; Z′X  Z′Z + A⁻¹λ] [b ; â] = [X′y ; Z′y],  λ = σ²e/σ²a\nreliability = 1 − C^aa_ii·λ  (A⁻¹ by Henderson’s rules incl. inbreeding)'),
        h('div.dim.small', `Dense solver for teaching / small datasets (BLUP ≤ ${P.MAX_BLUP}, REML ≤ ${P.MAX_REML_FAST} animals; EM ≤ ${P.MAX_REML}). Use BLUPF90 / AIREMLF90 for production-size data.`))),
      h('div.panel', h('div.panel-h', h('span.t', 'Variance components (REML)'), h('span.right.row', method, h('button.btn.sm.primary', { onclick: reml }, 'Estimate'))),
        h('div.panel-b', remlBox, h('div.dim.small', { style: { marginTop: '6px' } }, 'Profile method: λ = σ²e/σ²a is optimized on the REML likelihood with σ²e profiled out (Cholesky of the MME, golden-section search); SEs from the numerical Hessian of −2 log L. EM: σ²a ← (â′A⁻¹â + σ²e tr(A⁻¹C^aa))/q, σ²e ← (y′y − b̂′X′y − â′Z′y)/(N − r(X)).')))),
    h('div.panel', h('div.panel-h', h('span.t', 'Solutions')), h('div.panel-b', out))));
  run();
}
function wsPedigree(wrap) {
  const d = loadDraft('pedigree') || { ped: EX_PED, id: '8', depth: '4' };
  const ped = area('ped', d.ped, 10), idIn = h('input', { value: d.id, placeholder: 'animal id' }), depth = h('select', [2, 3, 4, 5, 6].map((n) => h('option', { value: n, selected: String(n) === String(d.depth) }, `${n} generations`)));
  const out = h('div.col');
  const run = () => {
    clear(out); saveDraft('pedigree', { ped: ped.value, id: idIn.value, depth: depth.value });
    try {
      const pd = P.parsePedigree(ped.value); const rel = P.relationshipMatrix(pd.animals); const stats = P.pedigreeStats(pd.animals, rel.F);
      pd.warnings.forEach((w) => out.append(h('div.warn.small', '⚠ ' + w)));
      out.append(resultView({ results: [{ label: 'Animals', value: stats.n, digits: 0 }, { label: 'Founders (both parents unknown)', value: stats.founders, digits: 0 }, { label: 'Both parents known', value: stats.bothKnown, digits: 0 }, { label: 'Inbred animals', value: stats.inbred, digits: 0 }, { label: 'Mean F', value: stats.meanF }, { label: 'Max F', value: stats.maxF }] }));
      const id = idIn.value.trim();
      if (id && rel.index.has(id)) {
        const desc = P.descendants(pd.animals, id);
        out.append(h('div.section-title', `Ancestry of ${id} · F = ${fmtNum(rel.F[rel.index.get(id)], 5)}`), h('div.panel', h('div.panel-b.ascii-tree', P.ancestryTree(pd.animals, id, Number(depth.value)).join('\n'))),
          h('div.small.muted', `Descendants (${desc.length}): `, desc.slice(0, 60).map((x) => `${x.id} (G${x.generation})`).join(', ') || 'none'));
      } else if (id) out.append(h('div.warn.small', `Animal ${id} not found`));
      const n = rel.ids.length;
      if (n <= 300) {
        const cv = h('canvas.heat', { width: n, height: n, style: { width: Math.min(420, Math.max(160, n * 4)) + 'px', height: Math.min(420, Math.max(160, n * 4)) + 'px' } });
        const g = cv.getContext('2d'); const img = g.createImageData(n, n); let mx = 1; for (let i = 0; i < n; i++) mx = Math.max(mx, rel.A[i][i]);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = Math.min(1, rel.A[i][j] / mx); const k = (i * n + j) * 4; img.data[k] = 11 + v * 78; img.data[k + 1] = 15 + v * 198; img.data[k + 2] = 20 + v * 175; img.data[k + 3] = 255; }
        g.putImageData(img, 0, 0);
        out.append(h('div.section-title', 'Numerator relationship matrix A (heatmap, pedigree order)'), h('div.row', cv, h('div.muted.small', 'dark = 0 · bright = high relationship / diagonal 1 + F')));
      }
      if (n <= 25) out.append(h('div.scroll', h('table.tbl', h('tr', h('th', 'A'), rel.ids.map((x) => h('th.num', x))), rel.ids.map((x, i) => h('tr', h('th', x), rel.ids.map((_, j) => h(`td.num${i === j ? '.accent' : ''}`, fmtNum(rel.A[i][j], 4))))))));
      out.append(h('div.row', h('button.btn.sm', { onclick: () => csvDownload('A-matrix.csv', [['', ...rel.ids], ...rel.ids.map((x, i) => [x, ...Array.from(rel.A[i]).map((v) => v.toFixed(6))])]) }, 'Export A (CSV)'), h('button.btn.sm', { onclick: () => csvDownload('inbreeding.csv', [['id', 'sire', 'dam', 'F'], ...pd.animals.map((a, i) => [a.id, a.sire || 0, a.dam || 0, rel.F[i].toFixed(6)])]) }, 'Export F (CSV)')));
    } catch (e) { out.append(h('div.err', e.message)); }
  };
  wrap.append(h('div.grid.g2', h('div.panel', h('div.panel-h', h('span.t', 'Pedigree')), h('div.panel-b.col', ped, h('div.row', idIn, depth, h('button.btn.primary', { onclick: run }, 'Analyse')), h('div.dim.small', `CSV / tab / space separated. Parents without records are added as founders; order is fixed automatically; loops are detected. Dense A up to ${P.MAX_A} animals.`))), h('div.panel', h('div.panel-h', h('span.t', 'Results')), h('div.panel-b', out))));
  run();
}

function wsMating(wrap) {
  const d = loadDraft('mating') || { ped: EX_PED + '\n9,7,6\n10,4,6', sires: '4, 7, 8', dams: '5, 6, 10', max: '2', fmax: '0.0625' };
  const ped = area('ped', d.ped, 9), sires = h('input', { value: d.sires, style: { width: '100%' } }), dams = h('input', { value: d.dams, style: { width: '100%' } }), max = h('input', { value: d.max }), fmax = h('input', { value: d.fmax });
  const out = h('div.col');
  const run = () => {
    clear(out); saveDraft('mating', { ped: ped.value, sires: sires.value, dams: dams.value, max: max.value, fmax: fmax.value });
    try {
      const pd = P.parsePedigree(ped.value); const rel = P.relationshipMatrix(pd.animals);
      const sl = sires.value.split(/[\s,;]+/).filter(Boolean), dl = dams.value.split(/[\s,;]+/).filter(Boolean);
      const lim = S.parseNumber(fmax.value); const res = P.planMatings(rel, sl, dl, Number(max.value) || Infinity, Number.isFinite(lim) ? lim : 1);
      const col = (f) => (f > lim ? 'err' : f > lim / 2 ? 'warn' : 'ok');
      out.append(h('div.section-title', 'Expected inbreeding of progeny F = a(sire, dam) / 2'), h('div.scroll', h('table.tbl', h('tr', h('th', 'Sire \\ Dam'), dl.map((x) => h('th.num', x))), sl.map((s, i) => h('tr', h('th', s), dl.map((_, j) => h(`td.num.${col(res.matrix[i][j])}`, fmtNum(res.matrix[i][j], 4))))))),
        h('div.section-title', `Suggested plan (max ${max.value || '∞'} matings per sire, minimizing progeny F)`), h('table.tbl', h('tr', h('th', 'Dam'), h('th', 'Sire'), h('th.num', 'Progeny F'), h('th', 'Note')), res.plan.map((p) => h('tr', h('td', p.dam), h('td.accent', p.sire || '—'), h('td.num', p.F === null ? '' : fmtNum(p.F, 4)), h('td.warn', p.note)))),
        h('div.small.muted', 'Sire use: ' + res.uses.map((u) => `${u.sire}×${u.matings}`).join('  ')),
        h('div.row', h('button.btn.sm', { onclick: () => csvDownload('mating-plan.csv', [['dam', 'sire', 'progeny_F'], ...res.plan.map((p) => [p.dam, p.sire || '', p.F ?? ''])]) }, 'Export plan (CSV)')));
    } catch (e) { out.append(h('div.err', e.message)); }
  };
  wrap.append(h('div.grid.g2', h('div.panel', h('div.panel-h', h('span.t', 'Inbreeding-aware mating planner')), h('div.panel-b.col', h('label.muted.small', 'Pedigree'), ped, h('label.muted.small', 'Candidate sires'), sires, h('label.muted.small', 'Candidate dams'), dams, h('div.row', h('span.muted.small', 'Max matings / sire'), max, h('span.muted.small', 'F limit'), fmax), h('button.btn.primary', { onclick: run }, 'Plan matings'), h('div.dim.small', 'Greedy heuristic: dams with the fewest low-F options are assigned first. It does not optimize genetic merit — combine with EBVs for final decisions (e.g. optimal contribution selection).'))), h('div.panel', h('div.panel-h', h('span.t', 'Results')), h('div.panel-b', out))));
  run();
}

function wsSelection(wrap) {
  const d = loadDraft('selection_decision') || { data: 'A1,12.4,0.71\nA2,9.8,0.65\nA3,15.1,0.80\nA4,7.2,0.55\nA5,11.0,0.62\nA6,13.9,0.77\nA7,6.5,0.50\nA8,10.2,0.68\nA9,14.4,0.74\nA10,8.8,0.60', mode: 'p', p: '0.3', n: '3' };
  const data = area('data', d.data, 12, 'id, value (EBV or phenotype)[, accuracy]'), mode = h('select', [['p', 'Select proportion p'], ['n', 'Select top N']].map(([v, l]) => h('option', { value: v, selected: d.mode === v }, l))), p = h('input', { value: d.p }), n = h('input', { value: d.n });
  const out = h('div.col');
  const run = () => {
    clear(out); saveDraft('selection_decision', { data: data.value, mode: mode.value, p: p.value, n: n.value });
    try {
      const rows = S.normalizeDigits(data.value).split(/\n+/).map((l) => l.split(/[,;\t ]+/).map((x) => x.trim())).filter((r) => r.length >= 2 && Number.isFinite(Number(r[1])));
      if (rows.length < 2) throw new Error('Enter at least two candidates (id, value)');
      const c = rows.map((r) => ({ id: r[0], v: Number(r[1]), acc: r[2] !== undefined ? Number(r[2]) : null })).sort((a, b) => b.v - a.v);
      const k = mode.value === 'n' ? Math.round(S.parseNumber(n.value)) : Math.round(S.parseNumber(p.value) * c.length);
      if (!(k >= 1 && k < c.length)) throw new Error(`Number selected must be between 1 and ${c.length - 1}`);
      const vals = c.map((x) => x.v), sel = c.slice(0, k), m = S.mean(vals), sd = S.sd(vals), ms = S.mean(sel.map((x) => x.v));
      const pp = k / c.length; const theo = S.selectionIntensity(pp).i;
      out.append(resultView({ results: [{ label: 'Candidates', value: c.length, digits: 0 }, { label: 'Selected', value: k, digits: 0 }, { label: 'Proportion selected p', value: pp }, { label: 'Truncation point (cut-off value)', value: c[k - 1].v }, { label: 'Mean of candidates', value: m }, { label: 'Mean of selected', value: ms }, { label: 'Selection differential S', value: ms - m }, { label: 'Realized intensity S/σ', value: (ms - m) / sd }, { label: 'Theoretical i(p), infinite population', value: theo }] }),
        h('table.tbl', h('tr', h('th', 'Rank'), h('th', 'Id'), h('th.num', 'Value'), h('th.num', 'Accuracy'), h('th', '')), c.map((x, i) => h('tr', h('td.dim', i + 1), h('td', x.id), h('td.num', fmtNum(x.v, 4)), h('td.num', x.acc === null ? '' : fmtNum(x.acc, 3)), h('td', i < k ? h('span.ok', 'SELECTED') : '')))),
        h('div.row', h('button.btn.sm', { onclick: () => copyText(sel.map((x) => x.id).join('\n'), 'selection') }, 'Copy selected ids'), h('button.btn.sm', { onclick: () => csvDownload('selection.csv', [['rank', 'id', 'value', 'accuracy', 'selected'], ...c.map((x, i) => [i + 1, x.id, x.v, x.acc ?? '', i < k ? 1 : 0])]) }, 'Export CSV')));
    } catch (e) { out.append(h('div.err', e.message)); }
  };
  mode.addEventListener('change', run);
  wrap.append(h('div.grid.g2', h('div.panel', h('div.panel-h', h('span.t', 'Selection decision workspace')), h('div.panel-b.col', data, h('div.row', mode, h('span.muted.small', 'p'), p, h('span.muted.small', 'N'), n, h('button.btn.primary', { onclick: run }, 'Rank & select')), h('div.dim.small', 'Truncation selection on the given values (e.g. EBVs from the BLUP workspace). Ties at the cut-off are broken by input order.'))), h('div.panel', h('div.panel-h', h('span.t', 'Decision')), h('div.panel-b', out))));
  run();
}

function wsExpr(wrap) {
  const scope = {}; const hist = h('div.col', { style: { gap: '2px' } });
  const inp = h('input', { placeholder: 'e.g.  va = 40;  h2 = va/(va+60);  sqrt(h2)*1.4*12', style: { width: '100%', fontSize: '1.1em' } });
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !inp.value.trim()) return;
    for (const part of inp.value.split(';').map((s) => s.trim()).filter(Boolean)) {
      try { const r = evaluate(part, scope); hist.prepend(h('div.result', h('span.muted', part), h('span.v', { style: { cursor: 'pointer' }, title: 'click to copy', onclick: () => copyText(String(r.value)) }, fmtNum(r.value, 10)))); } catch (err) { hist.prepend(h('div.err.small', `${part}: ${err.message}`)); }
    }
    inp.value = '';
  });
  wrap.append(h('div.panel', h('div.panel-h', h('span.t', 'Scientific calculator')), h('div.panel-b.col', inp, h('div.dim.small', `Operators + − × ÷ % ^ ( ) · constants pi e · variables persist (x = 3) · ans = last result · functions: ${FUNCTION_NAMES.join(', ')}`), hist)));
  setTimeout(() => inp.focus(), 30);
}
async function wsCsv(wrap) {
  const box = h('div');
  const { csvView } = await import('./library.js');
  wrap.append(h('div.toolbar', h('button.btn.primary', { onclick: async () => { const p = await api.system.openFiles({ kind: 'text', multi: false }); if (!p[0]) return; try { const text = await api.system.readTextFile(p[0]); clear(box).append(h('div.muted.small', p[0]), csvView(text.slice(0, 5e6), text.length > 5e6)); } catch (e) { toastError(e); } } }, 'Open CSV / TSV / text data file…'), h('span.muted.small', 'Column statistics are computed for numeric columns. Files in the library can be previewed from the Library module.')), box);
}
function wsGlossary(wrap) {
  const q = h('input.search-input', { placeholder: 'Filter glossary…' }); const list = h('div.list');
  const draw2 = () => { clear(list); GLOSSARY.filter(([t, d]) => !q.value || (t + d).toLowerCase().includes(q.value.toLowerCase())).forEach(([t, d]) => list.append(h('div.item', { style: { alignItems: 'flex-start' } }, h('b.accent', { style: { width: '260px', flexShrink: 0 } }, t), h('span.prose', d)))); };
  q.addEventListener('input', draw2); draw2();
  wrap.append(h('div.toolbar', q), h('div.panel', list));
}

const WS = { selection_index: wsSelectionIndex, blup: wsBlup, pedigree: wsPedigree, mating: wsMating, selection_decision: wsSelection, expr: wsExpr, csv: wsCsv, ref_glossary: wsGlossary,
  ref_formulas: (w) => w.append(h('div.panel', h('table.tbl', FORMULAS.map(([n, f]) => h('tr', h('td.muted', n), h('td.accent2', f)))))),
  ref_anova: (w) => w.append(h('div.panel', h('div.panel-b.md', { html: render(ANOVA_GUIDE) }))),
  ref_stats: (w) => w.append(h('div.panel', h('div.panel-b.md', { html: render(STATS_GUIDE) }))) };


export default {
  id: 'tools',
  mount(el, params = {}) {
    root = el;
    if (params.id && ALL.find((t) => t.id === params.id)) st.id = params.id;
    draw();
    this._off = bus.on('settings', ({ key }) => { if (key === 'tools.digits' || key === 'tools.autoCalc') draw(); });
  },
  unmount() { root = null; this._off && this._off(); },
};
