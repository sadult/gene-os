// UI toolkit: DOM builder, modals, forms, toasts, context menus, formatting helpers.
import { api, native } from './api.js';
import { settings } from './state.js';
import { icon } from './icons.js';

// Allow conditional children everywhere: native append/prepend would render null/undefined/false as text.
for (const proto of [Element.prototype]) {
  for (const m of ['append', 'prepend']) {
    const orig = proto[m];
    proto[m] = function (...nodes) { return orig.apply(this, nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false)); };
  }
}

export function h(tag, attrs, ...kids) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, v) => { if (t === '.') el.classList.add(v); else el.id = v; });
  if (attrs !== null && attrs !== undefined && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv === null || sv === undefined) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v; // only used with sanitized markdown output
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) { if (k === null || k === undefined || k === false) continue; el.append(k instanceof Node ? k : document.createTextNode(String(k))); }
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function debounce(fn, ms) { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); return fn(...a); }; d.cancel = () => clearTimeout(t); return d; }

// ---- formatting ----
const pad = (n) => String(n).padStart(2, '0');
export function fmtDate(iso, time = false) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso); if (isNaN(d)) return String(iso);
  const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return time ? `${s} ${pad(d.getHours())}:${pad(d.getMinutes())}` : s;
}
export function relTime(iso) {
  if (!iso) return '';
  const t = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T23:59').getTime() : Date.parse(iso);
  const diff = t - Date.now(); const a = Math.abs(diff);
  const u = a < 3600e3 ? [Math.round(a / 60e3), 'm'] : a < 864e5 ? [Math.round(a / 3600e3), 'h'] : a < 30 * 864e5 ? [Math.round(a / 864e5), 'd'] : [Math.round(a / (30 * 864e5)), 'mo'];
  return diff >= 0 ? `in ${u[0]}${u[1]}` : `${u[0]}${u[1]} ago`;
}
export const isOverdue = (iso) => !!iso && Date.parse(iso) < Date.now();
export function fmtBytes(b) { if (!b) return '0 B'; const u = ['B', 'KB', 'MB', 'GB']; const i = Math.min(3, Math.floor(Math.log(b) / Math.log(1024))); return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`; }
export function fmtNum(v, digits = 4) {
  if (typeof v !== 'number') return String(v ?? '');
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v) && digits === 0) return v.toLocaleString('en-US');
  if (v !== 0 && (Math.abs(v) < 1e-4 || Math.abs(v) >= 1e9)) return v.toExponential(Math.max(2, digits - 1));
  return Number(v.toFixed(digits)).toString();
}
export function bar(pct, width = 20) { const p = Math.max(0, Math.min(100, pct || 0)); const f = Math.round((p / 100) * width); return h('span.bar', '█'.repeat(f), h('span.rest', '░'.repeat(width - f)), h('span.muted', ` ${String(Math.round(p)).padStart(3)}%`)); }
export const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
export const todayStr = () => fmtDate(new Date().toISOString());
export const priorityGlyph = (p) => ({ critical: '‼', high: '▲', medium: '■', low: '▽' }[p] || '·');

// ---- toasts ----
let toastBox;
export function toast(msg, kind = 'info', ms = 3200) {
  if (!toastBox) { toastBox = h('div.toasts'); document.body.append(toastBox); }
  const t = h(`div.toast.${kind}`, msg); toastBox.append(t);
  setTimeout(() => t.remove(), ms);
}
export const toastError = (e) => toast(e && e.message ? e.message : String(e), 'error', 5000);

// ---- modal ----
const stack = [];
export function modal({ title = '', body, actions = [], size = '', onClose, closeOnBackdrop = true } = {}) {
  const box = h(`div.modal${size ? '.' + size : ''}`, { role: 'dialog', 'aria-modal': 'true' });
  const back = h('div.backdrop', box);
  const close = (v) => { if (!back.isConnected) return; back.remove(); stack.splice(stack.indexOf(api_), 1); onClose && onClose(v); };
  const api_ = { close, el: box };
  box.append(h('div.modal-h', title, h('button.x', { onclick: () => close(null), title: 'Close (Esc)' }, '✕')));
  const b = h('div.modal-b'); if (body) append(b, [typeof body === 'function' ? body(api_) : body]); box.append(b);
  if (actions.length) box.append(h('div.modal-f', actions.map((a) => h(`button.btn${a.primary ? '.primary' : ''}${a.danger ? '.danger' : ''}`, { onclick: () => a.onClick ? a.onClick(api_) : close(a.value) }, a.label))));
  back.addEventListener('mousedown', (e) => { if (e.target === back && closeOnBackdrop) close(null); });
  document.getElementById('layer').append(back);
  stack.push(api_);
  setTimeout(() => { const f = box.querySelector('[autofocus], input, textarea, select'); if (f) f.focus(); }, 10);
  return api_;
}
export const closeTopModal = () => { const m = stack[stack.length - 1]; if (m) { m.close(null); return true; } return false; };
export const modalOpen = () => stack.length > 0;

export function confirmBox(message, { okLabel = 'Confirm', danger = false, force = false } = {}) {
  if (!force && danger && settings.get('behavior.confirmDelete') === false) return Promise.resolve(true);
  return new Promise((resolve) => modal({ title: danger ? 'Confirm' : 'Please confirm', body: h('div', message), onClose: (v) => resolve(!!v), actions: [{ label: 'Cancel', value: false }, { label: okLabel, primary: !danger, danger, value: true }] }));
}
export function promptBox(title, label, value = '', { placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const inp = h('input', { value, placeholder, autofocus: true, style: { width: '100%' } });
    const m = modal({ title, body: h('div.col', h('label.muted', label), inp), onClose: (v) => resolve(v), actions: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, onClick: () => m.close(inp.value) }] });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') m.close(inp.value); });
  });
}

// ---- generic form ----
// field: { key, label, type, options, placeholder, hint, required, full, rows, render(value) -> {el, get} }
export function buildForm(fields, values = {}) {
  const getters = {};
  const form = h('div.form');
  for (const f of fields) {
    if (f.type === 'section') { form.append(h('div.full.section-title', f.label)); continue; }
    const v = values[f.key];
    let el, get;
    const t = f.type || 'text';
    if (t === 'textarea' || t === 'markdown') { el = h('textarea', { rows: f.rows || (t === 'markdown' ? 8 : 3), placeholder: f.placeholder || '' }); el.value = v ?? ''; get = () => el.value; }
    else if (t === 'select') { el = h('select', (f.options || []).map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return h('option', { value: val, selected: String(val) === String(v ?? f.default ?? '') }, lab); })); get = () => (f.numeric ? (el.value === '' ? null : Number(el.value)) : el.value); }
    else if (t === 'checkbox') { el = h('input', { type: 'checkbox', checked: !!v }); get = () => el.checked; }
    else if (t === 'number') { el = h('input', { type: 'number', step: f.step || 'any', value: v ?? '', placeholder: f.placeholder || '' }); get = () => (el.value === '' ? null : Number(el.value)); }
    else if (t === 'date') { el = h('input', { type: 'date', value: v ? fmtDate(v) : '' }); get = () => el.value || null; }
    else if (t === 'datetime') { el = h('input', { type: 'datetime-local', value: toLocalInput(v) }); get = () => fromLocalInput(el.value); }
    else if (t === 'color') { el = h('input', { type: 'color', value: v || '#59D5C3' }); get = () => el.value; }
    else if (t === 'tags') { el = h('input', { value: (v || []).join(', '), placeholder: 'comma separated' }); get = () => el.value.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean); }
    else if (t === 'custom') { const c = f.render(v); el = c.el; get = c.get; }
    else { el = h('input', { type: t === 'url' ? 'url' : 'text', value: v ?? '', placeholder: f.placeholder || '' }); get = () => el.value.trim(); }
    if (f.autofocus) el.setAttribute('autofocus', '');
    getters[f.key] = { get, f };
    if (f.full || t === 'custom' && f.full !== false) form.append(h('label.full', f.label), h('div.full', el));
    else form.append(h('label', f.label), el);
    if (f.hint) form.append(h('div.hint', f.hint));
  }
  return {
    el: form,
    values() {
      const out = {};
      for (const [k, { get, f }] of Object.entries(getters)) {
        const v = get();
        if (f.required && (v === '' || v === null || v === undefined)) throw new Error(`${f.label} is required`);
        out[k] = v;
      }
      return out;
    },
  };
}
export function formModal({ title, fields, values = {}, submitLabel = 'Save', size = '', extraActions = [] }) {
  return new Promise((resolve) => {
    const form = buildForm(fields, values);
    let done = false;
    const submit = (m) => { try { const v = form.values(); done = true; m.close(); resolve(v); } catch (e) { toastError(e); } };
    const m = modal({ title, size, body: form.el, onClose: () => { if (!done) resolve(null); }, actions: [...extraActions, { label: 'Cancel', onClick: (mm) => mm.close() }, { label: submitLabel, primary: true, onClick: submit }] });
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.target.tagName === 'INPUT' && e.target.type !== 'checkbox')) { e.preventDefault(); submit(m); } });
  });
}

// ---- context menu ----
let ctxEl = null;
export function contextMenu(ev, items) {
  ev.preventDefault(); ev.stopPropagation();
  closeContext();
  ctxEl = h('div.ctx', items.filter(Boolean).map((it) => (it === '-' ? h('hr') : h(`button${it.danger ? '.danger' : ''}`, { onclick: () => { closeContext(); it.run(); } }, h('span.grow', it.label), it.hint ? h('span.dim.small', it.hint) : null))));
  document.body.append(ctxEl);
  const r = ctxEl.getBoundingClientRect();
  ctxEl.style.left = Math.min(ev.clientX, innerWidth - r.width - 6) + 'px';
  ctxEl.style.top = Math.min(ev.clientY, innerHeight - r.height - 6) + 'px';
}
export function closeContext() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }
document.addEventListener('mousedown', (e) => { if (ctxEl && !ctxEl.contains(e.target)) closeContext(); });

// ---- misc ----
export async function copyText(text, source = '') {
  await api.system.copyText(text);
  api.clipboard.add(text, source).catch(() => {});
  toast('Copied to clipboard', 'ok', 1500);
}
export function empty(msg, action) { return h('div.empty', h('span.big', '∅'), msg, action ? h('div', { style: { marginTop: '10px' } }, action) : null); }
export function kv(pairs) { return h('div.kv', pairs.filter(Boolean).flatMap(([k, v]) => [h('span', k), v instanceof Node ? v : h('span', String(v ?? '—'))])); }
export function panel(title, body, actions, iconName) { return h('div.panel', h('div.panel-h', iconName ? icon(iconName, 14, 'ph') : null, h(`span.t${iconName ? '.noglyph' : ''}`, title), h('span.right.row', actions || null)), h('div.panel-b', body)); }
// Button with a leading icon. kind: '' | 'primary' | 'danger' | 'ghost' | 'sm' (dot-separated allowed)
export function ibtn(iconName, label, onclick, kind = '', attrs = {}) {
  return h(`button.btn${kind ? '.' + kind.split(/[.\s]+/).filter(Boolean).join('.') : ''}`, { onclick, ...attrs }, icon(iconName, 14), label ? h('span', label) : null);
}
export { icon };
export function stars(value, onChange) {
  const el = h('span.stars');
  const draw = (v) => { clear(el); for (let i = 1; i <= 5; i++) el.append(h(i <= v ? 'span' : 'span.off', { onclick: () => { const nv = i === v ? 0 : i; draw(nv); onChange && onChange(nv); } }, '★')); };
  draw(value || 0);
  return el;
}
export function subtabs(tabs, active, onPick) {
  return h('div.subtabs', tabs.map(([id, label]) => h(`button.subtab${id === active ? '.active' : ''}`, { onclick: () => onPick(id) }, label)));
}
export function dropzone(el, onPaths) {
  el.classList.add('dropzone');
  el.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('drag'); } });
  el.addEventListener('dragleave', (e) => { if (e.target === el) el.classList.remove('drag'); });
  el.addEventListener('drop', (e) => {
    el.classList.remove('drag');
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    const paths = [...e.dataTransfer.files].map((f) => native.pathForFile(f)).filter(Boolean);
    if (paths.length) onPaths(paths);
  });
}
export function colorFor(s) { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; const pal = ['#59D5C3', '#7AA2F7', '#B48EAD', '#E5B567', '#98C379', '#E06C75', '#56B6C2', '#C678DD']; return pal[x % pal.length]; }
export function parseCsv(text, maxRows = 2000) {
  const rows = []; let row = []; let cur = ''; let q = false; const delim = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : text.split('\n')[0].includes(';') && !text.split('\n')[0].includes(',') ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; continue; }
    if (c === '"') q = true; else if (c === delim) { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; if (rows.length >= maxRows) break; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
