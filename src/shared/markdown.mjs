// Minimal, safe Markdown renderer: all input is HTML-escaped first; only whitelisted constructs are emitted.
// Supports headings, emphasis, code (inline/fenced), lists (incl. task lists, one nesting level), tables,
// blockquotes, hr, links (http/https), images (gosfile:/data:/https:), [[wiki links]], and $math$ / $$math$$
// rendered with a light TeX-to-Unicode prettifier (not full LaTeX).

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
const SYM = { times: '×', cdot: '·', pm: '±', leq: '≤', geq: '≥', neq: '≠', approx: '≈', sum: 'Σ', prod: 'Π', sqrt: '√', infty: '∞', rightarrow: '→', leftarrow: '←', partial: '∂', in: '∈', hat: '^' };
export function prettyMath(src) {
  let s = esc(src);
  s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  s = s.replace(/\\([A-Za-z]+)/g, (m, w) => GREEK[w] || SYM[w] || m);
  s = s.replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>').replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>');
  s = s.replace(/\^([A-Za-z0-9])/g, '<sup>$1</sup>').replace(/_([A-Za-z0-9])/g, '<sub>$1</sub>');
  return s.replace(/[{}]/g, '');
}

function inline(text) {
  const store = [];
  const keep = (html) => `\u0000${store.push(html) - 1}\u0000`;
  let s = String(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  s = s.replace(/\$\$([^$]+)\$\$/g, (_, m) => keep(`<span class="math">${prettyMath(m)}</span>`));
  s = s.replace(/\$([^$\n]+)\$/g, (_, m) => keep(`<span class="math">${prettyMath(m)}</span>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => (/^(https:|gosfile:|data:image\/)/i.test(src) ? keep(`<img alt="${esc(alt)}" src="${esc(src)}">`) : keep(esc(_))));
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, t) => keep(`<a class="wikilink" data-note="${esc(t.trim())}">${esc(t.trim())}</a>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => (/^https?:\/\//i.test(u) ? keep(`<a class="ext" data-href="${esc(u)}">${esc(t)}</a>`) : keep(esc(_))));
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, u) => pre + keep(`<a class="ext" data-href="${esc(u)}">${esc(u)}</a>`));
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>').replace(/==([^=]+)==/g, '<mark>$1</mark>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => store[+i]);
}

export function render(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = []; let i = 0;
  const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if ((m = /^```\s*([\w+-]*)/.exec(l))) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; out.push(`<pre class="code"${m[1] ? ` data-lang="${esc(m[1])}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    if (/^\$\$\s*$/.test(l)) { const buf = []; i++; while (i < lines.length && !/^\$\$\s*$/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<div class="math-block">${prettyMath(buf.join('\n'))}</div>`); continue; }
    if (!l.trim()) { i++; continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { const lvl = m[1].length; out.push(`<h${lvl} id="h-${slug(m[2])}">${inline(m[2])}</h${lvl}>`); i++; continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^>\s?/.test(l)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${render(buf.join('\n'))}</blockquote>`); continue; }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d+[.)]/.test(l); const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        const raw = lines[i]; const indent = raw.match(/^\s*/)[0].length; const text = raw.replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        items.push({ indent, text }); i++;
        while (i < lines.length && lines[i].trim() && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && /^\s{2,}/.test(lines[i])) items[items.length - 1].text += ' ' + lines[i++].trim();
      }
      const base = items[0].indent; const li = (t) => { const tm = /^\[([ xX])\]\s+(.*)$/.exec(t); return tm ? `<li class="task${tm[1] !== ' ' ? ' done' : ''}"><span class="box">${tm[1] !== ' ' ? '☑' : '☐'}</span> ${inline(tm[2])}</li>` : `<li>${inline(t)}</li>`; };
      let html = ''; let sub = [];
      const flush = () => { if (sub.length) { html = html.replace(/<\/li>$/, `<ul>${sub.map((s) => li(s.text)).join('')}</ul></li>`); sub = []; } };
      for (const it of items) { if (it.indent > base + 1) sub.push(it); else { flush(); html += li(it.text); } }
      flush();
      out.push(ordered ? `<ol>${html}</ol>` : `<ul>${html}</ul>`); continue;
    }
    const buf = [l]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s+|\$\$)/.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) buf.push(lines[i++]);
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

export function slug(s) { return String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60); }
export function outline(md) {
  const res = []; let inCode = false;
  for (const l of String(md || '').split('\n')) {
    if (/^```/.test(l)) inCode = !inCode;
    const m = !inCode && /^(#{1,6})\s+(.*)$/.exec(l);
    if (m) res.push({ level: m[1].length, text: m[2].replace(/[*_`]/g, ''), id: 'h-' + slug(m[2]) });
  }
  return res;
}
export const wordCount = (s) => (String(s || '').match(/[\p{L}\p{N}]+/gu) || []).length;
export const escapeHtml = esc;
