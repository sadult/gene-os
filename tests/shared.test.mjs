// Unit tests for the shared scientific engine.  Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/shared/stats.mjs';
import * as P from '../src/shared/pedigree.mjs';
import * as G from '../src/shared/genetics.mjs';
import { evaluate } from '../src/shared/expr.mjs';
import { tokenize, parseArgs, splitChain, parseWhen, splitPipes, expandHistory } from '../src/shared/cmdparse.mjs';
import * as Q from '../src/shared/seq.mjs';
import * as J from '../src/shared/jalali.mjs';
import { render, outline, wordCount } from '../src/shared/markdown.mjs';

const near = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b} (tol ${tol})`);

test('distributions match reference tables', () => {
  near(S.normInv(0.975), 1.959964, 1e-6);
  near(S.normCdf(1.96), 0.9750021, 1e-6);
  near(S.tInv(0.975, 18), 2.100922, 1e-5);
  near(1 - S.chi2Cdf(3.841459, 1), 0.05, 1e-6);
  near(1 - S.fCdf(3.3541, 2, 27), 0.05, 1e-4);
  near(S.binomCdf(5, 20, 0.25), 0.6171727, 1e-6);
  near(S.poissonCdf(3, 2), 0.8571235, 1e-6);
});

test('selection intensity (truncation, infinite population)', () => {
  near(S.selectionIntensity(0.1).i, 1.75498, 1e-4);
  near(S.selectionIntensity(0.5).i, 0.797885, 1e-5);
  near(S.selectionIntensity(0.01).i, 2.66521, 1e-3);
});

test('descriptive statistics, correlation, regression', () => {
  const d = S.describe([2, 4, 4, 4, 5, 5, 7, 9]);
  near(d.mean, 5); near(d.sd, 2.13809, 1e-5); near(d.median, 4.5);
  near(S.pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]).r, 0.774597, 1e-5);
  const lr = S.linreg([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
  near(lr.b, 0.6); near(lr.a, 2.2);
  const I = S.matInverse([[4, 7], [2, 6]]);
  near(I[0][0], 0.6); near(I[0][1], -0.7); near(I[1][0], -0.2); near(I[1][1], 0.4);
});

test('relationship matrix & inbreeding (tabular method)', () => {
  const ped = P.parsePedigree('id,sire,dam\n1,0,0\n2,0,0\n3,1,2\n4,1,0\n5,4,3\n6,5,2');
  const rel = P.relationshipMatrix(ped.animals);
  const a = (x, y) => rel.A[rel.index.get(x)][rel.index.get(y)];
  near(a('5', '5'), 1.125); near(a('6', '6'), 1.125); near(a('5', '6'), 0.6875); near(a('3', '4'), 0.25);
  const Ai = P.aInverse(ped.animals, rel.F); const n = rel.ids.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += rel.A[i][k] * Ai[k][j]; near(s, i === j ? 1 : 0, 1e-10); }
});

test('animal model BLUP reproduces Mrode (2014) Example 3.1', () => {
  const ped = P.parsePedigree('1 0 0\n2 0 0\n3 0 0\n4 1 0\n5 3 2\n6 1 2\n7 4 5\n8 3 6');
  const { recs } = P.parseRecords('4 M 4.5\n5 F 2.9\n6 F 3.9\n7 M 3.5\n8 M 5.0');
  const r = P.animalModelBlup(ped.animals, recs, 1 / 3);
  const fx = Object.fromEntries(r.fixed.map((f) => [f.group, f.solution]));
  near(fx.M, 4.358, 1e-3); near(fx.F, 3.404, 1e-3);
  const e = Object.fromEntries(r.animals.map((x) => [x.id, x.ebv]));
  for (const [id, v] of Object.entries({ 1: 0.098, 2: -0.019, 3: -0.041, 4: -0.009, 5: -0.186, 6: 0.177, 7: -0.249, 8: 0.183 })) near(e[id], v, 1e-3);
});

test('pedigree validation & mating', () => {
  assert.throws(() => P.parsePedigree('a b 0\nb a 0'), /loop/);
  assert.throws(() => P.parsePedigree('a a 0'), /own parent/);
  const ped = P.parsePedigree('1,0,0\n2,0,0\n3,1,2\n4,1,0\n5,4,3\n6,5,2');
  const rel = P.relationshipMatrix(ped.animals);
  const plan = P.planMatings(rel, ['4', '5'], ['3', '6'], 1);
  near(plan.matrix[1][1], 0.34375);
  assert.equal(plan.plan.filter((p) => p.sire).length, 2);
  assert.equal(P.ancestryTree(ped.animals, '6', 2).length, 7);
});

test('every calculator example runs and yields finite results', () => {
  for (const c of G.CALCULATORS) {
    const raw = Object.fromEntries(Object.entries(c.example).map(([k, v]) => [k, String(v)]));
    const out = G.runCalculator(c.id, raw);
    assert.ok(out.results.length, c.id);
    for (const r of out.results) if (r.value !== undefined) assert.ok(Number.isFinite(r.value), `${c.id}: ${r.label}`);
  }
});

test('calculator spot checks', () => {
  const get = (id, raw, label) => G.runCalculator(id, raw).results.find((r) => r.label.startsWith(label));
  near(get('heritability', { va: '40', vd: '10', ve: '50' }, 'h²').value, 0.4);
  near(get('response', { mode: 'i', h2: '0.3', i: '1.4', sdp: '12', L: '2.5' }, 'R per generation').value, 5.04);
  near(get('haugh', { h: '7.2', w: '62' }, 'Haugh').value, 100 * Math.log10(7.2 - 1.7 * 62 ** 0.37 + 7.57), 1e-9);
  near(get('ne', { mode: 'sex', nm: '10', nf: '200' }, 'Ne').value, 4 * 10 * 200 / 210, 1e-9);
  near(get('relationship', { paths: '2 0\n2 0' }, 'Additive').value, 0.5);
  near(get('inbreeding_path', { paths: '1 1 0\n1 1 0' }, 'F').value, 0.25);
  near(get('bv_progeny', { n: '50', h2: '0.25', dev: '120' }, 'Accuracy').value, Math.sqrt(50 / (50 + 15)), 1e-9);
  assert.throws(() => G.runCalculator('heritability', { va: 'x', ve: '1' }), /not a number/);
  near(get('adg', { w1: '۱۰', w2: '۲۰', days: '۱۰' }, 'ADG').value, 1); // Persian digits
  assert.ok(G.hweExact(50, 25, 25) <= 1 && G.hweExact(0, 50, 50) < 1e-10);
});

test('expression evaluator', () => {
  const sc = {};
  assert.equal(evaluate('2+3*4^2', sc).value, 50);
  assert.equal(evaluate('-2^2', sc).value, -4);
  assert.equal(evaluate('h2 = 40/(40+60)', sc).value, 0.4);
  near(evaluate('sqrt(h2) * 2', sc).value, 2 * Math.sqrt(0.4), 1e-12);
  assert.throws(() => evaluate('2+', {}));
  assert.throws(() => evaluate('alert(1)', {}), /Unknown function/);
});

test('command parsing', () => {
  assert.deepEqual(tokenize('task add "Read Falconer ch. 8" --priority high'), ['task', 'add', 'Read Falconer ch. 8', '--priority', 'high']);
  const p = parseArgs(['x', '--priority', 'high', '--due=tomorrow', '-f'], ['priority']);
  assert.equal(p.flags.priority, 'high'); assert.equal(p.flags.due, 'tomorrow'); assert.equal(p.flags.f, true); assert.deepEqual(p.args, ['x']);
  assert.equal(splitChain('a "b;c" ; d && e').length, 3);
  assert.ok(parseWhen('+3d') && parseWhen('2026-12-01') && parseWhen('fri'));
  assert.equal(parseWhen('nonsense'), null);
  assert.throws(() => tokenize('"unterminated'));
});

test('markdown renderer is safe and complete', () => {
  const html = render('# T\n\n**b** $h^2$ <script>x</script>\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [[Note]]\n\n```r\nlm()\n```\n[x](javascript:alert(1)) [y](https://10ck.ir)');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('javascript:'.concat('alert')) || !/href="javascript/.test(html));
  for (const s of ['<table>', 'task done', 'data-lang="r"', 'class="math"', 'data-note="Note"', 'data-href="https://10ck.ir"']) assert.ok(html.includes(s), s);
  assert.deepEqual(outline('# A\n## B\n```\n# not\n```').map((o) => o.text), ['A', 'B']);
  assert.equal(wordCount('Animal breeding — 2 traits'), 4);
});

const res = (id, raw, label) => { const r = G.runCalculator(id, raw).results.find((x) => x.label.startsWith(label)); assert.ok(r, `${id}: ${label}`); return r; };

test('Gene OS 2.0 calculators — reference values', () => {
  assert.ok(G.CALCULATORS.length >= 62);
  near(res('realized_h2', { mode: 'single', R: '2', S: '5' }, 'h²R').value, 0.4);
  near(res('heterosis', { p1: '180', p2: '210', f1: '215' }, 'Heterosis %').value, 10.25641, 1e-4);
  near(res('crossbreeding', { mode: 'rot', n: '3' }, 'Heterosis retained').value, 85.7143, 1e-3);
  near(res('fst', { p: '0.2 0.8' }, 'FST').value, 0.36);
  near(res('nei', { x: '0.5 0.5', y: '0.5 0.5' }, 'Standard distance').value, 0, 1e-12);
  near(res('selection_allele', { p0: '0.1', w11: '0.8', w12: '1', w22: '0.6', t: '400' }, 'Stable').value, 2 / 3, 1e-9);
  near(res('map_distance', { mode: 'r', r: '0.2' }, 'Haldane').value, 25.5413, 1e-3);
  near(res('map_distance', { mode: 'r', r: '0.2' }, 'Kosambi').value, 21.1824, 1e-3);
  near(res('ld', { AB: '50', Ab: '0', aB: '0', ab: '50' }, 'r²').value, 1);
  near(res('milk', { m: '32', fat: '3.8' }, '4% FCM').value, 31.04, 1e-9);
  near(res('ttest', { mode: 'student', x: '1 2 3 4', y: '2 3 4 5' }, 't').value, -1.095445, 1e-5);
  near(res('chisq', { mode: 'gof', obs: '315 108 101 32', exp: '9 3 3 1' }, 'χ²').value, 0.470, 1e-3);
  near(res('chisq', { mode: 'table', table: '10 20\n30 40' }, 'χ²').value, 0.79365, 1e-4);
  near(res('dilution', { c1: '10', c2: '2', v2: '50' }, 'V₁').value, 10);
  assert.ok(res('gestation', { sp: 'sheep', date: '2026-11-01' }, 'Expected').text.startsWith('2027-03-28'));
  const pun = G.runCalculator('punnett', { p1: 'AaBb', p2: 'AaBb' });
  assert.equal(pun.results[0].table.rows.length, 9);
  near(pun.results[1].table.rows.find((r) => r[0] === 'A_B_')[1], 9 / 16);
});

test('sequence toolkit', () => {
  assert.equal(Q.revcomp('ATGC'), 'GCAT');
  assert.equal(Q.translate('ATGGCCTGG'), 'MAW');
  assert.equal(Q.translate('ATGTAA'), 'M*');
  assert.equal(Q.gc('GGCC'), 1);
  assert.equal(Q.clean('>h\natg u').seq, 'ATGT');
  const o = Q.orfs('CCATGAAATTTGGGTAACC', 3);
  assert.equal(o.length, 1); assert.equal(o[0].aa, 4); assert.equal(o[0].start, 3);
});

test('pipes and history expansion', () => {
  assert.equal(splitPipes('a | b "x|y" | c').length, 3);
  assert.equal(splitPipes('a || b').length, 1);
  assert.equal(expandHistory('!!', ['a', 'b']), 'b');
  assert.equal(expandHistory('!ta', ['task list', 'x']), 'task list');
  assert.equal(expandHistory('!2 --all', ['a', 'b']), 'b --all');
  assert.throws(() => expandHistory('!zzz', ['a']), /event not found/);
});

test('Jalali calendar (ICU persian) — anchors, leap years, round trip', () => {
  for (const [gy, gm, gd, jy, jm, jd] of [[2020, 3, 20, 1399, 1, 1], [2023, 3, 21, 1402, 1, 1], [2024, 3, 20, 1403, 1, 1], [2026, 3, 21, 1405, 1, 1], [2026, 11, 23, 1405, 9, 2], [2025, 3, 20, 1403, 12, 30]]) {
    assert.deepEqual(J.toJalali(gy, gm, gd), { jy, jm, jd });
    assert.deepEqual(J.toGregorian(jy, jm, jd), { gy, gm, gd });
  }
  assert.ok(J.isJalaliLeap(1403)); assert.ok(!J.isJalaliLeap(1404));
  assert.throws(() => J.toGregorian(1404, 12, 30));
  for (let t = Date.UTC(2024, 0, 1, 12); t < Date.UTC(2027, 0, 1); t += 864e5) {
    const d = new Date(t); const j = J.toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    assert.deepEqual(J.toGregorian(j.jy, j.jm, j.jd), { gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() });
  }
  const out = G.runCalculator('date_convert', { mode: 'j2g', date: '1405/09/02', date2: '1405/12/29' });
  assert.ok(out.results[0].text.startsWith('2026-11-23'));
  assert.equal(out.results.find((r) => r.label.startsWith('Difference')).value, 117);
});

// Deterministic simulation (seeded) used by the REML tests.
function simulate(seed, va, ve) {
  const rand = S.rng(seed); const norm = () => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  const ped = [], recs = [], bv = new Map();
  for (let i = 0; i < 16; i++) { ped.push(`F${i},0,0`); bv.set(`F${i}`, norm() * Math.sqrt(va)); }
  let sires = [...Array(6).keys()].map((i) => `F${i}`), dams = [...Array(10).keys()].map((i) => `F${i + 6}`);
  for (let g = 0; g < 3; g++) {
    const cur = [];
    for (let k = 0; k < 30; k++) {
      const s2 = sires[Math.floor(rand() * sires.length)], d2 = dams[Math.floor(rand() * dams.length)], id = `G${g}_${k}`;
      ped.push(`${id},${s2},${d2}`); const a = 0.5 * (bv.get(s2) + bv.get(d2)) + norm() * Math.sqrt(va / 2); bv.set(id, a); cur.push(id);
      recs.push(`${id},H${k % 3},${(100 + 5 * (k % 3) + a + norm() * Math.sqrt(ve)).toFixed(3)}`);
    }
    sires = cur.slice(0, 10); dams = cur.slice(10);
  }
  return { ped: P.parsePedigree(ped.join('\n')).animals, recs: P.parseRecords(recs.join('\n')).recs };
}

test('REML: profile-likelihood and EM agree and reach a local maximum', () => {
  const { ped, recs } = simulate(16, 30, 50);
  const a = P.remlProfile(ped, recs);
  const b = P.remlAnimal(ped, recs, { h2Start: 0.3, tol: 1e-8, maxIter: 5000 });
  assert.ok(!a.boundary);
  near(a.va, b.va, 1e-3 * a.va); near(a.ve, b.ve, 1e-3 * a.ve);
  for (const [fa, fe] of [[0.95, 1], [1.05, 1], [1, 0.95], [1, 1.05]]) assert.ok(P.remlM2LogL(ped, recs, a.va * fa, a.ve * fe) > a.m2logL);
  assert.ok(a.se && a.se.h2 > 0 && a.se.h2 < 1);
  // Mrode Example 3.1 has too little information: the estimate goes to the boundary
  const p2 = P.parsePedigree('1 0 0\n2 0 0\n3 0 0\n4 1 0\n5 3 2\n6 1 2\n7 4 5\n8 3 6').animals;
  const r2 = P.parseRecords('4 M 4.5\n5 F 2.9\n6 F 3.9\n7 M 3.5\n8 M 5.0').recs;
  assert.ok(P.remlProfile(p2, r2).boundary);
});
