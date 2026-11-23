// Markdown editor component used by notes, proposal sections and course notes.
import { h, clear, debounce, toast } from './ui.js';
import { settings, bus } from './state.js';
import { api } from './api.js';
import { render, outline, wordCount } from '../../shared/markdown.mjs';

export function mdEditor({ value = '', onSave, placeholder = 'Write in Markdown…  # heading, **bold**, - list, | table |, ```code```, $math$, [[Note link]]', mode = 'split', minHeight = 360, showOutline = false } = {}) {
  let saved = value, dirty = false, current = mode;
  const ta = h('textarea', { placeholder, spellcheck: 'false' }); ta.value = value;
  const preview = h('div.preview.md');
  const st = h('div.estatus');
  const outlineEl = h('div.small', { style: { maxHeight: '180px', overflow: 'auto' } });
  const modeBtns = {};
  const wrap = (before, after = before, ph = 'text') => {
    const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || ph;
    ta.setRangeText(before + sel + after, s, e, 'select'); ta.focus(); changed();
  };
  const linePrefix = (p) => { const s = ta.selectionStart; const ls = ta.value.lastIndexOf('\n', s - 1) + 1; ta.setRangeText(p, ls, ls, 'end'); ta.focus(); changed(); };
  const insert = (text) => { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.focus(); changed(); };
  const tb = h('div.etb',
    h('button', { title: 'Bold (Ctrl+B)', onclick: () => wrap('**') }, 'B'),
    h('button', { title: 'Italic (Ctrl+I)', onclick: () => wrap('*') }, 'I'),
    h('button', { title: 'Heading', onclick: () => linePrefix('## ') }, 'H'),
    h('button', { title: 'List', onclick: () => linePrefix('- ') }, '•'),
    h('button', { title: 'Task', onclick: () => linePrefix('- [ ] ') }, '☐'),
    h('button', { title: 'Quote', onclick: () => linePrefix('> ') }, '❝'),
    h('button', { title: 'Code block', onclick: () => wrap('\n```r\n', '\n```\n', 'code') }, '</>'),
    h('button', { title: 'Inline math', onclick: () => wrap('$', '$', 'h^2 = \\sigma^2_A / \\sigma^2_P') }, '∑'),
    h('button', { title: 'Table', onclick: () => insert('\n| Column | Column |\n|---|---|\n|  |  |\n') }, '▦'),
    h('button', { title: 'Link note [[ ]]', onclick: () => wrap('[[', ']]', 'Note title') }, '[[ ]]'),
    h('span.grow'),
    ...['edit', 'split', 'preview'].map((m) => (modeBtns[m] = h('button', { onclick: () => setMode(m) }, m.toUpperCase()))),
  );
  const body = h('div.ebody', ta, preview);
  const el = h('div.editor', { style: { minHeight: minHeight + 'px' } }, tb, body, st);
  const renderPreview = debounce(() => { preview.innerHTML = render(ta.value); drawOutline(); }, 140);
  const autosave = debounce(() => flush(), settings.get('behavior.autosaveMs') || 1200);
  function drawStatus() { clear(st).append(h('span', `${wordCount(ta.value)} words`), h('span', `${ta.value.length} chars`), h('span', dirty ? '● unsaved' : '✓ saved'), h('span.right', 'Ctrl+S save · Tab indent')); }
  function drawOutline() { if (!showOutline) return; clear(outlineEl); for (const o of outline(ta.value)) outlineEl.append(h('div.item.clickable', { style: { paddingLeft: (o.level - 1) * 12 + 6 + 'px', minHeight: '20px' }, onclick: () => jump(o.text) }, o.text)); if (!outlineEl.childNodes.length) outlineEl.append(h('div.dim', 'No headings')); }
  function jump(text) { const i = ta.value.indexOf(text); if (i >= 0) { ta.focus(); ta.setSelectionRange(i, i + text.length); const lines = ta.value.slice(0, i).split('\n').length; ta.scrollTop = Math.max(0, (lines - 3) * 20); } }
  function changed() { dirty = ta.value !== saved; drawStatus(); renderPreview(); if (dirty) autosave(); }
  async function flush() {
    autosave.cancel();
    if (ta.value === saved) { dirty = false; drawStatus(); return; }
    const v = ta.value;
    try { await onSave(v); saved = v; dirty = ta.value !== saved; drawStatus(); } catch (e) { toast('Save failed: ' + e.message, 'error'); }
  }
  function setMode(m) { current = m; el.classList.toggle('split', m === 'split'); el.classList.toggle('preview-only', m === 'preview'); el.classList.toggle('edit-only', m === 'edit'); Object.entries(modeBtns).forEach(([k, b]) => b.classList.toggle('on', k === m)); if (m !== 'edit') { preview.innerHTML = render(ta.value); } }
  ta.addEventListener('input', changed);
  ta.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap('**'); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap('*'); }
    else if (e.key === 'Tab') { e.preventDefault(); insert('  '); }
    else if (e.key === 'Enter') { // continue lists
      const s = ta.selectionStart; const ls = ta.value.lastIndexOf('\n', s - 1) + 1; const line = ta.value.slice(ls, s);
      const m = /^(\s*)([-*+]|\d+[.)])(\s+\[[ xX]\])?\s+/.exec(line);
      if (m) { e.preventDefault(); if (line.trim() === m[0].trim()) { ta.setRangeText('', ls, s, 'end'); changed(); return; } const n = /\d+/.test(m[2]) ? `${parseInt(m[2], 10) + 1}${m[2].slice(-1)}` : m[2]; insert(`\n${m[1]}${n}${m[3] ? ' [ ]' : ''} `); }
    }
  });
  ta.addEventListener('blur', () => flush());
  preview.addEventListener('click', (e) => {
    const a = e.target.closest('a'); if (!a) return;
    if (a.classList.contains('wikilink')) bus.emit('open-note', a.dataset.note);
    else if (a.dataset.href) api.system.openExternal(a.dataset.href);
  });
  setMode(current); drawStatus(); preview.innerHTML = render(value); drawOutline();
  return {
    el, outlineEl, flush, focus: () => ta.focus(),
    getValue: () => ta.value,
    setValue(v) { ta.value = v ?? ''; saved = ta.value; dirty = false; drawStatus(); preview.innerHTML = render(ta.value); drawOutline(); },
    isDirty: () => dirty,
    destroy() { flush(); },
  };
}

// Open (or create) a note by [[title]] from anywhere.
bus.on('open-note', async (title) => {
  const found = await api.notes.byTitle(title);
  if (found) return window.__os.nav('notes', { id: found.id });
  const n = await api.notes.create({ title, content: `# ${title}\n\n` });
  toast(`Created note “${title}”`, 'ok');
  window.__os.nav('notes', { id: n.id });
});
