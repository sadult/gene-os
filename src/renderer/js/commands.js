// Shared command registry. The integrated terminal executes these; the command palette lists the ones
// with a `palette` label. Every command calls the same backend services as the GUI (via `api`).
import { api } from './api.js';
import { settings, bus, THEMES } from './state.js';
import { fmtDate, relTime, fmtBytes, fmtNum, toastError, formModal, promptBox, toast } from './ui.js';
import { parseWhen } from '../../shared/cmdparse.mjs';
import { evaluate } from '../../shared/expr.mjs';
import { CALCULATORS, CATEGORIES, WORKSPACES, runCalculator } from '../../shared/genetics.mjs';
import { pomodoro } from './pomodoro.js';
import { BUILTINS } from './terminal/builtins.js';
import { formatJalali } from '../../shared/jalali.mjs';

const nav = (id, p) => window.__os.nav(id, p);
const calcScope = {};
const STATUSES = ['backlog', 'planned', 'in_progress', 'on_hold', 'completed', 'cancelled'];
const PRIOS = ['low', 'medium', 'high', 'critical'];
const changed = (e) => bus.emit('changed', e);
const need = (v, usage) => { if (v === undefined || v === '') throw new Error('Usage: ' + usage); return v; };
const idArg = (v, usage) => { const n = Number(need(v, usage)); if (!Number.isInteger(n)) throw new Error(`'${v}' is not a numeric id. Usage: ${usage}`); return n; };

async function findByName(list, q, key = 'name') {
  if (/^\d+$/.test(q)) { const f = list.find((x) => x.id === Number(q)); if (f) return f; }
  const l = q.toLowerCase();
  return list.find((x) => String(x[key]).toLowerCase() === l) || list.find((x) => String(x[key]).toLowerCase().startsWith(l)) || list.find((x) => String(x[key]).toLowerCase().includes(l));
}
const taskRow = (t) => [t.id, (t.priority || '').slice(0, 4), t.status, t.title.slice(0, 54), t.deadline ? `${fmtDate(t.deadline, true)} (${relTime(t.deadline)})` : ''];

export const commands = [
  // ── core ──
  { name: 'help', summary: 'List commands or show help for one', usage: 'help [command]', aliases: ['?', 'man'], complete: () => allNames(), run: (io, args) => {
    if (args.length) {
      const c = resolve(args.join(' '));
      if (!c) return io.err(`No help for '${args.join(' ')}'`);
      io.h1(c.name);
      io.kv([['summary', c.summary], ['usage', c.usage || c.name], c.aliases ? ['aliases', c.aliases.join(', ')] : null, c.details ? ['details', c.details] : null].filter(Boolean));
      return;
    }
    const groups = {};
    for (const c of commands) (groups[c.group || 'core'] ||= []).push(c);
    for (const [g, list] of Object.entries(groups)) { io.h1(g.toUpperCase()); io.table(null, list.map((c) => [c.usage || c.name, c.summary])); }
    io.print('Tips: ↑/↓ history · Tab completes · → accepts suggestion · Ctrl+L clears · chain with ; or && · pipe with | grep/head/wc · !! repeats · cd ~/research', 'muted');
  } },
  { name: 'clear', summary: 'Clear the terminal', aliases: ['cls'], run: (io) => io.clear() },
  { name: 'version', summary: 'Show version and runtime', run: async (io) => { const i = await api.system.info(); io.print(`Gene OS ${i.version}  (Electron ${i.electron}, Chromium ${i.chrome}, Node ${i.node}, schema v${i.schema}, ${i.platform}-${i.arch})`); } },
  { name: 'about', summary: 'About Gene OS', run: (io) => { io.print('GENE OS — Research Operating Environment', 'acc'); io.kv([['developer', 'Mersad (Bitologist)'], ['telegram', '@Bitologist'], ['website', 'https://10ck.ir'], ['github', 'https://github.com/sadult']]); io.print('Run `open about` for credits, licenses and the changelog.', 'muted'); } },
  { name: 'status', summary: 'System, database and workload status', run: async (io) => {
    const [s, d, i] = await Promise.all([api.system.status(), api.dashboard.summary(), api.system.info()]);
    io.table(null, [['database', `${s.db} · schema v${s.schema} · ${fmtBytes(s.dbSize)}`], ['data folder', i.paths.dataDir], ['memory', `${s.memoryMB} MB`], ['tasks', `${d.counts.tasksOpen} open · ${d.counts.tasksOverdue} overdue · ${d.counts.tasksDoneToday} done today`], ['library', `${d.counts.documents} files · ${d.counts.papers} papers · ${d.counts.books} books`], ['projects', d.counts.projects], ['courses', d.counts.courses], ['notes', d.counts.notes], ['apps / bookmarks', `${d.counts.apps} / ${d.counts.bookmarks}`]]);
  } },
  { name: 'profile', summary: 'Show the profile card', aliases: ['whoami'], run: async (io) => { const p = await api.profile.get(); io.table(null, [['name', p.name], ['role', p.role], ['university', p.university], ['telegram', p.telegram], ['website', p.website], ['github', p.github]]); } },
  { name: 'date', summary: 'Current date and time (with Jalali date)', run: (io) => { const d = new Date(); io.print(d.toString()); io.print(`Jalali: ${formatJalali(d, 'long')} · ${formatJalali(d, 'fa')}`, 'muted'); } },
  { name: 'echo', summary: 'Print text', usage: 'echo <text>', run: (io, args) => io.print(args.join(' ')) },
  { name: 'calc', summary: 'Evaluate an expression (variables persist)', usage: 'calc <expr>   e.g. calc h2 = 40/(40+60)', aliases: ['='], run: (io, args) => { const r = evaluate(need(args.join(' '), 'calc <expression>'), calcScope); io.print(`${r.assigned ? r.assigned + ' = ' : ''}${fmtNum(r.value, 10)}`, 'ok'); } },
  { name: 'history', summary: 'Show command history', usage: 'history [--clear]', run: async (io, _a, f) => { if (f.clear) { await api.shell.clear(); io.ok('History cleared'); return; } const h = await api.shell.list(500); io.print(h.slice(-50).map((l, i) => `${String(h.length - Math.min(50, h.length) + i + 1).padStart(4)}  ${l}`).join('\n')); } },
  { name: 'alias', summary: 'List or define aliases', usage: 'alias [name="command line"]', run: async (io, args) => {
    if (!args.length) { const a = await api.shell.aliases(); return a.length ? io.table(['alias', 'expands to'], a.map((x) => [x.name, x.expansion])) : io.print('No aliases. Example: alias td="task list --today"', 'muted'); }
    const m = /^([\w-]+)=(.*)$/.exec(args.join(' ')); if (!m) throw new Error('Usage: alias name="command"');
    await api.shell.setAlias(m[1], m[2].replace(/^"|"$/g, '')); io.ok(`alias ${m[1]} → ${m[2]}`);
  } },
  { name: 'unalias', summary: 'Remove an alias', usage: 'unalias <name>', run: async (io, args) => { io[(await api.shell.removeAlias(need(args[0], 'unalias <name>'))) ? 'ok' : 'err'](`unalias ${args[0]}`); } },
  { name: 'search', summary: 'Global full-text search', usage: 'search <query>', aliases: ['find'], run: async (io, args) => { const r = await api.search.query(need(args.join(' '), 'search <query>'), { limit: 30 }); if (!r.length) return io.print('No results', 'muted'); io.table(['type', 'id', 'title', 'match'], r.map((x) => [x.entity, x.id, x.title.slice(0, 50), (x.snippet || '').replace(/\[\[|\]\]/g, '').slice(0, 60)])); } },
  // ── navigation ──
  ...['home', 'tasks', 'research', 'courses', 'library', 'apps', 'bookmarks', 'notes', 'settings', 'profile'].map((m) => ({ name: m, group: 'navigate', summary: `Open the ${m} module`, run: () => nav(m) })),
  { name: 'fullscreen', group: 'navigate', summary: 'Toggle fullscreen', palette: 'Toggle fullscreen', paletteRun: () => api.system.toggleFullscreen(), run: () => api.system.toggleFullscreen() },
  { name: 'focus', group: 'navigate', summary: 'Toggle focus mode (hide header)', palette: 'Toggle focus mode', paletteRun: () => document.body.classList.toggle('focus'), run: () => document.body.classList.toggle('focus') },
  // ── tasks ──
  { name: 'task list', group: 'tasks', summary: 'List tasks', usage: 'task list [--today|--overdue|--done|--all] [--tag t] [--category c]', aliases: ['ls', 'todo list'], run: async (io, _a, f) => {
    let list = await api.tasks.list({ sort: 'deadline', dir: 'ASC' });
    const now = Date.now(), eod = new Date(); eod.setHours(23, 59, 59, 999);
    if (f.done) list = list.filter((t) => t.status === 'completed');
    else if (!f.all) list = list.filter((t) => !['completed', 'cancelled'].includes(t.status));
    if (f.today) list = list.filter((t) => t.deadline && Date.parse(t.deadline) <= eod.getTime());
    if (f.overdue) list = list.filter((t) => t.deadline && Date.parse(t.deadline) < now);
    if (f.tag) list = list.filter((t) => (t.tags || []).includes(f.tag));
    if (f.category) list = list.filter((t) => (t.category || '').toLowerCase() === String(f.category).toLowerCase());
    list.sort((a, b) => (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1) || String(a.deadline).localeCompare(String(b.deadline)));
    if (!list.length) return io.print('No tasks match', 'muted');
    io.table(['id', 'prio', 'status', 'title', 'deadline'], list.slice(0, 100).map(taskRow));
  } },
  { name: 'task add', group: 'tasks', summary: 'Create a task', usage: 'task add "title" [--priority high] [--due tomorrow|+3d|fri|2026-12-01] [--tag thesis] [--category Research]', aliases: ['todo'], valueFlags: ['priority', 'due', 'tag', 'category', 'p', 'project', 'course', 'estimate'],
    palette: 'New task', paletteRun: async () => (await import('./modules/tasks.js')).quickTaskDialog(),
    run: async (io, args, f) => {
      const title = need(args.join(' '), 'task add "title" [--priority p] [--due when]');
      const due = f.due ? parseWhen(f.due) : null; if (f.due && !due) throw new Error(`Cannot parse due date '${f.due}'`);
      const pr = f.priority || f.p || 'medium'; if (!PRIOS.includes(pr)) throw new Error(`priority must be one of ${PRIOS.join(', ')}`);
      const t = await api.tasks.create({ title, priority: pr, deadline: due, tags: f.tag ? String(f.tag).split(',') : [], category: f.category || 'Research', estimate_min: f.estimate ? Number(f.estimate) : 0 });
      changed('tasks'); io.ok(`Task #${t.id} created: ${t.title}${due ? ' · due ' + fmtDate(due, true) : ''}`);
    } },
  { name: 'task done', group: 'tasks', summary: 'Complete a task', usage: 'task done <id>', aliases: ['task complete'], run: async (io, args) => { const r = await api.tasks.complete(idArg(args[0], 'task done <id>')); changed('tasks'); io.ok(`✓ #${r.id} ${r.title}`); if (r.next) io.print(`  recurring → next #${r.next.id} due ${fmtDate(r.next.deadline, true)}`, 'muted'); } },
  { name: 'task reopen', group: 'tasks', summary: 'Re-open a completed task', usage: 'task reopen <id>', run: async (io, args) => { const t = await api.tasks.reopen(idArg(args[0], 'task reopen <id>')); changed('tasks'); io.ok(`#${t.id} reopened`); } },
  { name: 'task status', group: 'tasks', summary: 'Set task status', usage: `task status <id> <${STATUSES.join('|')}>`, run: async (io, args) => { const s = need(args[1], 'task status <id> <status>'); if (!STATUSES.includes(s)) throw new Error('Unknown status'); const t = await api.tasks.update(idArg(args[0], 'task status <id> <status>'), { status: s }); changed('tasks'); io.ok(`#${t.id} → ${t.status}`); } },
  { name: 'task show', group: 'tasks', summary: 'Show task details', usage: 'task show <id>', run: async (io, args) => { const t = await api.tasks.get(idArg(args[0], 'task show <id>')); if (!t) throw new Error('Not found'); io.table(null, [['id', t.id], ['title', t.title], ['status', t.status], ['priority', t.priority], ['category', t.category], ['deadline', fmtDate(t.deadline, true)], ['tags', (t.tags || []).join(', ')], ['time', `${t.actual_min || 0} / ${t.estimate_min || 0} min`], ['subtasks', (t.subtasks || []).map((s) => (s.done ? '☑ ' : '☐ ') + s.title).join('\n')], ['description', t.description || '']]); } },
  { name: 'task start', group: 'tasks', summary: 'Start time tracking on a task', usage: 'task start <id>', run: async (io, args) => { const t = await api.tasks.timerStart(idArg(args[0], 'task start <id>')); changed('tasks'); io.ok(`⏱ tracking #${t.id} ${t.title}`); } },
  { name: 'task stop', group: 'tasks', summary: 'Stop time tracking', usage: 'task stop <id>', run: async (io, args) => { const t = await api.tasks.timerStop(idArg(args[0], 'task stop <id>')); changed('tasks'); io.ok(`⏹ #${t.id} total ${t.actual_min} min`); } },
  { name: 'task rm', group: 'tasks', summary: 'Delete a task', usage: 'task rm <id>', aliases: ['task delete'], run: async (io, args) => { const id = idArg(args[0], 'task rm <id>'); if (!(await io.confirm(`Delete task #${id}?`))) return; await api.tasks.remove(id); changed('tasks'); io.ok(`Deleted #${id}`); } },
  { name: 'task stats', group: 'tasks', summary: 'Task statistics', run: async (io) => { const s = await api.tasks.stats(); io.table(null, [['open', s.open], ['overdue', s.overdue], ['due today', s.dueToday], ['completed', s.completed], ['completed today', s.completedToday], ['high/critical open', s.highPriority], ['focus today', s.focusToday + ' min'], ['focus 7 days', s.focusWeek + ' min']]); } },
  { name: 'pomo', group: 'tasks', summary: 'Pomodoro timer', usage: 'pomo start [minutes] [taskId] | pomo stop | pomo status', palette: 'Start pomodoro (25 min)', paletteRun: () => pomodoro.start(),
    run: async (io, args) => {
      const sub = args[0] || 'status';
      if (sub === 'start') { const task = args[2] ? await api.tasks.get(Number(args[2])) : null; pomodoro.start(Number(args[1]) || undefined, task); io.ok('◷ started'); }
      else if (sub === 'stop') { pomodoro.stop(); io.ok('stopped'); }
      else { const s = pomodoro.status(); io.print(s.running ? `${s.mode} · ${s.remaining} remaining${s.taskTitle ? ' · ' + s.taskTitle : ''}` : 'not running', 'muted'); }
    } },
  // ── research ──
  { name: 'research list', group: 'research', summary: 'List research projects', run: async (io) => { const l = await api.research.list({ sort: 'updated_at' }); if (!l.length) return io.print('No projects — try: research new "My thesis"', 'muted'); io.table(['id', 'active', 'status', 'name', 'target'], l.map((p) => [p.id, p.active ? '●' : '', p.status, p.name, p.target_date || ''])); } },
  { name: 'research new', group: 'research', summary: 'Create a project with the full proposal structure', usage: 'research new "name" [--title "research title"] [--supervisor "Dr. X"]', valueFlags: ['title', 'supervisor'],
    palette: 'New research project', paletteRun: async () => (await import('./modules/research.js')).newProjectDialog(),
    run: async (io, args, f) => { const p = await api.research.create({ name: need(args.join(' '), 'research new "name"'), title: f.title || '', supervisor: f.supervisor || '' }); changed('projects'); io.ok(`Project #${p.id} “${p.name}” created with 16 proposal sections`); } },
  { name: 'research open', group: 'research', summary: 'Open a project', usage: 'research open <id|name>', run: async (io, args) => { const p = await findByName(await api.research.list({}), need(args.join(' '), 'research open <id|name>')); if (!p) throw new Error('No such project'); nav('research', { id: p.id }); } },
  { name: 'research active', group: 'research', summary: 'Set the active project', usage: 'research active <id|name>', run: async (io, args) => { const p = await findByName(await api.research.list({}), need(args.join(' '), 'research active <id|name>')); if (!p) throw new Error('No such project'); await api.research.setActive(p.id); changed('projects'); io.ok(`Active project: ${p.name}`); } },
  { name: 'research progress', group: 'research', summary: 'Show proposal/timeline progress', usage: 'research progress [id]', run: async (io, args) => { const p = args[0] ? await api.research.get(Number(args[0])) : await api.research.active(); if (!p) throw new Error('No project'); const g = await api.research.progress(p.id); io.table(null, [['project', p.name], ['proposal', `${g.proposalPct}% · ${g.words} words · ${g.doneSections}/${g.sections} sections done`], ['timeline', `${g.timelinePct}% · ${g.milestonesDone}/${g.milestones} milestones`], ['checklist', `${g.checklistPct}%`]]); } },
  // ── courses ──
  { name: 'course list', group: 'courses', summary: 'List courses', aliases: ['courses list'], run: async (io) => { const l = await api.courses.list({ sort: 'name', dir: 'ASC' }); if (!l.length) return io.print('No courses — try: course new "Quantitative Genetics" --code AG501', 'muted'); io.table(['id', 'code', 'name', 'instructor', 'semester', 'status'], l.map((c) => [c.id, c.code, c.name, c.instructor, c.semester, c.status])); } },
  { name: 'course new', group: 'courses', summary: 'Create a course', usage: 'course new "name" [--code X] [--instructor Y] [--semester Z]', valueFlags: ['code', 'instructor', 'semester'], palette: 'New course', paletteRun: async () => (await import('./modules/courses.js')).newCourseDialog(),
    run: async (io, args, f) => { const c = await api.courses.create({ name: need(args.join(' '), 'course new "name"'), code: f.code || '', instructor: f.instructor || '', semester: f.semester || '' }); changed('courses'); io.ok(`Course #${c.id} created`); } },
  { name: 'course open', group: 'courses', summary: 'Open a course workspace', usage: 'course open <id|name|code>', run: async (io, args) => { const l = await api.courses.list({}); const q = need(args.join(' '), 'course open <id|name>'); const c = (await findByName(l, q)) || (await findByName(l, q, 'code')); if (!c) throw new Error('No such course'); nav('courses', { id: c.id }); } },
  // ── apps ──
  { name: 'apps list', group: 'apps', summary: 'List registered applications', run: async (io) => { const l = await api.apps.list({ sort: 'name', dir: 'ASC' }); if (!l.length) return io.print('No apps registered — use: apps add', 'muted'); io.table(['id', 'name', 'category', 'launches', 'status'], l.map((a) => [a.id, a.name, a.category, a.launch_count, a.broken ? 'BROKEN' : 'ok'])); } },
  { name: 'apps add', group: 'apps', summary: 'Register .exe / .lnk (opens a file dialog when no path given)', usage: 'apps add [path]', palette: 'Add application (.exe / .lnk)', paletteRun: async () => (await import('./modules/apps.js')).addAppsDialog(),
    run: async (io, args) => { const paths = args.length ? [args.join(' ')] : await api.system.openFiles({ kind: 'apps', multi: true, title: 'Select applications or shortcuts' }); if (!paths.length) return io.print('cancelled', 'muted'); const r = await api.apps.registerMany(paths); changed('apps'); r.added.forEach((a) => io.ok(`+ ${a.name}  (${a.target_path || a.path})`)); r.errors.forEach((e) => io.err(`${e.path}: ${e.error}`)); } },
  { name: 'apps launch', group: 'apps', summary: 'Launch an application by name or id', usage: 'apps launch <name|id>', aliases: ['launch', 'run'], run: async (io, args) => { const q = need(args.join(' '), 'apps launch <name|id>'); const r = await api.apps.launch(/^\d+$/.test(q) ? Number(q) : q); changed('apps'); io.ok(`▶ ${r.name}`); } },
  { name: 'apps rm', group: 'apps', summary: 'Remove an app from the library (does not uninstall)', usage: 'apps rm <id>', run: async (io, args) => { const id = idArg(args[0], 'apps rm <id>'); if (!(await io.confirm(`Remove app #${id} from the library?`))) return; await api.apps.remove(id); changed('apps'); io.ok('removed'); } },
  // ── library ──
  { name: 'library search', group: 'library', summary: 'Search the knowledge library', usage: 'library search <query>', run: async (io, args) => { const l = await api.library.list({ filter: { q: need(args.join(' '), 'library search <query>') }, limit: 50 }); if (!l.length) return io.print('No files', 'muted'); io.table(['id', 'type', 'name', 'authors', 'year'], l.map((f) => [f.id, f.doc_type, f.name.slice(0, 50), (f.authors || '').slice(0, 30), f.year || ''])); } },
  { name: 'library import', group: 'library', summary: 'Import files (dialog) — linked by default, originals untouched', usage: 'library import [--managed] [--folder]', palette: 'Import files into library', paletteRun: async () => (await import('./modules/library.js')).importDialog(),
    run: async (io, _a, f) => { const paths = await api.system.openFiles({ kind: 'docs', multi: true, folders: !!f.folder }); if (!paths.length) return io.print('cancelled', 'muted'); io.print('importing…', 'muted'); const r = await api.library.importPaths(paths, { mode: f.managed ? 'managed' : undefined }); changed('files'); io.ok(`${r.imported.length} imported · ${r.duplicates.length} duplicates skipped · ${r.errors.length} errors`); r.duplicates.slice(0, 10).forEach((d) => io.warn(`dup: ${d.file} = #${d.existing.id} ${d.existing.name}`)); } },
  { name: 'library open', group: 'library', summary: 'Open a library file with its default application', usage: 'library open <id>', run: async (io, args) => { await api.library.open(idArg(args[0], 'library open <id>')); io.ok('opened'); } },
  { name: 'library recent', group: 'library', summary: 'Recently opened files', run: async (io) => { const r = await api.library.recent(15); io.table(['id', 'name', 'opened'], r.map((f) => [f.id, f.name, relTime(f.last_opened_at)])); } },
  { name: 'paper add', group: 'library', summary: 'Add a paper (file dialog), marked as article', palette: 'Add paper', paletteRun: async () => (await import('./modules/library.js')).importDialog({ doc_type: 'article' }), run: async (io) => { const p = await api.system.openFiles({ kind: 'docs', multi: true }); if (!p.length) return; const r = await api.library.importPaths(p, { doc_type: 'article' }); changed('files'); io.ok(`${r.imported.length} paper(s) added`); } },
  // ── bookmarks ──
  { name: 'bookmark add', group: 'bookmarks', summary: 'Add a bookmark', usage: 'bookmark add <url> [name] [--category X] [--tag t]', valueFlags: ['category', 'tag'], palette: 'Add bookmark', paletteRun: async () => (await import('./modules/bookmarks.js')).bookmarkDialog(),
    run: async (io, args, f) => { const url = need(args[0], 'bookmark add <url> [name]'); const b = await api.bookmarks.create({ url, name: args.slice(1).join(' ') || undefined, category: f.category || 'Reference', tags: f.tag ? String(f.tag).split(',') : [] }); changed('bookmarks'); io.ok(`Bookmark #${b.id} ${b.name}`); } },
  { name: 'bookmarks list', group: 'bookmarks', summary: 'List bookmarks', aliases: ['bookmark list'], run: async (io) => { const l = await api.bookmarks.list({ sort: 'sort', dir: 'ASC' }); io.table(['id', 'category', 'name', 'url'], l.map((b) => [b.id, b.category, b.name.slice(0, 40), b.url.slice(0, 60)])); } },
  { name: 'bookmark open', group: 'bookmarks', summary: 'Open a bookmark in the browser', usage: 'bookmark open <id|name>', run: async (io, args) => { const b = await findByName(await api.bookmarks.list({}), need(args.join(' '), 'bookmark open <id|name>')); if (!b) throw new Error('No such bookmark'); await api.system.openExternal(b.url); io.ok(`→ ${b.url}`); } },
  // ── notes ──
  { name: 'note new', group: 'notes', summary: 'Create a note', usage: 'note new "title"', palette: 'New note', paletteRun: () => nav('notes', { create: true }), run: async (io, args) => { const n = await api.notes.create({ title: args.join(' ') || 'Untitled' }); changed('notes'); io.ok(`Note #${n.id} created`); nav('notes', { id: n.id }); } },
  { name: 'note list', group: 'notes', summary: 'List notes', run: async (io) => { const l = await api.notes.list({ limit: 60 }); io.table(['id', 'kind', 'title', 'updated'], l.map((n) => [n.id, n.kind, n.title.slice(0, 50), relTime(n.updated_at)])); } },
  { name: 'journal', group: 'notes', summary: "Open today's journal (or research journal)", usage: 'journal [--research]', palette: "Open today's journal", paletteRun: () => nav('notes', { tab: 'journal' }), run: (io, _a, f) => nav('notes', { tab: f.research ? 'research_journal' : 'journal' }) },
  { name: 'scratch', group: 'notes', summary: 'Open the scratchpad', palette: 'Open scratchpad', paletteRun: () => nav('notes', { tab: 'scratch' }), run: () => nav('notes', { tab: 'scratch' }) },
  { name: 'qn', group: 'notes', summary: 'Quick note: append a line to the scratchpad', usage: 'qn <text>', run: async (io, args) => { const s = await api.notes.scratch(); await api.notes.update(s.id, { content: `${s.content ? s.content + '\n' : ''}- ${fmtDate(new Date().toISOString(), true)} ${need(args.join(' '), 'qn <text>')}` }); changed('notes'); io.ok('appended to scratchpad'); } },
  // ── tools ──
  { name: 'tools', group: 'tools', summary: 'List scientific tools (optionally by category)', usage: 'tools [genetics|population|breeding|animal|statistics|util]', run: (io, args) => {
    const map = { genetics: 'quant', quantitative: 'quant', population: 'pop', breeding: 'breed', animal: 'animal', statistics: 'stats', stats: 'stats', util: 'util' };
    const cat = args[0] ? map[args[0].toLowerCase()] || args[0] : null;
    const all = [...CALCULATORS, ...WORKSPACES].filter((c) => !cat || c.cat === cat);
    for (const ct of CATEGORIES.filter((x) => !cat || x.id === cat)) { const l = all.filter((c) => c.cat === ct.id); if (!l.length) continue; io.print(`\n${ct.name.toUpperCase()}`, 'acc'); io.table(null, l.map((c) => [c.id, c.name])); }
    io.print('\nRun inline:  tool <id> key=value …   e.g.  tool heritability va=40 ve=60', 'muted');
  } },
  { name: 'tool', group: 'tools', summary: 'Run a calculator inline or open it', usage: 'tool <id> [key=value …]', run: (io, args) => {
    const id = need(args[0], 'tool <id> [key=value …]'); const calc = CALCULATORS.find((c) => c.id === id);
    if (!calc) { if (WORKSPACES.find((w) => w.id === id)) return nav('tools', { id }); throw new Error(`Unknown tool '${id}' — see: tools`); }
    if (args.length === 1) { io.print(`${calc.name}`, 'acc'); io.print('inputs: ' + calc.inputs.map((i) => `${i.k}${i.optional ? '?' : ''}${i.type === 'select' ? '=' + i.options.map((o) => o[0]).join('|') : ''}`).join('  '), 'muted'); io.print('formula: ' + calc.formula, 'muted'); io.print('example: tool ' + id + ' ' + Object.entries(calc.example).map(([k, v]) => `${k}=${String(v).includes(' ') || String(v).includes('\n') ? JSON.stringify(String(v)) : v}`).join(' '), 'muted'); return; }
    const raw = {}; for (const a of args.slice(1)) { const m = /^([\w]+)=(.*)$/s.exec(a); if (!m) throw new Error(`Expected key=value, got '${a}'`); raw[m[1]] = m[2].replace(/\\n/g, '\n'); }
    const out = runCalculator(id, raw);
    const kvs = [];
    const flush = () => { if (kvs.length) { io.kv(kvs.splice(0)); } };
    for (const r of out.results) {
      if (r.table) { flush(); io.print(r.label, 'muted'); io.table(r.table.columns, r.table.rows.map((row) => row.map((c) => (typeof c === 'number' ? fmtNum(c, 4) : c)))); }
      else kvs.push([r.label, `${r.text !== undefined ? r.text : fmtNum(r.value, r.digits ?? 4)}${r.unit ? ' ' + r.unit : ''}`]);
    }
    flush();
    out.warnings.forEach((w) => io.warn('! ' + w));
  } },
  // ── system ──
  { name: 'theme', group: 'system', summary: 'List or set the color theme', usage: 'theme [name]', run: async (io, args) => { if (!args[0]) return io.table(['theme', 'name'], Object.entries(THEMES).map(([k, t]) => [k + (settings.get('appearance.theme') === k ? ' ●' : ''), t.name])); if (!THEMES[args[0]]) throw new Error('Unknown theme'); await settings.set('appearance.theme', args[0]); io.ok(`theme → ${args[0]}`); } },
  { name: 'accent', group: 'system', summary: 'Set accent color', usage: 'accent <#hex>', run: async (io, args) => { const c = need(args[0], 'accent #59D5C3'); if (!/^#[0-9a-f]{6}$/i.test(c)) throw new Error('Use a #RRGGBB color'); await settings.set('appearance.accent', c); io.ok(`accent → ${c}`); } },
  { name: 'backup', group: 'system', summary: 'Create or list database backups', usage: 'backup [now|list]', palette: 'Backup now', paletteRun: async () => { try { const r = await api.backup.create({}); toast(`Backup saved: ${r.file}`, 'ok', 5000); } catch (e) { toastError(e); } },
    run: async (io, args) => { if ((args[0] || 'now') === 'list') { const l = await api.backup.list(); return io.table(['created', 'size', 'file'], l.map((b) => [fmtDate(b.created_at, true), fmtBytes(b.size), b.name])); } const r = await api.backup.create({}); io.ok(`backup → ${r.file} (${fmtBytes(r.size)})`); } },
  { name: 'notify', group: 'system', summary: 'List notifications', usage: 'notify [--scan]', run: async (io, _a, f) => { if (f.scan) await api.notifications.scan(); const l = await api.notifications.list(30); if (!l.length) return io.print('No notifications', 'muted'); io.table(['', 'when', 'title'], l.map((n) => [n.read ? ' ' : '●', relTime(n.created_at), n.title])); } },
  { name: 'reindex', group: 'system', summary: 'Rebuild the full-text search index', run: async (io) => { const n = await api.search.rebuild(); io.ok(`indexed ${n} records`); } },
  { name: 'logs', group: 'system', summary: 'Open the log folder', run: () => api.system.openLogFolder() },
  { name: 'data', group: 'system', summary: 'Open the data folder', run: () => api.system.openDataFolder() },
];

commands.push(...BUILTINS);

const byName = new Map();
for (const c of commands) { byName.set(c.name, c); for (const a of c.aliases || []) byName.set(a, c); }

// Find the longest command name that prefixes the token list. Returns { cmd, rest }.
export function match(tokens) {
  for (let n = Math.min(3, tokens.length); n >= 1; n--) {
    const key = tokens.slice(0, n).join(' ').toLowerCase();
    if (byName.has(key)) return { cmd: byName.get(key), rest: tokens.slice(n) };
  }
  return null;
}
export const resolve = (name) => byName.get(String(name).toLowerCase());
export const allNames = () => [...byName.keys()].sort();
