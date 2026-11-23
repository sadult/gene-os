// gsh engine: one persistent session shared by every terminal view (Home widget and Terminal module).
// Parses with the shared tokenizer, supports aliases, history expansion (!!, !n, !prefix), chaining (; &&),
// pipelines into text filters (| grep | head …), a virtual working directory and rich output nodes.
import { api } from '../api.js';
import { h, esc, confirmBox } from '../ui.js';
import { settings, bus } from '../state.js';
import { tokenize, parseArgs, splitChain, splitPipes, expandHistory, distance } from '../../../shared/cmdparse.mjs';
import { commands, match, allNames } from '../commands.js';

const listeners = new Set();
export const shell = {
  lines: [], history: [], aliases: new Map(), cwd: '~', last: { code: 0, ms: 0 }, busy: false, timers: [],
  user: 'user', host: 'gene-os', project: '', started: false, _ready: null,
  ready() {
    if (!this._ready) this._ready = (async () => {
      try { this.history = await api.shell.list(500); } catch { this.history = []; }
      await loadAliases();
      try { const i = await api.system.info(); this.host = String(i.host || 'gene-os').toLowerCase(); } catch { /* ignore */ }
      refreshContext();
    })();
    return this._ready;
  },
  push(node) {
    this.lines.push(node);
    const max = Number(settings.get('terminal.maxLines')) || 2000;
    if (this.lines.length > max) this.lines.splice(0, this.lines.length - max).forEach((n) => n.remove());
    emit('line', node);
  },
  clear() { this.lines.forEach((n) => n.remove()); this.lines = []; emit('clear'); },
  notify(text) { this.push(h('div.c-warn', text)); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
function emit(type, data) { for (const fn of listeners) { try { fn(type, data); } catch (e) { console.error(e); } } }

async function loadAliases() { try { shell.aliases = new Map((await api.shell.aliases()).map((a) => [a.name, a.expansion])); } catch { /* ignore */ } }
async function refreshContext() {
  const p = settings.get('profile') || {};
  shell.user = String(p.name || 'user').toLowerCase().split(/\s+/)[0];
  try { const a = await api.research.active(); shell.project = a ? a.name : ''; } catch { shell.project = ''; }
  emit('state');
}
bus.on('changed', (e) => { if (e === 'projects') refreshContext(); });
bus.on('settings', ({ key }) => { if (key === 'profile' || key.startsWith('terminal.')) refreshContext(); });

// ── syntax highlighting (input overlay & echoed lines) ─────────────────────────
let rootCache = null;
function roots() {
  if (!rootCache) { rootCache = { words: new Set(), phrases: new Set(allNames()) }; for (const n of allNames()) rootCache.words.add(n.split(' ')[0]); }
  return rootCache;
}
const isRoot = (w) => roots().words.has(w.toLowerCase()) || shell.aliases.has(w.toLowerCase());
export function highlightHTML(line, ghost = '') {
  const re = /("(?:[^"\\]|\\.)*"?|'[^']*'?|\s+|&&|\|\||\||;|[^\s|;&"']+|&)/g;
  let out = ''; let words = []; let m;
  const span = (c, t) => `<span class="h-${c}">${esc(t)}</span>`;
  while ((m = re.exec(line))) {
    const t = m[0];
    if (/^\s+$/.test(t)) { out += esc(t); continue; }
    if (t === '|' || t === '&&' || t === ';' || t === '||' || t === '&') { out += span('op', t); words = []; continue; }
    if (/^["']/.test(t)) { out += span('str', t); words.push(t); continue; }
    if (words.length === 0) {
      words.push(t);
      if (t.startsWith('!')) out += span('bang', t);
      else if (isRoot(t)) out += span('cmd', t);
      else if ([...roots().words].some((w) => w.startsWith(t.toLowerCase())) && line.trimEnd().endsWith(t)) out += span('part', t);
      else out += span('bad', t);
      continue;
    }
    const phrase = [...words.slice(0, 2), t].join(' ').toLowerCase();
    words.push(t);
    if (words.length <= 3 && roots().phrases.has(phrase)) out += span('sub', t);
    else if (/^--?[\w-]+(=.*)?$/.test(t)) { const [k, ...v] = t.split('='); out += span('flag', k) + (v.length ? span('op', '=') + span('val', v.join('=')) : ''); }
    else if (/^[\w.]+=/.test(t)) { const i = t.indexOf('='); out += span('key', t.slice(0, i + 1)) + span('val', t.slice(i + 1)); }
    else if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?[a-z%]*$/.test(t)) out += span('num', t);
    else if (/^(~|\.{1,2})(\/|$)|\//.test(t)) out += span('path', t);
    else out += span('arg', t);
  }
  return out + (ghost ? span('ghost', ghost) : '');
}

// ── IO: screen sink and capture sink (pipelines) ────────────────────────────────
function textTable(headers, rows) {
  const all = headers ? [headers, ...rows] : rows;
  const w = []; for (const r of all) r.forEach((c, i) => { w[i] = Math.max(w[i] || 0, String(c ?? '').length); });
  const fmt = (r) => r.map((c, i) => String(c ?? '').padEnd(w[i])).join('  ').trimEnd();
  return [...(headers ? [fmt(headers), w.map((x) => '─'.repeat(x)).join('  ')] : []), ...rows.map(fmt)];
}
const isNum = (v) => typeof v === 'number' || /^[+-]?\d[\d,]*(\.\d+)?(e[+-]?\d+)?$/i.test(String(v ?? '').trim());
function makeIO(sink) {
  const io = {
    print(text, cls) { sink(h(`div${cls ? '.c-' + cls : ''}`, String(text ?? '')), String(text ?? '')); },
    line(segs) { sink(h('div', segs.map(([t, c]) => (c ? h(`span.c-${c}`, t) : t))), segs.map((x) => x[0]).join('')); },
    ok(t) { io.line([['✔ ', 'ok'], [String(t), '']]); },
    err(t) { io.line([['✘ ', 'err'], [String(t), 'err']]); },
    warn(t) { io.line([['⚠ ', 'warn'], [String(t).replace(/^!\s*/, ''), 'warn']]); },
    h1(t) { sink(h('div.th1', String(t)), `── ${t} ──`); },
    table(headers, rows) {
      const el = h('table.tt', headers ? h('tr', headers.map((x) => h('th', String(x)))) : null,
        rows.map((r) => h('tr', r.map((c, i) => h(`td${!headers && i === 0 ? '.k' : isNum(c) && i > 0 ? '.n' : ''}`, String(c ?? ''))))));
      sink(el, textTable(headers, rows).join('\n'));
    },
    kv(pairs) {
      const el = h('div.tkv', pairs.flatMap(([k, v]) => [h('span.k', String(k)), h('span.v', String(v ?? '—'))]));
      const w = Math.max(...pairs.map(([k]) => String(k).length));
      sink(el, pairs.map(([k, v]) => `${String(k).padEnd(w)}  ${v ?? '—'}`).join('\n'));
    },
    node(el, text) { sink(el, text ?? el.textContent); },
    clear() { shell.clear(); },
    confirm: (msg) => confirmBox(msg, { danger: true, okLabel: 'Yes', force: true }),
  };
  return io;
}
const screenIO = () => makeIO((el) => shell.push(el));
const captureIO = (buf) => makeIO((_el, text) => { for (const l of String(text).split('\n')) buf.push(l); });

// ── execution ──────────────────────────────────────────────────────────────────
function expandAlias(line, depth = 0) {
  const first = line.trim().split(/\s+/)[0]?.toLowerCase();
  if (depth < 5 && first && shell.aliases.has(first)) return expandAlias(shell.aliases.get(first) + line.trim().slice(first.length), depth + 1);
  return line;
}
function suggest(word) {
  const best = allNames().map((n) => [n, distance(word, n)]).sort((a, b) => a[1] - b[1])[0];
  return best && best[1] <= 3 ? best[0] : null;
}
async function runOne(line, io) {
  let tokens;
  try { tokens = tokenize(line); } catch (e) { io.err(e.message); return false; }
  if (!tokens.length) return true;
  const m = match(tokens);
  if (!m) { const s = suggest(tokens.slice(0, 2).join(' ').toLowerCase()); io.err(`gsh: command not found: ${tokens[0]}${s ? `  — did you mean '${s}'?` : ''}`); return false; }
  const { args, flags } = parseArgs(m.rest, m.cmd.valueFlags || []);
  try {
    await m.cmd.run(io, args, flags, { line, shell });
    if (m.cmd.name === 'alias' || m.cmd.name === 'unalias') await loadAliases();
    return true;
  } catch (e) { io.err(e && e.message ? e.message : String(e)); return false; }
}
async function runPipeline(line) {
  const stages = splitPipes(line).filter(Boolean);
  const io = screenIO();
  if (stages.length <= 1) return runOne(stages[0] || line, io);
  const buf = [];
  const ok = await runOne(stages[0], captureIO(buf));
  let lines = buf;
  if (!ok) { for (const l of lines) io.print(l, 'err'); return false; }
  for (const st of stages.slice(1)) {
    let tokens; try { tokens = tokenize(st); } catch (e) { io.err(e.message); return false; }
    const m = match(tokens);
    if (!m || !m.cmd.filter) { io.err(`gsh: '${tokens[0]}' cannot read piped input — use grep, head, tail, sort, uniq, wc or nl`); return false; }
    const { args, flags } = parseArgs(m.rest, m.cmd.valueFlags || []);
    try { lines = m.cmd.filter(lines, args, flags); } catch (e) { io.err(e.message); return false; }
  }
  io.node(h('div', { style: { whiteSpace: 'pre' } }, lines.join('\n') || ' '), lines.join('\n'));
  return true;
}

function echoLine(line) {
  const st = h('span.st', '');
  const el = h('div.tl-cmd', h('span.p', '❯ ', h('span.cw', shell.cwd)), h('span.line', { html: highlightHTML(line) }), st);
  shell.push(el);
  return st;
}

export async function execute(raw, { echo = true } = {}) {
  let line = String(raw || '').trim();
  if (!line) return 0;
  await shell.ready();
  try { line = expandHistory(line, shell.history); } catch (e) { echoLine(line); screenIO().err(e.message); return 1; }
  const st = echo ? echoLine(line) : null;
  if (shell.history[shell.history.length - 1] !== line) { shell.history.push(line); api.shell.add(line).catch(() => {}); }
  shell.busy = true; emit('state');
  const t0 = performance.now(); let code = 0;
  try {
    for (const part of splitChain(line)) {
      const ok = await runPipeline(expandAlias(part.line));
      if (!ok) code = 1;
      if (!ok && part.op === '&&') { screenIO().print('chain stopped after error', 'dim'); break; }
    }
  } finally {
    const ms = Math.round(performance.now() - t0);
    shell.last = { code, ms }; shell.busy = false;
    if (st) { st.textContent = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`; st.className = `st ${code ? 'err' : 'ok'}`; }
    emit('state');
  }
  return code;
}

// First terminal shown in a session: welcome banner + startup command (default: gfetch).
export async function welcome() {
  if (shell.started) return;
  shell.started = true;
  await shell.ready();
  const io = screenIO();
  io.line([['GENE OS', 'acc'], [' · gsh 2.0 — type ', 'muted'], ['help', 'acc2'], [' for commands, ', 'muted'], ['tools', 'acc2'], [' for calculators, ', 'muted'], ['cd ~/research', 'acc2'], [' to browse your data.', 'muted']]);
  const cmd = settings.get('terminal.startup');
  if (cmd) await execute(cmd, { echo: true });
}

// Completion candidates for the current input (commands, sub-commands, paths, app names, tool ids …).
export async function complete(value) {
  const parts = value.replace(/^\s+/, '').split(/\s+/);
  const names = [...new Set([...allNames(), ...shell.aliases.keys()])];
  if (parts.length <= 1) return names.filter((n) => !n.includes(' ') && n.startsWith((parts[0] || '').toLowerCase())).map((n) => ({ value: n + ' ', desc: commands.find((c) => c.name === n)?.summary || (shell.aliases.has(n) ? 'alias' : '') }));
  // multi-word command names
  const prefix = parts.slice(0, -1).join(' ').toLowerCase(), last = parts[parts.length - 1];
  const sub = names.filter((n) => n.startsWith(prefix + ' ') && n.split(' ').length === parts.length && n.endsWith(n.split(' ').pop()) && n.split(' ').pop().startsWith(last.toLowerCase()));
  if (sub.length) return sub.map((n) => ({ value: n + ' ', desc: commands.find((c) => c.name === n)?.summary || '' }));
  const m = match(parts.slice(0, -1));
  if (!m) return [];
  const head = value.slice(0, value.length - last.length);
  if (m.cmd.completePath) { const { completions } = await import('./vfs.js'); return (await completions(shell.cwd, last)).map((c) => ({ value: head + c.value, desc: c.desc, label: c.value })); }
  let opts = [];
  if (m.cmd.completeApps || m.cmd.name === 'apps launch') opts = (await api.apps.list({ sort: 'name', dir: 'ASC' })).map((a) => (a.name.includes(' ') ? `"${a.name}"` : a.name));
  else if (m.cmd.name === 'tool') { const { CALCULATORS, WORKSPACES } = await import('../../../shared/genetics.mjs'); opts = [...CALCULATORS, ...WORKSPACES].map((t) => t.id); }
  else if (m.cmd.name === 'theme') { const { THEMES } = await import('../state.js'); opts = Object.keys(THEMES); }
  else if (m.cmd.complete) opts = m.cmd.complete();
  return opts.filter((o) => o.toLowerCase().replace(/^"/, '').startsWith(last.toLowerCase().replace(/^"/, ''))).slice(0, 40).map((o) => ({ value: head + o + ' ', label: o, desc: '' }));
}
