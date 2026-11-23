// Safe arithmetic expression evaluator (no eval). Supports + - * / % ^, parentheses, unary minus,
// scientific notation, constants, functions, variables and assignment (x = 2*pi).
import { normalizeDigits } from './stats.mjs';

const FUNCS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc, sign: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow, hypot: Math.hypot,
  fact: (n) => { if (!Number.isInteger(n) || n < 0 || n > 170) return NaN; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; },
  mean: (...a) => a.reduce((s, x) => s + x, 0) / a.length,
  sum: (...a) => a.reduce((s, x) => s + x, 0),
};
const CONSTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

function tokenize(src) {
  const s = normalizeDigits(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({ t: 'n', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = /^[a-z_][a-z0-9_]*/i.exec(s.slice(i));
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    if ('+-*/%^(),='.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error(`Unexpected character '${c}'`);
  }
  return out;
}

export function evaluate(src, scope = {}) {
  const toks = tokenize(src); let p = 0;
  const peek = () => toks[p], next = () => toks[p++];
  const expect = (t) => { const k = next(); if (!k || k.t !== t) throw new Error(`Expected '${t}'`); };
  function expr() { let v = term(); while (peek() && (peek().t === '+' || peek().t === '-')) { const op = next().t; const r = term(); v = op === '+' ? v + r : v - r; } return v; }
  function term() { let v = unary(); while (peek() && '*/%'.includes(peek().t)) { const op = next().t; const r = unary(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; } return v; }
  function unary() { if (peek() && (peek().t === '-' || peek().t === '+')) { const op = next().t; const v = unary(); return op === '-' ? -v : v; } return power(); }
  function power() { const b = primary(); if (peek() && peek().t === '^') { next(); return b ** unary(); } return b; }
  function primary() {
    const k = next(); if (!k) throw new Error('Unexpected end of expression');
    if (k.t === 'n') return k.v;
    if (k.t === '(') { const v = expr(); expect(')'); return v; }
    if (k.t === 'id') {
      const name = k.v.toLowerCase();
      if (peek() && peek().t === '(') {
        next(); const args = [];
        if (peek() && peek().t !== ')') { args.push(expr()); while (peek() && peek().t === ',') { next(); args.push(expr()); } }
        expect(')');
        const f = FUNCS[name]; if (!f) throw new Error(`Unknown function '${k.v}'`);
        return f(...args);
      }
      if (name in scope) return scope[name];
      if (name in CONSTS) return CONSTS[name];
      throw new Error(`Unknown variable '${k.v}'`);
    }
    throw new Error(`Unexpected '${k.t}'`);
  }
  let assign = null;
  if (toks.length > 2 && toks[0].t === 'id' && toks[1].t === '=') { assign = toks[0].v.toLowerCase(); p = 2; if (assign in CONSTS || assign in FUNCS) throw new Error(`Cannot assign to '${assign}'`); }
  const value = expr();
  if (p < toks.length) throw new Error(`Unexpected '${toks[p].t === 'n' || toks[p].t === 'id' ? toks[p].v : toks[p].t}'`);
  if (assign) scope[assign] = value;
  scope.ans = value;
  return { value, assigned: assign };
}
export const FUNCTION_NAMES = Object.keys(FUNCS);
