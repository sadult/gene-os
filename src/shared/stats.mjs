// Gene OS — numerical core. Pure functions, no DOM / Node dependencies.
// Special functions follow Numerical Recipes (3rd ed.) and Acklam's inverse-normal algorithm.

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹', ARABIC = '٠١٢٣٤٥٦٧٨٩';
export function normalizeDigits(s) {
  return String(s ?? '').replace(/[۰-۹]/g, (d) => PERSIAN.indexOf(d)).replace(/[٠-٩]/g, (d) => ARABIC.indexOf(d)).replace(/٫/g, '.').replace(/٬/g, ',');
}
export function parseNumber(s) {
  const t = normalizeDigits(s).trim();
  if (t === '') return NaN;
  return Number(t);
}
// Parse a list of numbers separated by commas, semicolons, whitespace or new lines. Non-numeric tokens are reported.
export function parseNumbers(text) {
  const toks = normalizeDigits(text).split(/[\s,;\t]+/).filter(Boolean);
  const values = [], bad = [];
  for (const t of toks) { const v = Number(t); if (Number.isFinite(v)) values.push(v); else if (!/^(na|nan|\.|-)$/i.test(t)) bad.push(t); }
  return { values, bad };
}

// ---------- descriptive ----------
export const sum = (x) => x.reduce((a, b) => a + b, 0);
export const mean = (x) => (x.length ? sum(x) / x.length : NaN);
export function variance(x, sample = true) {
  const n = x.length; if (n < (sample ? 2 : 1)) return NaN;
  const m = mean(x); let s = 0; for (const v of x) s += (v - m) ** 2;
  return s / (sample ? n - 1 : n);
}
export const sd = (x, sample = true) => Math.sqrt(variance(x, sample));
export function quantile(x, p) { // type 7 (R default / Excel PERCENTILE.INC)
  if (!x.length) return NaN;
  const s = [...x].sort((a, b) => a - b);
  const h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
export const median = (x) => quantile(x, 0.5);
export function modes(x) {
  const c = new Map(); for (const v of x) c.set(v, (c.get(v) || 0) + 1);
  const max = Math.max(...c.values()); if (max <= 1) return [];
  return [...c].filter(([, n]) => n === max).map(([v]) => v);
}
export function skewness(x) { // adjusted Fisher–Pearson G1
  const n = x.length; if (n < 3) return NaN;
  const m = mean(x), s = sd(x, false); let a = 0; for (const v of x) a += ((v - m) / s) ** 3;
  return (Math.sqrt(n * (n - 1)) / (n - 2)) * (a / n);
}
export function kurtosis(x) { // sample excess kurtosis G2
  const n = x.length; if (n < 4) return NaN;
  const m = mean(x), v = variance(x, false); let a = 0; for (const t of x) a += (t - m) ** 4;
  const g2 = a / n / (v * v) - 3;
  return ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * g2 + 6);
}
export function describe(x) {
  const n = x.length, m = mean(x), s = sd(x), se = s / Math.sqrt(n);
  const tc = n > 1 ? tInv(0.975, n - 1) : NaN;
  return {
    n, mean: m, median: median(x), modes: modes(x), sd: s, variance: variance(x), se, cv: (100 * s) / m,
    min: Math.min(...x), max: Math.max(...x), range: Math.max(...x) - Math.min(...x), q1: quantile(x, 0.25), q3: quantile(x, 0.75),
    iqr: quantile(x, 0.75) - quantile(x, 0.25), skewness: skewness(x), kurtosis: kurtosis(x), sum: sum(x),
    ci95: [m - tc * se, m + tc * se],
  };
}
export function ranks(x) { // average ranks for ties
  const idx = x.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(x.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1;
  }
  return r;
}
export function pearson(x, y) {
  if (x.length !== y.length) throw new Error('x and y must have the same length');
  const n = x.length; if (n < 3) throw new Error('Need at least 3 pairs');
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  const r = sxy / Math.sqrt(sxx * syy);
  const t = r * Math.sqrt((n - 2) / Math.max(1e-300, 1 - r * r));
  const p = 2 * (1 - tCdf(Math.abs(t), n - 2));
  const z = Math.atanh(Math.max(-0.999999999, Math.min(0.999999999, r))), zse = 1 / Math.sqrt(n - 3), zc = normInv(0.975);
  return { r, n, t, df: n - 2, p, ci95: n > 3 ? [Math.tanh(z - zc * zse), Math.tanh(z + zc * zse)] : [NaN, NaN] };
}
export function spearman(x, y) { const res = pearson(ranks(x), ranks(y)); return { rho: res.r, p: res.p, n: res.n }; }
export function linreg(x, y) {
  if (x.length !== y.length) throw new Error('x and y must have the same length');
  const n = x.length; if (n < 3) throw new Error('Need at least 3 pairs');
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0) throw new Error('x has zero variance');
  const b = sxy / sxx, a = my - b * mx;
  const sse = Math.max(0, syy - b * sxy), df = n - 2, mse = sse / df;
  const seB = Math.sqrt(mse / sxx), seA = Math.sqrt(mse * (1 / n + (mx * mx) / sxx));
  const t = b / seB, p = 2 * (1 - tCdf(Math.abs(t), df));
  return { a, b, r2: syy ? 1 - sse / syy : NaN, r: sxy / Math.sqrt(sxx * syy), seA, seB, t, p, df, mse, n, mx, sxx };
}

// ---------- special functions ----------
const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1; let a = LG[0]; const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
export function gammaP(a, x) { // regularized lower incomplete gamma
  if (x <= 0) return 0;
  const gln = lgamma(a);
  if (x < a + 1) {
    let ap = a, s = 1 / a, del = s;
    for (let i = 0; i < 1000; i++) { ap += 1; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-15) break; }
    return s * Math.exp(-x + a * Math.log(x) - gln);
  }
  const tiny = 1e-300; let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
}
function betacf(a, b, x) {
  const FPMIN = 1e-300; const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-15) break;
  }
  return h;
}
export function betai(a, b, x) { // regularized incomplete beta I_x(a,b)
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
export const erf = (x) => (x >= 0 ? gammaP(0.5, x * x) : -gammaP(0.5, x * x));
export const normPdf = (z, mu = 0, s = 1) => Math.exp(-0.5 * ((z - mu) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
export const normCdf = (z, mu = 0, s = 1) => 0.5 * (1 + erf((z - mu) / (s * Math.SQRT2)));
export function normInv(p, mu = 0, s = 1) {
  if (!(p > 0 && p < 1)) { if (p === 0) return -Infinity; if (p === 1) return Infinity; return NaN; }
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425; let q, r, x;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p <= 1 - pl) { q = p - 0.5; r = q * q; x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const e = normCdf(x) - p, u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2); x -= u / (1 + (x * u) / 2); // Halley refinement
  return mu + s * x;
}
export function tCdf(t, df) {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t), p = 0.5 * betai(df / 2, 0.5, x);
  return t > 0 ? 1 - p : p;
}
export function tInv(p, df) {
  if (!(p > 0 && p < 1)) return NaN;
  let lo = -1e4, hi = 1e4;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (tCdf(mid, df) < p) lo = mid; else hi = mid; if (hi - lo < 1e-12) break; }
  return (lo + hi) / 2;
}
export const chi2Cdf = (x, k) => (x <= 0 ? 0 : gammaP(k / 2, x / 2));
export const fCdf = (f, d1, d2) => (f <= 0 ? 0 : betai(d1 / 2, d2 / 2, (d1 * f) / (d1 * f + d2)));
export const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
export function choose(n, k) { if (k < 0 || k > n) return 0; return Math.round(Math.exp(lchoose(n, k))); }
export const binomPmf = (k, n, p) => (k < 0 || k > n ? 0 : Math.exp(lchoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p)));
export function binomCdf(k, n, p) { let s = 0; for (let i = 0; i <= Math.min(k, n); i++) s += binomPmf(i, n, p); return Math.min(1, s); }
export const poissonPmf = (k, l) => Math.exp(-l + k * Math.log(l) - lgamma(k + 1));
export const poissonCdf = (k, l) => 1 - gammaP(k + 1, l);

// Selection intensity under truncation selection of a normal trait, proportion p selected (infinite population).
export function selectionIntensity(p) {
  if (!(p > 0 && p < 1)) throw new Error('Proportion selected must be between 0 and 1');
  const x = normInv(1 - p);
  return { x, i: normPdf(x) / p };
}

// ---------- linear algebra (dense, small matrices) ----------
export function matInverse(M) {
  const n = M.length; const A = M.map((r, i) => { const row = new Float64Array(2 * n); row.set(r); row[n + i] = 1; return row; });
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) throw new Error('Matrix is singular (or nearly singular)');
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = A[r][c]; if (f) for (let j = c; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((r) => Array.from(r.subarray(n)));
}
export const matMul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
export const matVec = (A, v) => A.map((r) => r.reduce((s, x, k) => s + x * v[k], 0));
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export function parseMatrix(text) {
  const rows = normalizeDigits(text).trim().split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[\s,;\t]+/).map(Number));
  if (!rows.length) throw new Error('Matrix is empty');
  const w = rows[0].length;
  if (rows.some((r) => r.length !== w || r.some((v) => !Number.isFinite(v)))) throw new Error('Matrix rows must all have the same number of numeric values');
  return rows;
}

// Small seeded PRNG (mulberry32) for reproducible randomization layouts.
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle(arr, rand) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
