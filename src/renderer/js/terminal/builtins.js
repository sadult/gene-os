// gsh built-in commands added in Gene OS 2.0: gfetch, filesystem (pwd/cd/ls/tree/cat/open), pipes filters,
// system (uptime/top/lock/reboot/shutdown), science (dna), utilities (cal/timer/tip/which/prompt/export).
// Each command: { name, group, summary, usage?, aliases?, valueFlags?, palette?, run(io, args, flags, ctx), complete?, filter? }
import { api } from '../api.js';
import { h, toast, fmtBytes, fmtDate, confirmBox } from '../ui.js';
import { settings } from '../state.js';
import { helixV } from '../helix.js';
import * as vfs from './vfs.js';
import * as Q from '../../../shared/seq.mjs';
import { CALCULATORS, WORKSPACES } from '../../../shared/genetics.mjs';
import { monthGrid, weekdayHeaders, jalaliOn, isoDay, dateToJalali, formatJalali, JALALI_MONTHS } from '../calendar.js';
import { parseJalali, toGregorian } from '../../../shared/jalali.mjs';

const nav = (id, p) => window.__os.nav(id, p);
const gib = (b) => (b / 1073741824).toFixed(1) + ' GiB';
const mib = (b) => Math.round(b / 1048576) + ' MiB';
export function dur(sec) {
  sec = Math.round(sec); const d = Math.floor(sec / 86400), hh = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60;
  return [d ? `${d} day${d > 1 ? 's' : ''}` : '', hh ? `${hh} hour${hh > 1 ? 's' : ''}` : '', `${m} min${m !== 1 ? 's' : ''}`].filter(Boolean).join(', ');
}
export const textBar = (pct, w = 20) => { const f = Math.round((Math.max(0, Math.min(100, pct)) / 100) * w); return '█'.repeat(f) + '░'.repeat(w - f); };
const barNode = (pct, w = 22) => { const f = Math.round((Math.max(0, Math.min(100, pct)) / 100) * w); return h('span.tbar', '█'.repeat(f), h('span.rest', '░'.repeat(w - f))); };
const parseDur = (s) => { const m = /^(\d+(?:\.\d+)?)(s|m|h)?$/.exec(String(s || '')); if (!m) return null; return Number(m[1]) * ({ s: 1, m: 60, h: 3600 }[m[2] || 'm']) * 1000; };

const TIPS = [
  'Press Ctrl+K anywhere for the command palette; type ">" in it to run a gsh command.',
  'Pipes work: `task list --all | grep thesis | wc -l`.',
  'Browse your data like folders: `cd ~/research`, `ls`, `cat 02-abstract`, `open .`.',
  'Run any calculator inline: `tool hwe AA=298 Aa=489 aa=213`.',
  'Use !! to repeat the last command and !task to repeat the last command starting with "task".',
  'Press → at the end of the line to accept the grey history suggestion.',
  'Alt + letter jumps to a module: Alt+T tasks, Alt+R research, Alt+A apps, Alt+O tools.',
  '`qn <text>` appends a timestamped quick note to the scratchpad.',
  '`dna translate ATGGCC…` translates a sequence; `dna revcomp` gives the reverse complement.',
  'Ctrl+Alt+L locks Gene OS. Set a PIN in Settings → Behavior.',
  '`cal` shows this month with task deadlines marked.',
  '`timer 25m Read Mrode ch.3` starts a background timer that notifies you when done.',
];

// ── text filters for pipelines ────────────────────────────────────────────────
const filters = [
  { name: 'grep', summary: 'Filter lines matching a pattern (in a pipe)', usage: '… | grep [-i] [-v] [-c] <pattern>', filter(lines, args, f) {
    const pat = args.join(' '); if (!pat) throw new Error('grep: pattern required');
    let re; try { re = new RegExp(pat, f.i ? 'i' : ''); } catch { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), f.i ? 'i' : ''); }
    const out = lines.filter((l) => re.test(l) !== !!f.v);
    return f.c ? [String(out.length)] : out;
  } },
  { name: 'head', summary: 'First n lines (default 10)', usage: '… | head [-n N | N]', valueFlags: ['n'], filter: (lines, args, f) => lines.slice(0, Number(f.n || args[0] || 10)) },
  { name: 'tail', summary: 'Last n lines (default 10)', usage: '… | tail [-n N | N]', valueFlags: ['n'], filter: (lines, args, f) => lines.slice(-Number(f.n || args[0] || 10)) },
  { name: 'sort', summary: 'Sort lines', usage: '… | sort [-r] [-n]', filter: (lines, _a, f) => { const o = [...lines].sort(f.n ? (a, b) => parseFloat(a) - parseFloat(b) : (a, b) => a.localeCompare(b)); return f.r ? o.reverse() : o; } },
  { name: 'uniq', summary: 'Drop repeated adjacent lines', usage: '… | uniq [-c]', filter: (lines, _a, f) => { const out = []; for (const l of lines) { const last = out[out.length - 1]; if (last && last.l === l) last.n++; else out.push({ l, n: 1 }); } return out.map((x) => (f.c ? `${String(x.n).padStart(5)} ${x.l}` : x.l)); } },
  { name: 'wc', summary: 'Count lines, words, characters', usage: '… | wc [-l|-w|-c]', filter: (lines, _a, f) => { const w = lines.join(' ').split(/\s+/).filter(Boolean).length, c = lines.join('\n').length; return [f.l ? String(lines.length) : f.w ? String(w) : f.c ? String(c) : `${lines.length} lines  ${w} words  ${c} chars`]; } },
  { name: 'nl', summary: 'Number lines', usage: '… | nl', filter: (lines) => lines.map((l, i) => `${String(i + 1).padStart(5)}  ${l}`) },
].map((c) => ({ ...c, group: 'pipes', run: () => { throw new Error(`${c.name} reads piped input, e.g. "task list --all | ${c.name} …"`); } }));

async function gfetch(io) {
  const [info, d, apps, prof] = await Promise.all([api.system.fetchInfo(), api.dashboard.summary(), api.apps.list({ sort: 'name', dir: 'ASC' }), api.profile.get()]);
  const s = settings.all();
  const active = (d.projects || []).find((p) => p.active);
  const user = String(prof.name || info.user || 'user').toLowerCase().split(/\s+/)[0];
  const head = `${user}@${String(info.host).toLowerCase()}`;
  const memPct = (info.memUsed / info.memTotal) * 100;
  const rows = [
    ['OS', `Gene OS ${info.version} on ${info.os} ${info.arch}`],
    ['Host', `${info.host}${info.packaged ? '' : ' · development build'}`],
    ['Kernel', info.kernel],
    ['Uptime', `${dur(info.uptime)} (session ${dur(info.appUptime)})`],
    ['Shell', 'gsh 2.0 — Gene OS shell'],
    ['Runtime', `Electron ${info.electron} · Chromium ${info.chrome.split('.')[0]} · Node ${info.node}`],
    ['Engine', `V8 ${info.v8.split('-')[0]} · SQLite ${info.sqlite} (schema v${info.schema})`],
    info.display ? ['Display', `${info.display.w}×${info.display.h} @${info.display.scale}x${info.display.hz ? ' · ' + Math.round(info.display.hz) + ' Hz' : ''}${info.display.count > 1 ? ` (+${info.display.count - 1})` : ''}`] : null,
    ['Theme', `${s['appearance.theme']} · accent ${s['appearance.accent']}`],
    ['Font', `${s['appearance.font']} ${s['appearance.fontSize']}px`],
    ['CPU', `${info.cpu} (${info.cores})${info.mhz ? ` @ ${(info.mhz / 1000).toFixed(2)} GHz` : ''}`],
    info.gpu ? ['GPU', info.gpu] : null,
    ['Memory', `${gib(info.memUsed)} / ${gib(info.memTotal)} (${Math.round(memPct)}%)`],
    ['Gene OS RAM', mib(info.appMem)],
    info.disk ? ['Disk (data)', `${gib(info.disk.free)} free of ${gib(info.disk.total)}`] : null,
    ['Locale', `${info.locale} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`],
    ['Data', `${info.dataDir} (${fmtBytes(info.dataSize)})${info.portable ? ' · portable' : ''}`],
    ['Apps', `${apps.length} registered · ${apps.filter((a) => a.favorite).length} favorites${apps.some((a) => a.broken) ? ` · ${apps.filter((a) => a.broken).length} broken` : ''}`],
    ['Tools', `${CALCULATORS.length} calculators · ${WORKSPACES.length} workspaces`],
    ['Workspace', `${d.counts.projects} project(s)${active ? ` · active: ${active.name}` : ''} · ${d.counts.courses} course(s)`],
    ['Tasks', `${d.counts.tasksOpen} open · ${d.counts.tasksOverdue} overdue · ${d.counts.tasksDoneToday} done today`],
    ['Library', `${d.counts.documents} files · ${d.counts.papers} papers · ${d.counts.notes} notes · ${d.counts.bookmarks} bookmarks`],
  ].filter(Boolean);
  const pal = ['#0B0F14', '#E06C75', '#98C379', '#E5B567', '#7AA2F7', '#B48EAD', '#59D5C3', '#DCE6F0', '#253140', '#FF8A93', '#B5E08F', '#F2CC8F', '#9DB9FF', '#D2B0CB', '#8FE8DA', '#FFFFFF'];
  const logo = h('pre.gf-logo', { html: helixV(15, 17, 1.3) + '<span class="word">GENE OS</span>' });
  const infoEl = h('div.gf-info',
    h('div', h('span.u', head)), h('div.rule', '─'.repeat(head.length)),
    rows.map(([k, v]) => h('div', h('span.k', k), ': ', v)),
    h('div.gf-pal', pal.slice(0, 8).map((c) => h('i', { style: { background: c } }))), h('div.gf-pal', pal.slice(8).map((c) => h('i', { style: { background: c } }))));
  io.node(h('div.gf', logo, infoEl), [head, '-'.repeat(head.length), ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n'));
}

export const BUILTINS = [
  { name: 'gfetch', group: 'system', summary: 'System information with the Gene OS logo (like neofetch)', aliases: ['neofetch', 'fetch', 'sysinfo'], palette: 'gfetch — system information', paletteRun: async () => { nav('terminal'); setTimeout(async () => (await import('./shell.js')).execute('gfetch'), 80); }, run: (io) => gfetch(io) },
  { name: 'uptime', group: 'system', summary: 'System and session uptime', run: async (io) => { const m = await api.system.metrics(); io.print(`up ${dur(m.uptime)} · Gene OS session ${dur(m.appUptime)} · load ${m.load.map((x) => x.toFixed(2)).join(' ')}`); } },
  { name: 'top', group: 'system', summary: 'Resource usage snapshot (CPU, memory, disk, processes)', aliases: ['htop', 'sys'], run: async (io) => {
    await api.system.metrics(); await new Promise((r) => setTimeout(r, 350)); const m = await api.system.metrics();
    const row = (label, pct, text) => io.node(h('div', h('span.c-acc2', label.padEnd(9)), barNode(pct), '  ', h('span', text)), `${label.padEnd(9)}${textBar(pct, 22)}  ${text}`);
    row('CPU', m.cpu || 0, `${(m.cpu || 0).toFixed(1)}% of ${m.cores} cores`);
    row('Memory', (m.memUsed / m.memTotal) * 100, `${gib(m.memUsed)} / ${gib(m.memTotal)}`);
    if (m.disk) row('Disk', ((m.disk.total - m.disk.free) / m.disk.total) * 100, `${gib(m.disk.free)} free of ${gib(m.disk.total)}`);
    row('Gene OS', Math.min(100, (m.appMem / m.memTotal) * 100 * 10), `${mib(m.appMem)} in ${m.procs} processes · DB ${fmtBytes(m.dbSize)}`);
  } },
  { name: 'home edit', group: 'navigate', summary: 'Customize the Home desktop (layouts & widgets)', palette: 'Customize Home desktop', paletteRun: () => nav('home', { edit: true }), run: () => nav('home', { edit: true }) },
  { name: 'home layout', group: 'navigate', summary: 'Switch the Home layout preset', usage: 'home layout <balanced|terminal|widgets|focus>', complete: () => ['balanced', 'terminal', 'widgets', 'focus'], run: async (io, args) => {
    const v = (args[0] || '').toLowerCase(); if (!['balanced', 'terminal', 'widgets', 'focus'].includes(v)) { io.print(`current layout: ${settings.get('home.preset') || 'balanced'}`, 'muted'); throw new Error('Usage: home layout <balanced|terminal|widgets|focus>'); }
    await settings.set('home.preset', v); io.ok(`Home layout → ${v}`); if (window.__os.current() === 'home') nav('home');
  } },
  { name: 'lock', group: 'system', summary: 'Lock Gene OS (login screen)', aliases: ['logout'], run: () => window.__os.lock() },
  { name: 'reboot', group: 'system', summary: 'Restart Gene OS', aliases: ['restart'], run: async () => { if (await confirmBox('Restart Gene OS now?', { okLabel: 'Restart', force: true })) api.system.relaunch(); } },
  { name: 'shutdown', group: 'system', summary: 'Quit Gene OS', aliases: ['exit', 'quit', 'poweroff'], run: async () => { if (await confirmBox('Shut down Gene OS?', { okLabel: 'Shut down', force: true })) api.system.quit(); } },
  { name: 'prompt', group: 'system', summary: 'Prompt style', usage: 'prompt [powerline|classic|minimal]', complete: () => ['powerline', 'classic', 'minimal'], run: async (io, args) => { const v = args[0]; if (!v) return io.print(`prompt style: ${settings.get('terminal.prompt')}`, 'muted'); if (!['powerline', 'classic', 'minimal'].includes(v)) throw new Error('Use powerline, classic or minimal'); await settings.set('terminal.prompt', v); io.ok(`prompt → ${v}`); } },
  // ── filesystem ──
  { name: 'pwd', group: 'files', summary: 'Print the working directory', run: (io, _a, _f, ctx) => io.print(ctx.shell.cwd) },
  { name: 'cd', group: 'files', summary: 'Change directory in the Gene OS filesystem', usage: 'cd [~|..|path]', completePath: true, run: async (io, args, _f, ctx) => { const r = await vfs.lookup(ctx.shell.cwd, args.join(' ') || '~'); if (r.entry.kind !== 'dir') throw new Error(`not a directory: ${r.path}`); ctx.shell.cwd = r.path; } },
  { name: 'ls', group: 'files', summary: 'List a directory', usage: 'ls [-l] [path]', aliases: ['dir', 'll'], completePath: true, run: async (io, args, f, ctx) => {
    const r = await vfs.list(ctx.shell.cwd, args.join(' '));
    if (!r.entries.length) return io.print('(empty)', 'muted');
    const long = f.l || ctx.line.trim().startsWith('ll');
    if (long) return io.table(['type', 'name', 'title', 'info'], r.entries.map((e) => [e.kind, e.name + (e.kind === 'dir' ? '/' : ''), e.label || '', e.meta || '']));
    const cls = { dir: 'acc2', app: 'purple', link: 'warn', tool: 'acc', file: '' };
    io.node(h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px 22px' } }, r.entries.map((e) => h(`span${cls[e.kind] ? '.c-' + cls[e.kind] : ''}${e.kind === 'dir' ? '.c-bold' : ''}`, e.name + (e.kind === 'dir' ? '/' : '')))), r.entries.map((e) => e.name + (e.kind === 'dir' ? '/' : '')).join('\n'));
  } },
  { name: 'tree', group: 'files', summary: 'Show the Gene OS filesystem (two levels)', run: async (io, args, _f, ctx) => {
    const base = await vfs.list(ctx.shell.cwd, args.join(' '));
    const lines = [base.path];
    for (const [i, e] of base.entries.entries()) {
      const last = i === base.entries.length - 1;
      lines.push(`${last ? '└── ' : '├── '}${e.name}${e.kind === 'dir' ? '/' : ''}${e.meta ? '  · ' + e.meta : ''}`);
      if (e.kind === 'dir' && base.parts.length < 2) {
        try { const sub = await vfs.list(base.path, e.name); sub.entries.slice(0, 6).forEach((x, j) => lines.push(`${last ? '    ' : '│   '}${j === Math.min(5, sub.entries.length - 1) ? '└── ' : '├── '}${x.name}${x.kind === 'dir' ? '/' : ''}`)); if (sub.entries.length > 6) lines.push(`${last ? '    ' : '│   '}    … ${sub.entries.length - 6} more`); } catch { /* ignore */ }
      }
    }
    io.print(lines.join('\n'));
  } },
  { name: 'cat', group: 'files', summary: 'Print an item (note, section, task, file, tool…)', usage: 'cat <path>', completePath: true, run: async (io, args, _f, ctx) => {
    const { entry: e } = await vfs.lookup(ctx.shell.cwd, args.join(' ') || '.');
    const r = e.ref || {};
    if (e.kind === 'dir') throw new Error(`${e.name}: is a directory`);
    if (r.entity === 'note') { const n = await api.notes.get(r.id); return io.print(n.content || '(empty)'); }
    if (r.entity === 'section') { const s = await api.research.getSection(r.id); return io.print(s.content || '(empty section)'); }
    if (r.entity === 'task') { const t = await api.tasks.get(r.id); return io.kv([['title', t.title], ['status', t.status], ['priority', t.priority], ['deadline', fmtDate(t.deadline, true) || '—'], ['tags', (t.tags || []).join(', ')], ['subtasks', (t.subtasks || []).map((s) => (s.done ? '☑ ' : '☐ ') + s.title).join('\n') || '—'], ['description', t.description || '—']]); }
    if (r.entity === 'topic') { const t = await api.courses.getTopic(r.id); return io.kv([['title', t.title], ['kind', t.kind], ['done', t.done ? 'yes' : 'no'], ['summary', t.summary || '—'], ['questions', t.questions || '—']]); }
    if (r.entity === 'app') { const a = await api.apps.get(r.id); return io.kv([['name', a.name], ['path', a.path], ['target', a.target_path || '—'], ['args', a.args || '—'], ['category', a.category], ['launches', a.launch_count], ['status', a.broken ? 'BROKEN' : 'ok']]); }
    if (r.entity === 'bookmark') { const b = await api.bookmarks.get(r.id); return io.kv([['name', b.name], ['url', b.url], ['category', b.category], ['notes', b.notes || '—']]); }
    if (r.entity === 'tool') { const t = [...CALCULATORS, ...WORKSPACES].find((x) => x.id === r.id); return io.kv([['tool', t.name], ['formula', t.formula || 'interactive workspace — open it'], ['inputs', (t.inputs || []).map((i) => i.k).join(' ') || '—']]); }
    if (r.entity === 'file') {
      const f = await api.library.get(r.id); const kind = await api.library.previewKind(f);
      if (['text', 'markdown', 'csv'].includes(kind)) { const { text, truncated } = await api.library.readText(f.id, 64 * 1024); io.print(text); if (truncated) io.warn('… truncated at 64 KB'); return; }
      return io.kv([['name', `${f.name}.${f.ext}`], ['type', f.doc_type], ['authors', f.authors || '—'], ['year', f.year || '—'], ['path', f.stored_path], ['size', fmtBytes(f.size)]]);
    }
  } },
  { name: 'open', group: 'files', summary: 'Open a module, path or item in the interface', usage: 'open [module|path]', completePath: true, run: async (io, args, _f, ctx) => {
    const t = args.join(' ');
    const mod = window.__os.modules.find((m) => m.id === t.toLowerCase() || m.label.toLowerCase() === t.toLowerCase());
    if (mod) return nav(mod.id);
    const { entry } = await vfs.lookup(ctx.shell.cwd, t || '.');
    vfs.open(entry);
  } },
  // ── science ──
  { name: 'dna', group: 'science', summary: 'Sequence utilities', usage: 'dna <revcomp|complement|gc|translate|stats|orf|random|helix> [seq] [--frame 1..3] [--gc 0.5]', valueFlags: ['frame', 'gc', 'min'], complete: () => ['revcomp', 'complement', 'gc', 'translate', 'stats', 'orf', 'random', 'helix'],
    run: (io, args, f) => {
      const sub = (args[0] || 'help').toLowerCase(); const seq = () => { const { seq: s } = Q.clean(args.slice(1).join('')); if (!s) throw new Error('Provide a DNA sequence'); return s; };
      if (sub === 'revcomp') return io.print(Q.wrap(Q.revcomp(seq())), 'acc');
      if (sub === 'complement') return io.print(Q.wrap(Q.complement(seq())), 'acc');
      if (sub === 'gc') { const s = seq(); return io.print(`GC ${(Q.gc(s) * 100).toFixed(2)}% · ${s.length} bp`); }
      if (sub === 'translate') return io.print(Q.wrap(Q.translate(seq(), (Number(f.frame) || 1) - 1)) || '(too short)', 'acc');
      if (sub === 'stats') { const s = seq(); const c = Q.counts(s); return io.kv([['length', `${s.length} bp`], ['GC', `${(Q.gc(s) * 100).toFixed(2)} %`], ['A C G T N', `${c.A} ${c.C} ${c.G} ${c.T} ${c.N}`], ['Tm (approx.)', `${Q.tm(s).toFixed(1)} °C`], ['MW (ss)', `${Math.round(Q.mw(s))} g/mol`]]); }
      if (sub === 'orf') { const o = Q.orfs(seq(), Number(f.min) || 30); return o.length ? io.table(['frame', 'start', 'end', 'aa'], o.slice(0, 30).map((x) => [`+${x.frame}`, x.start, x.end, x.aa])) : io.print('no ORFs found', 'muted'); }
      if (sub === 'random') { const n = Math.min(100000, Number(args[1]) || 60); return io.print(Q.wrap(Q.random(n, f.gc !== undefined ? Number(f.gc) : 0.5))); }
      if (sub === 'helix') { const rows = Math.min(60, Number(args[1]) || 16); return io.node(h('pre.gf-logo', { html: helixV(15, rows, Math.random() * 6) }), '(helix)'); }
      throw new Error('Usage: dna <revcomp|complement|gc|translate|stats|orf|random|helix> [sequence]');
    } },
  // ── utilities ──
  { name: 'cal', group: 'utils', summary: 'Month calendar with task deadlines marked (Gregorian or Jalali)', usage: 'cal [month] [year] [-j]', run: async (io, args, f) => {
    const jal = !!(f.j || f.jalali);
    const now = new Date(); const nj = dateToJalali(now);
    const mo = args[0] ? Number(args[0]) : jal ? nj.jm : now.getMonth() + 1; const yr = args[1] ? Number(args[1]) : jal ? nj.jy : now.getFullYear();
    if (!(mo >= 1 && mo <= 12) || !(yr > (jal ? 1200 : 1900))) throw new Error(`Usage: cal [1-12] [year] [-j]${jal ? '  (Jalali year, e.g. 1405)' : ''}`);
    const tasks = await api.tasks.list({}); const due = new Set(tasks.filter((t) => t.deadline && !['completed', 'cancelled'].includes(t.status)).map((t) => fmtDate(t.deadline)));
    const g = monthGrid({ jalali: jal, y: yr, m: jal ? mo : mo - 1 });
    const head = weekdayHeaders(2).join(' ');
    const second = !jal && jalaliOn() ? (() => { const a = dateToJalali(g.first), b = dateToJalali(new Date(g.first.getFullYear(), g.first.getMonth() + 1, 0)); return `${JALALI_MONTHS[a.jm - 1]}${a.jm !== b.jm ? '–' + JALALI_MONTHS[b.jm - 1] : ''} ${b.jy}`; })() : jal ? g.first.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
    const wrap = h('div', { style: { display: 'inline-block' } }, h('div.c-acc.c-bold', { style: { textAlign: 'center' } }, g.title), second ? h('div.c-dim', { style: { textAlign: 'center' } }, second) : null, h('div.c-muted', head));
    const text = [g.title, head];
    for (let r = 0; r < g.cells.length / 7; r++) {
      const row = h('div'); let tline = '';
      for (const c of g.cells.slice(r * 7, r * 7 + 7)) {
        const key = isoDay(c.date), isToday = key === isoDay(now);
        const lbl = c.inMonth ? String(c.day).padStart(2) : '  ';
        row.append(h(`span${!c.inMonth ? '' : isToday ? '.c-acc.c-bold' : due.has(key) ? '.c-warn' : ''}`, { style: isToday && c.inMonth ? { textDecoration: 'underline' } : null }, lbl), ' ');
        tline += lbl + ' ';
      }
      wrap.append(row); text.push(tline.trimEnd());
    }
    io.node(wrap, text.join('\n'));
    if (g.cells.some((c) => c.inMonth && due.has(isoDay(c.date)))) io.print('yellow = task deadline · underlined = today', 'dim');
  } },
  { name: 'jdate', group: 'utils', summary: 'Convert dates between Gregorian and Jalali', usage: 'jdate [YYYY-MM-DD | 1405/09/02]', run: (io, args) => {
    const a = args.join(' ').trim();
    if (!a) { const d = new Date(); return io.kv([['Gregorian', d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })], ['Jalali', `${formatJalali(d, 'long')}  (${formatJalali(d)})`], ['فارسی', formatJalali(d, 'fa')]]); }
    const pj = parseJalali(a);
    if (pj && pj.jy < 1700) { const g2 = toGregorian(pj.jy, pj.jm, pj.jd); const d = new Date(g2.gy, g2.gm - 1, g2.gd); return io.kv([['Jalali', `${pj.jd} ${JALALI_MONTHS[pj.jm - 1]} ${pj.jy}`], ['Gregorian', `${isoDay(d)} (${d.toLocaleDateString('en-US', { weekday: 'long' })})`]]); }
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(a); if (!m) throw new Error('Usage: jdate 2026-11-23  or  jdate 1405/09/02');
    const d = new Date(+m[1], +m[2] - 1, +m[3]); io.kv([['Gregorian', `${isoDay(d)} (${d.toLocaleDateString('en-US', { weekday: 'long' })})`], ['Jalali', `${formatJalali(d, 'long')}  (${formatJalali(d)})`], ['فارسی', formatJalali(d, 'fa')]]);
  } },
  { name: 'timer', group: 'utils', summary: 'Background countdown with notification', usage: 'timer <90s|25m|1h> [label] | timer list', run: (io, args, _f, ctx) => {
    if (args[0] === 'list') { const l = ctx.shell.timers.filter((t) => t.end > Date.now()); return l.length ? io.table(['label', 'remaining'], l.map((t) => [t.label, `${Math.ceil((t.end - Date.now()) / 1000)} s`])) : io.print('no running timers', 'muted'); }
    const ms = parseDur(args[0]); if (!ms) throw new Error('Usage: timer <90s|25m|1h> [label]');
    const label = args.slice(1).join(' ') || `timer ${args[0]}`;
    const t = { label, end: Date.now() + ms };
    t.id = setTimeout(() => { ctx.shell.notify(`⏰ ${label} — time is up`); toast(`⏰ ${label} — time is up`, 'ok', 8000); try { new Notification('Gene OS timer', { body: label }); } catch { /* ignore */ } }, ms);
    ctx.shell.timers.push(t);
    io.ok(`timer set: ${label} (${args[0]})`);
  } },
  { name: 'tip', group: 'utils', summary: 'Show a random Gene OS tip', run: (io) => io.print('💡 ' + TIPS[Math.floor(Math.random() * TIPS.length)], 'acc2') },
  { name: 'which', group: 'utils', summary: 'Describe how a command resolves', usage: 'which <command>', run: async (io, args, _f, ctx) => {
    const w = args.join(' '); if (!w) throw new Error('Usage: which <command>');
    if (ctx.shell.aliases.has(w)) return io.print(`${w}: alias for "${ctx.shell.aliases.get(w)}"`);
    const { resolve } = await import('../commands.js'); const c = resolve(w);
    if (!c) throw new Error(`${w} not found`);
    io.print(`${w}: ${c.filter ? 'pipe filter' : 'built-in'} → ${c.name} (${c.group || 'core'}) — ${c.summary}`);
  } },
  { name: 'export', group: 'utils', summary: 'Export data to a file', usage: 'export <tasks|bookmarks|data|history>', complete: () => ['tasks', 'bookmarks', 'data', 'history'], run: async (io, args) => {
    const what = args[0]; const today = fmtDate(new Date().toISOString());
    let content, name, kind;
    if (what === 'tasks') { const t = await api.tasks.list({ sort: 'deadline', dir: 'ASC' }); const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`; content = ['id,title,status,priority,category,deadline,tags,estimate_min,actual_min', ...t.map((x) => [x.id, x.title, x.status, x.priority, x.category, x.deadline || '', (x.tags || []).join(' '), x.estimate_min, x.actual_min].map(esc).join(','))].join('\n'); name = `gene-os-tasks-${today}.csv`; kind = 'csv'; }
    else if (what === 'bookmarks') { content = await api.bookmarks.exportHtml(); name = `gene-os-bookmarks-${today}.html`; kind = 'bookmarks'; }
    else if (what === 'data') { content = await api.backup.exportJson(); name = `gene-os-export-${today}.json`; kind = 'json'; }
    else if (what === 'history') { content = (await api.shell.list(500)).join('\n'); name = `gsh-history-${today}.txt`; kind = 'text'; }
    else throw new Error('Usage: export <tasks|bookmarks|data|history>');
    const f = await api.system.saveFile({ kind, defaultName: name, content });
    f ? io.ok(`saved ${f}`) : io.print('cancelled', 'muted');
  } },
  { name: 'apps info', group: 'apps', summary: 'Show details of an application', usage: 'apps info <name|id>', completeApps: true, run: async (io, args) => {
    const q = args.join(' '); if (!q) throw new Error('Usage: apps info <name|id>');
    const l = await api.apps.list({}); const a = /^\d+$/.test(q) ? l.find((x) => x.id === Number(q)) : l.find((x) => x.name.toLowerCase() === q.toLowerCase()) || l.find((x) => x.name.toLowerCase().includes(q.toLowerCase()));
    if (!a) throw new Error(`No application matches '${q}'`);
    const m = a.metadata || {};
    io.kv([['name', a.name], ['description', a.description || '—'], ['category', a.category], ['path', a.path], ['target', a.target_path || (m.advertised ? 'advertised shortcut' : '—')], ['arguments', a.args || '—'], ['version', m.ProductVersion || m.FileVersion || '—'], ['company', m.CompanyName || '—'], ['launches', `${a.launch_count || 0}${a.last_launched_at ? ' · last ' + fmtDate(a.last_launched_at, true) : ''}`], ['status', a.broken ? 'BROKEN PATH' : 'ok']]);
  } },
  { name: 'apps open', group: 'apps', summary: 'Open the details page of an application', usage: 'apps open <name|id>', completeApps: true, run: async (io, args) => {
    const q = args.join(' '); const l = await api.apps.list({}); const a = /^\d+$/.test(q) ? l.find((x) => x.id === Number(q)) : l.find((x) => x.name.toLowerCase().includes(q.toLowerCase()));
    if (!a) throw new Error(`No application matches '${q}'`); nav('apps', { id: a.id });
  } },
  ...filters,
];
