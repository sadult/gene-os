// Bookmark manager: categories (user-defined), tags, favorites, custom icon/ordering, grid/list,
// import (Gene OS JSON or browser HTML export) and export (JSON / HTML).
import { api } from '../api.js';
import { h, clear, debounce, toast, toastError, formModal, confirmBox, contextMenu, copyText, empty, colorFor } from '../ui.js';
import { bus } from '../state.js';

export const SUGGESTED = ['Scientific Journals', 'Genetics', 'Research', 'Statistics', 'Programming', 'University', 'Tools', 'Reference', 'Personal'];
const st = { q: '', cat: 'all', view: 'grid', fav: false, sort: 'custom' };
let root = null, off = null;

export async function bookmarkDialog(b = {}) {
  const cats = (await api.bookmarks.categories()).map((c) => c.category);
  const all = [...new Set([...cats, ...SUGGESTED])];
  const v = await formModal({ title: b.id ? 'Edit bookmark' : 'New bookmark', values: { category: 'Reference', ...b }, extraActions: b.id ? [{ label: 'Delete', danger: true, onClick: async (m) => { if (await confirmBox(`Delete “${b.name}”?`, { danger: true })) { await api.bookmarks.remove(b.id); m.close(); bus.emit('changed', 'bookmarks'); } } }] : [], fields: [
    { key: 'url', label: 'URL', required: true, autofocus: !b.id, placeholder: 'https://www.ncbi.nlm.nih.gov/pubmed' },
    { key: 'name', label: 'Name', placeholder: 'defaults to the URL' },
    { key: 'category', label: 'Category', type: 'custom', full: false, render: (val) => { const inp = h('input', { value: val || '', list: 'gos-bm-cats' }); return { el: h('div', inp, h('datalist#gos-bm-cats', all.map((c) => h('option', { value: c })))), get: () => inp.value.trim() || 'Reference' }; } },
    { key: 'tags', label: 'Tags', type: 'tags' }, { key: 'icon', label: 'Icon (emoji or 1–2 letters)', placeholder: '🧬' },
    { key: 'favorite', label: 'Favorite', type: 'checkbox' },
    { key: 'description', label: 'Description', type: 'textarea', rows: 2 }, { key: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
  ] });
  if (!v) return null;
  try { const r = b.id ? await api.bookmarks.update(b.id, v) : await api.bookmarks.create({ ...b, ...v }); bus.emit('changed', 'bookmarks'); return r; } catch (e) { toastError(e); return null; }
}
const open = (b) => api.system.openExternal(b.url).catch(toastError);
const ico = (b) => h('div.ico', { style: { background: b.icon && /\p{Extended_Pictographic}/u.test(b.icon) ? 'var(--bg2)' : colorFor(b.category + b.name) } }, b.icon || (b.name || '?').slice(0, 1).toUpperCase());
function menu(e, b) {
  contextMenu(e, [{ label: 'Open in browser', run: () => open(b) }, { label: 'Copy URL', run: () => copyText(b.url, 'bookmark') }, { label: 'Edit…', run: () => bookmarkDialog(b) }, { label: b.favorite ? 'Unfavorite' : 'Favorite', run: () => api.bookmarks.update(b.id, { favorite: !b.favorite }).then(() => bus.emit('changed', 'bookmarks')) }, '-', { label: 'Delete', danger: true, run: async () => { if (await confirmBox(`Delete “${b.name}”?`, { danger: true })) { await api.bookmarks.remove(b.id); bus.emit('changed', 'bookmarks'); } } }]);
}

async function doImport() {
  const p = await api.system.openFiles({ kind: 'bookmarks', multi: false });
  if (!p[0]) return;
  try { const text = await api.system.readTextFile(p[0]); const r = await api.bookmarks.importText(text); toast(`Imported ${r.added} bookmark(s), skipped ${r.skipped} (duplicates/invalid)`, 'ok', 5000); bus.emit('changed', 'bookmarks'); } catch (e) { toastError(e); }
}
async function doExport(fmt) {
  try { const content = fmt === 'html' ? await api.bookmarks.exportHtml() : await api.bookmarks.exportJson(); const f = await api.system.saveFile({ kind: fmt === 'html' ? 'bookmarks' : 'json', defaultName: `gene-os-bookmarks.${fmt}`, content }); if (f) toast('Exported → ' + f, 'ok'); } catch (e) { toastError(e); }
}

async function draw() {
  if (!root) return;
  let all; try { all = await api.bookmarks.list({ sort: 'sort', dir: 'ASC' }); } catch (e) { return toastError(e); }
  const cats = [...new Set(all.map((b) => b.category || 'Reference'))].sort();
  let list = all;
  if (st.q) { const q = st.q.toLowerCase(); list = list.filter((b) => [b.name, b.url, b.description, b.notes, (b.tags || []).join(' ')].join(' ').toLowerCase().includes(q)); }
  if (st.cat !== 'all') list = list.filter((b) => b.category === st.cat);
  if (st.fav) list = list.filter((b) => b.favorite);
  if (st.sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (st.sort === 'recent') list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const draggable = st.sort === 'custom' && !st.q;
  const card = (b) => {
    const el = st.view === 'grid'
      ? h('div.bm', { draggable: draggable ? 'true' : null, onclick: () => open(b), oncontextmenu: (e) => menu(e, b), title: b.url }, ico(b), h('div.grow', { style: { minWidth: 0 } }, h('div.ellipsis', b.favorite ? h('span.warn', '★ ') : null, b.name), h('div.u', b.url.replace(/^https?:\/\//, '')), b.description ? h('div.muted.small.ellipsis', b.description) : null, (b.tags || []).length ? h('div', b.tags.map((t) => h('span.tag', t))) : null))
      : h('div.item.clickable', { draggable: draggable ? 'true' : null, onclick: () => open(b), oncontextmenu: (e) => menu(e, b) }, b.favorite ? h('span.warn', '★') : h('span.dim', '·'), h('span', { style: { width: '220px' }, class: 'ellipsis' }, b.name), h('span.grow.muted.ellipsis', b.url), h('span.meta', b.category), h('button.btn.sm', { onclick: (e) => { e.stopPropagation(); copyText(b.url, 'bookmark'); } }, 'Copy'), h('button.btn.sm', { onclick: (e) => { e.stopPropagation(); bookmarkDialog(b); } }, 'Edit'));
    if (draggable) {
      el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/gos-bm', String(b.id)));
      el.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/gos-bm')) e.preventDefault(); });
      el.addEventListener('drop', async (e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/gos-bm')); if (!from || from === b.id) return; const ids = all.map((x) => x.id).filter((x) => x !== from); ids.splice(ids.indexOf(b.id), 0, from); await api.bookmarks.reorder(ids); draw(); });
    }
    return el;
  };
  clear(root).append(
    h('div.toolbar', h('input.search-input', { placeholder: 'Search bookmarks…', value: st.q, oninput: debounce((e) => { st.q = e.target.value; draw(); }, 150) }),
      h('select', { onchange: (e) => { st.sort = e.target.value; draw(); } }, [['custom', 'Custom order (drag)'], ['name', 'Name'], ['recent', 'Recently added']].map(([v, l]) => h('option', { value: v, selected: st.sort === v }, l))),
      h(`button.chip${st.fav ? '.on' : ''}`, { onclick: () => { st.fav = !st.fav; draw(); } }, '★ Favorites'),
      h('button.btn.sm', { onclick: () => { st.view = st.view === 'grid' ? 'list' : 'grid'; draw(); } }, st.view === 'grid' ? '☰ List' : '▦ Grid'),
      h('span.right.row', h('button.btn', { onclick: doImport }, 'Import'), h('button.btn', { onclick: () => doExport('json') }, 'Export JSON'), h('button.btn', { onclick: () => doExport('html') }, 'Export HTML'), h('button.btn.primary', { onclick: () => bookmarkDialog() }, '+ Bookmark'))),
    h('div.toolbar', h(`button.chip${st.cat === 'all' ? '.on' : ''}`, { onclick: () => { st.cat = 'all'; draw(); } }, `All (${all.length})`), cats.map((c) => h(`button.chip${st.cat === c ? '.on' : ''}`, { onclick: () => { st.cat = c; draw(); } }, `${c} (${all.filter((b) => b.category === c).length})`))),
    !all.length ? empty(`No bookmarks yet. Suggested categories: ${SUGGESTED.join(', ')} — or create your own. You can also import a browser bookmarks export (HTML).`, h('button.btn.primary', { onclick: () => bookmarkDialog() }, '+ Bookmark'))
      : !list.length ? empty('No bookmarks match.') : st.view === 'grid' ? h('div.bm-grid', list.map(card)) : h('div.panel', h('div.list', list.map(card))));
  if (st.openId) { const b = all.find((x) => x.id === st.openId); st.openId = null; if (b) bookmarkDialog(b); }
}

export default {
  id: 'bookmarks',
  async mount(el, params = {}) { root = el; if (params.id) st.openId = params.id; await draw(); off = bus.on('changed', (e) => { if (!e || e === 'bookmarks') draw(); }); },
  unmount() { root = null; off && off(); },
};
