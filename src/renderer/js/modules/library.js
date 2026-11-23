// Scientific file manager & knowledge library.
import { api } from '../api.js';
import { h, clear, debounce, fmtDate, fmtBytes, relTime, toast, toastError, modal, confirmBox, promptBox, contextMenu, copyText, dropzone, stars, empty, parseCsv, fmtNum, buildForm } from '../ui.js';
import { bus, settings } from '../state.js';
import { render } from '../../../shared/markdown.mjs';
import { describe } from '../../../shared/stats.mjs';
import { PAPER_REVIEW_TEMPLATE } from '../../../shared/reference.mjs';
import { mdEditor } from '../editor.js';

export const DOC_TYPES = ['article', 'book', 'lecture', 'thesis', 'document', 'note', 'data', 'output', 'script', 'slides', 'image', 'archive'];
const PAGE = 200;
const st = { q: '', type: 'all', collection: 'all', ext: 'all', fav: false, archived: false, sort: 'created_at', dir: 'DESC', limit: PAGE, sel: null };
let root = null, off = null;

export async function importDialog(opts = {}) {
  const cols = await api.library.collectionList();
  const form = buildForm([
    { key: 'mode', label: 'Storage', type: 'select', options: [['linked', 'Link to original (no copy, original untouched)'], ['managed', 'Copy into Gene OS library folder']], default: settings.get('library.importMode') || 'linked' },
    { key: 'doc_type', label: 'Document type', type: 'select', options: [['', 'Auto-detect from extension'], ...DOC_TYPES.map((t) => [t, t])], default: opts.doc_type || '' },
    { key: 'collection_id', label: 'Collection', type: 'select', numeric: true, options: [['', '—'], ...cols.map((c) => [c.id, c.name])] },
    { key: 'tags', label: 'Tags', type: 'tags' },
  ], {});
  return new Promise((resolve) => {
    const go = async (m, folders) => {
      const v = form.values();
      const paths = await api.system.openFiles({ kind: 'docs', multi: true, folders });
      if (!paths.length) return;
      m.close();
      resolve(await runImport(paths, { ...opts, ...v, doc_type: v.doc_type || opts.doc_type || undefined }));
    };
    modal({ title: 'Import into library', body: h('div.col', form.el, h('div.muted.small', 'Duplicates are detected by SHA-256 content hash. Folders are scanned recursively (depth 6).')), onClose: () => resolve(null), actions: [{ label: 'Cancel' }, { label: 'Choose folder…', onClick: (m) => go(m, true) }, { label: 'Choose files…', primary: true, onClick: (m) => go(m, false) }] });
  });
}
async function runImport(paths, opts = {}) {
  toast(`Importing ${paths.length} item(s)…`, 'info', 1500);
  try {
    const r = await api.library.importPaths(paths, opts);
    bus.emit('changed', 'files');
    if (r.duplicates.length || r.errors.length) modal({ title: 'Import finished', size: 'wide', body: h('div.col', h('div', h('b.ok', r.imported.length), ' imported · ', h('b.warn', r.duplicates.length), ' duplicate(s) skipped · ', h('b.err', r.errors.length), ' error(s)'),
      r.duplicates.length ? h('div', h('div.section-title', 'Duplicates (same content already in library)'), h('div.list', r.duplicates.map((d) => h('div.item', h('span.grow.ellipsis', d.file), h('span.meta', `= #${d.existing.id} ${d.existing.name}`))))) : null,
      r.errors.length ? h('div', h('div.section-title', 'Errors'), r.errors.map((e) => h('div.err.small', `${e.file}: ${e.error}`))) : null), actions: [{ label: 'Close' }, r.duplicates.length ? { label: 'Import duplicates anyway', onClick: async (m) => { m.close(); const r2 = await api.library.importPaths(r.duplicates.map((d) => d.file), { ...opts, allowDuplicates: true }); toast(`${r2.imported.length} imported`, 'ok'); bus.emit('changed', 'files'); } } : null].filter(Boolean) });
    else toast(`Imported ${r.imported.length} file(s)`, 'ok');
    return r;
  } catch (e) { toastError(e); return null; }
}

export async function preview(f) {
  const kind = await api.library.previewKind(f);
  if (kind === 'pdf') return api.system.pdfWindow(f.stored_path, f.name).catch(toastError);
  let body;
  try {
    if (kind === 'image') body = h('img', { src: `gosfile://file/${f.id}`, style: { maxWidth: '100%', maxHeight: '72vh', display: 'block', margin: '0 auto' } });
    else if (kind === 'markdown') { const { text } = await api.library.readText(f.id); body = h('div.md', { html: render(text) }); }
    else if (kind === 'csv') { const { text, truncated } = await api.library.readText(f.id); body = csvView(text, truncated); }
    else if (kind === 'text') { const { text, truncated } = await api.library.readText(f.id); body = h('div', truncated ? h('div.warn.small', 'Showing the first 2 MB') : null, h('pre', { style: { whiteSpace: 'pre-wrap', maxHeight: '70vh', overflow: 'auto', margin: 0 } }, text)); }
    else body = h('div.empty', `No built-in preview for .${f.ext} files.`, h('div', { style: { marginTop: '8px' } }, h('button.btn.primary', { onclick: () => api.library.open(f.id).catch(toastError) }, 'Open with default application')));
  } catch (e) { body = h('div.err', e.message); }
  modal({ title: `${f.name}.${f.ext}`, size: 'xl', body, actions: [{ label: 'Open externally', onClick: () => api.library.open(f.id).catch(toastError) }, { label: 'Close' }] });
}
export function csvView(text, truncated) {
  const rows = parseCsv(text, 5000);
  if (!rows.length) return h('div.muted', 'Empty file');
  const [head, ...data] = rows;
  const stats = head.map((name, j) => { const vals = data.map((r) => Number(r[j])).filter((v) => Number.isFinite(v) && String(v) !== ''); return vals.length >= Math.max(2, data.length * 0.6) ? [name, describe(vals)] : null; }).filter(Boolean);
  return h('div.col',
    h('div.muted.small', `${data.length} rows${truncated || rows.length >= 5000 ? '+ (truncated)' : ''} × ${head.length} columns · showing up to 500 rows`),
    stats.length ? h('div.panel.scroll', h('table.tbl', h('tr', ['Column', 'n', 'mean', 'sd', 'min', 'max', 'CV%'].map((x) => h('th', x))), stats.map(([n, d]) => h('tr', h('td', n), [d.n, d.mean, d.sd, d.min, d.max, d.cv].map((v) => h('td.num', fmtNum(v, 4))))))) : null,
    h('div.panel.scroll', { style: { maxHeight: '55vh' } }, h('table.tbl', h('tr', h('th', '#'), head.map((x) => h('th', x))), data.slice(0, 500).map((r, i) => h('tr', h('td.dim', i + 1), head.map((_, j) => h('td', r[j] ?? '')))))));
}

function citation(f) { return `${f.authors || 'Anon.'} (${f.year || 'n.d.'}). ${f.name}.${f.journal ? ' ' + f.journal + '.' : ''}${f.doi ? ' https://doi.org/' + String(f.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : ''}`; }

async function reviewDialog(f) {
  const review = f.review || {};
  const ed = mdEditor({ value: review.text || PAPER_REVIEW_TEMPLATE.replace('**Citation:**', `**Citation:** ${citation(f)}`).replace('**DOI:**', `**DOI:** ${f.doi || ''}`), onSave: async (text) => { const cur = await api.library.get(f.id); await api.library.update(f.id, { review: { ...(cur.review || {}), text } }); } });
  modal({ title: `Paper review — ${f.name}`, size: 'xl', body: ed.el, onClose: () => ed.flush(), actions: [{ label: 'Close', onClick: async (m) => { await ed.flush(); m.close(); } }] });
}

async function detail(f, wrap) {
  const [cols, courses, projects] = await Promise.all([api.library.collectionList(), api.courses.list({ sort: 'name', dir: 'ASC' }), api.research.list({})]);
  const exists = await api.system.pathExists(f.stored_path);
  const form = buildForm([
    { key: 'name', label: 'Title / name', required: true },
    { key: 'doc_type', label: 'Type', type: 'select', options: DOC_TYPES },
    { key: 'collection_id', label: 'Collection', type: 'select', numeric: true, options: [['', '—'], ...cols.map((c) => [c.id, c.name])] },
    { key: 'tags', label: 'Tags', type: 'tags' }, { key: 'authors', label: 'Authors' }, { key: 'year', label: 'Year', type: 'number' },
    { key: 'journal', label: 'Journal / publisher' }, { key: 'doi', label: 'DOI' },
    { key: 'read_status', label: 'Reading', type: 'select', options: [['unread', 'Unread'], ['reading', 'Reading'], ['read', 'Read']] },
    { key: 'read_progress', label: 'Progress %', type: 'number' },
    { key: 'course_id', label: 'Course', type: 'select', numeric: true, options: [['', '—'], ...courses.map((c) => [c.id, c.name])] },
    { key: 'project_id', label: 'Project', type: 'select', numeric: true, options: [['', '—'], ...projects.map((p) => [p.id, p.name])] },
    { key: 'abstract', label: 'Abstract', type: 'textarea', rows: 4, full: true }, { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, full: true },
  ], f);
  const save = async () => { try { await api.library.update(f.id, form.values()); toast('Saved', 'ok', 1000); bus.emit('changed', 'files'); } catch (e) { toastError(e); } };
  clear(wrap).append(h('div.panel', h('div.panel-h', h('span.t', `#${f.id} · ${(f.ext || '').toUpperCase()}`), h('span.right.row', stars(f.rating, (v) => api.library.update(f.id, { rating: v })), h(`button.btn.sm${f.favorite ? '.on' : ''}`, { onclick: async () => { await api.library.update(f.id, { favorite: !f.favorite }); bus.emit('changed', 'files'); } }, f.favorite ? '★' : '☆'))),
    h('div.panel-b.col',
      !exists ? h('div.err.small', '⚠ File is missing at its stored location. It may have been moved or deleted outside Gene OS.') : null,
      h('div.row.wrap', h('button.btn.primary', { onclick: () => api.library.open(f.id).then(() => bus.emit('changed', 'files')).catch(toastError) }, 'Open'), h('button.btn', { onclick: () => preview(f) }, 'Preview'), h('button.btn', { onclick: () => api.library.showInFolder(f.id) }, 'Show in folder'), h('button.btn', { onclick: () => copyText(f.stored_path, 'path') }, 'Copy path'), h('button.btn', { onclick: () => copyText(citation(f), 'citation') }, 'Copy citation'), h('button.btn', { onclick: () => reviewDialog(f) }, (f.review || {}).text ? 'Review ✎' : 'Write review')),
      form.el,
      h('div.small.muted', h('div', `Storage: ${f.storage_mode === 'managed' ? 'managed copy in library folder' : 'linked to original (never modified)'}`), h('div.ellipsis', { title: f.stored_path }, f.stored_path), h('div', `${fmtBytes(f.size)} · added ${fmtDate(f.created_at)} · ${f.last_opened_at ? 'opened ' + relTime(f.last_opened_at) : 'never opened'} · sha256 ${String(f.hash).slice(0, 12)}…`)),
      h('div.row.wrap', h('button.btn.primary', { onclick: save }, 'Save metadata'),
        f.storage_mode === 'managed' ? h('button.btn', { onclick: async () => { const n = await promptBox('Rename file on disk', 'New file name (without extension)', f.name); if (n) { try { await api.library.renameOnDisk(f.id, n); bus.emit('changed', 'files'); } catch (e) { toastError(e); } } } }, 'Rename on disk') : null,
        h('button.btn', { onclick: async () => { await api.library.update(f.id, { archived: !f.archived }); st.sel = null; bus.emit('changed', 'files'); } }, f.archived ? 'Unarchive' : 'Archive'),
        h('button.btn.danger', { onclick: () => removeFile(f) }, 'Remove')))));
}
async function removeFile(f) {
  const managed = f.storage_mode === 'managed';
  const ok = await confirmBox(h('div', `Remove “${f.name}” from the library?`, h('div.muted.small', managed ? 'The managed copy inside the Gene OS library folder will also be deleted. Your original file is not touched.' : 'Only the library record is removed. The original file on disk is not touched.')), { danger: true, okLabel: 'Remove' });
  if (!ok) return;
  try { await api.library.remove(f.id, { deleteManagedCopy: managed }); st.sel = null; bus.emit('changed', 'files'); } catch (e) { toastError(e); }
}

async function manageCollections() {
  const draw2 = async (m) => {
    const cols = await api.library.collectionList();
    const body = m.el.querySelector('.modal-b'); clear(body);
    body.append(h('div.list', cols.map((c) => h('div.item', h('span.grow', c.name), h('button.btn.sm', { onclick: async () => { const n = await promptBox('Rename collection', 'Name', c.name); if (n) { await api.library.collectionRename(c.id, n); draw2(m); } } }, 'Rename'), h('button.btn.sm.danger', { onclick: async () => { if (await confirmBox(`Delete collection “${c.name}”? Files stay in the library.`, { danger: true })) { await api.library.collectionRemove(c.id); draw2(m); } } }, '✕')))),
      h('div', { style: { marginTop: '8px' } }, h('button.btn.primary', { onclick: async () => { const n = await promptBox('New collection', 'Name'); if (n) { await api.library.collectionCreate(n); draw2(m); } } }, '+ Collection')));
  };
  const m = modal({ title: 'Collections', body: h('div'), onClose: () => draw(), actions: [{ label: 'Done' }] });
  draw2(m);
}

async function checks(kind) {
  const list = kind === 'dups' ? await api.library.duplicates() : await api.library.checkMissing();
  modal({ title: kind === 'dups' ? 'Duplicate files (same content hash)' : 'Missing files', size: 'wide', body: list.length ? h('div.list', list.map((x) => h('div.item', kind === 'dups' ? [h('span.grow', x.names), h('span.meta', `${x.n} copies · ids ${x.ids}`)] : [h('span.grow', x.name), h('span.meta.ellipsis', { style: { maxWidth: '60%' } }, x.stored_path)]))) : h('div.empty', kind === 'dups' ? 'No duplicates found.' : 'All files are present on disk. ✓') });
}

async function draw() {
  if (!root) return;
  const filter = { q: st.q || undefined, doc_type: st.type, collection_id: st.collection === 'all' ? undefined : st.collection === 'none' ? null : Number(st.collection), ext: st.ext, archived: st.archived };
  if (st.fav) filter.favorite = true;
  let files, total, cols, facets;
  try { [files, total, cols, facets] = await Promise.all([api.library.list({ filter, sort: st.sort, dir: st.dir, limit: st.limit }), api.library.count(filter), api.library.collectionList(), api.library.facets()]); } catch (e) { return toastError(e); }
  const search = h('input.search-input', { placeholder: 'Search title, authors, DOI, abstract, tags, notes…', value: st.q, oninput: debounce((e) => { st.q = e.target.value; st.limit = PAGE; draw(); }, 220) });
  const sortTh = (key, label, cls = '') => h(`th.sortable${cls}`, { onclick: () => { if (st.sort === key) st.dir = st.dir === 'ASC' ? 'DESC' : 'ASC'; else { st.sort = key; st.dir = key === 'name' ? 'ASC' : 'DESC'; } draw(); } }, label, st.sort === key ? (st.dir === 'ASC' ? ' ▴' : ' ▾') : '');
  const rows = files.map((f) => h('tr', { style: { cursor: 'pointer', background: st.sel === f.id ? 'var(--accent-soft)' : '' }, onclick: () => { st.sel = f.id; draw(); }, ondblclick: () => api.library.open(f.id).then(() => bus.emit('changed', 'files')).catch(toastError),
    oncontextmenu: (e) => contextMenu(e, [{ label: 'Open', run: () => api.library.open(f.id).catch(toastError) }, { label: 'Preview', run: () => preview(f) }, { label: 'Show in folder', run: () => api.library.showInFolder(f.id) }, { label: 'Copy path', run: () => copyText(f.stored_path, 'path') }, { label: 'Copy citation', run: () => copyText(citation(f), 'citation') }, '-', { label: f.favorite ? 'Unfavorite' : 'Favorite', run: () => api.library.update(f.id, { favorite: !f.favorite }).then(() => draw()) }, { label: f.archived ? 'Unarchive' : 'Archive', run: () => api.library.update(f.id, { archived: !f.archived }).then(() => draw()) }, { label: 'Move to collection…', run: () => moveTo(f, cols) }, '-', { label: 'Remove', danger: true, run: () => removeFile(f) }]) },
  h('td', f.favorite ? h('span.warn', '★') : ''), h('td.dim', (f.ext || '').toUpperCase()), h('td', h('div.ellipsis', { style: { maxWidth: '420px' } }, f.name), f.authors ? h('div.dim.small.ellipsis', { style: { maxWidth: '420px' } }, f.authors) : null), h('td.muted', f.doc_type), h('td.num', f.year || ''), h('td.muted', cols.find((c) => c.id === f.collection_id)?.name || ''), h('td', f.read_status === 'read' ? h('span.ok', '✓') : f.read_status === 'reading' ? h('span.accent', `${f.read_progress || 0}%`) : ''), h('td.num.muted', fmtBytes(f.size)), h('td.muted', fmtDate(f.created_at))));
  const side = h('div');
  const body = h('div.split.wide-left',
    h('div.col', files.length ? h('div.panel.scroll', { style: { maxHeight: 'calc(100vh - 330px)' } }, h('table.tbl', h('tr', h('th', ''), h('th', 'Ext'), sortTh('name', 'Name'), sortTh('doc_type', 'Type'), sortTh('year', 'Year', '.num'), h('th', 'Collection'), h('th', 'Read'), sortTh('size', 'Size', '.num'), sortTh('created_at', 'Added')), rows)) : empty('No files match. Drag & drop files or folders here, or use Import.'),
      files.length < total ? h('button.btn', { onclick: () => { st.limit += PAGE; draw(); } }, `Load more (${files.length}/${total})`) : h('div.muted.small', `${total} file(s)`)),
    side);
  clear(root).append(
    h('div.toolbar', search,
      h('select', { onchange: (e) => { st.type = e.target.value; draw(); } }, [['all', 'All types'], ...facets.types.map((t) => [t.k, `${t.k} (${t.n})`])].map(([v, l]) => h('option', { value: v, selected: st.type === v }, l))),
      h('select', { onchange: (e) => { st.ext = e.target.value; draw(); } }, [['all', 'All extensions'], ...facets.exts.map((t) => [t.k, `.${t.k} (${t.n})`])].map(([v, l]) => h('option', { value: v, selected: st.ext === v }, l))),
      h('select', { onchange: (e) => { st.sort = e.target.value; draw(); } }, [['created_at', 'Recently added'], ['last_opened_at', 'Recently opened'], ['name', 'Name'], ['year', 'Year'], ['rating', 'Rating'], ['size', 'Size']].map(([v, l]) => h('option', { value: v, selected: st.sort === v }, l))),
      h(`button.chip${st.fav ? '.on' : ''}`, { onclick: () => { st.fav = !st.fav; draw(); } }, `★ Favorites (${facets.favorites})`),
      h(`button.chip${st.archived ? '.on' : ''}`, { onclick: () => { st.archived = !st.archived; st.sel = null; draw(); } }, `Archive (${facets.archived})`),
      h('span.right.row', h('button.btn', { onclick: () => checks('dups') }, 'Duplicates'), h('button.btn', { onclick: () => checks('missing') }, 'Check missing'), h('button.btn.primary', { onclick: () => importDialog() }, '⇪ Import'))),
    h('div.toolbar', h(`button.chip${st.collection === 'all' ? '.on' : ''}`, { onclick: () => { st.collection = 'all'; draw(); } }, 'All'), h(`button.chip${st.collection === 'none' ? '.on' : ''}`, { onclick: () => { st.collection = 'none'; draw(); } }, 'Unsorted'),
      cols.map((c) => { const chip = h(`button.chip${String(st.collection) === String(c.id) ? '.on' : ''}`, { onclick: () => { st.collection = c.id; draw(); } }, c.name); chip.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/gos-file')) e.preventDefault(); }); return chip; }),
      h('button.btn.sm.ghost', { onclick: manageCollections }, '⚙ collections')),
    body);
  dropzone(body, (paths) => runImport(paths, { collection_id: typeof st.collection === 'number' ? st.collection : undefined }));
  if (st.sel) { const f = await api.library.get(st.sel); if (f) await detail(f, side); else st.sel = null; }
  if (!st.sel) side.append(h('div.panel', h('div.panel-h', h('span.t', 'Details')), h('div.panel-b.muted.small', 'Select a file to edit metadata (authors, year, DOI, abstract, rating, collection, course, project), preview it, or write a paper review. Double-click opens it in its default application.', h('hr'), `Default import mode: ${settings.get('library.importMode') === 'managed' ? 'copy into library' : 'link originals'} (Settings → Data).`)));
}
async function moveTo(f, cols) {
  const m = modal({ title: 'Move to collection', body: h('div.list', [['', 'Unsorted'], ...cols.map((c) => [c.id, c.name])].map(([id, name]) => h('div.item.clickable', { onclick: async () => { await api.library.update(f.id, { collection_id: id || null }); m.close(); draw(); } }, name))) });
}

export default {
  id: 'library',
  async mount(el, params = {}) { root = el; if (params.id) { st.sel = params.id; st.archived = false; } await draw(); off = bus.on('changed', (e) => { if (!e || e === 'files') draw(); }); },
  unmount() { root = null; off && off(); },
};
