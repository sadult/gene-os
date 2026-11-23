// DNA sequence utilities (shared by the Sequence toolkit calculator and the `dna` terminal command).
// Standard genetic code, codons indexed in TCAG order: index = 16·b1 + 4·b2 + b3.
const CODE = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
const B = 'TCAG';
const COMP = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };

// Accepts raw text or FASTA; RNA U is converted to T. Returns cleaned sequence + number of removed symbols.
export function clean(raw) {
  const lines = String(raw || '').split(/\r?\n/).filter((l) => !l.trim().startsWith('>'));
  const up = lines.join('').toUpperCase().replace(/\s+/g, '').replace(/U/g, 'T');
  const seq = up.replace(/[^ACGTN]/g, '');
  return { seq, removed: up.length - seq.length };
}
export function counts(s) { const c = { A: 0, C: 0, G: 0, T: 0, N: 0 }; for (const ch of s) if (ch in c) c[ch]++; return c; }
export function gc(s) { const c = counts(s); const k = s.length - c.N; return k ? (c.G + c.C) / k : 0; }
export const revcomp = (s) => [...s].reverse().map((b) => COMP[b] || 'N').join('');
export const complement = (s) => [...s].map((b) => COMP[b] || 'N').join('');
export function translate(s, frame = 0) {
  let out = '';
  for (let i = frame; i + 3 <= s.length; i += 3) {
    const a = B.indexOf(s[i]), b = B.indexOf(s[i + 1]), c = B.indexOf(s[i + 2]);
    out += a < 0 || b < 0 || c < 0 ? 'X' : CODE[a * 16 + b * 4 + c];
  }
  return out;
}
export function tm(s) { const c = counts(s); const n = s.length; return n < 14 ? 2 * (c.A + c.T) + 4 * (c.G + c.C) : 64.9 + (41 * (c.G + c.C - 16.4)) / n; }
export function mw(s) { const c = counts(s); return s.length ? c.A * 313.21 + c.T * 304.2 + c.C * 289.18 + c.G * 329.21 - 61.96 : 0; }
export function wrap(s, w = 60) { return (String(s).match(new RegExp(`.{1,${w}}`, 'g')) || []).join('\n'); }
export function random(n, gcFrac = 0.5, rnd = Math.random) {
  let s = '';
  for (let i = 0; i < n; i++) { const g = rnd() < gcFrac; s += g ? (rnd() < 0.5 ? 'G' : 'C') : (rnd() < 0.5 ? 'A' : 'T'); }
  return s;
}
// Open reading frames (ATG … stop) on the forward strand, length ≥ minAa amino acids.
export function orfs(s, minAa = 30) {
  const out = [];
  for (let f = 0; f < 3; f++) {
    const p = translate(s, f);
    let start = -1;
    for (let i = 0; i < p.length; i++) {
      if (start < 0 && p[i] === 'M') start = i;
      else if (start >= 0 && p[i] === '*') { if (i - start >= minAa) out.push({ frame: f + 1, start: f + start * 3 + 1, end: f + i * 3 + 3, aa: i - start }); start = -1; }
    }
  }
  return out.sort((a, b) => b.aa - a.aa);
}
