// Gene OS — pedigree engine: parsing, sorting, numerator relationship matrix (A), inbreeding,
// Henderson's A-inverse, single-trait animal-model BLUP, mating planning and ASCII ancestry trees.
import { normalizeDigits } from './stats.mjs';

export const MAX_A = 3000;   // dense A-matrix limit (memory: n² doubles)
export const MAX_BLUP = 1200; // dense MME inverse limit (time grows with n³)
const UNKNOWN = new Set(['', '0', 'na', 'nan', '.', '-', 'unknown', 'null']);
const isUnknown = (v) => UNKNOWN.has(String(v ?? '').trim().toLowerCase());

function splitLine(l) { return l.includes(',') ? l.split(',') : l.includes(';') ? l.split(';') : l.split(/\s+/); }

export function parsePedigree(text) {
  const lines = normalizeDigits(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!lines.length) throw new Error('Pedigree is empty');
  let start = 0;
  const first = splitLine(lines[0]).map((s) => s.trim().toLowerCase());
  if (['id', 'animal', 'ind', 'individual'].includes(first[0])) start = 1;
  const map = new Map(); const warnings = [];
  for (let i = start; i < lines.length; i++) {
    const f = splitLine(lines[i]).map((s) => s.trim());
    if (f.length < 3) { warnings.push(`Line ${i + 1}: expected id, sire, dam`); continue; }
    const [id, s, d, ...extra] = f;
    if (map.has(id)) { warnings.push(`Duplicate record for ${id} (line ${i + 1}) — first kept`); continue; }
    const sire = isUnknown(s) ? null : s, dam = isUnknown(d) ? null : d;
    if (sire === id || dam === id) throw new Error(`Animal ${id} is listed as its own parent`);
    map.set(id, { id, sire, dam, extra });
  }
  for (const a of [...map.values()]) for (const p of [a.sire, a.dam]) if (p && !map.has(p)) { map.set(p, { id: p, sire: null, dam: null, extra: [], added: true }); }
  const added = [...map.values()].filter((a) => a.added).length;
  if (added) warnings.push(`${added} parent(s) without own record were added as founders`);
  return { animals: sortPedigree([...map.values()]), warnings };
}

// Topological order: parents always before offspring. Throws on cycles.
export function sortPedigree(animals) {
  const byId = new Map(animals.map((a) => [a.id, a]));
  const out = []; const state = new Map();
  const visit = (a, depth = 0) => {
    const st = state.get(a.id);
    if (st === 2) return; if (st === 1) throw new Error(`Pedigree loop detected at ${a.id}`);
    if (depth > 10000) throw new Error('Pedigree too deep');
    state.set(a.id, 1);
    for (const p of [a.sire, a.dam]) if (p && byId.has(p)) visit(byId.get(p), depth + 1);
    state.set(a.id, 2); out.push(a);
  };
  // iterative-safe for typical pedigrees; recursion depth equals number of generations
  for (const a of animals) visit(a);
  return out;
}

// Tabular method. Returns { ids, index, A (Float64Array rows), F }.
export function relationshipMatrix(animals) {
  const n = animals.length;
  if (n > MAX_A) throw new Error(`Pedigree has ${n} animals; dense A-matrix limit is ${MAX_A}`);
  const index = new Map(animals.map((a, i) => [a.id, i]));
  const A = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    const s = animals[i].sire != null ? index.get(animals[i].sire) : undefined;
    const d = animals[i].dam != null ? index.get(animals[i].dam) : undefined;
    for (let j = 0; j < i; j++) {
      const v = 0.5 * ((s !== undefined ? A[j][s] : 0) + (d !== undefined ? A[j][d] : 0));
      A[i][j] = v; A[j][i] = v;
    }
    A[i][i] = 1 + (s !== undefined && d !== undefined ? 0.5 * A[s][d] : 0);
  }
  const F = Array.from({ length: n }, (_, i) => A[i][i] - 1);
  return { ids: animals.map((a) => a.id), index, A, F };
}

// Henderson (1976) rules accounting for parental inbreeding.
export function aInverse(animals, F) {
  const n = animals.length; const index = new Map(animals.map((a, i) => [a.id, i]));
  const Ai = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    const s = animals[i].sire != null ? index.get(animals[i].sire) : undefined;
    const d = animals[i].dam != null ? index.get(animals[i].dam) : undefined;
    let dii = 1;
    if (s !== undefined && d !== undefined) dii = 0.5 - 0.25 * (F[s] + F[d]);
    else if (s !== undefined) dii = 0.75 - 0.25 * F[s];
    else if (d !== undefined) dii = 0.75 - 0.25 * F[d];
    const a = 1 / dii;
    Ai[i][i] += a;
    for (const p of [s, d]) if (p !== undefined) { Ai[i][p] -= a / 2; Ai[p][i] -= a / 2; Ai[p][p] += a / 4; }
    if (s !== undefined && d !== undefined) { Ai[s][d] += a / 4; Ai[d][s] += a / 4; }
  }
  return Ai;
}

function invertInPlace(M, withLogDet = false) { // Gauss–Jordan with partial pivoting, returns inverse (and log|M|)
  const n = M.length; const I = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
  let logDet = 0;
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) throw new Error('Mixed-model equations are singular — check that every fixed-effect level has records');
    [M[c], M[piv]] = [M[piv], M[c]]; [I[c], I[piv]] = [I[piv], I[c]];
    const d = M[c][c]; logDet += Math.log(Math.abs(d));
    for (let j = 0; j < n; j++) { M[c][j] /= d; I[c][j] /= d; }
    for (let r = 0; r < n; r++) {
      if (r === c) continue; const f = M[r][c]; if (!f) continue;
      const Mr = M[r], Mc = M[c], Ir = I[r], Ic = I[c];
      for (let j = 0; j < n; j++) { Mr[j] -= f * Mc[j]; Ir[j] -= f * Ic[j]; }
    }
  }
  return withLogDet ? { inv: I, logDet } : I;
}

// Records: lines "id, group, y" (group = contemporary group / fixed effect level). h2 in (0,1).
export function parseRecords(text) {
  const lines = normalizeDigits(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const recs = []; const warnings = [];
  for (let i = 0; i < lines.length; i++) {
    const f = splitLine(lines[i]).map((s) => s.trim());
    if (i === 0 && isNaN(Number(f[f.length - 1]))) continue; // header
    if (f.length < 3) { warnings.push(`Record line ${i + 1}: expected id, group, value`); continue; }
    const y = Number(f[2]);
    if (!Number.isFinite(y)) { warnings.push(`Record line ${i + 1}: value is not numeric`); continue; }
    recs.push({ id: f[0], group: f[1], y });
  }
  return { recs, warnings };
}

// Mixed-model equations for y = Xb + Za + e with one fixed factor (contemporary group).
function mmeSetup(animals, recs) {
  const n = animals.length;
  const { index, F } = relationshipMatrix(animals);
  const used = recs.filter((r) => index.has(r.id));
  const missing = [...new Set(recs.filter((r) => !index.has(r.id)).map((r) => r.id))];
  if (!used.length) throw new Error('None of the records belong to animals in the pedigree');
  const groups = [...new Set(used.map((r) => r.group))];
  const gi = new Map(groups.map((g, i) => [g, i])); const p = groups.length; const m = p + n;
  const base = Array.from({ length: m }, () => new Float64Array(m)); const rhs = new Float64Array(m);
  let yy = 0;
  for (const r of used) {
    const g = gi.get(r.group), ai = p + index.get(r.id);
    base[g][g] += 1; base[g][ai] += 1; base[ai][g] += 1; base[ai][ai] += 1; rhs[g] += r.y; rhs[ai] += r.y; yy += r.y * r.y;
  }
  const Ai = aInverse(animals, F);
  // log|A| = Σ log dᵢ (Henderson's D), where 1/dᵢ is the diagonal coefficient added for animal i
  const logDetA = animals.reduce((acc, a, i) => {
    const s = a.sire != null ? index.get(a.sire) : undefined, d = a.dam != null ? index.get(a.dam) : undefined;
    const di = s !== undefined && d !== undefined ? 0.5 - 0.25 * (F[s] + F[d]) : s !== undefined ? 0.75 - 0.25 * F[s] : d !== undefined ? 0.75 - 0.25 * F[d] : 1;
    return acc + Math.log(di);
  }, 0);
  return { n, p, m, groups, index, F, base, rhs, Ai, yy, N: used.length, missing, logDetA };
}
function mmeSolve(S, lambda, logDet = false) {
  const { p, n, m, base, rhs, Ai } = S;
  const C = base.map((r) => Float64Array.from(r));
  for (let i = 0; i < n; i++) { const row = Ai[i]; const Ci = C[p + i]; for (let j = 0; j < n; j++) if (row[j]) Ci[p + j] += row[j] * lambda; }
  const res = invertInPlace(C, logDet);
  const Cinv = logDet ? res.inv : res;
  const sol = Array.from({ length: m }, (_, i) => { let s = 0; const row = Cinv[i]; for (let j = 0; j < m; j++) s += row[j] * rhs[j]; return s; });
  return { Cinv, sol, logDetC: logDet ? res.logDet : null };
}

export function animalModelBlup(animals, recs, h2) {
  if (!(h2 > 0 && h2 < 1)) throw new Error('Heritability must be between 0 and 1 (exclusive)');
  const n = animals.length;
  if (n > MAX_BLUP) throw new Error(`BLUP workspace handles up to ${MAX_BLUP} animals (dense solver). Use BLUPF90 for larger data.`);
  const S = mmeSetup(animals, recs);
  const lambda = (1 - h2) / h2;
  const { Cinv, sol } = mmeSolve(S, lambda);
  const { p, F } = S;
  const nRec = new Map(); for (const r of recs) nRec.set(r.id, (nRec.get(r.id) || 0) + 1);
  const results = animals.map((a, i) => {
    const rel = Math.max(0, 1 - Cinv[p + i][p + i] * lambda);
    return { id: a.id, sire: a.sire, dam: a.dam, ebv: sol[p + i], reliability: rel, accuracy: Math.sqrt(rel), F: F[i], records: nRec.get(a.id) || 0 };
  });
  return { fixed: S.groups.map((g, i) => ({ group: g, solution: sol[i] })), animals: results, lambda, missing: S.missing };
}

export const MAX_REML = 800;
// Single-trait animal-model REML by the EM algorithm (Henderson; Mrode 2014, ch. 11):
//   σ²e ← (y′y − b̂′X′y − â′Z′y) / (N − r(X))
//   σ²a ← (â′A⁻¹â + σ²e·tr(A⁻¹C^aa)) / q
// C^aa is the animal block of the inverse of the MME coefficient matrix (built with λ = σ²e/σ²a).
// Also reports −2 log L (REML, up to a constant) = (N − r)·log σ²e + q·log σ²a + log|A| + log|C| − m·log σ²e … see below.
export function remlAnimal(animals, recs, { h2Start = 0.3, maxIter = 1000, tol = 1e-7, onIter, start = null, skipLogL = false } = {}) {
  const n = animals.length;
  if (n > MAX_REML) throw new Error(`REML workspace handles up to ${MAX_REML} animals (dense EM). Use AIREMLF90 for larger data.`);
  if (!(h2Start > 0 && h2Start < 1)) throw new Error('Starting h² must be between 0 and 1');
  const S = mmeSetup(animals, recs);
  const { p, m, N, yy, rhs, Ai } = S;
  const q = n, rX = p;
  if (N - rX < 2) throw new Error('Too few records for variance estimation');
  // starting values from the phenotypic variance within groups
  const ybarG = S.groups.map((_, g) => rhs[g] / S.base[g][g]);
  const ssw = yy - S.groups.reduce((a, _, g) => a + S.base[g][g] * ybarG[g] * ybarG[g], 0);
  const vp = Math.max(1e-8, ssw / (N - rX));
  let va = start ? start.va : h2Start * vp, ve = start ? start.ve : (1 - h2Start) * vp;
  const history = []; let it = 0, converged = false;
  for (it = 1; it <= maxIter; it++) {
    const lambda = ve / va;
    const { Cinv, sol } = mmeSolve(S, lambda);
    let ypy = yy; for (let i = 0; i < m; i++) ypy -= sol[i] * rhs[i];
    const veN = ypy / (N - rX);
    let aAa = 0, tr = 0;
    for (let i = 0; i < n; i++) {
      const row = Ai[i]; let s = 0, t = 0;
      for (let j = 0; j < n; j++) if (row[j]) { s += row[j] * sol[p + j]; t += row[j] * Cinv[p + j][p + i]; }
      aAa += sol[p + i] * s; tr += t;
    }
    const vaN = (aAa + tr * ve) / q;
    const change = Math.abs(vaN - va) / Math.max(va, 1e-12) + Math.abs(veN - ve) / Math.max(ve, 1e-12);
    va = Math.max(vaN, 1e-10); ve = Math.max(veN, 1e-10);
    history.push({ it, va, ve, h2: va / (va + ve) });
    if (onIter) onIter(history[history.length - 1]);
    if (change < tol) { converged = true; break; }
  }
  if (skipLogL) return { va, ve, vp: va + ve, h2: va / (va + ve), iterations: Math.min(it, maxIter), converged, history, N, q, rX };
  // −2 log L_REML = (N − r(X) − q)·log σ²e + q·log σ²a + log|A| + log|C| + y′Py      (C built with λ; constant omitted)
  //   with y′Py = (y′y − b̂′X′y − â′Z′y)/σ²e   (Meyer 1989; Mrode 2014)
  const lambda = ve / va;
  const fin = mmeSolve(S, lambda, true);
  let ypy = yy; for (let i = 0; i < m; i++) ypy -= fin.sol[i] * rhs[i];
  const m2logL = (N - rX - q) * Math.log(ve) + q * Math.log(va) + S.logDetA + fin.logDetC + ypy / ve;
  return { va, ve, vp: va + ve, h2: va / (va + ve), iterations: Math.min(it, maxIter), converged, m2logL, logL: -0.5 * m2logL, history, N, q, rX, lambda };
}

// ── fast REML: profile likelihood in λ = σ²e/σ²a, Cholesky factorization (no inverse per step) ──
function cholLogDetSolve(S, lambda) {
  const { p, n, m, base, rhs, Ai } = S;
  const L = base.map((r) => Float64Array.from(r));
  for (let i = 0; i < n; i++) { const row = Ai[i]; const Li = L[p + i]; for (let j = 0; j < n; j++) if (row[j]) Li[p + j] += row[j] * lambda; }
  let logDet = 0;
  for (let j = 0; j < m; j++) {
    const Lj = L[j];
    let d = Lj[j]; for (let k = 0; k < j; k++) d -= Lj[k] * Lj[k];
    if (!(d > 1e-14)) throw new Error('Mixed-model equations are not positive definite — check that every fixed-effect level has records');
    d = Math.sqrt(d); Lj[j] = d; logDet += 2 * Math.log(d);
    for (let i = j + 1; i < m; i++) { const Li = L[i]; let s2 = Li[j]; for (let k = 0; k < j; k++) s2 -= Li[k] * Lj[k]; Li[j] = s2 / d; }
  }
  const z = new Float64Array(m); for (let i = 0; i < m; i++) { let s2 = rhs[i]; const Li = L[i]; for (let k = 0; k < i; k++) s2 -= Li[k] * z[k]; z[i] = s2 / Li[i]; }
  const x = new Float64Array(m); for (let i = m - 1; i >= 0; i--) { let s2 = z[i]; for (let k = i + 1; k < m; k++) s2 -= L[k][i] * x[k]; x[i] = s2 / L[i][i]; }
  let ypyRaw = S.yy; for (let i = 0; i < m; i++) ypyRaw -= x[i] * rhs[i];
  return { logDet, ypyRaw };
}
// −2 log L (constant omitted) at (σ²a, σ²e) via Cholesky
function m2ll(S, va, ve) { const { logDet, ypyRaw } = cholLogDetSolve(S, ve / va); return (S.N - S.p - S.n) * Math.log(ve) + S.n * Math.log(va) + S.logDetA + logDet + ypyRaw / ve; }
// profiled −2 log L as a function of t = ln λ, with σ²e maximized out
function profile(S, t) {
  const lambda = Math.exp(t); const { logDet, ypyRaw } = cholLogDetSolve(S, lambda);
  const df = S.N - S.p, ve = ypyRaw / df;
  return { val: df * Math.log(ve) - S.n * Math.log(lambda) + S.logDetA + logDet + df, ve, va: ve / lambda };
}
export const MAX_REML_FAST = 2500;
export function remlProfile(animals, recs, { tol = 1e-8 } = {}) {
  if (animals.length > MAX_REML_FAST) throw new Error(`REML handles up to ${MAX_REML_FAST} animals here (dense). Use AIREMLF90 for larger data.`);
  const S = mmeSetup(animals, recs);
  if (S.N - S.p < 3) throw new Error('Too few records for variance estimation');
  const lo = Math.log(1 / 999), hi = Math.log(999);   // h² ∈ [0.001, 0.999]
  let evals = 0; const f = (t) => { evals++; return profile(S, t).val; };
  // coarse grid to bracket the global minimum, then golden-section search
  const G = 24; let bi = 0, bv = Infinity; const grid = [];
  for (let k = 0; k <= G; k++) { const t = lo + ((hi - lo) * k) / G; const v = f(t); grid.push([t, v]); if (v < bv) { bv = v; bi = k; } }
  let a = grid[Math.max(0, bi - 1)][0], b = grid[Math.min(G, bi + 1)][0];
  const gr = (Math.sqrt(5) - 1) / 2; let c = b - gr * (b - a), d = a + gr * (b - a), fc = f(c), fd = f(d);
  while (Math.abs(b - a) > tol) { if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(d); } }
  const tBest = (a + b) / 2; const pr = profile(S, tBest);
  const va = pr.va, ve = pr.ve, h2 = va / (va + ve);
  const m2 = m2ll(S, va, ve);
  // asymptotic SEs: numerical Hessian of −2 log L in (σ²a, σ²e); Var(θ) ≈ 2·H⁻¹; delta method for h²
  let se = null;
  try {
    const hA = va * 1e-3, hE = ve * 1e-3, F = (x, y) => m2ll(S, x, y);
    const faa = (F(va + hA, ve) - 2 * m2 + F(va - hA, ve)) / (hA * hA);
    const fee = (F(va, ve + hE) - 2 * m2 + F(va, ve - hE)) / (hE * hE);
    const fae = (F(va + hA, ve + hE) - F(va + hA, ve - hE) - F(va - hA, ve + hE) + F(va - hA, ve - hE)) / (4 * hA * hE);
    const det = faa * fee - fae * fae;
    if (det > 0 && faa > 0) {
      const vaa = (2 * fee) / det, vee = (2 * faa) / det, vae = (-2 * fae) / det;
      const vp = va + ve, ga = ve / (vp * vp), ge = -va / (vp * vp);
      se = { va: Math.sqrt(vaa), ve: Math.sqrt(vee), h2: Math.sqrt(Math.max(0, ga * ga * vaa + 2 * ga * ge * vae + ge * ge * vee)), corr: vae / Math.sqrt(vaa * vee) };
    }
  } catch { se = null; }
  const boundary = h2 < 0.0015 || h2 > 0.9985;
  return { method: 'profile', va, ve, vp: va + ve, h2, se, m2logL: m2, logL: -0.5 * m2, evaluations: evals, boundary, N: S.N, q: S.n, rX: S.p, lambda: ve / va,
    curve: grid.map(([t, v]) => ({ h2: 1 / (1 + Math.exp(t)), m2logL: v })).reverse() };
}
export const remlAnimalEM = remlAnimal;

// −2 log L at fixed (σ²a, σ²e), for profiling / verification.
export function remlM2LogL(animals, recs, va, ve) { return m2ll(mmeSetup(animals, recs), va, ve); }

// Expected inbreeding of progeny = half the additive relationship between mates.
export function matingMatrix(rel, sires, dams) {
  const miss = [...sires, ...dams].filter((x) => !rel.index.has(x));
  if (miss.length) throw new Error('Not in pedigree: ' + miss.join(', '));
  return sires.map((s) => dams.map((d) => 0.5 * rel.A[rel.index.get(s)][rel.index.get(d)]));
}
// Greedy plan: each dam gets the available sire that gives the lowest progeny F (ties: fewest uses).
export function planMatings(rel, sires, dams, maxPerSire = Infinity, maxF = 1) {
  const M = matingMatrix(rel, sires, dams); const uses = new Array(sires.length).fill(0);
  const order = dams.map((d, j) => ({ d, j, best: Math.min(...M.map((r) => r[j])) })).sort((a, b) => b.best - a.best); // hardest dams first
  const plan = [];
  for (const { d, j } of order) {
    let bi = -1;
    for (let i = 0; i < sires.length; i++) {
      if (uses[i] >= maxPerSire) continue;
      if (bi < 0 || M[i][j] < M[bi][j] - 1e-12 || (Math.abs(M[i][j] - M[bi][j]) < 1e-12 && uses[i] < uses[bi])) bi = i;
    }
    if (bi < 0) { plan.push({ dam: d, sire: null, F: null, note: 'no sire capacity left' }); continue; }
    uses[bi]++; plan.push({ dam: d, sire: sires[bi], F: M[bi][j], note: M[bi][j] > maxF ? 'exceeds F limit' : '' });
  }
  return { matrix: M, plan: plan.sort((a, b) => dams.indexOf(a.dam) - dams.indexOf(b.dam)), uses: sires.map((s, i) => ({ sire: s, matings: uses[i] })) };
}

export function ancestryTree(animals, id, depth = 4) {
  const by = new Map(animals.map((a) => [a.id, a]));
  if (!by.has(id)) throw new Error(`Animal ${id} not found`);
  const lines = [id];
  const walk = (aid, prefix, level) => {
    if (level >= depth) return;
    const a = by.get(aid); if (!a) return;
    const kids = [['S', a.sire], ['D', a.dam]];
    kids.forEach(([tag, pid], k) => {
      const last = k === 1; const branch = last ? '└── ' : '├── ';
      lines.push(`${prefix}${branch}${tag}: ${pid ?? '(unknown)'}`);
      if (pid) walk(pid, prefix + (last ? '    ' : '│   '), level + 1);
    });
  };
  walk(id, '', 0);
  return lines;
}
export function descendants(animals, id) {
  const kids = new Map(); for (const a of animals) for (const p of [a.sire, a.dam]) if (p) (kids.get(p) || kids.set(p, []).get(p)).push(a.id);
  const out = []; const seen = new Set(); const q = [[id, 0]];
  while (q.length) { const [x, g] = q.shift(); for (const k of kids.get(x) || []) if (!seen.has(k)) { seen.add(k); out.push({ id: k, generation: g + 1 }); q.push([k, g + 1]); } }
  return out;
}
export function pedigreeStats(animals, F) {
  const founders = animals.filter((a) => !a.sire && !a.dam).length;
  const inbred = F.filter((f) => f > 1e-12);
  return { n: animals.length, founders, bothKnown: animals.filter((a) => a.sire && a.dam).length, inbred: inbred.length, meanF: F.reduce((s, f) => s + f, 0) / (F.length || 1), maxF: F.length ? Math.max(...F) : 0 };
}
