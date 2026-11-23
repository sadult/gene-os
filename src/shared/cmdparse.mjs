// Command-line tokenizer/parser shared by the integrated terminal.
// Supports "double" and 'single' quotes, backslash escapes, --flag, --key=value, --key value, -abc short flags.

export function tokenize(line) {
  const out = []; let cur = ''; let q = null; let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"' && i + 1 < line.length) cur += line[++i]; else cur += c; continue; }
    if (c === '"' || c === "'") { q = c; has = true; continue; }
    if (c === '\\' && i + 1 < line.length) { cur += line[++i]; has = true; continue; }
    if (/\s/.test(c)) { if (has || cur) { out.push(cur); cur = ''; has = false; } continue; }
    cur += c; has = true;
  }
  if (q) throw new Error('Unterminated quote');
  if (has || cur) out.push(cur);
  return out;
}

// Parse tokens after the command path. `valueFlags` lists flags that take a value when written as "--key value".
export function parseArgs(tokens, valueFlags = []) {
  const args = []; const flags = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--') { args.push(...tokens.slice(i + 1)); break; }
    if (t.startsWith('--') && t.length > 2) {
      const eq = t.indexOf('=');
      if (eq > 0) flags[t.slice(2, eq)] = t.slice(eq + 1);
      else { const k = t.slice(2); if (valueFlags.includes(k) && i + 1 < tokens.length) flags[k] = tokens[++i]; else flags[k] = true; }
    } else if (/^-[a-z]+$/i.test(t)) { for (const ch of t.slice(1)) flags[ch] = true; }
    else args.push(t);
  }
  return { args, flags };
}

// Split "a ; b && c" into separate command lines (quotes respected). && stops on error; ; continues.
export function splitChain(line) {
  const parts = []; let cur = ''; let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === ';') { parts.push({ line: cur.trim(), op: ';' }); cur = ''; continue; }
    if (c === '&' && line[i + 1] === '&') { parts.push({ line: cur.trim(), op: '&&' }); cur = ''; i++; continue; }
    cur += c;
  }
  parts.push({ line: cur.trim(), op: null });
  return parts.filter((p) => p.line);
}

// Split "a | b | c" into pipeline stages (quotes respected, "||" is not a pipe).
export function splitPipes(line) {
  const parts = []; let cur = ''; let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '|' && line[i + 1] !== '|' && line[i - 1] !== '|') { parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur.trim());
  return parts;
}

// History expansion: !! (last), !n (n-th, 1-based), !-n (n-th from the end), !prefix (latest starting with prefix).
export function expandHistory(line, history) {
  const t = line.trim();
  if (!t.startsWith('!') || t === '!') return line;
  const m = /^!(!|-?\d+|[^\s]+)(.*)$/.exec(t);
  if (!m) return line;
  let hit = null;
  if (m[1] === '!') hit = history[history.length - 1];
  else if (/^-\d+$/.test(m[1])) hit = history[history.length + Number(m[1])];
  else if (/^\d+$/.test(m[1])) hit = history[Number(m[1]) - 1];
  else hit = [...history].reverse().find((h) => h.startsWith(m[1]));
  if (!hit) throw new Error(`event not found: ${m[1]}`);
  return hit + m[2];
}

// Levenshtein distance for "did you mean" suggestions.
export function distance(a, b) {
  const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// Parse a natural deadline token: today, tomorrow, +3d, +2w, mon..sun, YYYY-MM-DD, YYYY-MM-DDTHH:MM
export function parseWhen(s, now = new Date()) {
  if (!s) return null;
  const t = String(s).trim().toLowerCase();
  const d = new Date(now); d.setSeconds(0, 0);
  const endOfDay = (x) => { x.setHours(23, 59, 0, 0); return x; };
  if (t === 'today') return endOfDay(d).toISOString();
  if (t === 'tomorrow') { d.setDate(d.getDate() + 1); return endOfDay(d).toISOString(); }
  let m = /^\+(\d+)([hdwm])$/.exec(t);
  if (m) { const n = +m[1]; if (m[2] === 'h') d.setHours(d.getHours() + n); if (m[2] === 'd') { d.setDate(d.getDate() + n); endOfDay(d); } if (m[2] === 'w') { d.setDate(d.getDate() + 7 * n); endOfDay(d); } if (m[2] === 'm') { d.setMonth(d.getMonth() + n); endOfDay(d); } return d.toISOString(); }
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const wi = days.indexOf(t.slice(0, 3));
  if (wi >= 0 && /^[a-z]+$/.test(t)) { let add = (wi - d.getDay() + 7) % 7; if (add === 0) add = 7; d.setDate(d.getDate() + add); return endOfDay(d).toISOString(); }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[t\s](\d{2}):(\d{2}))?$/.exec(t);
  if (m) { const x = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59); if (isNaN(x)) return null; return x.toISOString(); }
  return null;
}
