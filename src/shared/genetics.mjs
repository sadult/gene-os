// Gene OS — scientific calculator definitions.
// Each calculator: { id, cat, name, inputs, compute(values) -> { results, warnings }, formula, assumptions, example }.
// Input types: number (default) | int | select | list (numbers) | text. `when: {key: value|[values]}` shows an input conditionally.
// compute() throws Error(message) on invalid input; the UI shows it.
import * as S from './stats.mjs';
import { EXTRA_CALCULATORS } from './calc_extra.mjs';

export const CATEGORIES = [
  { id: 'quant', name: 'Quantitative Genetics', icon: 'sigma', color: '#59D5C3', desc: 'Heritability, variance components, breeding values, response to selection' },
  { id: 'pop', name: 'Population Genetics', icon: 'population', color: '#7AA2F7', desc: 'Allele & genotype frequencies, HWE, Ne, inbreeding, F-statistics, distance' },
  { id: 'genomics', name: 'Genomics & Sequence', icon: 'dna', color: '#C099FF', desc: 'Mendelian crosses, LD, map distance, genomic relationships, DNA toolkit' },
  { id: 'breed', name: 'Breeding & Selection', icon: 'tree', color: '#98C379', desc: 'Selection index, BLUP, pedigree, mating plans, heterosis, crossbreeding' },
  { id: 'animal', name: 'Animal Science', icon: 'egg', color: '#E0AF68', desc: 'Growth, feed efficiency, egg & milk traits, weaning weights, gestation' },
  { id: 'stats', name: 'Statistics', icon: 'chart', color: '#FF9E64', desc: 'Descriptives, tests, ANOVA, regression, distributions, design, sample size' },
  { id: 'util', name: 'Utilities', icon: 'calc', color: '#89DDFF', desc: 'Unit conversion, dilution, scientific calculator, CSV viewer' },
];

const r = (label, value, unit = '', digits = 4) => ({ label, value, unit, digits });
const txt = (label, text) => ({ label, text });
const tbl = (label, columns, rows) => ({ label, table: { columns, rows } });
const num = (k, label, o = {}) => ({ k, label, type: 'number', ...o });
const int = (k, label, o = {}) => ({ k, label, type: 'int', ...o });
const sel = (k, label, options, o = {}) => ({ k, label, type: 'select', options, ...o });
const list = (k, label, o = {}) => ({ k, label, type: 'list', ...o });
const fail = (m) => { throw new Error(m); };
const prob = (v, name) => { if (!(v >= 0 && v <= 1)) fail(`${name} must be between 0 and 1`); return v; };
const pos = (v, name) => { if (!(v > 0)) fail(`${name} must be greater than 0`); return v; };
const nonneg = (v, name) => { if (!(v >= 0)) fail(`${name} cannot be negative`); return v; };
const h2check = (h2) => { if (!(h2 > 0 && h2 <= 1)) fail('h² must be in (0, 1]'); return h2; };
const fmtP = (p) => (p < 1e-4 ? p.toExponential(2) : p.toFixed(4));

const UNITS = {
  kg_lb: { from: 'kg', to: 'lb', f: (v) => v / 0.45359237, inv: (v) => v * 0.45359237 },
  g_oz: { from: 'g', to: 'oz', f: (v) => v / 28.349523125, inv: (v) => v * 28.349523125 },
  c_f: { from: '°C', to: '°F', f: (v) => (v * 9) / 5 + 32, inv: (v) => ((v - 32) * 5) / 9 },
  c_k: { from: '°C', to: 'K', f: (v) => v + 273.15, inv: (v) => v - 273.15 },
  cm_in: { from: 'cm', to: 'in', f: (v) => v / 2.54, inv: (v) => v * 2.54 },
  m_ft: { from: 'm', to: 'ft', f: (v) => v / 0.3048, inv: (v) => v * 0.3048 },
  l_gal: { from: 'L', to: 'US gal', f: (v) => v / 3.785411784, inv: (v) => v * 3.785411784 },
  kcal_kj: { from: 'kcal', to: 'kJ', f: (v) => v * 4.184, inv: (v) => v / 4.184 },
  mcal_mj: { from: 'Mcal', to: 'MJ', f: (v) => v * 4.184, inv: (v) => v / 4.184 },
  ha_acre: { from: 'ha', to: 'acre', f: (v) => v / 0.40468564224, inv: (v) => v * 0.40468564224 },
  ppm_pct: { from: 'ppm (mg/kg)', to: '%', f: (v) => v / 10000, inv: (v) => v * 10000 },
  gkg_pct: { from: 'g/kg', to: '%', f: (v) => v / 10, inv: (v) => v * 10 },
};
function UNIT_OPTIONS() { return Object.entries(UNITS).map(([k, u]) => [k, `${u.from} → ${u.to}`]); }

export const CALCULATORS = [
  // ───────────────────────── QUANTITATIVE GENETICS ─────────────────────────
  {
    id: 'heritability', cat: 'quant', name: 'Heritability (variance components)',
    inputs: [num('va', 'Additive genetic variance σ²A', { unit: 'unit²', min: 0 }), num('vd', 'Dominance variance σ²D', { unit: 'unit²', min: 0, optional: true }), num('vi', 'Epistatic variance σ²I', { unit: 'unit²', min: 0, optional: true }), num('ve', 'Environmental variance σ²E', { unit: 'unit²', min: 0 })],
    compute({ va, vd = 0, vi = 0, ve }) {
      [va, vd, vi, ve].forEach((v) => nonneg(v, 'Variance components'));
      const vg = va + vd + vi, vp = vg + ve; pos(vp, 'σ²P');
      return { results: [r('σ²P = σ²G + σ²E', vp, 'unit²'), r('σ²G = σ²A + σ²D + σ²I', vg, 'unit²'), r('h² (narrow sense)', va / vp), r('H² (broad sense)', vg / vp), r('e² = σ²E / σ²P', ve / vp)] };
    },
    formula: 'h² = σ²A / σ²P     H² = σ²G / σ²P     σ²P = σ²A + σ²D + σ²I + σ²E',
    assumptions: 'Components are independent (no G×E interaction or genotype–environment covariance). Estimates should come from REML/ANOVA on an appropriate design.',
    example: { va: 40, vd: 10, vi: 0, ve: 50 },
  },
  {
    id: 'h2_relatives', cat: 'quant', name: 'Heritability from resemblance between relatives',
    inputs: [sel('method', 'Design', [['po1', 'Offspring on one parent (regression b)'], ['pomp', 'Offspring on mid-parent (regression b)'], ['hs', 'Half-sib intraclass correlation t'], ['fs', 'Full-sib intraclass correlation t']]), num('v', 'Regression coefficient b or intraclass correlation t'), int('n', 'Number of families / pairs (optional, for SE)', { optional: true }), num('se', 'SE of b or t (optional)', { optional: true })],
    compute({ method, v, se }) {
      const k = { po1: 2, pomp: 1, hs: 4, fs: 2 }[method];
      const h2 = k * v; const out = [r('h²', h2)];
      if (se !== undefined) out.push(r('SE(h²)', k * se));
      const w = [];
      if (h2 < 0 || h2 > 1) w.push('Estimate outside [0,1] — check sampling error or model.');
      if (method === 'fs') w.push('Full-sib t includes ¼σ²D and common-environment (maternal) variance: 2t is an upper bound for h².');
      if (method === 'po1') w.push('Assumes equal variances in parents and offspring and no maternal effects.');
      return { results: out, warnings: w };
    },
    formula: 'h² = 2b (one parent)   h² = b (mid-parent)   h² = 4t (half-sibs)   h² ≤ 2t (full-sibs)',
    assumptions: 'Additive model, unrelated mates, no common environment for half-sibs, no epistasis.',
    example: { method: 'hs', v: 0.075 },
  },
  {
    id: 'repeatability', cat: 'quant', name: 'Repeatability & repeated records',
    inputs: [num('va', 'Additive variance σ²A', { min: 0 }), num('vpe', 'Permanent environment + non-additive σ²PE', { min: 0 }), num('vte', 'Temporary environment σ²TE', { min: 0 }), int('n', 'Records per animal (n)', { optional: true, min: 1 })],
    compute({ va, vpe, vte, n }) {
      [va, vpe, vte].forEach((v) => nonneg(v, 'Variances'));
      const vp = va + vpe + vte; pos(vp, 'σ²P');
      const t = (va + vpe) / vp, h2 = va / vp; const out = [r('σ²P', vp), r('Repeatability t', t), r('h²', h2)];
      if (n) {
        out.push(r(`h² of mean of ${n} records`, (n * h2) / (1 + (n - 1) * t)));
        out.push(r(`Var(mean of ${n}) / σ²P`, (1 + (n - 1) * t) / n));
        out.push(r('Accuracy using mean', Math.sqrt((n * h2) / (1 + (n - 1) * t))));
      }
      return { results: out };
    },
    formula: 't = (σ²A + σ²PE) / σ²P;   h²(P̄n) = n·h² / [1 + (n−1)t];   σ²(P̄n) = σ²P·[1 + (n−1)t] / n',
    assumptions: 'Repeated records are the same trait with constant variance and equal correlation between any two records.',
    example: { va: 20, vpe: 15, vte: 65, n: 3 },
  },
  {
    id: 'genetic_variance', cat: 'quant', name: 'Genetic variance',
    inputs: [sel('mode', 'From', [['h2', 'h² and σ²P'], ['ve', 'σ²P and σ²E']]), num('vp', 'Phenotypic variance σ²P', { min: 0 }), num('h2', 'Heritability h²', { when: { mode: 'h2' } }), num('ve', 'Environmental variance σ²E', { when: { mode: 've' } }), num('mu', 'Trait mean (optional, for CV)', { optional: true })],
    compute({ mode, vp, h2, ve, mu }) {
      pos(vp, 'σ²P'); const out = [];
      if (mode === 'h2') { prob(h2, 'h²'); const va = h2 * vp; out.push(r('σ²A = h²·σ²P', va), r('σA', Math.sqrt(va)), r('σ²E (residual)', vp - va)); if (mu) out.push(r('CVA', (100 * Math.sqrt(va)) / mu, '%')); }
      else { nonneg(ve, 'σ²E'); if (ve > vp) fail('σ²E cannot exceed σ²P'); const vg = vp - ve; out.push(r('σ²G = σ²P − σ²E', vg), r('σG', Math.sqrt(vg)), r('H²', vg / vp)); if (mu) out.push(r('CVG', (100 * Math.sqrt(vg)) / mu, '%')); }
      return { results: out };
    },
    formula: 'σ²A = h²·σ²P   or   σ²G = σ²P − σ²E;   CV = 100·σ / μ',
    assumptions: 'Variance components are additive and independent.',
    example: { mode: 'h2', vp: 400, h2: 0.3, mu: 250 },
  },
  {
    id: 'phenotypic_variance', cat: 'quant', name: 'Phenotypic variance',
    inputs: [sel('mode', 'From', [['comp', 'Variance components'], ['sd', 'Phenotypic SD']]), num('va', 'σ²A', { when: { mode: 'comp' }, min: 0 }), num('vd', 'σ²D', { when: { mode: 'comp' }, optional: true }), num('vi', 'σ²I', { when: { mode: 'comp' }, optional: true }), num('vpe', 'σ²PE', { when: { mode: 'comp' }, optional: true }), num('vte', 'σ²TE (residual)', { when: { mode: 'comp' }, min: 0 }), num('sdp', 'σP', { when: { mode: 'sd' } })],
    compute({ mode, va = 0, vd = 0, vi = 0, vpe = 0, vte = 0, sdp }) {
      if (mode === 'sd') { pos(sdp, 'σP'); return { results: [r('σ²P', sdp * sdp)] }; }
      [va, vd, vi, vpe, vte].forEach((v) => nonneg(v, 'Variances'));
      const vp = va + vd + vi + vpe + vte; pos(vp, 'σ²P');
      return { results: [r('σ²P', vp), r('σP', Math.sqrt(vp)), tbl('Proportions of σ²P', ['Component', 'Variance', 'Proportion'], [['A', va, va / vp], ['D', vd, vd / vp], ['I', vi, vi / vp], ['PE', vpe, vpe / vp], ['TE', vte, vte / vp]])] };
    },
    formula: 'σ²P = σ²A + σ²D + σ²I + σ²PE + σ²TE',
    assumptions: 'No covariance between genotype and environment, no G×E.',
    example: { mode: 'comp', va: 30, vd: 5, vi: 0, vpe: 10, vte: 55 },
  },
  {
    id: 'environmental_variance', cat: 'quant', name: 'Environmental variance',
    inputs: [num('vp', 'σ²P', { min: 0 }), num('vg', 'Genetic variance σ²G (or σ²A)', { min: 0 }), num('vpe', 'Permanent environment σ²PE (optional)', { optional: true })],
    compute({ vp, vg, vpe }) {
      pos(vp, 'σ²P'); nonneg(vg, 'σ²G'); if (vg > vp) fail('σ²G cannot exceed σ²P');
      const ve = vp - vg; const out = [r('σ²E = σ²P − σ²G', ve), r('e² = σ²E / σ²P', ve / vp)];
      if (vpe !== undefined) { if (vpe > ve) fail('σ²PE cannot exceed σ²E'); out.push(r('σ²TE = σ²E − σ²PE', ve - vpe), r('c² (permanent env. ratio)', vpe / vp)); }
      return { results: out };
    },
    formula: 'σ²E = σ²P − σ²G;   σ²E = σ²PE + σ²TE',
    assumptions: 'σ²G here is whatever genetic component you subtract (additive only gives the residual including non-additive).',
    example: { vp: 100, vg: 35, vpe: 15 },
  },
  {
    id: 'genetic_correlation', cat: 'quant', name: 'Genetic correlation',
    inputs: [num('cov', 'Additive genetic covariance covA(x,y)'), num('vx', 'σ²A of trait x', { min: 0 }), num('vy', 'σ²A of trait y', { min: 0 })],
    compute({ cov, vx, vy }) {
      pos(vx, 'σ²Ax'); pos(vy, 'σ²Ay'); const rg = cov / Math.sqrt(vx * vy);
      return { results: [r('rG', rg)], warnings: Math.abs(rg) > 1 ? ['|rG| > 1: the covariance matrix is not positive definite — re-check estimates.'] : [] };
    },
    formula: 'rG = covA(x,y) / (σAx · σAy)',
    assumptions: 'Components estimated jointly (e.g. bivariate REML).',
    example: { cov: 12, vx: 40, vy: 25 },
  },
  {
    id: 'phenotypic_correlation', cat: 'quant', name: 'Phenotypic correlation',
    inputs: [sel('mode', 'From', [['cov', 'Phenotypic covariance'], ['comp', 'rG, rE and heritabilities']]), num('cov', 'covP(x,y)', { when: { mode: 'cov' } }), num('vx', 'σ²P of x', { when: { mode: 'cov' } }), num('vy', 'σ²P of y', { when: { mode: 'cov' } }), num('rg', 'rG', { when: { mode: 'comp' } }), num('re', 'rE', { when: { mode: 'comp' } }), num('h2x', 'h²x', { when: { mode: 'comp' } }), num('h2y', 'h²y', { when: { mode: 'comp' } })],
    compute({ mode, cov, vx, vy, rg, re, h2x, h2y }) {
      if (mode === 'cov') { pos(vx, 'σ²Px'); pos(vy, 'σ²Py'); return { results: [r('rP', cov / Math.sqrt(vx * vy))] }; }
      prob(h2x, 'h²x'); prob(h2y, 'h²y');
      const rp = rg * Math.sqrt(h2x * h2y) + re * Math.sqrt((1 - h2x) * (1 - h2y));
      return { results: [r('rP', rp), r('Genetic part rG·hx·hy', rg * Math.sqrt(h2x * h2y)), r('Environmental part rE·ex·ey', re * Math.sqrt((1 - h2x) * (1 - h2y)))] };
    },
    formula: 'rP = covP / (σPx σPy) = rG·hx·hy + rE·ex·ey,  e = √(1 − h²)',
    assumptions: 'Environmental correlation rE includes all non-additive sources.',
    example: { mode: 'comp', rg: 0.6, re: 0.2, h2x: 0.3, h2y: 0.4 },
  },
  {
    id: 'bv_own', cat: 'quant', name: 'Breeding value — own performance',
    inputs: [num('mu', 'Population (contemporary) mean μ'), num('pbar', 'Mean of the animal’s records P̄'), int('n', 'Number of records n', { min: 1 }), num('h2', 'h²'), num('t', 'Repeatability t', { when_n: true, optional: true })],
    compute({ mu, pbar, n, h2, t }) {
      h2check(h2); if (n < 1) fail('n ≥ 1');
      if (n > 1 && t === undefined) fail('Repeatability is required when n > 1');
      const tt = n > 1 ? prob(t, 't') : h2; if (n > 1 && tt < h2) fail('Repeatability cannot be smaller than h²');
      const b = (n * h2) / (1 + (n - 1) * tt), ebv = b * (pbar - mu);
      return { results: [r('Regression b', b), r('EBV = b(P̄ − μ)', ebv), r('PTA (= EBV/2)', ebv / 2), r('Accuracy rIA', Math.sqrt(b)), r('Reliability r²', b)] };
    },
    formula: 'EBV = b·(P̄ − μ),  b = n·h² / [1 + (n−1)t],  accuracy = √b',
    assumptions: 'Selection index on own records only, known μ, records corrected for fixed effects.',
    example: { mu: 6000, pbar: 6800, n: 3, h2: 0.25, t: 0.5 },
  },
  {
    id: 'bv_progeny', cat: 'quant', name: 'Breeding value — progeny test',
    inputs: [int('n', 'Number of progeny n', { min: 1 }), num('h2', 'h²'), num('dev', 'Progeny mean deviation from contemporaries')],
    compute({ n, h2, dev }) {
      h2check(h2); const k = (4 - h2) / h2, b = (2 * n) / (n + k);
      return { results: [r('k = (4 − h²)/h²', k), r('b = 2n/(n + k)', b), r('EBV', b * dev), r('PTA', (b * dev) / 2), r('Accuracy √(n/(n+k))', Math.sqrt(n / (n + k)))] };
    },
    formula: 'EBV = 2n/(n+k) · (P̄prog − μ),  k = (4 − h²)/h²,  accuracy = √(n/(n+k))',
    assumptions: 'Progeny are paternal half-sibs from unrelated, randomly chosen mates; single record per progeny.',
    example: { n: 50, h2: 0.25, dev: 120 },
  },
  {
    id: 'sel_diff', cat: 'quant', name: 'Selection differential',
    inputs: [num('mu', 'Population mean μ'), num('mus', 'Mean of selected parents μs'), num('sdp', 'Phenotypic SD σP')],
    compute({ mu, mus, sdp }) { pos(sdp, 'σP'); const s = mus - mu; return { results: [r('S = μs − μ', s), r('Standardized i = S/σP', s / sdp)] }; },
    formula: 'S = μs − μ;  i = S / σP',
    assumptions: 'Phenotypic selection on the trait itself.',
    example: { mu: 2.4, mus: 2.9, sdp: 0.35 },
  },
  {
    id: 'response', cat: 'quant', name: 'Response to selection (breeder’s equation)',
    inputs: [sel('mode', 'Inputs', [['s', 'Selection differential S'], ['i', 'Intensity i and σP']]), num('h2', 'h²'), num('s', 'S', { when: { mode: 's' } }), num('i', 'Selection intensity i', { when: { mode: 'i' } }), num('sdp', 'σP', { when: { mode: 'i' } }), num('L', 'Generation interval L (years, optional)', { optional: true }), num('mu', 'Current mean (optional)', { optional: true })],
    compute({ mode, h2, s, i, sdp, L, mu }) {
      prob(h2, 'h²'); const R = mode === 's' ? h2 * s : (pos(sdp, 'σP'), i * h2 * sdp);
      const out = [r('R per generation', R)];
      if (L) out.push(r('R per year = R / L', R / pos(L, 'L')));
      if (mu !== undefined) out.push(r('Expected mean of offspring', mu + R));
      if (mode === 'i') out.push(r('Equivalent S = i·σP', i * sdp));
      return { results: out };
    },
    formula: 'R = h²·S = i·h²·σP = i·h·σA;   ΔG/yr = R / L',
    assumptions: 'Normal trait, truncation selection, additive inheritance, no change in variance from selection (Bulmer effect ignored).',
    example: { mode: 'i', h2: 0.3, i: 1.4, sdp: 12, L: 2.5 },
  },
  {
    id: 'intensity', cat: 'quant', name: 'Selection intensity helper',
    inputs: [num('p', 'Proportion selected p (0–1)'), int('N', 'Candidates N (optional, finite-population correction)', { optional: true })],
    compute({ p, N }) {
      if (!(p > 0 && p < 1)) fail('p must be between 0 and 1 (exclusive)');
      const { x, i } = S.selectionIntensity(p); const out = [r('Truncation point x (SD units)', x), r('i (infinite population)', i)];
      if (N) { if (N < 2) fail('N must be ≥ 2'); out.push(r(`i (N = ${N}, Burrows approx.)`, i - (1 - p) / (2 * p * (N + 1) * i)), r('Number selected', Math.round(p * N), '', 0)); }
      return { results: out };
    },
    formula: 'i = φ(x) / p,  where x = Φ⁻¹(1 − p);  finite N: i ≈ i∞ − (1 − p) / [2p(N + 1)i∞]  (Burrows, 1972)',
    assumptions: 'Normally distributed selection criterion; truncation selection.',
    example: { p: 0.1, N: 100 },
  },
  {
    id: 'gen_interval', cat: 'quant', name: 'Generation interval',
    inputs: [list('sire', 'Sire ages at birth of selected offspring (years)'), list('dam', 'Dam ages at birth of selected offspring (years)')],
    compute({ sire, dam }) {
      if (!sire.length || !dam.length) fail('Enter at least one age for each path');
      const lm = S.mean(sire), lf = S.mean(dam);
      return { results: [r('Lm (sire path)', lm, 'yr'), r('Lf (dam path)', lf, 'yr'), r('L = (Lm + Lf)/2', (lm + lf) / 2, 'yr'), r('Offspring records (sire / dam)', sire.length, '', 0)] };
    },
    formula: 'L = (Lm + Lf) / 2;  each path = mean age of parents when their replacement offspring are born',
    assumptions: 'Ages refer to the birth of offspring that are themselves kept for breeding.',
    example: { sire: '2.1, 2.3, 2.0, 3.1', dam: '3.5, 4.2, 2.8, 5.0, 3.9' },
  },
  {
    id: 'accuracy', cat: 'quant', name: 'Accuracy of selection',
    inputs: [sel('src', 'Information source', [['own', 'Own records'], ['prog', 'Progeny (half-sibs of each other)'], ['hs', 'Half-sib family mean'], ['pa', 'Parent average']]), num('h2', 'h²', { when: { src: ['own', 'prog', 'hs'] } }), int('n', 'Number of records / relatives n', { when: { src: ['own', 'prog', 'hs'] } }), num('t', 'Repeatability t', { when: { src: 'own' }, optional: true }), num('rs', 'Sire EBV accuracy', { when: { src: 'pa' } }), num('rd', 'Dam EBV accuracy', { when: { src: 'pa' } })],
    compute({ src, h2, n, t, rs, rd }) {
      let acc;
      if (src === 'pa') { prob(rs, 'Sire accuracy'); prob(rd, 'Dam accuracy'); acc = 0.5 * Math.sqrt(rs * rs + rd * rd); }
      else {
        h2check(h2); if (!(n >= 1)) fail('n ≥ 1');
        if (src === 'own') { const tt = n > 1 ? (t === undefined ? fail('Repeatability required when n > 1') : t) : h2; acc = Math.sqrt((n * h2) / (1 + (n - 1) * tt)); }
        else if (src === 'prog') acc = Math.sqrt((n * h2) / (4 + (n - 1) * h2));
        else acc = 0.25 * Math.sqrt((n * h2) / (1 + ((n - 1) * h2) / 4));
      }
      return { results: [r('Accuracy rIA', acc), r('Reliability r²', acc * acc)] };
    },
    formula: 'own: √(n h²/[1+(n−1)t])   progeny: √(n h²/[4+(n−1)h²])   half-sibs: ¼√(n h²/[1+(n−1)h²/4])   PA: ½√(rs²+rd²)',
    assumptions: 'Unrelated mates, no inbreeding, no common environment among relatives.',
    example: { src: 'prog', h2: 0.3, n: 40 },
  },
  {
    id: 'genetic_gain', cat: 'quant', name: 'Annual genetic gain (incl. four-path)',
    inputs: [sel('mode', 'Model', [['simple', 'Single path: i·r·σA / L'], ['four', 'Four paths (Rendel & Robertson)']]), num('sa', 'σA'),
      num('i', 'Intensity i', { when: { mode: 'simple' } }), num('r', 'Accuracy r', { when: { mode: 'simple' } }), num('L', 'Generation interval L (yr)', { when: { mode: 'simple' } }),
      ...['SS', 'SD', 'DS', 'DD'].flatMap((p) => [num('i' + p, `i ${p}`, { when: { mode: 'four' } }), num('r' + p, `r ${p}`, { when: { mode: 'four' } }), num('L' + p, `L ${p} (yr)`, { when: { mode: 'four' } })])],
    compute(v) {
      pos(v.sa, 'σA');
      if (v.mode === 'simple') { pos(v.L, 'L'); return { results: [r('ΔG per generation', v.i * v.r * v.sa), r('ΔG per year', (v.i * v.r * v.sa) / v.L), r('ΔG per year (% of σA)', (100 * v.i * v.r) / v.L, '%')] }; }
      const P = ['SS', 'SD', 'DS', 'DD']; const numr = P.reduce((s, p) => s + v['i' + p] * v['r' + p], 0); const den = P.reduce((s, p) => s + v['L' + p], 0); pos(den, 'Sum of L');
      return { results: [r('ΔG per year', (numr * v.sa) / den), tbl('Path contributions', ['Path', 'i·r', 'L'], P.map((p) => [p, v['i' + p] * v['r' + p], v['L' + p]]))] };
    },
    formula: 'ΔG/yr = (iSS rSS + iSD rSD + iDS rDS + iDD rDD) σA / (LSS + LSD + LDS + LDD)',
    assumptions: 'Steady state; paths: sires-of-sires, sires-of-dams, dams-of-sires, dams-of-dams.',
    example: { mode: 'four', sa: 500, iSS: 2.6, rSS: 0.9, LSS: 6.5, iSD: 2.0, rSD: 0.8, LSD: 7, iDS: 2.0, rDS: 0.6, LDS: 5, iDD: 0.4, rDD: 0.5, LDD: 5.5 },
  },
  {
    id: 'correlated_response', cat: 'quant', name: 'Correlated response',
    inputs: [num('i', 'Intensity i (selection on x)'), num('h2x', 'h²x'), num('h2y', 'h²y'), num('rg', 'rG(x,y)'), num('sdy', 'σP of y')],
    compute({ i, h2x, h2y, rg, sdy }) {
      prob(h2x, 'h²x'); prob(h2y, 'h²y'); pos(sdy, 'σPy');
      const cr = i * Math.sqrt(h2x * h2y) * rg * sdy, direct = i * h2y * sdy;
      return { results: [r('CRy = i·hx·hy·rG·σPy', cr), r('Direct response Ry (same i)', direct), r('Relative efficiency CRy/Ry = rG·hx/hy', h2y ? (rg * Math.sqrt(h2x)) / Math.sqrt(h2y) : NaN)] };
    },
    formula: 'CRy = i · hx · hy · rG · σPy',
    assumptions: 'Linear genetic relationship, same selection intensity for comparison.',
    example: { i: 1.76, h2x: 0.4, h2y: 0.2, rg: 0.5, sdy: 8 },
  },

  // ───────────────────────── POPULATION GENETICS ─────────────────────────
  {
    id: 'allele_freq', cat: 'pop', name: 'Allele frequency (bi-allelic)',
    inputs: [int('AA', 'Count AA', { min: 0 }), int('Aa', 'Count Aa', { min: 0 }), int('aa', 'Count aa', { min: 0 })],
    compute({ AA, Aa, aa }) {
      [AA, Aa, aa].forEach((v) => nonneg(v, 'Counts')); const N = AA + Aa + aa; pos(N, 'Total N');
      const p = (2 * AA + Aa) / (2 * N), q = 1 - p;
      return { results: [r('N individuals', N, '', 0), r('p = f(A)', p), r('q = f(a)', q), r('SE(p) = √(pq/2N)', Math.sqrt((p * q) / (2 * N))), r('MAF', Math.min(p, q)), tbl('Observed genotype frequencies', ['Genotype', 'Count', 'Frequency'], [['AA', AA, AA / N], ['Aa', Aa, Aa / N], ['aa', aa, aa / N]])] };
    },
    formula: 'p = (2·nAA + nAa) / 2N;   SE = √(pq / 2N)',
    assumptions: 'Diploid, autosomal, bi-allelic locus; genotypes called without error.',
    example: { AA: 64, Aa: 32, aa: 4 },
  },
  {
    id: 'genotype_freq', cat: 'pop', name: 'Expected genotype frequencies (HWE)',
    inputs: [sel('mode', 'From', [['p', 'Allele frequency p'], ['rec', 'Frequency of recessive phenotype (q²)']]), num('p', 'p', { when: { mode: 'p' } }), num('q2', 'Recessive phenotype frequency', { when: { mode: 'rec' } }), int('N', 'Population size N (optional)', { optional: true })],
    compute({ mode, p, q2, N }) {
      let q; if (mode === 'p') { prob(p, 'p'); q = 1 - p; } else { prob(q2, 'q²'); q = Math.sqrt(q2); p = 1 - q; }
      const f = [p * p, 2 * p * q, q * q];
      const rows = [['AA', f[0]], ['Aa', f[1]], ['aa', f[2]]].map(([g, x]) => (N ? [g, x, x * N] : [g, x]));
      return { results: [r('p', p), r('q', q), tbl('Expected genotypes', N ? ['Genotype', 'Frequency', 'Count'] : ['Genotype', 'Frequency'], rows), r('Carriers among dominant phenotypes 2pq/(1−q²)', f[1] / (1 - f[2]))] };
    },
    formula: 'f(AA) = p², f(Aa) = 2pq, f(aa) = q²',
    assumptions: 'Random mating, large population, no selection, mutation or migration.',
    example: { mode: 'rec', q2: 0.01, N: 1000 },
  },
  {
    id: 'hwe', cat: 'pop', name: 'Hardy–Weinberg equilibrium test',
    inputs: [int('AA', 'Observed AA', { min: 0 }), int('Aa', 'Observed Aa', { min: 0 }), int('aa', 'Observed aa', { min: 0 })],
    compute({ AA, Aa, aa }) {
      const N = AA + Aa + aa; pos(N, 'N');
      const p = (2 * AA + Aa) / (2 * N), q = 1 - p; const E = [p * p * N, 2 * p * q * N, q * q * N]; const O = [AA, Aa, aa];
      if (p === 0 || q === 0) fail('Locus is monomorphic — HWE test not applicable');
      const chi = O.reduce((s, o, i) => s + (o - E[i]) ** 2 / E[i], 0); const pchi = 1 - S.chi2Cdf(chi, 1);
      const pexact = hweExact(Aa, AA, aa); const He = 2 * p * q, Ho = Aa / N;
      const w = E.some((e) => e < 5) ? ['Some expected counts < 5: rely on the exact test.'] : [];
      return { results: [r('p', p), r('q', q), tbl('Observed vs expected', ['Genotype', 'Observed', 'Expected'], [['AA', AA, E[0]], ['Aa', Aa, E[1]], ['aa', aa, E[2]]]), r('χ² (1 df)', chi), txt('P (χ²)', fmtP(pchi)), txt('P (exact, Wigginton 2005)', fmtP(pexact)), r('Ho', Ho), r('He', He), r('F = 1 − Ho/He', 1 - Ho / He)], warnings: w };
    },
    formula: 'χ² = Σ (O − E)² / E with 1 df;  exact test enumerates heterozygote counts given allele counts',
    assumptions: 'Bi-allelic autosomal locus; sample of unrelated individuals.',
    example: { AA: 298, Aa: 489, aa: 213 },
  },
  {
    id: 'heterozygosity', cat: 'pop', name: 'Heterozygosity & F_IS',
    inputs: [list('freqs', 'Allele frequencies (or allele counts) at one locus'), int('N', 'Individuals sampled N (optional)', { optional: true }), int('hets', 'Observed heterozygotes (optional)', { optional: true })],
    compute({ freqs, N, hets }) {
      if (freqs.length < 2) fail('Enter at least two alleles'); freqs.forEach((f) => nonneg(f, 'Frequencies'));
      const tot = S.sum(freqs); const p = freqs.map((f) => f / tot); const sp2 = S.sum(p.map((x) => x * x)); const He = 1 - sp2;
      const out = [r('Expected heterozygosity He = 1 − Σp²', He)];
      const w = Math.abs(tot - 1) > 1e-6 && tot <= 1.5 ? ['Frequencies did not sum to 1 — normalized.'] : [];
      if (N) { const Hu = ((2 * N) / (2 * N - 1)) * He; out.push(r('Unbiased He (Nei 1978)', Hu)); if (hets !== undefined) { const Ho = hets / N; out.push(r('Ho', Ho), r('FIS = 1 − Ho/He', 1 - Ho / Hu)); } }
      return { results: out, warnings: w };
    },
    formula: 'He = 1 − Σ pᵢ²;  Ĥe = 2N/(2N−1)·He;  FIS = 1 − Ho / He',
    assumptions: 'Single locus; frequencies estimated from a random sample.',
    example: { freqs: '0.5, 0.3, 0.2', N: 50, hets: 28 },
  },
  {
    id: 'ne', cat: 'pop', name: 'Effective population size',
    inputs: [sel('mode', 'Method', [['sex', 'Unequal sex ratio'], ['harm', 'Fluctuating size (harmonic mean)'], ['df', 'From rate of inbreeding ΔF'], ['vk', 'Variance in family size']]), int('nm', 'Breeding males Nm', { when: { mode: 'sex' } }), int('nf', 'Breeding females Nf', { when: { mode: 'sex' } }), list('sizes', 'Census sizes per generation', { when: { mode: 'harm' } }), num('dF', 'ΔF per generation', { when: { mode: 'df' } }), int('N', 'Census N (constant)', { when: { mode: 'vk' } }), num('vk', 'Variance of family size Vk', { when: { mode: 'vk' } })],
    compute({ mode, nm, nf, sizes, dF, N, vk }) {
      let ne;
      if (mode === 'sex') { pos(nm, 'Nm'); pos(nf, 'Nf'); ne = (4 * nm * nf) / (nm + nf); }
      else if (mode === 'harm') { if (!sizes.length) fail('Enter sizes'); sizes.forEach((x) => pos(x, 'Sizes')); ne = sizes.length / S.sum(sizes.map((x) => 1 / x)); }
      else if (mode === 'df') { pos(dF, 'ΔF'); ne = 1 / (2 * dF); }
      else { pos(N, 'N'); nonneg(vk, 'Vk'); ne = (4 * N - 2) / (vk + 2); }
      return { results: [r('Ne', ne, '', 2), r('ΔF = 1/(2Ne)', 1 / (2 * ne), '', 5), r('F after 10 generations', 1 - (1 - 1 / (2 * ne)) ** 10)] , warnings: ne < 50 ? ['Ne < 50: short-term inbreeding risk (FAO guideline minimum ≈ 50).'] : [] };
    },
    formula: 'Ne = 4NmNf/(Nm+Nf);  1/Ne = (1/t)Σ1/Nᵢ;  Ne = 1/(2ΔF);  Ne = (4N − 2)/(Vk + 2)',
    assumptions: 'Ideal-population approximations; discrete generations.',
    example: { mode: 'sex', nm: 10, nf: 200 },
  },
  {
    id: 'inbreeding_path', cat: 'pop', name: 'Inbreeding coefficient (path method)',
    inputs: [{ k: 'paths', label: 'One path per line: n1 n2 FA  (n1 = generations sire→CA, n2 = dam→CA, FA = inbreeding of common ancestor)', type: 'text', rows: 5 }],
    compute({ paths }) {
      const rows = String(paths).split(/\n+/).map((l) => S.normalizeDigits(l).trim()).filter(Boolean).map((l) => l.split(/[\s,;]+/).map(Number));
      if (!rows.length) fail('Enter at least one path');
      const contrib = rows.map((p, i) => { const [n1, n2, fa = 0] = p; if (![n1, n2].every((v) => Number.isInteger(v) && v >= 0)) fail(`Path ${i + 1}: n1 and n2 must be non-negative integers`); return [i + 1, n1, n2, fa, 0.5 ** (n1 + n2 + 1) * (1 + fa)]; });
      return { results: [r('F', S.sum(contrib.map((c) => c[4]))), tbl('Path contributions', ['Path', 'n1', 'n2', 'FA', '(½)^(n1+n2+1)(1+FA)'], contrib)] };
    },
    formula: 'F_X = Σ (½)^(n1 + n2 + 1) · (1 + F_A)',
    assumptions: 'All independent paths through each common ancestor must be listed. Use the Pedigree workspace to compute F directly from a pedigree.',
    example: { paths: '1 1 0\n1 1 0' },
  },
  {
    id: 'inbreeding_time', cat: 'pop', name: 'Inbreeding accumulation over generations',
    inputs: [num('ne', 'Effective size Ne'), int('t', 'Generations t', { min: 1 }), num('f0', 'Initial F0', { optional: true })],
    compute({ ne, t, f0 = 0 }) {
      pos(ne, 'Ne'); prob(f0, 'F0'); const dF = 1 / (2 * ne); const ft = 1 - (1 - f0) * (1 - dF) ** t;
      const rows = []; for (let g = 0; g <= t; g += Math.max(1, Math.round(t / 10))) rows.push([g, 1 - (1 - f0) * (1 - dF) ** g]);
      return { results: [r('ΔF', dF, '', 5), r(`F after ${t} generations`, ft), r('Heterozygosity retained', 1 - ft), tbl('Trajectory', ['Generation', 'F'], rows)] };
    },
    formula: 'F_t = 1 − (1 − F₀)(1 − 1/2Ne)^t',
    assumptions: 'Constant Ne, no selection or migration.',
    example: { ne: 50, t: 20, f0: 0 },
  },
  {
    id: 'relationship', cat: 'pop', name: 'Relationship coefficient (path method)',
    inputs: [{ k: 'paths', label: 'One path per line: n FA  (n = number of segregations between X and Y through ancestor A)', type: 'text', rows: 5 }, num('fx', 'F of X', { optional: true }), num('fy', 'F of Y', { optional: true })],
    compute({ paths, fx = 0, fy = 0 }) {
      const rows = String(paths).split(/\n+/).map((l) => S.normalizeDigits(l).trim()).filter(Boolean).map((l) => l.split(/[\s,;]+/).map(Number));
      if (!rows.length) fail('Enter at least one path');
      const a = S.sum(rows.map(([n, fa = 0], i) => { if (!Number.isInteger(n) || n < 1) fail(`Path ${i + 1}: n must be a positive integer`); return 0.5 ** n * (1 + fa); }));
      return { results: [r('Additive relationship a_XY', a), r('Coancestry f_XY = a/2', a / 2), r("Wright's R_XY", a / Math.sqrt((1 + fx) * (1 + fy))), r('Expected F of their progeny', a / 2)] };
    },
    formula: 'a_XY = Σ (½)^n (1 + F_A);   R_XY = a_XY / √[(1 + F_X)(1 + F_Y)]',
    assumptions: 'All paths listed. Full sibs: two paths "2 0". Half sibs: one path "2 0".',
    example: { paths: '2 0\n2 0', fx: 0, fy: 0 },
  },
  {
    id: 'diversity', cat: 'pop', name: 'Population diversity indices',
    inputs: [list('freqs', 'Allele frequencies at a locus (or counts)')],
    compute({ freqs }) {
      if (freqs.length < 2) fail('Enter at least two alleles');
      const tot = S.sum(freqs); const p = freqs.map((f) => f / tot); const sp2 = S.sum(p.map((x) => x * x));
      let pic = 1 - sp2; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) pic -= 2 * p[i] ** 2 * p[j] ** 2;
      return { results: [r('Number of alleles k', p.length, '', 0), r('Effective number of alleles ne = 1/Σp²', 1 / sp2), r('He', 1 - sp2), r('PIC (Botstein 1980)', pic), r("Shannon index H'", -S.sum(p.filter((x) => x > 0).map((x) => x * Math.log(x))))] };
    },
    formula: 'ne = 1/Σpᵢ²;  PIC = 1 − Σpᵢ² − ΣΣ_{i<j} 2pᵢ²pⱼ²;  H\' = −Σ pᵢ ln pᵢ',
    assumptions: 'Single locus; average across loci for multi-locus summaries.',
    example: { freqs: '0.4, 0.3, 0.2, 0.1' },
  },

  // ───────────────────────── ANIMAL SCIENCE ─────────────────────────
  {
    id: 'adg', cat: 'animal', name: 'Average daily gain',
    inputs: [num('w1', 'Initial weight', { unit: 'kg' }), num('w2', 'Final weight', { unit: 'kg' }), num('days', 'Days on test', { unit: 'd' })],
    compute({ w1, w2, days }) { pos(days, 'Days'); const adg = (w2 - w1) / days; return { results: [r('Total gain', w2 - w1, 'kg'), r('ADG', adg, 'kg/d'), r('ADG', adg * 1000, 'g/d', 1)] }; },
    formula: 'ADG = (W₂ − W₁) / days',
    assumptions: 'Weights recorded under comparable conditions (e.g. same fasting time).',
    example: { w1: 0.042, w2: 2.45, days: 35 },
  },
  {
    id: 'fcr', cat: 'animal', name: 'Feed conversion & feed efficiency',
    inputs: [num('feed', 'Feed consumed', { unit: 'kg' }), num('gain', 'Weight gain', { unit: 'kg' })],
    compute({ feed, gain }) { pos(feed, 'Feed'); pos(gain, 'Gain'); return { results: [r('FCR = feed / gain', feed / gain, 'kg/kg'), r('Feed efficiency = gain / feed', gain / feed, 'kg/kg')] }; },
    formula: 'FCR = feed intake / weight gain;  FE = 1 / FCR',
    assumptions: 'Feed corrected for wastage if possible. Residual feed intake requires a regression on a cohort (not computed here).',
    example: { feed: 3.9, gain: 2.4 },
  },
  {
    id: 'epef', cat: 'animal', name: 'European Production Efficiency Factor (broilers)',
    inputs: [num('liv', 'Livability', { unit: '%' }), num('lw', 'Mean live weight', { unit: 'kg' }), num('age', 'Age at slaughter', { unit: 'd' }), num('fcr', 'FCR')],
    compute({ liv, lw, age, fcr }) { pos(age, 'Age'); pos(fcr, 'FCR'); return { results: [r('EPEF', (liv * lw * 100) / (age * fcr), '', 1)] }; },
    formula: 'EPEF = (livability % × live weight kg × 100) / (age d × FCR)',
    assumptions: 'Standard broiler industry index; > 400 is generally considered very good.',
    example: { liv: 96, lw: 2.5, age: 38, fcr: 1.6 },
  },
  {
    id: 'egg_production', cat: 'animal', name: 'Egg production analysis',
    inputs: [int('eggs', 'Total eggs produced'), int('days', 'Days in period'), num('hens', 'Average hens alive (hen-days / days)'), int('housed', 'Hens housed at start', { optional: true }), num('ew', 'Mean egg weight', { unit: 'g', optional: true }), num('feed', 'Feed consumed in period', { unit: 'kg', optional: true })],
    compute({ eggs, days, hens, housed, ew, feed }) {
      pos(days, 'Days'); pos(hens, 'Hens'); const hd = (eggs / (hens * days)) * 100; const out = [r('Hen-day production', hd, '%', 2)];
      if (housed) out.push(r('Hen-housed production', (eggs / (housed * days)) * 100, '%', 2), r('Eggs per hen housed', eggs / housed, '', 1));
      if (ew) { const mass = (hd / 100) * ew; out.push(r('Egg mass', mass, 'g/hen/d', 2)); if (feed) out.push(r('Feed per kg egg mass', feed / ((eggs * ew) / 1000), 'kg/kg'), r('Feed per dozen eggs', (feed / eggs) * 12, 'kg')); }
      if (feed) out.push(r('Feed intake', (feed * 1000) / (hens * days), 'g/hen/d', 1));
      return { results: out };
    },
    formula: 'HD% = eggs / (hens alive × days) × 100;  HH% = eggs / (hens housed × days) × 100;  egg mass = HD%/100 × egg weight',
    assumptions: 'Average hens alive = total hen-days / days.',
    example: { eggs: 25200, days: 30, hens: 920, housed: 1000, ew: 61.5, feed: 3200 },
  },
  {
    id: 'haugh', cat: 'animal', name: 'Haugh unit',
    inputs: [num('h', 'Thick albumen height', { unit: 'mm' }), num('w', 'Egg weight', { unit: 'g' })],
    compute({ h, w }) {
      pos(h, 'Albumen height'); pos(w, 'Egg weight'); const arg = h - 1.7 * w ** 0.37 + 7.57; if (arg <= 0) fail('Inputs give a non-positive log argument');
      const hu = 100 * Math.log10(arg); const grade = hu >= 72 ? 'AA' : hu >= 60 ? 'A' : 'B';
      return { results: [r('Haugh unit', hu, 'HU', 2), txt('USDA grade (approx.)', grade)] };
    },
    formula: 'HU = 100 · log₁₀(H − 1.7·W^0.37 + 7.57)',
    assumptions: 'H measured with a tripod micrometer on fresh eggs; USDA: AA ≥ 72, A 60–72, B < 60.',
    example: { h: 7.2, w: 62 },
  },
  {
    id: 'egg_quality', cat: 'animal', name: 'Egg quality indices',
    inputs: [num('len', 'Egg length', { unit: 'mm', optional: true }), num('wid', 'Egg width', { unit: 'mm', optional: true }), num('yh', 'Yolk height', { unit: 'mm', optional: true }), num('yd', 'Yolk diameter', { unit: 'mm', optional: true }), num('ah', 'Albumen height', { unit: 'mm', optional: true }), num('ad', 'Mean albumen diameter', { unit: 'mm', optional: true }), num('sw', 'Shell weight', { unit: 'g', optional: true }), num('ew', 'Egg weight', { unit: 'g', optional: true }), num('yw', 'Yolk weight', { unit: 'g', optional: true })],
    compute(v) {
      const out = [];
      if (v.len && v.wid) out.push(r('Shape index = W/L × 100', (v.wid / v.len) * 100, '%', 2));
      if (v.yh && v.yd) out.push(r('Yolk index = YH/YD', v.yh / v.yd));
      if (v.ah && v.ad) out.push(r('Albumen index = AH/AD', v.ah / v.ad));
      if (v.sw && v.ew) out.push(r('Shell percentage', (v.sw / v.ew) * 100, '%', 2));
      if (v.yw && v.ew) out.push(r('Yolk percentage', (v.yw / v.ew) * 100, '%', 2));
      if (v.yw && v.ew && v.sw) out.push(r('Albumen percentage', ((v.ew - v.yw - v.sw) / v.ew) * 100, '%', 2), r('Yolk : albumen ratio', v.yw / (v.ew - v.yw - v.sw)));
      if (!out.length) fail('Enter at least one matching pair of measurements');
      return { results: out };
    },
    formula: 'Shape index = width/length·100;  yolk index = height/diameter;  shell % = shell/egg·100',
    assumptions: 'Measurements on the same egg; albumen weight = egg − yolk − shell.',
    example: { len: 57, wid: 43, yh: 18, yd: 41, ah: 7, ad: 75, sw: 6.1, ew: 61, yw: 16 },
  },
  {
    id: 'growth_rate', cat: 'animal', name: 'Growth rate indices',
    inputs: [num('w1', 'Weight W₁'), num('w2', 'Weight W₂'), num('t1', 'Age t₁', { unit: 'd' }), num('t2', 'Age t₂', { unit: 'd' })],
    compute({ w1, w2, t1, t2 }) {
      pos(w1, 'W₁'); pos(w2, 'W₂'); if (!(t2 > t1)) fail('t₂ must be greater than t₁'); const dt = t2 - t1;
      return { results: [r('Absolute growth rate', (w2 - w1) / dt, 'unit/d'), r('Relative growth', ((w2 - w1) / w1) * 100, '%', 2), r('Specific growth rate', (100 * (Math.log(w2) - Math.log(w1))) / dt, '%/d'), r('Brody relative growth rate', ((w2 - w1) / ((w1 + w2) / 2)) * 100, '%', 2)] };
    },
    formula: 'AGR = ΔW/Δt;  SGR = 100(lnW₂ − lnW₁)/Δt;  Brody RGR = 100(W₂ − W₁)/[(W₁ + W₂)/2]',
    assumptions: 'Weights in the same unit; fitting nonlinear growth curves (Gompertz, Richards) needs R/SAS.',
    example: { w1: 0.18, w2: 1.2, t1: 7, t2: 28 },
  },
  {
    id: 'bw_stats', cat: 'animal', name: 'Body weight statistics & flock uniformity',
    inputs: [list('w', 'Individual body weights'), num('band', 'Uniformity band ± %', { optional: true })],
    compute({ w, band = 10 }) {
      if (w.length < 2) fail('Enter at least two weights'); const d = S.describe(w); const lo = d.mean * (1 - band / 100), hi = d.mean * (1 + band / 100);
      const within = w.filter((x) => x >= lo && x <= hi).length;
      return { results: [r('n', d.n, '', 0), r('Mean', d.mean), r('SD', d.sd), r('CV', d.cv, '%', 2), r('Min', d.min), r('Max', d.max), r(`Uniformity (±${band}% of mean)`, (100 * within) / w.length, '%', 1), txt('Band', `${lo.toFixed(3)} – ${hi.toFixed(3)}`)] };
    },
    formula: 'Uniformity = % of birds within ±band% of the mean;  CV = 100·SD/mean',
    assumptions: 'Random sample of the flock (typically ≥ 1–2% or ≥ 100 birds).',
    example: { w: '1.82 1.95 2.01 1.77 2.10 1.89 2.30 1.65 1.98 2.05 1.92 1.86', band: 10 },
  },

  // ───────────────────────── STATISTICS ─────────────────────────
  {
    id: 'descriptive', cat: 'stats', name: 'Descriptive statistics',
    inputs: [list('x', 'Data (numbers separated by space, comma or new line)')],
    compute({ x }) {
      if (x.length < 2) fail('Enter at least two values'); const d = S.describe(x);
      return { results: [r('n', d.n, '', 0), r('Mean', d.mean), r('Median', d.median), txt('Mode(s)', d.modes.length ? d.modes.join(', ') : 'none'), r('SD (sample)', d.sd), r('Variance (sample)', d.variance), r('SE of mean', d.se), r('CV', d.cv, '%', 2), r('Min', d.min), r('Max', d.max), r('Range', d.range), r('Q1', d.q1), r('Q3', d.q3), r('IQR', d.iqr), r('Skewness (G1)', d.skewness), r('Excess kurtosis (G2)', d.kurtosis), txt('95% CI of mean (t)', `${d.ci95[0].toFixed(4)} – ${d.ci95[1].toFixed(4)}`), r('Sum', d.sum)] };
    },
    formula: 's² = Σ(x − x̄)²/(n − 1);  SE = s/√n;  quantiles: type 7 (R default)',
    assumptions: 'CI assumes approximately normal data or large n.',
    example: { x: '12.1 13.4 11.8 14.2 12.9 13.1 12.4 15.0 13.7 12.2' },
  },
  {
    id: 'sample_size', cat: 'stats', name: 'Sample size helper',
    inputs: [sel('mode', 'Goal', [['two', 'Compare two means'], ['one', 'Estimate a mean ± E'], ['prop', 'Estimate a proportion ± E']]), num('sd', 'Expected SD σ', { when: { mode: ['two', 'one'] } }), num('delta', 'Detectable difference δ', { when: { mode: 'two' } }), num('E', 'Margin of error E', { when: { mode: ['one', 'prop'] } }), num('p', 'Expected proportion p', { when: { mode: 'prop' } }), num('alpha', 'α (two-sided)', { def: 0.05 }), num('power', 'Power 1 − β', { when: { mode: 'two' }, def: 0.8 })],
    compute({ mode, sd, delta, E, p, alpha = 0.05, power = 0.8 }) {
      prob(alpha, 'α'); const za = S.normInv(1 - alpha / 2);
      if (mode === 'two') { pos(sd, 'σ'); pos(delta, 'δ'); prob(power, 'Power'); const zb = S.normInv(power); const n = (2 * (za + zb) ** 2 * sd * sd) / (delta * delta); return { results: [r('n per group', Math.ceil(n), '', 0), r('Total N', 2 * Math.ceil(n), '', 0), r('Effect size d = δ/σ', delta / sd)], warnings: ['Normal approximation; add ~1–2 per group for t-distribution, plus expected losses.'] }; }
      if (mode === 'one') { pos(sd, 'σ'); pos(E, 'E'); return { results: [r('n', Math.ceil((za * sd / E) ** 2), '', 0)] }; }
      prob(p, 'p'); pos(E, 'E'); return { results: [r('n', Math.ceil((za * za * p * (1 - p)) / (E * E)), '', 0)] };
    },
    formula: 'two means: n = 2(z₁₋α/₂ + z₁₋β)²σ²/δ²;  mean: n = (zσ/E)²;  proportion: n = z²p(1−p)/E²',
    assumptions: 'Normal approximation, independent observations, equal group sizes.',
    example: { mode: 'two', sd: 10, delta: 5, alpha: 0.05, power: 0.8 },
  },
  {
    id: 'probability', cat: 'stats', name: 'Probability calculator',
    inputs: [sel('mode', 'Distribution', [['binom', 'Binomial'], ['pois', 'Poisson'], ['comb', 'Combinations / permutations']]), int('n', 'n', { when: { mode: ['binom', 'comb'] } }), num('p', 'p (success probability)', { when: { mode: 'binom' } }), num('lambda', 'λ (mean)', { when: { mode: 'pois' } }), int('k', 'k')],
    compute({ mode, n, p, lambda, k }) {
      nonneg(k, 'k');
      if (mode === 'binom') { prob(p, 'p'); if (k > n) fail('k cannot exceed n'); const cdf = S.binomCdf(k, n, p); return { results: [r('P(X = k)', S.binomPmf(k, n, p), '', 6), r('P(X ≤ k)', cdf, '', 6), r('P(X > k)', 1 - cdf, '', 6), r('Mean np', n * p), r('Variance np(1−p)', n * p * (1 - p))] }; }
      if (mode === 'pois') { pos(lambda, 'λ'); const cdf = S.poissonCdf(k, lambda); return { results: [r('P(X = k)', S.poissonPmf(k, lambda), '', 6), r('P(X ≤ k)', cdf, '', 6), r('P(X > k)', 1 - cdf, '', 6)] }; }
      if (k > n) fail('k cannot exceed n'); const c = Math.exp(S.lchoose(n, k)); const perm = Math.exp(S.lgamma(n + 1) - S.lgamma(n - k + 1));
      return { results: [r('C(n,k)', c, '', c < 1e15 ? 0 : 4), r('P(n,k)', perm, '', perm < 1e15 ? 0 : 4)] };
    },
    formula: 'Binomial: C(n,k)pᵏ(1−p)ⁿ⁻ᵏ;  Poisson: e^−λ λᵏ/k!',
    assumptions: 'Independent trials.',
    example: { mode: 'binom', n: 20, p: 0.25, k: 5 },
  },
  {
    id: 'distribution', cat: 'stats', name: 'Distribution calculator (Z, t, χ², F)',
    inputs: [sel('mode', 'Distribution', [['z', 'Normal: P from x'], ['zinv', 'Normal: x from P'], ['t', 'Student t: P from t'], ['tcrit', 'Student t: critical value'], ['chi', 'χ²: P from statistic'], ['f', 'F: P from statistic']]), num('x', 'x / statistic', { when: { mode: ['z', 't', 'chi', 'f'] } }), num('mu', 'μ', { when: { mode: ['z', 'zinv'] }, def: 0 }), num('sigma', 'σ', { when: { mode: ['z', 'zinv'] }, def: 1 }), num('p', 'Probability (lower tail) / α', { when: { mode: ['zinv', 'tcrit'] } }), num('df', 'df (or df1 for F)', { when: { mode: ['t', 'tcrit', 'chi', 'f'] } }), num('df2', 'df2', { when: { mode: 'f' } })],
    compute({ mode, x, mu = 0, sigma = 1, p, df, df2 }) {
      if (mode === 'z') { pos(sigma, 'σ'); const c = S.normCdf(x, mu, sigma); return { results: [r('P(X ≤ x)', c, '', 6), r('P(X > x)', 1 - c, '', 6), r('Two-tailed P', 2 * Math.min(c, 1 - c), '', 6), r('z', (x - mu) / sigma)] }; }
      if (mode === 'zinv') { prob(p, 'P'); return { results: [r('x', S.normInv(p, mu, sigma), '', 6)] }; }
      pos(df, 'df');
      if (mode === 't') { const c = S.tCdf(x, df); return { results: [r('P(T ≤ t)', c, '', 6), r('P(T > t)', 1 - c, '', 6), r('Two-tailed P', 2 * Math.min(c, 1 - c), '', 6)] }; }
      if (mode === 'tcrit') { prob(p, 'α'); return { results: [r('t (two-tailed α)', S.tInv(1 - p / 2, df), '', 5), r('t (one-tailed α)', S.tInv(1 - p, df), '', 5)] }; }
      if (mode === 'chi') { nonneg(x, 'χ²'); return { results: [r('P(χ² > x)', 1 - S.chi2Cdf(x, df), '', 6), r('P(χ² ≤ x)', S.chi2Cdf(x, df), '', 6)] }; }
      pos(df2, 'df2'); nonneg(x, 'F'); return { results: [r('P(F > x)', 1 - S.fCdf(x, df, df2), '', 6)] };
    },
    formula: 'Computed with the regularized incomplete gamma / beta functions (Numerical Recipes).',
    assumptions: 'Accuracy ≈ 1e-10 for typical inputs.',
    example: { mode: 't', x: 2.1, df: 18 },
  },
  {
    id: 'transform', cat: 'stats', name: 'Data transformation helper',
    inputs: [list('x', 'Data'), sel('fn', 'Transformation', [['log10', 'log₁₀(x)'], ['ln', 'ln(x)'], ['log1p', 'ln(x + 1) — counts with zeros'], ['sqrt', '√x'], ['sqrt05', '√(x + 0.5) — small counts'], ['asin', 'arcsine √p — proportions (0–1)'], ['asinpct', 'arcsine √(x/100) — percentages'], ['logit', 'logit(p)'], ['z', 'z-score'], ['minmax', 'min–max scale (0–1)'], ['boxcox', 'Box–Cox (λ)']]), num('lambda', 'λ', { when: { fn: 'boxcox' } })],
    compute({ x, fn, lambda }) {
      if (!x.length) fail('Enter data'); const m = S.mean(x), s = S.sd(x), mn = Math.min(...x), mx = Math.max(...x);
      const F = { log10: Math.log10, ln: Math.log, log1p: (v) => Math.log(v + 1), sqrt: Math.sqrt, sqrt05: (v) => Math.sqrt(v + 0.5), asin: (v) => Math.asin(Math.sqrt(v)), asinpct: (v) => Math.asin(Math.sqrt(v / 100)), logit: (v) => Math.log(v / (1 - v)), z: (v) => (v - m) / s, minmax: (v) => (v - mn) / (mx - mn), boxcox: (v) => (lambda === 0 ? Math.log(v) : (v ** lambda - 1) / lambda) }[fn];
      const y = x.map(F); const bad = y.filter((v) => !Number.isFinite(v)).length;
      const good = y.filter(Number.isFinite);
      return { results: [txt('Transformed values', y.map((v) => (Number.isFinite(v) ? +v.toFixed(6) : 'NA')).join('\n')), r('Mean (transformed)', S.mean(good)), r('SD (transformed)', S.sd(good)), r('Skewness before', S.skewness(x)), r('Skewness after', S.skewness(good))], warnings: bad ? [`${bad} value(s) outside the domain of this transformation → NA`] : [] };
    },
    formula: 'Choose the transformation that stabilizes variance / normalizes residuals; back-transform means for reporting.',
    assumptions: 'Arcsine and logit need proportions in (0,1); logs need positive values.',
    example: { x: '0 3 5 12 1 0 7 22 4 2', fn: 'log1p' },
  },
  {
    id: 'design', cat: 'stats', name: 'Experimental design helper & randomization',
    inputs: [sel('d', 'Design', [['crd', 'Completely randomized (CRD)'], ['rcbd', 'Randomized complete block (RCBD)'], ['latin', 'Latin square'], ['fact', 'Two-factor factorial in CRD']]), int('t', 'Treatments t (factor A levels for factorial)', { min: 2 }), int('b', 'Factor B levels', { when: { d: 'fact' }, min: 2 }), int('r', 'Replicates / blocks r', { when: { d: ['crd', 'rcbd', 'fact'] }, min: 2 }), int('seed', 'Random seed', { def: 2026 })],
    compute({ d, t, b, r: reps, seed = 2026 }) {
      const rand = S.rng(seed); const T = Array.from({ length: t }, (_, i) => `T${i + 1}`);
      if (d === 'crd') { const N = t * reps; const units = S.shuffle(T.flatMap((x) => Array(reps).fill(x)), rand); return { results: [tbl('ANOVA skeleton', ['Source', 'df'], [['Treatment', t - 1], ['Error', N - t], ['Total', N - 1]]), tbl('Randomized layout (unit → treatment)', ['Unit', 'Treatment'], units.map((x, i) => [i + 1, x]))] }; }
      if (d === 'rcbd') { const rows = []; for (let k = 1; k <= reps; k++) rows.push([`Block ${k}`, S.shuffle(T, rand).join('  ')]); return { results: [tbl('ANOVA skeleton', ['Source', 'df'], [['Block', reps - 1], ['Treatment', t - 1], ['Error', (reps - 1) * (t - 1)], ['Total', reps * t - 1]]), tbl('Randomized layout', ['Block', 'Plot order'], rows)] }; }
      if (d === 'latin') {
        if (t > 12) fail('Latin square limited to 12 treatments');
        const base = Array.from({ length: t }, (_, i) => Array.from({ length: t }, (_, j) => T[(i + j) % t]));
        const ro = S.shuffle([...Array(t).keys()], rand), co = S.shuffle([...Array(t).keys()], rand);
        const sq = ro.map((i) => co.map((j) => base[i][j]));
        return { results: [tbl('ANOVA skeleton', ['Source', 'df'], [['Rows', t - 1], ['Columns', t - 1], ['Treatment', t - 1], ['Error', (t - 1) * (t - 2)], ['Total', t * t - 1]]), tbl('Randomized square', ['Row', ...Array.from({ length: t }, (_, j) => `C${j + 1}`)], sq.map((row, i) => [`R${i + 1}`, ...row]))] };
      }
      const combos = []; for (let i = 1; i <= t; i++) for (let j = 1; j <= b; j++) combos.push(`A${i}B${j}`);
      const N = t * b * reps; const units = S.shuffle(combos.flatMap((x) => Array(reps).fill(x)), rand);
      return { results: [tbl('ANOVA skeleton', ['Source', 'df'], [['A', t - 1], ['B', b - 1], ['A×B', (t - 1) * (b - 1)], ['Error', t * b * (reps - 1)], ['Total', N - 1]]), tbl('Randomized layout', ['Unit', 'Combination'], units.map((x, i) => [i + 1, x]))] };
    },
    formula: 'Fixed-effects ANOVA degrees of freedom; randomization with a seeded generator (reproducible).',
    assumptions: 'Balanced designs. Record the seed in your methods section.',
    example: { d: 'rcbd', t: 4, r: 3, seed: 2026 },
  },
  {
    id: 'anova1', cat: 'stats', name: 'One-way ANOVA',
    inputs: [{ k: 'groups', label: 'One group per line:  label: v1, v2, v3 …', type: 'text', rows: 6 }],
    compute({ groups }) {
      const G = String(groups).split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l, i) => { const [lab, rest] = l.includes(':') ? l.split(/:(.*)/s) : [`G${i + 1}`, l]; const { values } = S.parseNumbers(rest); return { lab: lab.trim(), v: values }; });
      if (G.length < 2) fail('Need at least two groups'); if (G.some((g) => g.v.length < 2)) fail('Each group needs at least 2 values');
      const all = G.flatMap((g) => g.v), N = all.length, k = G.length, gm = S.mean(all);
      const ssb = S.sum(G.map((g) => g.v.length * (S.mean(g.v) - gm) ** 2)), ssw = S.sum(G.map((g) => S.sum(g.v.map((x) => (x - S.mean(g.v)) ** 2))));
      const dfb = k - 1, dfw = N - k, msb = ssb / dfb, msw = ssw / dfw, F = msb / msw, p = 1 - S.fCdf(F, dfb, dfw);
      return { results: [tbl('ANOVA', ['Source', 'df', 'SS', 'MS', 'F', 'P'], [['Between', dfb, ssb, msb, F, fmtP(p)], ['Within', dfw, ssw, msw, '', ''], ['Total', N - 1, ssb + ssw, '', '', '']]), tbl('Group means', ['Group', 'n', 'Mean', 'SD'], G.map((g) => [g.lab, g.v.length, S.mean(g.v), S.sd(g.v)])), r('η² = SSB/SST', ssb / (ssb + ssw)), r('Pooled SD √MSW', Math.sqrt(msw))] };
    },
    formula: 'F = MSB / MSW with (k−1, N−k) df',
    assumptions: 'Independent groups, normal residuals, equal variances. Use post-hoc tests (Tukey/Duncan) in R/SAS.',
    example: { groups: 'Control: 2.10, 2.25, 2.05, 2.30, 2.18\nDiet A: 2.42, 2.51, 2.38, 2.60, 2.47\nDiet B: 2.31, 2.29, 2.44, 2.36, 2.40' },
  },
  {
    id: 'regression', cat: 'stats', name: 'Simple linear regression',
    inputs: [list('x', 'x values'), list('y', 'y values'), num('x0', 'Predict y at x₀ (optional)', { optional: true })],
    compute({ x, y, x0 }) {
      const m = S.linreg(x, y); const out = [txt('Equation', `ŷ = ${m.a.toFixed(5)} + ${m.b.toFixed(5)}·x`), r('Intercept a', m.a), r('SE(a)', m.seA), r('Slope b', m.b), r('SE(b)', m.seB), r('t (b = 0)', m.t), txt('P', fmtP(m.p)), r('r', m.r), r('R²', m.r2), r('Residual MSE', m.mse), r('n', m.n, '', 0)];
      if (x0 !== undefined) { const yhat = m.a + m.b * x0, tc = S.tInv(0.975, m.df), sef = Math.sqrt(m.mse * (1 / m.n + (x0 - m.mx) ** 2 / m.sxx)); out.push(r('ŷ(x₀)', yhat), txt('95% CI of mean ŷ', `${(yhat - tc * sef).toFixed(4)} – ${(yhat + tc * sef).toFixed(4)}`)); }
      return { results: out };
    },
    formula: 'b = Sxy/Sxx;  a = ȳ − b·x̄;  SE(b) = √(MSE/Sxx)',
    assumptions: 'Linear relationship, independent normal residuals with constant variance. Parent–offspring regression: h² = 2b.',
    example: { x: '10 12 14 15 17 19 21 22', y: '24 28 31 33 38 40 45 47', x0: 18 },
  },
  {
    id: 'correlation', cat: 'stats', name: 'Correlation (Pearson & Spearman)',
    inputs: [list('x', 'x values'), list('y', 'y values')],
    compute({ x, y }) {
      const p = S.pearson(x, y), s = S.spearman(x, y);
      return { results: [r('Pearson r', p.r), txt('P (Pearson)', fmtP(p.p)), txt('95% CI (Fisher z)', `${p.ci95[0].toFixed(4)} – ${p.ci95[1].toFixed(4)}`), r('r²', p.r * p.r), r('Spearman ρ', s.rho), txt('P (Spearman, t approx.)', fmtP(s.p)), r('n', p.n, '', 0)] };
    },
    formula: 'r = Sxy/√(Sxx Syy);  t = r√[(n−2)/(1−r²)];  ρ = Pearson r on ranks',
    assumptions: 'Pearson: bivariate normality; Spearman: monotonic relation.',
    example: { x: '2.1 2.5 3.0 3.2 3.8 4.1 4.4 5.0', y: '30 34 33 39 41 45 44 52' },
  },

  // ───────────────────────── UTILITIES ─────────────────────────
  {
    id: 'units', cat: 'util', name: 'Unit converter',
    inputs: [sel('conv', 'Conversion', UNIT_OPTIONS()), num('v', 'Value')],
    compute({ conv, v }) { const c = UNITS[conv]; return { results: [r(c.to, c.f(v), '', 6), r(`Inverse: ${v} ${c.to} → ${c.from}`, c.inv(v), '', 6)] }; },
    formula: 'Exact SI factors (lb = 0.45359237 kg; in = 25.4 mm; US gal = 3.785411784 L; kcal = 4.184 kJ).',
    assumptions: 'Thermochemical calorie.',
    example: { conv: 'kg_lb', v: 2.5 },
  },
];

CALCULATORS.push(...EXTRA_CALCULATORS);

// breeding-category workspaces are custom UIs (see renderer tools module); listed here for search & terminal.
export const WORKSPACES = [
  { id: 'selection_index', cat: 'breed', name: 'Selection index (P⁻¹Ga)' },
  { id: 'blup', cat: 'breed', name: 'BLUP animal model — EBV workspace' },
  { id: 'pedigree', cat: 'breed', name: 'Pedigree viewer & relationship matrix' },
  { id: 'mating', cat: 'breed', name: 'Inbreeding-aware mating planner' },
  { id: 'selection_decision', cat: 'breed', name: 'Selection decision workspace' },
];


// Exact test for HWE (Wigginton, Cutler & Abecasis 2005).
export function hweExact(obsHets, obsHom1, obsHom2) {
  const homr = Math.min(obsHom1, obsHom2), homc = Math.max(obsHom1, obsHom2);
  const rare = 2 * homr + obsHets, N = obsHets + homc + homr;
  if (N === 0) return 1;
  const probs = new Float64Array(rare + 1);
  let mid = Math.floor((rare * (2 * N - rare)) / (2 * N));
  if ((rare & 1) ^ (mid & 1)) mid++;
  let hets = mid, hr = (rare - mid) / 2, hc = N - hets - hr;
  probs[mid] = 1; let sum = 1;
  for (hets = mid; hets > 1; hets -= 2) { probs[hets - 2] = (probs[hets] * hets * (hets - 1)) / (4 * (hr + 1) * (hc + 1)); sum += probs[hets - 2]; hr++; hc++; }
  hets = mid; hr = (rare - mid) / 2; hc = N - hets - hr;
  for (hets = mid; hets <= rare - 2; hets += 2) { probs[hets + 2] = (probs[hets] * 4 * hr * hc) / ((hets + 2) * (hets + 1)); sum += probs[hets + 2]; hr--; hc--; }
  let p = 0; const target = probs[obsHets] / sum;
  for (let i = 0; i <= rare; i++) { const pi = probs[i] / sum; if (pi <= target * (1 + 1e-7)) p += pi; }
  return Math.min(1, p);
}

// Validate & coerce raw string inputs for a calculator; returns { values } or throws with a field-specific message.
export function coerceInputs(calc, raw) {
  const values = {};
  for (const inp of calc.inputs) {
    if (!isVisible(inp, raw)) continue;
    const v = raw[inp.k];
    if (inp.type === 'select') { values[inp.k] = v ?? inp.options[0][0]; continue; }
    if (inp.type === 'text') { if (!String(v ?? '').trim() && !inp.optional) throw new Error(`${inp.label}: required`); values[inp.k] = String(v ?? ''); continue; }
    if (inp.type === 'list') {
      const { values: arr, bad } = S.parseNumbers(v ?? '');
      if (bad.length) throw new Error(`${inp.label}: not numeric → ${bad.slice(0, 5).join(', ')}`);
      if (!arr.length && !inp.optional) throw new Error(`${inp.label}: required`);
      values[inp.k] = arr; continue;
    }
    const s = String(v ?? '').trim();
    if (s === '') { if (inp.def !== undefined) { values[inp.k] = inp.def; continue; } if (inp.optional) continue; throw new Error(`${inp.label}: required`); }
    const n = S.parseNumber(s);
    if (!Number.isFinite(n)) throw new Error(`${inp.label}: '${s}' is not a number`);
    if (inp.type === 'int' && !Number.isInteger(n)) throw new Error(`${inp.label}: must be a whole number`);
    if (inp.min !== undefined && n < inp.min) throw new Error(`${inp.label}: must be ≥ ${inp.min}`);
    if (inp.max !== undefined && n > inp.max) throw new Error(`${inp.label}: must be ≤ ${inp.max}`);
    values[inp.k] = n;
  }
  return values;
}
export function isVisible(inp, raw) {
  if (!inp.when) return true;
  return Object.entries(inp.when).every(([k, want]) => {
    const cur = raw[k] ?? CALC_DEFAULT_SELECT(k, inp);
    return Array.isArray(want) ? want.includes(cur) : cur === want;
  });
}
function CALC_DEFAULT_SELECT() { return undefined; }
export function runCalculator(id, raw) {
  const calc = CALCULATORS.find((c) => c.id === id);
  if (!calc) throw new Error(`Unknown calculator '${id}'`);
  const withDefaults = { ...raw };
  for (const inp of calc.inputs) if (inp.type === 'select' && withDefaults[inp.k] === undefined) withDefaults[inp.k] = inp.options[0][0];
  const values = coerceInputs(calc, withDefaults);
  const out = calc.compute(values);
  return { results: out.results || [], warnings: out.warnings || [] };
}
