// gsh virtual filesystem: browse Gene OS data like directories.
//   ~/tasks  ~/research/<project>  ~/courses/<course>  ~/library  ~/notes  ~/apps  ~/bookmarks  ~/tools/<category>
import { api } from '../api.js';
import { CATEGORIES, CALCULATORS, WORKSPACES } from '../../../shared/genetics.mjs';

export const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 42) || 'item';
export const split = (path) => String(path || '~').replace(/^~\/?/, '').split('/').filter(Boolean);
export const join = (parts) => '~' + (parts.length ? '/' + parts.join('/') : '');

const ROOT = [
  { name: 'tasks', module: 'tasks', meta: 'open tasks' }, { name: 'research', module: 'research', meta: 'projects & proposal sections' },
  { name: 'courses', module: 'courses', meta: 'course workspaces' }, { name: 'library', module: 'library', meta: 'files & papers' },
  { name: 'notes', module: 'notes', meta: 'notes & journals' }, { name: 'apps', module: 'apps', meta: 'registered programs' },
  { name: 'bookmarks', module: 'bookmarks', meta: 'web resources' }, { name: 'tools', module: 'tools', meta: 'scientific toolbox' },
];
const ALL_TOOLS = () => [...CALCULATORS, ...WORKSPACES];

export function resolve(cwd, target) {
  if (!target || target === '~' || target === '/') return '~';
  const abs = target.startsWith('~') || target.startsWith('/');
  const parts = abs ? [] : split(cwd);
  for (const seg of target.replace(/^~\/?|^\//, '').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return join(parts);
}

// Children of a canonical directory path (array of segment names).
async function children(parts) {
  const [a, b] = parts;
  if (parts.length === 0) return ROOT.map((r) => ({ name: r.name, kind: 'dir', meta: r.meta, ref: { module: r.module } }));
  if (parts.length === 1) {
    if (a === 'tasks') return (await api.tasks.list({ sort: 'deadline', dir: 'ASC' })).filter((t) => !['completed', 'cancelled'].includes(t.status)).map((t) => ({ name: `${t.id}-${slug(t.title)}`, kind: 'file', label: t.title, meta: `${t.priority} · ${t.status}${t.deadline ? ' · due ' + t.deadline.slice(0, 10) : ''}`, ref: { entity: 'task', id: t.id } }));
    if (a === 'research') return (await api.research.list({})).map((p) => ({ name: slug(p.name), kind: 'dir', label: p.name, meta: `${p.status}${p.active ? ' · active' : ''}`, ref: { entity: 'project', id: p.id } }));
    if (a === 'courses') return (await api.courses.list({ sort: 'name', dir: 'ASC' })).map((c) => ({ name: slug(c.code || c.name), kind: 'dir', label: c.name, meta: `${c.semester || ''} ${c.status}`.trim(), ref: { entity: 'course', id: c.id } }));
    if (a === 'library') return (await api.library.list({ limit: 300 })).map((f) => ({ name: `${f.id}-${slug(f.name)}${f.ext ? '.' + f.ext : ''}`, kind: 'file', label: f.name, meta: `${f.doc_type}${f.year ? ' · ' + f.year : ''}`, ref: { entity: 'file', id: f.id } }));
    if (a === 'notes') return (await api.notes.list({ limit: 500 })).map((n) => ({ name: `${slug(n.title)}.md`, kind: 'file', label: n.title, meta: n.kind, ref: { entity: 'note', id: n.id } }));
    if (a === 'apps') return (await api.apps.list({ sort: 'name', dir: 'ASC' })).map((x) => ({ name: slug(x.name), kind: 'app', label: x.name, meta: `${x.category}${x.broken ? ' · BROKEN' : ''}`, ref: { entity: 'app', id: x.id } }));
    if (a === 'bookmarks') return (await api.bookmarks.list({ sort: 'sort', dir: 'ASC' })).map((x) => ({ name: slug(x.name), kind: 'link', label: x.name, meta: x.url, ref: { entity: 'bookmark', id: x.id } }));
    if (a === 'tools') return [...CATEGORIES.map((c) => ({ name: c.id, kind: 'dir', label: c.name, meta: `${ALL_TOOLS().filter((t) => t.cat === c.id).length} tools`, ref: { module: 'tools' } }))];
  }
  if (parts.length === 2) {
    const parent = (await children([a])).find((e) => e.name === b);
    if (!parent) return null;
    if (a === 'research') return (await api.research.sections(parent.ref.id)).map((s) => ({ name: `${String(s.sort + 1).padStart(2, '0')}-${slug(s.title)}`, kind: 'file', label: s.title, meta: s.status, ref: { entity: 'section', id: s.id, project: parent.ref.id } }));
    if (a === 'courses') return (await api.courses.topics(parent.ref.id)).map((t) => ({ name: slug(t.title), kind: 'file', label: t.title, meta: `${t.kind}${t.done ? ' · done' : ''}`, ref: { entity: 'topic', id: t.id, course: parent.ref.id, kind: t.kind } }));
    if (a === 'tools') return ALL_TOOLS().filter((t) => t.cat === b).map((t) => ({ name: t.id, kind: 'tool', label: t.name, meta: WORKSPACES.includes(t) ? 'workspace' : 'calculator', ref: { entity: 'tool', id: t.id } }));
  }
  return null;
}

function pick(entries, name) {
  const n = String(name).toLowerCase();
  return entries.find((e) => e.name === name) || entries.find((e) => e.name.toLowerCase() === n)
    || entries.find((e) => (e.label || '').toLowerCase() === n)
    || (() => { const m = entries.filter((e) => e.name.toLowerCase().startsWith(n)); return m.length === 1 ? m[0] : null; })()
    || (/^\d+$/.test(n) ? entries.find((e) => e.name.startsWith(n + '-')) : null);
}

// Canonicalize a path (prefix matching per segment). Returns { path, parts, entry } where entry is the
// node itself ({ kind: 'dir' } for directories).
export async function lookup(cwd, target) {
  const raw = split(resolve(cwd, target));
  const parts = [];
  let entry = { name: '~', kind: 'dir', ref: {} };
  for (let i = 0; i < raw.length; i++) {
    const kids = await children(parts);
    if (!kids) throw new Error(`not a directory: ${join(parts)}`);
    const hit = pick(kids, raw[i]);
    if (!hit) throw new Error(`no such file or directory: ${join([...parts, raw[i]])}`);
    if (hit.kind !== 'dir' && i < raw.length - 1) throw new Error(`not a directory: ${join([...parts, hit.name])}`);
    parts.push(hit.name); entry = hit;
  }
  return { path: join(parts), parts, entry };
}
export async function list(cwd, target) {
  const r = await lookup(cwd, target || '.');
  if (r.entry.kind !== 'dir') return { ...r, entries: [r.entry], single: true };
  return { ...r, entries: (await children(r.parts)) || [] };
}
export async function completions(cwd, partial) {
  const idx = partial.lastIndexOf('/');
  const base = idx >= 0 ? partial.slice(0, idx + 1) : '';
  const stem = idx >= 0 ? partial.slice(idx + 1) : partial;
  try {
    const { entries } = await list(cwd, base || '.');
    return entries.filter((e) => e.name.toLowerCase().startsWith(stem.toLowerCase())).map((e) => ({ value: base + e.name + (e.kind === 'dir' ? '/' : ''), desc: e.label || e.meta || e.kind }));
  } catch { return []; }
}

// Navigate the GUI to whatever a path points at.
export function open(entry) {
  const nav = (m, p) => window.__os.nav(m, p);
  const r = entry.ref || {};
  if (r.module && !r.entity) return nav(r.module);
  if (r.entity === 'task') return nav('tasks', { open: r.id });
  if (r.entity === 'project') return nav('research', { id: r.id });
  if (r.entity === 'section') return nav('research', { id: r.project, tab: 'proposal', section: r.id });
  if (r.entity === 'course') return nav('courses', { id: r.id });
  if (r.entity === 'topic') return nav('courses', { id: r.course, tab: r.kind === 'lecture' ? 'lectures' : r.kind === 'assignment' ? 'assignments' : 'topics' });
  if (r.entity === 'file') return nav('library', { id: r.id });
  if (r.entity === 'note') return nav('notes', { id: r.id });
  if (r.entity === 'app') return nav('apps', { id: r.id });
  if (r.entity === 'bookmark') return nav('bookmarks', { id: r.id });
  if (r.entity === 'tool') return nav('tools', { id: r.id });
  return nav('home');
}
