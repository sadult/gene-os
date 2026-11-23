// Gene OS 2.0 calculator additions. Kept in a separate module for readability; merged into CALCULATORS by genetics.mjs.
import * as S from './stats.mjs';
import * as Q from './seq.mjs';
import * as J from './jalali.mjs';

const r = (label, value, unit = '', digits = 4) => ({ label, value, unit, digits });
const txt = (label, text) => ({ label, text });
const tbl = (label, columns, rows) => ({ label, table: { columns, rows } });
const num = (k, label, o = {}) => ({ k, label, type: 'number', ...o });
const int = (k, label, o = {}) => ({ k, label, type: 'int', ...o });
const sel = (k, label, options, o = {}) => ({ k, label, type: 'select', options, ...o });
const list = (k, label, o = {}) => ({ k, label, type: 'list', ...o });
const text = (k, label, o = {}) => ({ k, label, type: 'text', rows: 4, ...o });
const fail = (m) => { throw new Error(m); };
const prob = (v, name) => { if (!(v >= 0 && v <= 1)) fail(`${name} must be between 0 and 1`); return v; };
const pos = (v, name) => { if (!(v > 0)) fail(`${name} must be greater than 0`); return v; };
const nonneg = (v, name) => { if (!(v >= 0)) fail(`${name} cannot be negative`); return v; };
const fmtP = (p) => (p < 1e-4 ? p.toExponential(2) : p.toFixed(4));

export const GESTATION = [
  ['cattle', 'Cattle', 283], ['buffalo', 'Water buffalo', 310], ['sheep', 'Sheep', 147], ['goat', 'Goat', 150],
  ['pig', 'Pig', 114], ['horse', 'Horse', 340], ['camel', 'Dromedary camel', 390], ['rabbit', 'Rabbit', 31],
  ['chicken', 'Chicken (incubation)', 21], ['quail', 'Japanese quail (incubation)', 17], ['duck', 'Duck (incubation)', 28], ['turkey', 'Turkey (incubation)', 28],
];

export const EXTRA_CALCULATORS = [
  // ── quantitative genetics ──
  {
    id: 'realized_h2', cat: 'quant', name: 'Realized heritability',
    inputs: [sel('mode', 'Data', [['single', 'Single generation (R, S)'], ['cum', 'Several generations (cumulative R and S)']]), num('R', 'Response R', { when: { mode: 'single' } }), num('S', 'Selection differential S', { when: { mode: 'single' } }), list('cr', 'Cumulative responses', { when: { mode: 'cum' } }), list('cs', 'Cumulative selection differentials', { when: { mode: 'cum' } })],
    compute({ mode, R, S: Sd, cr, cs }) {
      if (mode === 'single') { if (!Sd) fail('S cannot be 0'); return { results: [r('h²R = R / S', R / Sd)] }; }
      if (cr.length !== cs.length || cr.length < 2) fail('Enter the same number (≥ 2) of cumulative R and S values');
      const sxy = S.sum(cr.map((y, i) => y * cs[i])), sxx = S.sum(cs.map((x) => x * x)); pos(sxx, 'Σ CS²');
      const b = sxy / sxx; const res = cr.map((y, i) => y - b * cs[i]);
      const se = Math.sqrt(S.sum(res.map((e) => e * e)) / (cr.length - 1) / sxx);
      return { results: [r('h²R (regression through origin)', b), r('SE', se), tbl('Generations', ['Gen', 'Cum. S', 'Cum. R', 'Predicted R'], cs.map((x, i) => [i + 1, x, cr[i], b * x]))] };
    },
    formula: 'h²R = R / S;   several generations: b = Σ(CS·CR) / Σ CS²  (regression through the origin)',
    assumptions: 'Response measured against a control line or corrected for environmental trend; no maternal effects.',
    example: { mode: 'cum', cr: '1.1 2.0 3.2 4.1', cs: '3.5 7.2 10.4 13.9' },
  },
  // ── breeding ──
  {
    id: 'heterosis', cat: 'breed', name: 'Heterosis (hybrid vigour)',
    inputs: [num('p1', 'Mean of parent breed 1'), num('p2', 'Mean of parent breed 2'), num('f1', 'Mean of F1 crossbreds'), num('f2', 'Mean of F2 (optional)', { optional: true })],
    compute({ p1, p2, f1, f2 }) {
      const mp = (p1 + p2) / 2; if (!mp) fail('Mid-parent mean cannot be 0');
      const H = f1 - mp, bp = Math.max(p1, p2);
      const out = [r('Mid-parent value MP', mp), r('Heterosis H = F1 − MP', H), r('Heterosis %', (100 * H) / mp, '%', 2), r('Better-parent heterosis', f1 - bp), r('Better-parent heterosis %', (100 * (f1 - bp)) / bp, '%', 2), r('Expected F2 = MP + H/2', mp + H / 2)];
      if (f2 !== undefined && H !== 0) out.push(r('Heterosis retained in observed F2', ((f2 - mp) / H) * 100, '%', 1));
      return { results: out };
    },
    formula: 'H = F̄1 − (P̄1 + P̄2)/2;   H% = 100·H / MP;   expected F2 = MP + ½H (dominance model)',
    assumptions: 'Parental and crossbred means measured in the same environment; additive–dominance model without epistatic loss.',
    example: { p1: 180, p2: 210, f1: 215, f2: 204 },
  },
  {
    id: 'crossbreeding', cat: 'breed', name: 'Crossbreeding — retained heterosis',
    inputs: [sel('mode', 'System', [['rot', 'Rotational crossing (n breeds)'], ['comp', 'Composite / synthetic breed']]), int('n', 'Number of breeds n', { when: { mode: 'rot' }, min: 2 }), list('props', 'Breed proportions in the composite', { when: { mode: 'comp' } }), num('h1', 'F1 heterosis (trait units, optional)', { optional: true })],
    compute({ mode, n, props, h1 }) {
      let ret;
      if (mode === 'rot') { if (!(n >= 2)) fail('n ≥ 2'); ret = (2 ** n - 2) / (2 ** n - 1); }
      else { if (props.length < 2) fail('Enter at least two proportions'); props.forEach((x) => nonneg(x, 'Proportions')); const t = S.sum(props); pos(t, 'Sum'); ret = 1 - S.sum(props.map((x) => (x / t) ** 2)); }
      const out = [r('Heterosis retained', 100 * ret, '%', 1)];
      if (h1 !== undefined) out.push(r('Expected heterosis', ret * h1));
      return { results: out };
    },
    formula: 'Rotation of n breeds (equilibrium): (2ⁿ − 2)/(2ⁿ − 1);   composite: 1 − Σ pᵢ²',
    assumptions: 'Heterosis proportional to breed-of-origin heterozygosity (dominance model); generations at equilibrium.',
    example: { mode: 'comp', props: '0.5 0.25 0.25', h1: 20 },
  },
  // ── population ──
  {
    id: 'fst', cat: 'pop', name: 'F-statistics (FST, FIS, FIT)',
    inputs: [list('p', 'Allele frequency p in each subpopulation'), list('w', 'Subpopulation sizes (optional weights)', { optional: true }), num('ho', 'Mean observed heterozygosity Ho (optional)', { optional: true })],
    compute({ p, w, ho }) {
      if (p.length < 2) fail('Enter at least two subpopulations'); p.forEach((x) => prob(x, 'Allele frequencies'));
      const wt = w && w.length ? w : p.map(() => 1); if (wt.length !== p.length) fail('Number of weights must match the number of subpopulations');
      const tw = S.sum(wt); pos(tw, 'Weights');
      const pbar = S.sum(p.map((x, i) => x * wt[i])) / tw;
      const HS = S.sum(p.map((x, i) => 2 * x * (1 - x) * wt[i])) / tw, HT = 2 * pbar * (1 - pbar);
      if (HT === 0) fail('Locus is fixed in all subpopulations');
      const fst = (HT - HS) / HT;
      const out = [r('p̄', pbar), r('HS (mean within-subpopulation He)', HS), r('HT (total He)', HT), r('FST = (HT − HS)/HT', fst), r('Variance of p among subpopulations', S.sum(p.map((x, i) => wt[i] * (x - pbar) ** 2)) / tw)];
      if (ho !== undefined) { if (HS > 0) out.push(r('FIS = (HS − HO)/HS', (HS - ho) / HS)); out.push(r('FIT = (HT − HO)/HT', (HT - ho) / HT)); }
      return { results: out, warnings: fst > 0.25 ? ['FST > 0.25: very great genetic differentiation (Wright 1978).'] : [] };
    },
    formula: 'HS = Σwᵢ·2pᵢqᵢ / Σwᵢ;   HT = 2p̄q̄;   FST = (HT − HS)/HT;   (1 − FIT) = (1 − FIS)(1 − FST)',
    assumptions: 'Bi-allelic locus with known frequencies (no sample-size correction, Nei’s GST-type estimator).',
    example: { p: '0.2 0.5 0.7 0.4', ho: 0.35 },
  },
  {
    id: 'nei', cat: 'pop', name: "Nei's genetic distance",
    inputs: [text('x', 'Population X — one locus per line, allele frequencies separated by spaces'), text('y', 'Population Y — same loci and allele order')],
    compute({ x, y }) {
      const parse = (t) => String(t).split(/\n+/).map((l) => S.parseNumbers(l).values).filter((a) => a.length);
      const X = parse(x), Y = parse(y);
      if (!X.length) fail('Enter allele frequencies'); if (X.length !== Y.length) fail('Both populations need the same number of loci');
      let jx = 0, jy = 0, jxy = 0;
      X.forEach((a, i) => { const b = Y[i]; if (a.length !== b.length) fail(`Locus ${i + 1}: different number of alleles`); jx += S.sum(a.map((v) => v * v)); jy += S.sum(b.map((v) => v * v)); jxy += S.sum(a.map((v, k) => v * b[k])); });
      const L = X.length; jx /= L; jy /= L; jxy /= L;
      const I = jxy / Math.sqrt(jx * jy); if (!(I > 0)) fail('Populations share no alleles (I = 0)');
      return { results: [r('Loci', L, '', 0), r('Jx', jx), r('Jy', jy), r('Jxy', jxy), r('Genetic identity I', I), r('Standard distance D = −ln I', -Math.log(I))] };
    },
    formula: 'I = Jxy / √(Jx·Jy);   D = −ln I   (Nei 1972);   J = mean over loci of Σ p²',
    assumptions: 'Frequencies at each locus sum to 1; no sample-size bias correction.',
    example: { x: '0.6 0.4\n0.2 0.5 0.3\n0.9 0.1', y: '0.3 0.7\n0.4 0.4 0.2\n0.8 0.2' },
  },
  {
    id: 'selection_allele', cat: 'pop', name: 'Selection on allele frequency',
    inputs: [num('p0', 'Initial frequency p of A₁'), num('w11', 'Fitness A₁A₁'), num('w12', 'Fitness A₁A₂'), num('w22', 'Fitness A₂A₂'), int('t', 'Generations', { min: 1, def: 20 })],
    compute({ p0, w11, w12, w22, t }) {
      prob(p0, 'p'); [w11, w12, w22].forEach((v) => nonneg(v, 'Fitness')); if (t > 5000) fail('At most 5000 generations');
      let p = p0, dp1 = null; const rows = [[0, p, 1 - p, '']]; const step = Math.max(1, Math.round(t / 20));
      for (let g = 1; g <= t; g++) {
        const q = 1 - p; const wbar = p * p * w11 + 2 * p * q * w12 + q * q * w22; if (wbar <= 0) fail('Mean fitness reached 0');
        const np = (p * p * w11 + p * q * w12) / wbar; if (dp1 === null) dp1 = np - p; p = np;
        if (g % step === 0 || g === t) rows.push([g, p, 1 - p, wbar]);
      }
      const out = [r('Δp in the first generation', dp1), r(`p after ${t} generations`, p), tbl('Trajectory', ['Generation', 'p', 'q', 'w̄'], rows)];
      const s1 = w12 - w11, s2 = w12 - w22; if (s1 > 0 && s2 > 0) out.push(r('Stable equilibrium p̂ (overdominance)', s2 / (s1 + s2)));
      return { results: out };
    },
    formula: "p′ = (p²w₁₁ + pq·w₁₂) / w̄;   w̄ = p²w₁₁ + 2pq·w₁₂ + q²w₂₂;   overdominance: p̂ = (w₁₂ − w₂₂)/(2w₁₂ − w₁₁ − w₂₂)",
    assumptions: 'Infinite random-mating population, constant viability selection, no mutation, migration or drift.',
    example: { p0: 0.1, w11: 1, w12: 0.95, w22: 0.8, t: 50 },
  },
  // ── genomics & sequence ──
  {
    id: 'punnett', cat: 'genomics', name: 'Mendelian cross (Punnett square)',
    inputs: [text('p1', 'Parent 1 genotype (e.g. AaBb)', { rows: 1 }), text('p2', 'Parent 2 genotype (e.g. Aabb)', { rows: 1 })],
    compute({ p1, p2 }) {
      const parse = (g) => {
        const s = String(g).replace(/\s+/g, ''); if (!s || s.length % 2) fail('Genotypes need two letters per gene, e.g. AaBb');
        const genes = [];
        for (let i = 0; i < s.length; i += 2) { const a = s[i], b = s[i + 1]; if (!/[a-z]/i.test(a) || a.toLowerCase() !== b.toLowerCase()) fail(`'${a}${b}' is not a valid gene pair`); genes.push([a, b]); }
        return genes;
      };
      const g1 = parse(p1), g2 = parse(p2);
      if (g1.length !== g2.length) fail('Both parents need the same genes'); if (g1.length > 5) fail('At most 5 genes');
      g1.forEach((x, i) => { if (x[0].toLowerCase() !== g2[i][0].toLowerCase()) fail('Genes must be listed in the same order in both parents'); });
      const upFirst = (x, y) => (x === x.toUpperCase() ? 0 : 1) - (y === y.toUpperCase() ? 0 : 1);
      let dist = [['', 1]];
      for (let i = 0; i < g1.length; i++) {
        const per = {};
        for (const a of g1[i]) for (const b of g2[i]) { const k = [a, b].sort(upFirst).join(''); per[k] = (per[k] || 0) + 0.25; }
        const nd = []; for (const [k, p] of dist) for (const [k2, p2] of Object.entries(per)) nd.push([k + k2, p * p2]); dist = nd;
      }
      const geno = {}; for (const [k, p] of dist) geno[k] = (geno[k] || 0) + p;
      const pheno = {};
      for (const [k, p] of Object.entries(geno)) { let ph = ''; for (let i = 0; i < k.length; i += 2) { const L = k[i].toUpperCase(); ph += k[i] === L || k[i + 1] === L ? L + '_' : L.toLowerCase().repeat(2); } pheno[ph] = (pheno[ph] || 0) + p; }
      const den = 4 ** g1.length; const sortE = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
      return { results: [tbl('Genotypes', ['Genotype', 'Probability', `Ratio (/${den})`], sortE(geno).map(([k, p]) => [k, p, Math.round(p * den)])), tbl('Phenotypes (complete dominance)', ['Phenotype', 'Probability', `Ratio (/${den})`], sortE(pheno).map(([k, p]) => [k, p, Math.round(p * den)])), r('Genotype classes', Object.keys(geno).length, '', 0), r('Phenotype classes', Object.keys(pheno).length, '', 0)] };
    },
    formula: 'Independent assortment: product of per-gene Mendelian probabilities (¼ per gamete combination)',
    assumptions: 'Unlinked autosomal genes, complete dominance of the uppercase allele, equal gamete viability.',
    example: { p1: 'AaBb', p2: 'AaBb' },
  },
  {
    id: 'map_distance', cat: 'genomics', name: 'Recombination fraction ↔ map distance',
    inputs: [sel('mode', 'Convert', [['r', 'Recombination fraction → cM'], ['d', 'Map distance (cM) → r']]), num('r', 'Recombination fraction r (0–0.5)', { when: { mode: 'r' } }), num('d', 'Map distance (cM)', { when: { mode: 'd' } })],
    compute({ mode, r: rf, d }) {
      if (mode === 'r') { if (!(rf >= 0 && rf < 0.5)) fail('r must be in [0, 0.5)'); return { results: [r('Haldane d = −½ ln(1 − 2r)', -50 * Math.log(1 - 2 * rf), 'cM'), r('Kosambi d = ¼ ln[(1 + 2r)/(1 − 2r)]', 25 * Math.log((1 + 2 * rf) / (1 - 2 * rf)), 'cM')] }; }
      nonneg(d, 'Distance'); const M = d / 100;
      return { results: [r('Haldane r = ½(1 − e^(−2d))', 0.5 * (1 - Math.exp(-2 * M))), r('Kosambi r = ½ tanh(2d)', 0.5 * Math.tanh(2 * M))] };
    },
    formula: 'Haldane: d = −½ ln(1 − 2r);   Kosambi: d = ¼ ln[(1 + 2r)/(1 − 2r)]   (d in Morgans, ×100 for cM)',
    assumptions: 'Haldane assumes no crossover interference; Kosambi allows moderate interference.',
    example: { mode: 'r', r: 0.2 },
  },
  {
    id: 'ld', cat: 'genomics', name: 'Linkage disequilibrium (D, D′, r²)',
    inputs: [num('AB', 'Haplotype AB (count or frequency)'), num('Ab', 'Haplotype Ab'), num('aB', 'Haplotype aB'), num('ab', 'Haplotype ab')],
    compute({ AB, Ab, aB, ab }) {
      [AB, Ab, aB, ab].forEach((v) => nonneg(v, 'Haplotypes')); const n = AB + Ab + aB + ab; pos(n, 'Total');
      const f = [AB, Ab, aB, ab].map((v) => v / n); const pA = f[0] + f[1], pB = f[0] + f[2];
      const D = f[0] * f[3] - f[1] * f[2];
      const Dmax = D >= 0 ? Math.min(pA * (1 - pB), (1 - pA) * pB) : Math.min(pA * pB, (1 - pA) * (1 - pB));
      const den = pA * (1 - pA) * pB * (1 - pB); if (den === 0) fail('A locus is monomorphic');
      const r2 = (D * D) / den;
      const out = [r('pA', pA), r('pB', pB), r('D = pAB·pab − pAb·paB', D), r('D′ = D / Dmax', Dmax ? D / Dmax : 0), r('r²', r2)];
      if ([AB, Ab, aB, ab].some((v) => v > 1)) { const chi = n * r2; out.push(r('χ² = n·r² (1 df)', chi), txt('P', fmtP(1 - S.chi2Cdf(chi, 1)))); }
      return { results: out };
    },
    formula: 'D = p_AB·p_ab − p_Ab·p_aB;   D′ = D / Dmax;   r² = D² / (pA qA pB qB)',
    assumptions: 'Phased haplotypes. When counts are given, χ² = n·r² tests H₀: D = 0.',
    example: { AB: 474, Ab: 26, aB: 117, ab: 383 },
  },
  {
    id: 'sequence', cat: 'genomics', name: 'DNA sequence toolkit',
    inputs: [text('seq', 'DNA / RNA sequence (FASTA header lines are ignored)', { rows: 5 }), sel('frame', 'Translation reading frame', [['1', '+1'], ['2', '+2'], ['3', '+3']]), int('orf', 'Minimum ORF length (amino acids)', { def: 30, min: 1 })],
    compute({ seq, frame, orf = 30 }) {
      const { seq: s, removed } = Q.clean(seq); if (!s.length) fail('Enter a DNA sequence');
      const c = Q.counts(s); const orfs = Q.orfs(s, orf);
      return { results: [r('Length', s.length, 'bp', 0), r('GC content', Q.gc(s) * 100, '%', 2), tbl('Base composition', ['Base', 'Count', '%'], ['A', 'C', 'G', 'T', 'N'].map((b) => [b, c[b], (100 * c[b]) / s.length])), r('Tm (approximate)', Q.tm(s), '°C', 1), r('Molecular weight, single strand (approx.)', Q.mw(s), 'g/mol', 0), txt('Reverse complement', Q.wrap(Q.revcomp(s))), txt(`Protein (frame +${frame})`, Q.wrap(Q.translate(s, Number(frame) - 1)) || '—'), orfs.length ? tbl(`ORFs ≥ ${orf} aa (forward strand)`, ['Frame', 'Start', 'End', 'Length (aa)'], orfs.slice(0, 20).map((o) => [`+${o.frame}`, o.start, o.end, o.aa])) : txt('ORFs', `none ≥ ${orf} aa`)], warnings: removed ? [`${removed} non-ACGTN symbol(s) removed`] : [] };
    },
    formula: 'GC = (G + C)/N;   Tm = 2(A+T) + 4(G+C) for N < 14, else 64.9 + 41(G + C − 16.4)/N;   standard genetic code',
    assumptions: 'IUPAC ambiguity codes other than N are removed. Tm is a rough estimate without salt or primer-concentration correction.',
    example: { seq: '>demo\nATGGCTAGCTTCGGAGCTGACCTGAAAGGCTTGCTGGTGCTGCTAAGCTGA', frame: '1', orf: 5 },
  },
  {
    id: 'grm', cat: 'genomics', name: 'Genomic relationship matrix (VanRaden G)',
    inputs: [text('geno', 'Genotypes: one animal per line — id, then SNP codes 0/1/2 (copies of allele B)', { rows: 7 })],
    compute({ geno }) {
      const lines = String(geno).split(/\n+/).map((l) => S.normalizeDigits(l).trim()).filter((l) => l && !l.startsWith('#'));
      if (lines.length < 2) fail('Enter at least two animals');
      const ids = [], M = [];
      lines.forEach((l, i) => { const f = l.split(/[\s,;\t]+/); const codes = f.slice(1).map(Number); if (codes.some((v) => ![0, 1, 2].includes(v))) fail(`Line ${i + 1}: genotype codes must be 0, 1 or 2`); ids.push(f[0]); M.push(codes); });
      const m = M[0].length; if (m < 2) fail('Need at least two SNPs'); if (M.some((x) => x.length !== m)) fail('All animals need the same number of SNPs');
      const n = M.length; const p = Array.from({ length: m }, (_, j) => S.sum(M.map((x) => x[j])) / (2 * n));
      const k = 2 * S.sum(p.map((v) => v * (1 - v))); if (k === 0) fail('All SNPs are monomorphic');
      const Z = M.map((x) => x.map((v, j) => v - 2 * p[j])); const G = Z.map((a) => Z.map((b) => S.dot(a, b) / k));
      const diag = G.map((row, i) => row[i]); let off = 0, c = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { off += G[i][j]; c++; }
      const out = [r('Animals', n, '', 0), r('SNPs', m, '', 0), r('Monomorphic SNPs', p.filter((v) => v === 0 || v === 1).length, '', 0), r('Scaling 2Σpq', k), r('Mean diagonal (≈ 1 + F)', S.mean(diag)), r('Mean off-diagonal', c ? off / c : 0)];
      if (n <= 25) out.push(tbl('G matrix', ['', ...ids], G.map((row, i) => [ids[i], ...row])));
      return { results: out, warnings: n > 25 ? ['Matrix not displayed for more than 25 animals (use Export).'] : [] };
    },
    formula: 'Z = M − 2P;   G = ZZ′ / (2 Σ pⱼ(1 − pⱼ))   (VanRaden 2008, method 1), p estimated from the data',
    assumptions: 'Allele frequencies are estimated from the genotyped animals (ideally base-population frequencies would be used).',
    example: { geno: 'A1 0 1 2 1 0 2 1 1\nA2 1 1 2 0 0 2 1 2\nA3 2 0 1 1 1 1 0 1\nA4 0 2 2 1 0 2 2 1' },
  },
  // ── animal science ──
  {
    id: 'milk', cat: 'animal', name: 'Milk yield corrections (FCM, ECM)',
    inputs: [num('m', 'Milk yield', { unit: 'kg' }), num('fat', 'Fat', { unit: '%' }), num('prot', 'Protein', { unit: '%', optional: true })],
    compute({ m, fat, prot }) {
      pos(m, 'Milk'); nonneg(fat, 'Fat %'); const F = (m * fat) / 100;
      const out = [r('Fat yield', F, 'kg'), r('4% FCM = 0.4·M + 15·F', 0.4 * m + 15 * F, 'kg')];
      if (prot !== undefined) { const Pk = (m * prot) / 100; out.push(r('Protein yield', Pk, 'kg'), r('ECM = 0.327·M + 12.95·F + 7.65·P', 0.327 * m + 12.95 * F + 7.65 * Pk, 'kg')); }
      return { results: out };
    },
    formula: '4% FCM = 0.4·M + 15·F (Gaines);   ECM = 0.327·M + 12.95·F + 7.65·P (Tyrrell & Reid 1965); yields in kg',
    assumptions: 'M = milk, F = fat and P = protein yield in kg over the same period.',
    example: { m: 32, fat: 3.8, prot: 3.2 },
  },
  {
    id: 'adj_weaning', cat: 'animal', name: 'Adjusted weaning weight (205-day)',
    inputs: [num('bw', 'Birth weight', { unit: 'kg' }), num('ww', 'Actual weaning weight', { unit: 'kg' }), num('age', 'Age at weaning', { unit: 'd' }), num('std', 'Standard age', { unit: 'd', def: 205 }), num('adj', 'Age-of-dam additive adjustment', { unit: 'kg', optional: true })],
    compute({ bw, ww, age, std = 205, adj = 0 }) {
      pos(age, 'Age'); pos(std, 'Standard age'); if (ww < bw) fail('Weaning weight is below birth weight');
      const pre = (ww - bw) / age;
      return { results: [r('Pre-weaning ADG', pre, 'kg/d'), r(`Adjusted ${std}-day weight`, pre * std + bw + adj, 'kg', 1)], warnings: std === 205 && (age < 160 || age > 250) ? ['BIF recommends weaning ages of about 160–250 days for the 205-day adjustment.'] : [] };
    },
    formula: 'Adjusted WW = (WW − BW)/age × standard age + BW (+ age-of-dam factor)',
    assumptions: 'Linear growth between birth and weaning (BIF guidelines). For sheep/goats use your scheme’s standard age (e.g. 90 or 100 d).',
    example: { bw: 38, ww: 245, age: 198 },
  },
  {
    id: 'gestation', cat: 'animal', name: 'Gestation & incubation calendar',
    inputs: [sel('sp', 'Species', GESTATION.map(([k, l, d]) => [k, `${l} — ${d} d`])), text('date', 'Mating / insemination / setting date (YYYY-MM-DD)', { rows: 1 }), int('len', 'Custom length in days (optional)', { optional: true, min: 1 })],
    compute({ sp, date, len }) {
      const g = GESTATION.find((x) => x[0] === sp) || GESTATION[0]; const days = len || g[2];
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(S.normalizeDigits(date).trim()); if (!m) fail('Date must be YYYY-MM-DD');
      const d0 = Date.UTC(+m[1], +m[2] - 1, +m[3]); if (isNaN(d0)) fail('Invalid date');
      const due = new Date(d0 + days * 864e5); const iso = (t) => new Date(t).toISOString().slice(0, 10);
      const t = new Date(); const left = Math.round((due.getTime() - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
      const win = Math.round(days * 0.02) * 864e5;
      return { results: [txt('Expected date', `${iso(due)} (${due.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })})`), r('Length', days, 'd', 0), r(left >= 0 ? 'Days remaining' : 'Days since the expected date', Math.abs(left), 'd', 0), txt('Window (±2 %)', `${iso(due.getTime() - win)} – ${iso(due.getTime() + win)}`)] };
    },
    formula: 'Expected date = service date + mean gestation (or incubation) length',
    assumptions: 'Mean lengths vary with breed, litter size and sex of the offspring; the window shown is ±2 % of the length.',
    example: { sp: 'sheep', date: '2026-11-01' },
  },
  // ── statistics ──
  {
    id: 'ttest', cat: 'stats', name: 't-test (two-sample / paired)',
    inputs: [sel('mode', 'Test', [['welch', 'Two-sample, Welch (unequal variances)'], ['student', 'Two-sample, Student (pooled variance)'], ['paired', 'Paired samples']]), list('x', 'Group 1 / before'), list('y', 'Group 2 / after')],
    compute({ mode, x, y }) {
      if (x.length < 2 || y.length < 2) fail('Each group needs at least 2 values');
      let df, diff, se;
      if (mode === 'paired') { if (x.length !== y.length) fail('A paired test needs groups of equal length'); const d = x.map((v, i) => v - y[i]); diff = S.mean(d); se = S.sd(d) / Math.sqrt(d.length); df = d.length - 1; }
      else {
        const m1 = S.mean(x), m2 = S.mean(y), v1 = S.variance(x), v2 = S.variance(y), n1 = x.length, n2 = y.length; diff = m1 - m2;
        if (mode === 'student') { const sp = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2); se = Math.sqrt(sp * (1 / n1 + 1 / n2)); df = n1 + n2 - 2; }
        else { se = Math.sqrt(v1 / n1 + v2 / n2); df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)); }
      }
      if (!(se > 0)) fail('Standard error is 0 — the data have no variation');
      const t = diff / se, p = 2 * (1 - S.tCdf(Math.abs(t), df)), tc = S.tInv(0.975, df);
      const sdP = mode === 'paired' ? se * Math.sqrt(x.length) : Math.sqrt(((x.length - 1) * S.variance(x) + (y.length - 1) * S.variance(y)) / (x.length + y.length - 2));
      return { results: [r('Mean difference', diff), r('SE of difference', se), r('t', t), r('df', df, '', 2), txt('P (two-tailed)', fmtP(p)), txt('95 % CI of difference', `${(diff - tc * se).toFixed(4)} – ${(diff + tc * se).toFixed(4)}`), r(mode === 'paired' ? "Cohen's dz" : "Cohen's d (pooled SD)", diff / sdP), tbl('Groups', ['Group', 'n', 'Mean', 'SD'], [['1', x.length, S.mean(x), S.sd(x)], ['2', y.length, S.mean(y), S.sd(y)]])] };
    },
    formula: 'Welch: t = (x̄₁ − x̄₂)/√(s₁²/n₁ + s₂²/n₂), Welch–Satterthwaite df;   Student: pooled s²;   paired: t = d̄ / (s_d/√n)',
    assumptions: 'Independent observations (paired: independent pairs) and approximately normal data or differences.',
    example: { mode: 'welch', x: '2.42 2.51 2.38 2.60 2.47 2.55', y: '2.10 2.25 2.05 2.30 2.18' },
  },
  {
    id: 'chisq', cat: 'stats', name: 'χ² test (contingency / goodness of fit)',
    inputs: [sel('mode', 'Test', [['gof', 'Goodness of fit'], ['table', 'Contingency table (independence)']]), list('obs', 'Observed counts', { when: { mode: 'gof' } }), list('exp', 'Expected ratio / proportions (e.g. 9 3 3 1)', { when: { mode: 'gof' } }), text('table', 'Observed counts — one row per line', { when: { mode: 'table' } })],
    compute({ mode, obs, exp, table }) {
      let chi = 0; const w = [];
      if (mode === 'gof') {
        if (obs.length < 2) fail('Enter at least two categories'); if (exp.length !== obs.length) fail('Expected ratio needs one value per category');
        const n = S.sum(obs), te = S.sum(exp); pos(te, 'Expected ratio'); const E = exp.map((e) => (e / te) * n);
        const rows = obs.map((o, i) => { chi += (o - E[i]) ** 2 / E[i]; return [i + 1, o, E[i], (o - E[i]) / Math.sqrt(E[i])]; });
        if (E.some((e) => e < 5)) w.push('Expected counts < 5 — the χ² approximation is unreliable.');
        const df = obs.length - 1;
        return { results: [r('χ²', chi), r('df', df, '', 0), txt('P', fmtP(1 - S.chi2Cdf(chi, df))), tbl('Categories', ['#', 'Observed', 'Expected', 'Std. residual'], rows)], warnings: w };
      }
      const T = String(table).split(/\n+/).map((l) => S.parseNumbers(l).values).filter((a) => a.length);
      if (T.length < 2) fail('Need at least 2 rows'); const c = T[0].length; if (c < 2 || T.some((a) => a.length !== c)) fail('All rows need the same number (≥ 2) of columns');
      const R = T.map((a) => S.sum(a)), C = T[0].map((_, j) => S.sum(T.map((a) => a[j]))), n = S.sum(R); pos(n, 'Total');
      const E = T.map((a, i) => a.map((_, j) => (R[i] * C[j]) / n)); if (E.flat().some((e) => e === 0)) fail('A row or column total is 0');
      T.forEach((a, i) => a.forEach((o, j) => { chi += (o - E[i][j]) ** 2 / E[i][j]; }));
      const df = (T.length - 1) * (c - 1); if (E.flat().some((e) => e < 5)) w.push('Some expected counts < 5 — consider Fisher’s exact test.');
      return { results: [r('χ²', chi), r('df', df, '', 0), txt('P', fmtP(1 - S.chi2Cdf(chi, df))), r("Cramér's V", Math.sqrt(chi / (n * Math.min(T.length - 1, c - 1)))), tbl('Expected counts', ['Row', ...T[0].map((_, j) => `C${j + 1}`)], E.map((a, i) => [`R${i + 1}`, ...a]))], warnings: w };
    },
    formula: 'χ² = Σ (O − E)² / E;   independence: E = row total × column total / N, df = (r − 1)(c − 1)',
    assumptions: 'Independent observations; expected counts mostly ≥ 5.',
    example: { mode: 'gof', obs: '315 108 101 32', exp: '9 3 3 1' },
  },
  {
    id: 'ci_prop', cat: 'stats', name: 'Confidence interval for a proportion',
    inputs: [int('x', 'Successes x', { min: 0 }), int('n', 'Trials n', { min: 1 }), num('conf', 'Confidence level', { def: 0.95 })],
    compute({ x, n, conf = 0.95 }) {
      if (x > n) fail('x cannot exceed n'); if (!(conf > 0 && conf < 1)) fail('Confidence level must be between 0 and 1');
      const p = x / n, z = S.normInv(1 - (1 - conf) / 2), den = 1 + (z * z) / n;
      const cen = (p + (z * z) / (2 * n)) / den, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den, wald = z * Math.sqrt((p * (1 - p)) / n);
      return { results: [r('p̂', p), txt(`Wilson ${Math.round(conf * 100)} % CI`, `${(cen - half).toFixed(4)} – ${(cen + half).toFixed(4)}`), txt('Wald CI (for comparison)', `${Math.max(0, p - wald).toFixed(4)} – ${Math.min(1, p + wald).toFixed(4)}`), r('SE', Math.sqrt((p * (1 - p)) / n))] };
    },
    formula: 'Wilson: [p̂ + z²/2n ± z·√(p̂(1−p̂)/n + z²/4n²)] / (1 + z²/n)',
    assumptions: 'Independent Bernoulli trials. Wilson is preferred over Wald for small n or extreme p.',
    example: { x: 18, n: 120, conf: 0.95 },
  },
  // ── utilities ──
  {
    id: 'date_convert', cat: 'util', name: 'Date converter (Gregorian ↔ Jalali) & date difference',
    inputs: [sel('mode', 'Convert', [['g2j', 'Gregorian → Jalali'], ['j2g', 'Jalali → Gregorian']]), text('date', 'Date (YYYY-MM-DD, or YYYY/MM/DD for Jalali)', { rows: 1 }), text('date2', 'Second date for the difference (optional, same calendar)', { rows: 1, optional: true }), int('add', 'Add days (optional, may be negative)', { optional: true })],
    compute({ mode, date, date2, add }) {
      const toDate = (s, label) => {
        const t = S.normalizeDigits(s).trim();
        if (mode === 'j2g') { const p = J.parseJalali(t); if (!p) fail(`${label}: use YYYY/MM/DD (e.g. 1405/09/02)`); const g = J.toGregorian(p.jy, p.jm, p.jd); return new Date(Date.UTC(g.gy, g.gm - 1, g.gd)); }
        const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t); if (!m) fail(`${label}: use YYYY-MM-DD`);
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) fail(`${label}: no such Gregorian date`); return d;
      };
      const d = toDate(date, 'Date');
      const desc = (x) => { const j = J.toJalali(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); return { g: x.toISOString().slice(0, 10), wd: x.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }), j: `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`, jl: `${j.jd} ${J.JALALI_MONTHS[j.jm - 1]} ${j.jy}`, fa: `${j.jd} ${J.JALALI_MONTHS_FA[j.jm - 1]} ${j.jy}`, jy: j.jy } };
      const a = desc(d);
      const out = [txt('Gregorian', `${a.g} (${a.wd})`), txt('Jalali', `${a.j} · ${a.jl}`), txt('فارسی', a.fa), txt('Jalali leap year', J.isJalaliLeap(a.jy) ? `${a.jy} is a leap year (Esfand has 30 days)` : `${a.jy} is a common year`)];
      if (date2 && String(date2).trim()) { const d2 = toDate(date2, 'Second date'); const diff = Math.round((d2 - d) / 864e5); out.push(r('Difference (second − first)', diff, 'days', 0), r('≈ weeks', diff / 7, 'wk', 2)); }
      if (add !== undefined) { const b = desc(new Date(d.getTime() + add * 864e5)); out.push(txt(`${add >= 0 ? '+' : ''}${add} days`, `${b.g} (${b.wd}) · ${b.jl}`)); }
      return { results: out };
    },
    formula: 'Conversion uses the ICU Persian (Solar Hijri) calendar built into Chromium / Node; differences are counted in whole days.',
    assumptions: 'Dates are calendar days (no time zone shifts). Jalali years are astronomical (Nowruz at the vernal equinox, Tehran time).',
    example: { mode: 'j2g', date: '1405/09/02', date2: '1405/12/29', add: 147 },
  },
  {
    id: 'dilution', cat: 'util', name: 'Dilution (C₁V₁ = C₂V₂)',
    inputs: [num('c1', 'C₁ stock concentration', { optional: true }), num('v1', 'V₁ stock volume', { optional: true }), num('c2', 'C₂ final concentration', { optional: true }), num('v2', 'V₂ final volume', { optional: true })],
    compute({ c1, v1, c2, v2 }) {
      const vals = { c1, v1, c2, v2 }; const miss = Object.keys(vals).filter((k) => vals[k] === undefined);
      if (miss.length !== 1) fail('Leave exactly one field empty — it will be calculated');
      const k = miss[0];
      const v = k === 'c1' ? (c2 * v2) / v1 : k === 'v1' ? (c2 * v2) / c1 : k === 'c2' ? (c1 * v1) / v2 : (c1 * v1) / c2;
      if (!Number.isFinite(v)) fail('Division by zero — check the inputs');
      const out = [r({ c1: 'C₁', v1: 'V₁', c2: 'C₂', v2: 'V₂' }[k], v)];
      const V1 = k === 'v1' ? v : v1, V2 = k === 'v2' ? v : v2; if (V2 >= V1) out.push(r('Diluent to add (V₂ − V₁)', V2 - V1));
      return { results: out };
    },
    formula: 'C₁·V₁ = C₂·V₂  — use consistent units',
    assumptions: 'Ideal mixing; concentrations and volumes in consistent units.',
    example: { c1: 10, v1: '', c2: 2, v2: 50 },
  },
];
