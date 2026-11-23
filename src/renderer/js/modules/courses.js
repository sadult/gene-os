// Courses: unlimited courses, each an independent workspace (overview, notes, lectures, assignments, topics,
// files, tasks, reading list, flashcards / exam prep, bookmarks).
import { api } from '../api.js';
import { h, clear, bar, kv, relTime, fmtDate, toast, toastError, formModal, confirmBox, subtabs, empty, promptBox, isOverdue, contextMenu } from '../ui.js';
import { bus } from '../state.js';
import { mdEditor } from '../editor.js';
import { render } from '../../../shared/markdown.mjs';

const st = { id: null, tab: 'overview', noteId: null, editor: null, review: null };
let root = null, off = null;
const courseFields = [
  { key: 'name', label: 'Course name', required: true, autofocus: true }, { key: 'code', label: 'Course code' },
  { key: 'instructor', label: 'Instructor' }, { key: 'semester', label: 'Semester', placeholder: '1404-1405 · Fall' },
  { key: 'credits', label: 'Credits', type: 'number' }, { key: 'schedule', label: 'Schedule', placeholder: 'Sat 10:00–12:00, Room 12' },
  { key: 'exam_date', label: 'Exam date', type: 'date' }, { key: 'color', label: 'Color', type: 'color' },
  { key: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['completed', 'Completed'], ['planned', 'Planned'], ['archived', 'Archived']] },
  { key: 'description', label: 'Description', type: 'textarea', rows: 3, full: true },
];
export async function newCourseDialog() {
  const v = await formModal({ title: 'New course', size: 'wide', fields: courseFields, values: { status: 'active', color: '#59D5C3' }, submitLabel: 'Create' });
  if (!v) return null;
  try { const c = await api.courses.create(v); bus.emit('changed', 'courses'); window.__os.nav('courses', { id: c.id }); return c; } catch (e) { toastError(e); return null; }
}

async function grid() {
  const list = await api.courses.list({ sort: 'name', dir: 'ASC' });
  const overs = await Promise.all(list.map((c) => api.courses.overview(c.id)));
  clear(root).append(h('div.toolbar', h('span.section-title', { style: { margin: 0 } }, `Courses (${list.length})`), h('span.right'), h('button.btn.primary', { onclick: newCourseDialog }, '+ New course')),
    list.length ? h('div.dash', list.map((c, i) => { const o = overs[i]; return h('div.panel', { style: { cursor: 'pointer', borderTop: `2px solid ${c.color}` }, onclick: () => { st.id = c.id; st.tab = 'overview'; draw(); } },
      h('div.panel-h', h('span', { style: { color: c.color } }, '■'), h('span', c.code || 'COURSE'), h('span.right.small', c.status)),
      h('div.panel-b.col', h('b', c.name), h('div.muted.small', [c.instructor, c.semester].filter(Boolean).join(' · ') || '—'), bar(o.progress, 18),
        h('div.small.muted', `${o.topicsDone}/${o.topicCount} topics · ${o.lecturesDone}/${o.lectureCount} lectures · ${o.assignmentsOpen} open assignments · ${o.dueCards} cards due`),
        c.exam_date ? h(`div.small${isOverdue(c.exam_date) ? '.dim' : '.warn'}`, `Exam ${c.exam_date} · ${relTime(c.exam_date)}`) : null)); })) : empty('No courses yet — each course gets its own notes, lectures, assignments, files, tasks, flashcards and reading list.', h('button.btn.primary', { onclick: newCourseDialog }, '+ New course')));
}

function topicList(c, kind, label) {
  return async (wrap) => {
    const items = await api.courses.topics(c.id, kind);
    const add = h('input.grow', { placeholder: `+ add ${label.toLowerCase()} (Enter)` });
    add.addEventListener('keydown', async (e) => { if (e.key === 'Enter' && add.value.trim()) { await api.courses.addTopic(c.id, { title: add.value.trim(), kind }); draw(); } });
    const done = items.filter((x) => x.done).length;
    wrap.append(h('div.panel', h('div.panel-h', h('span.t', label), h('span.right', bar(items.length ? (done / items.length) * 100 : 0, 14))), h('div.list', items.map((t) => h(`div.item.clickable${t.done ? '.done' : ''}`, {
      onclick: () => editTopic(t),
      oncontextmenu: (e) => contextMenu(e, [{ label: 'Edit / summary', run: () => editTopic(t) }, { label: 'Create flashcard from this', run: async () => { await api.courses.addCard(c.id, t.title, t.summary || ''); toast('Card added', 'ok'); } }, '-', { label: 'Delete', danger: true, run: async () => { if (await confirmBox(`Delete “${t.title}”?`, { danger: true })) { await api.courses.removeTopic(t.id); draw(); } } }]),
    }, h('input', { type: 'checkbox', checked: t.done, onclick: async (e) => { e.stopPropagation(); await api.courses.updateTopic(t.id, { done: e.target.checked }); draw(); } }),
    h('span.grow.title', t.title), t.summary ? h('span.dim.small', '✎') : null, t.questions ? h('span.dim.small', '?') : null,
    t.due_date ? h(`span.meta${!t.done && isOverdue(t.due_date + 'T23:59') ? '.err' : ''}`, `${t.due_date} · ${relTime(t.due_date)}`) : null))), h('div.panel-b.row', add)));
  };
}
async function editTopic(t) {
  const v = await formModal({ title: t.kind === 'assignment' ? 'Assignment' : t.kind === 'lecture' ? 'Lecture' : 'Topic', size: 'wide', values: t, fields: [
    { key: 'title', label: 'Title', required: true }, { key: 'done', label: 'Completed', type: 'checkbox' },
    { key: 'due_date', label: t.kind === 'assignment' ? 'Due date' : 'Date', type: 'date' },
    { key: 'summary', label: 'Summary (Markdown)', type: 'markdown', rows: 8, full: true },
    { key: 'questions', label: 'Questions / things to review', type: 'textarea', rows: 4, full: true },
  ] });
  if (!v) return;
  await api.courses.updateTopic(t.id, v); bus.emit('changed', 'courses'); draw();
}

async function courseNotes(c, wrap) {
  const notes = await api.notes.list({ filter: { course_id: c.id } });
  if (!st.noteId || !notes.find((n) => n.id === st.noteId)) st.noteId = notes[0]?.id || null;
  const cur = notes.find((n) => n.id === st.noteId);
  const left = h('div.panel', h('div.panel-h', h('span.t', 'Notes'), h('button.btn.sm.right', { onclick: async () => { const t = await promptBox('New course note', 'Title', `Lecture notes ${fmtDate(new Date().toISOString())}`); if (t) { const n = await api.notes.create({ title: t, course_id: c.id, content: `# ${t}\n\n` }); st.noteId = n.id; draw(); } } }, '+')),
    h('div.list', notes.map((n) => h(`div.item.clickable${n.id === st.noteId ? '.sel' : ''}`, { onclick: async () => { if (st.editor) await st.editor.flush(); st.noteId = n.id; draw(); } }, h('span.grow.ellipsis', n.title), h('span.meta', relTime(n.updated_at))))));
  const right = h('div.col');
  if (cur) {
    st.editor = mdEditor({ value: cur.content, onSave: (content) => api.notes.update(cur.id, { content }) });
    right.append(h('div.row', h('input.grow', { value: cur.title, style: { fontWeight: 600 }, onchange: async (e) => { await api.notes.update(cur.id, { title: e.target.value }); draw(); } }), h('button.btn.sm', { onclick: () => window.__os.nav('notes', { id: cur.id }) }, 'Open in Notes'), h('button.btn.sm.danger', { onclick: async () => { if (await confirmBox(`Delete note “${cur.title}”?`, { danger: true })) { await api.notes.remove(cur.id); st.noteId = null; draw(); } } }, '✕')), st.editor.el);
  } else right.append(empty('No notes for this course yet.'));
  wrap.append(h('div.split', left, right));
}
async function courseFiles(c, wrap) {
  const files = await api.library.list({ filter: { course_id: c.id }, sort: 'created_at' });
  wrap.append(h('div.toolbar', h('button.btn.primary', { onclick: async () => { const lib = await import('./library.js'); await lib.importDialog({ course_id: c.id, doc_type: 'lecture' }); draw(); } }, '+ Attach files'), h('span.muted.small', 'Files are stored in the library and tagged with this course.')),
    files.length ? h('div.panel', h('div.list', files.map((f) => h('div.item.clickable', { onclick: () => window.__os.nav('library', { id: f.id }), ondblclick: () => api.library.open(f.id).catch(toastError) }, h('span.dim', (f.ext || '').toUpperCase().padEnd(5)), h('span.grow', f.name), h('span.meta', f.doc_type), h('button.btn.sm', { onclick: (e) => { e.stopPropagation(); api.library.open(f.id).catch(toastError); } }, 'Open'))))) : empty('No files attached.'));
}
async function courseTasks(c, wrap) {
  const tasks = (await api.tasks.list({ filter: { course_id: c.id }, sort: 'deadline', dir: 'ASC' }));
  const t = await import('./tasks.js');
  wrap.append(h('div.toolbar', h('button.btn.primary', { onclick: async () => { await t.quickTaskDialog({ course_id: c.id, category: 'Academic' }); draw(); } }, '+ Task')),
    tasks.length ? h('div.panel', h('div.list', tasks.map((x) => h(`div.item.clickable${x.status === 'completed' ? '.done' : ''}`, { onclick: () => t.openTask(x.id) }, h('input', { type: 'checkbox', checked: x.status === 'completed', onclick: async (e) => { e.stopPropagation(); await (e.target.checked ? api.tasks.complete(x.id) : api.tasks.reopen(x.id)); draw(); } }), h('span.grow.title', x.title), x.deadline ? h('span.meta', relTime(x.deadline)) : null)))) : empty('No tasks linked to this course.'));
}
async function readingList(c, wrap) {
  const items = (c.reading_list || []).map((x) => ({ ...x }));
  const save = async () => { await api.courses.update(c.id, { reading_list: items }); c.reading_list = items; draw(); };
  const add = h('input.grow', { placeholder: '+ add reading: Falconer & Mackay ch. 10 (Enter)' });
  add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim()) { items.push({ title: add.value.trim(), done: false }); save(); } });
  wrap.append(h('div.panel', h('div.panel-h', h('span.t', 'Reading list'), h('span.right', `${items.filter((x) => x.done).length}/${items.length}`)), h('div.list', items.map((it, i) => h(`div.item${it.done ? '.done' : ''}`, h('input', { type: 'checkbox', checked: it.done, onchange: (e) => { it.done = e.target.checked; save(); } }), h('span.grow.title', it.title), h('button.btn.sm.ghost', { onclick: () => { items.splice(i, 1); save(); } }, '✕')))), h('div.panel-b.row', add)));
}
async function flashcards(c, wrap) {
  const [cards, due] = await Promise.all([api.courses.cards(c.id), api.courses.dueCards(c.id)]);
  const front = h('input.grow', { placeholder: 'Front (question)' }), back = h('input.grow', { placeholder: 'Back (answer)' });
  const addCard = async () => { if (!front.value.trim()) return; await api.courses.addCard(c.id, front.value.trim(), back.value.trim()); draw(); };
  back.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCard(); });
  const reviewBox = h('div');
  const startReview = () => {
    let i = 0, flipped = false;
    const show = () => {
      clear(reviewBox);
      if (i >= due.length) { reviewBox.append(h('div.empty', `Session complete — ${due.length} card(s) reviewed.`)); return; }
      const cd = due[i];
      reviewBox.append(h('div.flash', { onclick: () => { flipped = !flipped; show(); } }, flipped ? h('div', h('div.muted.small', cd.front), h('div.md', { html: render(cd.back || '—') })) : cd.front),
        h('div.row', { style: { justifyContent: 'center', marginTop: '8px' } }, h('span.muted.small', `${i + 1}/${due.length} · box ${cd.box} · click card to flip`),
          flipped ? [h('button.btn.danger', { onclick: async () => { await api.courses.reviewCard(cd.id, false); i++; flipped = false; show(); } }, '✗ Again'), h('button.btn.primary', { onclick: async () => { await api.courses.reviewCard(cd.id, true); i++; flipped = false; show(); } }, '✓ Got it')] : null));
    };
    show();
  };
  wrap.append(h('div.grid.g2',
    h('div.panel', h('div.panel-h', h('span.t', 'Exam preparation — review'), h('span.right', `${due.length} due`)), h('div.panel-b.col', c.exam_date ? h('div.warn.small', `Exam: ${c.exam_date} (${relTime(c.exam_date)})`) : null, due.length ? h('button.btn.primary', { onclick: startReview }, `Start review (${due.length})`) : h('div.muted', 'No cards due. Leitner boxes: 1 → 1d, 2 → 2d, 3 → 4d, 4 → 8d, 5 → 16d.'), reviewBox)),
    h('div.panel', h('div.panel-h', h('span.t', `Cards (${cards.length})`)), h('div.panel-b.row', front, back, h('button.btn', { onclick: addCard }, 'Add')), h('div.list.scroll', { style: { maxHeight: '50vh' } }, cards.map((cd) => h('div.item', h('span.dim.small', `B${cd.box}`), h('span.grow.ellipsis', cd.front), h('span.meta.ellipsis', { style: { maxWidth: '40%' } }, cd.back), h('button.btn.sm.ghost', { onclick: async () => { await api.courses.removeCard(cd.id); draw(); } }, '✕'))))),
  ));
}
async function courseBookmarks(c, wrap) {
  const list = await api.bookmarks.list({ filter: { course_id: c.id } });
  const b = await import('./bookmarks.js');
  wrap.append(h('div.toolbar', h('button.btn.primary', { onclick: async () => { await b.bookmarkDialog({ course_id: c.id, category: 'University' }); draw(); } }, '+ Bookmark')),
    list.length ? h('div.panel', h('div.list', list.map((x) => h('div.item.clickable', { onclick: () => api.system.openExternal(x.url).catch(toastError) }, h('span.grow', x.name), h('span.meta.ellipsis', { style: { maxWidth: '50%' } }, x.url))))) : empty('No bookmarks for this course.'));
}
async function overview(c, wrap) {
  const o = await api.courses.overview(c.id);
  wrap.append(h('div.grid.g2',
    h('div.panel', h('div.panel-h', h('span.t', 'Course'), h('span.right.row', h('button.btn.sm', { onclick: async () => { const v = await formModal({ title: 'Edit course', size: 'wide', fields: courseFields, values: c }); if (v) { await api.courses.update(c.id, v); bus.emit('changed', 'courses'); draw(); } } }, 'Edit'), h('button.btn.sm.danger', { onclick: async () => { if (await confirmBox(`Delete course “${c.name}” with its topics and flashcards? (Notes, files and tasks are kept and unlinked.)`, { danger: true })) { await api.courses.remove(c.id); st.id = null; bus.emit('changed', 'courses'); draw(); } } }, 'Delete'))),
      h('div.panel-b.col', h('h2', { style: { color: c.color } }, c.name), kv([['Code', c.code], ['Instructor', c.instructor], ['Semester', c.semester], ['Credits', c.credits], ['Schedule', c.schedule], ['Exam', c.exam_date ? `${c.exam_date} (${relTime(c.exam_date)})` : '—'], ['Status', c.status]]), c.description ? h('div.md', { html: render(c.description) }) : null)),
    h('div.panel', h('div.panel-h', h('span.t', 'Learning progress')), h('div.panel-b', kv([['Overall', bar(o.progress, 22)], ['Topics', `${o.topicsDone}/${o.topicCount}`], ['Lectures', `${o.lecturesDone}/${o.lectureCount}`], ['Assignments', `${o.assignments - o.assignmentsOpen}/${o.assignments} done`], ['Open tasks', o.tasksOpen], ['Notes', o.notes], ['Files', o.files], ['Flashcards', `${o.flashcards} (${o.dueCards} due)`]])))));
}

async function draw() {
  if (!root) return;
  if (st.editor) { await st.editor.flush(); st.editor = null; }
  try {
    if (!st.id) return await grid();
    const c = await api.courses.get(st.id);
    if (!c) { st.id = null; return grid(); }
    const wrap = h('div');
    const tabs = [['overview', 'Overview'], ['notes', 'Notes'], ['lectures', 'Lectures'], ['assignments', 'Assignments'], ['topics', 'Topics'], ['files', 'Files'], ['tasks', 'Tasks'], ['reading', 'Reading list'], ['exam', 'Exam prep · flashcards'], ['bookmarks', 'Bookmarks']];
    clear(root).append(h('div.toolbar', h('button.btn.sm', { onclick: () => { st.id = null; draw(); } }, '← All courses'), h('span.dim', '/'), h('b', { style: { color: c.color } }, `${c.code ? c.code + ' · ' : ''}${c.name}`), h('span.right.muted.small', c.semester || '')), subtabs(tabs, st.tab, (t) => { st.tab = t; draw(); }), wrap);
    const map = { overview, notes: courseNotes, lectures: (cc, w) => topicList(cc, 'lecture', 'Lectures')(w), assignments: (cc, w) => topicList(cc, 'assignment', 'Assignments')(w), topics: (cc, w) => topicList(cc, 'topic', 'Topics')(w), files: courseFiles, tasks: courseTasks, reading: readingList, exam: flashcards, bookmarks: courseBookmarks };
    await map[st.tab](c, wrap);
  } catch (e) { toastError(e); }
}

export default {
  id: 'courses',
  async mount(el, params = {}) { root = el; if (params.id) { st.id = params.id; st.tab = params.tab || 'overview'; } await draw(); off = bus.on('changed', (e) => { if (e === 'courses' && !st.id) draw(); }); },
  unmount() { if (st.editor) st.editor.flush(); st.editor = null; root = null; off && off(); },
};
