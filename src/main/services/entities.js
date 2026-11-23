'use strict';
// All entity repositories in one place. Services compose these; the IPC layer exposes services.
const { createRepo } = require('../db/repo');
const database = require('../db/database');
const g = () => database.get();
const join = (...xs) => xs.filter(Boolean).map((x) => (Array.isArray(x) ? x.join(' ') : String(x))).join('\n');

const tasks = createRepo(g, {
  table: 'tasks', entity: 'task', defaultSort: 'updated_at',
  columns: ['title', 'description', 'category', 'priority', 'status', 'deadline', 'start_date', 'estimate_min', 'actual_min', 'tags', 'subtasks', 'notes', 'attachments', 'course_id', 'project_id', 'reminder_at', 'recurrence', 'completed_at', 'timer_started_at', 'sort'],
  json: ['tags', 'subtasks', 'attachments'],
  textColumns: ['title', 'description', 'notes', 'tags'],
  search: (r) => ({ title: r.title, body: join(r.description, r.notes, r.tags, r.category, (r.subtasks || []).map((s) => s.title)) }),
});

const taskTemplates = createRepo(g, {
  table: 'task_templates', entity: 'task_template', columns: ['name', 'data'], json: ['data'], track: false,
});

const projects = createRepo(g, {
  table: 'projects', entity: 'project',
  columns: ['name', 'title', 'abstract', 'objectives', 'questions', 'hypotheses', 'keywords', 'supervisor', 'status', 'kind', 'start_date', 'target_date', 'field', 'notes', 'checklist', 'active'],
  json: ['keywords', 'checklist'], bool: ['active'],
  textColumns: ['name', 'title', 'abstract'],
  search: (r) => ({ title: r.name + (r.title ? ' — ' + r.title : ''), body: join(r.abstract, r.objectives, r.questions, r.hypotheses, r.keywords, r.supervisor, r.notes) }),
});

const sections = createRepo(g, {
  table: 'proposal_sections', entity: 'section', defaultSort: 'sort',
  columns: ['project_id', 'skey', 'title', 'content', 'status', 'sort'],
  search: (r) => ({ title: r.title, body: r.content }), track: true,
});

const milestones = createRepo(g, {
  table: 'milestones', entity: 'milestone', defaultSort: 'sort',
  columns: ['project_id', 'title', 'start_date', 'end_date', 'status', 'progress', 'depends_on', 'notes', 'sort'],
  json: ['depends_on'],
});

const courses = createRepo(g, {
  table: 'courses', entity: 'course',
  columns: ['name', 'code', 'instructor', 'semester', 'description', 'schedule', 'credits', 'color', 'status', 'exam_date', 'reading_list'],
  json: ['reading_list'], textColumns: ['name', 'code', 'instructor'],
  search: (r) => ({ title: `${r.code ? r.code + ' ' : ''}${r.name}`, body: join(r.instructor, r.semester, r.description, r.schedule) }),
});

const topics = createRepo(g, {
  table: 'course_topics', entity: 'topic', defaultSort: 'sort',
  columns: ['course_id', 'title', 'done', 'summary', 'questions', 'kind', 'due_date', 'sort'], bool: ['done'],
  search: (r) => ({ title: r.title, body: join(r.summary, r.questions) }), track: false,
});

const flashcards = createRepo(g, {
  table: 'flashcards', entity: 'flashcard', columns: ['course_id', 'front', 'back', 'box', 'due_at'], track: false,
});

const notes = createRepo(g, {
  table: 'notes', entity: 'note',
  columns: ['title', 'content', 'kind', 'course_id', 'project_id', 'tags', 'pinned', 'language'],
  json: ['tags'], bool: ['pinned'], textColumns: ['title', 'content'],
  search: (r) => ({ title: r.title, body: join(r.content, r.tags, r.kind) }),
});

const collections = createRepo(g, {
  table: 'collections', entity: 'collection', defaultSort: 'sort', columns: ['name', 'parent_id', 'color', 'sort'], track: false,
});

const files = createRepo(g, {
  table: 'files', entity: 'file',
  columns: ['name', 'original_path', 'stored_path', 'storage_mode', 'ext', 'size', 'hash', 'doc_type', 'collection_id', 'tags', 'authors', 'year', 'doi', 'journal', 'abstract', 'notes', 'rating', 'favorite', 'archived', 'read_status', 'read_progress', 'review', 'course_id', 'project_id', 'last_opened_at'],
  json: ['tags', 'review'], bool: ['favorite', 'archived'],
  textColumns: ['name', 'authors', 'doi', 'abstract', 'notes', 'tags', 'journal'],
  search: (r) => ({ title: r.name, body: join(r.authors, r.year, r.doi, r.journal, r.abstract, r.notes, r.tags, r.doc_type, r.ext) }),
});

const apps = createRepo(g, {
  table: 'apps', entity: 'app',
  columns: ['name', 'path', 'target_path', 'args', 'cwd', 'description', 'category', 'tags', 'group_name', 'favorite', 'icon', 'custom_icon', 'metadata', 'launch_count', 'last_launched_at', 'sort'],
  json: ['tags', 'metadata'], bool: ['favorite', 'custom_icon'], textColumns: ['name', 'description', 'category', 'tags'],
  search: (r) => ({ title: r.name, body: join(r.description, r.category, r.tags, r.group_name, r.path) }),
});

const bookmarks = createRepo(g, {
  table: 'bookmarks', entity: 'bookmark', defaultSort: 'sort',
  columns: ['name', 'url', 'description', 'category', 'tags', 'favorite', 'icon', 'notes', 'course_id', 'sort'],
  json: ['tags'], bool: ['favorite'], textColumns: ['name', 'url', 'description', 'tags'],
  search: (r) => ({ title: r.name, body: join(r.url, r.description, r.category, r.tags, r.notes) }),
});

const all = { tasks, taskTemplates, projects, sections, milestones, courses, topics, flashcards, notes, collections, files, apps, bookmarks };

// Simple CRUD facade used by services that need nothing special.
function crud(repo) {
  return {
    list: (opts) => repo.list(opts),
    get: (id) => repo.get(id),
    create: (data) => repo.create(data),
    update: (id, patch) => repo.update(id, patch),
    remove: (id) => repo.remove(id),
    count: (filter) => repo.count(filter),
  };
}

module.exports = { ...all, all, crud };
