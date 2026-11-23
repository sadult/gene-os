'use strict';
const E = require('./entities');
const database = require('../db/database');

// Leitner intervals (days) per box 1..5
const LEITNER = [0, 1, 2, 4, 8, 16];

const courses = {
  ...E.crud(E.courses),
  create(data) {
    if (!data || !String(data.name || '').trim()) throw new Error('Course name is required');
    return E.courses.create(data);
  },
  remove(id) {
    const d = database.get();
    return d.transaction(() => {
      for (const t of ['tasks', 'notes', 'files', 'bookmarks']) d.prepare(`UPDATE ${t} SET course_id = NULL WHERE course_id = ?`).run(id);
      d.prepare("DELETE FROM search_fts WHERE entity = 'topic' AND entity_id IN (SELECT id FROM course_topics WHERE course_id = ?)").run(id);
      return E.courses.remove(id); // topics & flashcards cascade
    })();
  },
  overview(id) {
    const d = database.get();
    const topics = E.topics.list({ filter: { course_id: id }, sort: 'sort', dir: 'ASC' });
    const t = topics.filter((x) => x.kind === 'topic');
    const lectures = topics.filter((x) => x.kind === 'lecture');
    const assignments = topics.filter((x) => x.kind === 'assignment');
    const c = (sql) => d.prepare(sql).get(id).c;
    return {
      course: E.courses.get(id),
      topicCount: t.length, topicsDone: t.filter((x) => x.done).length,
      lectureCount: lectures.length, lecturesDone: lectures.filter((x) => x.done).length,
      assignments: assignments.length, assignmentsOpen: assignments.filter((x) => !x.done).length,
      notes: c('SELECT COUNT(*) c FROM notes WHERE course_id = ?'),
      files: c('SELECT COUNT(*) c FROM files WHERE course_id = ?'),
      tasksOpen: c("SELECT COUNT(*) c FROM tasks WHERE course_id = ? AND status NOT IN ('completed','cancelled')"),
      flashcards: c('SELECT COUNT(*) c FROM flashcards WHERE course_id = ?'),
      dueCards: d.prepare('SELECT COUNT(*) c FROM flashcards WHERE course_id = ? AND (due_at IS NULL OR due_at <= ?)').get(id, new Date().toISOString()).c,
      progress: topics.length ? Math.round((topics.filter((x) => x.done).length / topics.length) * 100) : 0,
    };
  },
  topics: (courseId, kind) => E.topics.list({ filter: { course_id: courseId, kind }, sort: 'sort', dir: 'ASC' }),
  getTopic: (id) => E.topics.get(id),
  addTopic(courseId, data) {
    const max = database.get().prepare('SELECT COALESCE(MAX(sort),0) m FROM course_topics WHERE course_id=?').get(courseId).m;
    return E.topics.create({ kind: 'topic', ...data, course_id: courseId, sort: max + 1 });
  },
  updateTopic: (id, patch) => E.topics.update(id, patch),
  removeTopic: (id) => E.topics.remove(id),

  cards: (courseId) => E.flashcards.list({ filter: { course_id: courseId }, sort: 'created_at', dir: 'ASC' }),
  dueCards: (courseId) => database.get().prepare('SELECT * FROM flashcards WHERE course_id = ? AND (due_at IS NULL OR due_at <= ?) ORDER BY box ASC, id ASC').all(courseId, new Date().toISOString()),
  addCard: (courseId, front, back) => E.flashcards.create({ course_id: courseId, front, back, box: 1, due_at: null }),
  updateCard: (id, patch) => E.flashcards.update(id, patch),
  removeCard: (id) => E.flashcards.remove(id),
  reviewCard(id, correct) {
    const c = E.flashcards.get(id);
    if (!c) throw new Error('Card not found');
    const box = correct ? Math.min(5, (c.box || 1) + 1) : 1;
    const due = new Date(); due.setDate(due.getDate() + LEITNER[box]);
    return E.flashcards.update(id, { box, due_at: due.toISOString() });
  },
};

const notes = {
  ...E.crud(E.notes),
  create(data) { return E.notes.create({ title: 'Untitled', kind: 'note', ...data }); },
  byTitle(title) { return database.get().prepare('SELECT id, title FROM notes WHERE lower(title) = lower(?) LIMIT 1').get(title) || null; },
  titles() { return database.get().prepare('SELECT id, title, kind FROM notes ORDER BY title').all(); },
  // Journal entries are one note per day and kind ('journal' or 'research_journal').
  journal(date, kind = 'journal') {
    const title = `${kind === 'research_journal' ? 'Research Journal' : 'Journal'} ${date}`;
    const found = database.get().prepare('SELECT id FROM notes WHERE kind = ? AND title = ?').get(kind, title);
    return found ? E.notes.get(found.id) : E.notes.create({ title, kind, content: `# ${title}\n\n` });
  },
  scratch() {
    const found = database.get().prepare("SELECT id FROM notes WHERE kind = 'scratch' LIMIT 1").get();
    return found ? E.notes.get(found.id) : E.notes.create({ title: 'Scratchpad', kind: 'scratch', content: '' });
  },
};

const bookmarks = {
  ...E.crud(E.bookmarks),
  create(data) {
    const url = normalizeUrl(data && data.url);
    return E.bookmarks.create({ ...data, name: (data.name || '').trim() || url, url, sort: Date.now() });
  },
  update(id, patch) { if (patch.url !== undefined) patch.url = normalizeUrl(patch.url); return E.bookmarks.update(id, patch); },
  reorder(ids) {
    database.get().transaction(() => ids.forEach((id, i) => database.get().prepare('UPDATE bookmarks SET sort = ? WHERE id = ?').run(i, id)))();
    return true;
  },
  categories: () => database.get().prepare("SELECT category, COUNT(*) n FROM bookmarks GROUP BY category ORDER BY category").all(),
  exportJson: () => JSON.stringify({ format: 'gene-os-bookmarks', version: 1, bookmarks: E.bookmarks.list({ sort: 'sort', dir: 'ASC' }) }, null, 2),
  exportHtml() {
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const byCat = {};
    for (const b of E.bookmarks.list({ sort: 'sort', dir: 'ASC' })) (byCat[b.category || 'Other'] ||= []).push(b);
    let out = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Gene OS Bookmarks</H1>\n<DL><p>\n';
    for (const [cat, list] of Object.entries(byCat)) {
      out += `  <DT><H3>${esc(cat)}</H3>\n  <DL><p>\n`;
      for (const b of list) out += `    <DT><A HREF="${esc(b.url)}">${esc(b.name)}</A>\n${b.description ? `    <DD>${esc(b.description)}\n` : ''}`;
      out += '  </DL><p>\n';
    }
    return out + '</DL><p>\n';
  },
  // Accepts Gene OS JSON or a browser "Netscape bookmark file" export (Chrome/Edge/Firefox).
  importText(text) {
    let items = [];
    const t = String(text || '').trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      const parsed = JSON.parse(t);
      items = (Array.isArray(parsed) ? parsed : parsed.bookmarks || []).map((b) => ({ name: b.name || b.title, url: b.url, description: b.description || '', category: b.category || 'Imported', tags: b.tags || [], notes: b.notes || '', favorite: !!b.favorite }));
    } else {
      let cat = 'Imported';
      const re = /<H3[^>]*>([^<]*)<\/H3>|<A\s[^>]*HREF="([^"]+)"[^>]*>([^<]*)<\/A>/gi;
      let m;
      while ((m = re.exec(t))) {
        if (m[1] !== undefined) cat = decodeEntities(m[1]) || 'Imported';
        else if (/^https?:/i.test(m[2])) items.push({ name: decodeEntities(m[3]) || m[2], url: decodeEntities(m[2]), category: cat });
      }
    }
    const existing = new Set(E.bookmarks.list({}).map((b) => b.url));
    let added = 0, skipped = 0;
    database.get().transaction(() => {
      for (const it of items) {
        if (!it.url) { skipped++; continue; }
        let url; try { url = normalizeUrl(it.url); } catch { skipped++; continue; }
        if (existing.has(url)) { skipped++; continue; }
        existing.add(url);
        bookmarks.create({ ...it, url });
        added++;
      }
    })();
    return { added, skipped };
  },
};

function decodeEntities(s) { return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(); }
function normalizeUrl(u) {
  let s = String(u || '').trim();
  if (!s) throw new Error('URL is required');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  const url = new URL(s);
  if (!['http:', 'https:', 'ftp:', 'file:'].includes(url.protocol)) throw new Error('Unsupported URL scheme: ' + url.protocol);
  return url.toString();
}

module.exports = { courses, notes, bookmarks, normalizeUrl };
