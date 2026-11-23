'use strict';
// Versioned schema migrations. Each migration runs inside a transaction and bumps PRAGMA user_version.
// Never edit an applied migration - append a new one.

const V1 = `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, description TEXT DEFAULT '', category TEXT DEFAULT 'Research',
  priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'planned',
  deadline TEXT, start_date TEXT, estimate_min INTEGER DEFAULT 0, actual_min INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]', subtasks TEXT DEFAULT '[]', notes TEXT DEFAULT '', attachments TEXT DEFAULT '[]',
  course_id INTEGER, project_id INTEGER, reminder_at TEXT, recurrence TEXT DEFAULT '',
  completed_at TEXT, timer_started_at TEXT, sort REAL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_deadline ON tasks(deadline);

CREATE TABLE task_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, title TEXT DEFAULT '', abstract TEXT DEFAULT '', objectives TEXT DEFAULT '',
  questions TEXT DEFAULT '', hypotheses TEXT DEFAULT '', keywords TEXT DEFAULT '[]', supervisor TEXT DEFAULT '',
  status TEXT DEFAULT 'planning', kind TEXT DEFAULT 'thesis', start_date TEXT, target_date TEXT,
  field TEXT DEFAULT '', notes TEXT DEFAULT '', checklist TEXT DEFAULT '[]', active INTEGER DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE proposal_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  skey TEXT NOT NULL, title TEXT NOT NULL, content TEXT DEFAULT '', status TEXT DEFAULT 'todo',
  sort INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(project_id, skey)
);

CREATE TABLE section_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL REFERENCES proposal_sections(id) ON DELETE CASCADE,
  content TEXT NOT NULL, words INTEGER DEFAULT 0, created_at TEXT NOT NULL
);

CREATE TABLE milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, start_date TEXT, end_date TEXT, status TEXT DEFAULT 'planned',
  progress INTEGER DEFAULT 0, depends_on TEXT DEFAULT '[]', notes TEXT DEFAULT '', sort INTEGER DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, code TEXT DEFAULT '', instructor TEXT DEFAULT '', semester TEXT DEFAULT '',
  description TEXT DEFAULT '', schedule TEXT DEFAULT '', credits REAL DEFAULT 0, color TEXT DEFAULT '#59D5C3',
  status TEXT DEFAULT 'active', exam_date TEXT, reading_list TEXT DEFAULT '[]',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE course_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL, done INTEGER DEFAULT 0, summary TEXT DEFAULT '', questions TEXT DEFAULT '',
  kind TEXT DEFAULT 'topic', due_date TEXT, sort INTEGER DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE flashcards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  front TEXT NOT NULL, back TEXT DEFAULT '', box INTEGER DEFAULT 1, due_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, content TEXT DEFAULT '', kind TEXT DEFAULT 'note',
  course_id INTEGER, project_id INTEGER, tags TEXT DEFAULT '[]', pinned INTEGER DEFAULT 0, language TEXT DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_notes_kind ON notes(kind);

CREATE TABLE collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, parent_id INTEGER, color TEXT DEFAULT '',
  sort INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, original_path TEXT NOT NULL, stored_path TEXT NOT NULL, storage_mode TEXT DEFAULT 'linked',
  ext TEXT DEFAULT '', size INTEGER DEFAULT 0, hash TEXT DEFAULT '', doc_type TEXT DEFAULT 'document',
  collection_id INTEGER, tags TEXT DEFAULT '[]', authors TEXT DEFAULT '', year INTEGER, doi TEXT DEFAULT '',
  journal TEXT DEFAULT '', abstract TEXT DEFAULT '', notes TEXT DEFAULT '', rating INTEGER DEFAULT 0,
  favorite INTEGER DEFAULT 0, archived INTEGER DEFAULT 0, read_status TEXT DEFAULT 'unread', read_progress INTEGER DEFAULT 0,
  review TEXT DEFAULT '{}', course_id INTEGER, project_id INTEGER, last_opened_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_files_hash ON files(hash);
CREATE INDEX idx_files_collection ON files(collection_id);

CREATE TABLE apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, path TEXT NOT NULL, target_path TEXT DEFAULT '', args TEXT DEFAULT '', cwd TEXT DEFAULT '',
  description TEXT DEFAULT '', category TEXT DEFAULT 'General', tags TEXT DEFAULT '[]', group_name TEXT DEFAULT '',
  favorite INTEGER DEFAULT 0, icon TEXT DEFAULT '', custom_icon INTEGER DEFAULT 0, metadata TEXT DEFAULT '{}',
  launch_count INTEGER DEFAULT 0, last_launched_at TEXT, sort INTEGER DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, url TEXT NOT NULL, description TEXT DEFAULT '', category TEXT DEFAULT 'Reference',
  tags TEXT DEFAULT '[]', favorite INTEGER DEFAULT 0, icon TEXT DEFAULT '', notes TEXT DEFAULT '',
  course_id INTEGER, sort REAL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER,
  label TEXT DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX idx_activity_created ON activity(created_at);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nkey TEXT UNIQUE, kind TEXT NOT NULL, title TEXT NOT NULL,
  body TEXT DEFAULT '', entity TEXT DEFAULT '', entity_id INTEGER, read INTEGER DEFAULT 0, created_at TEXT NOT NULL
);

CREATE TABLE clipboard (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, source TEXT DEFAULT '', created_at TEXT NOT NULL);

CREATE TABLE command_history (id INTEGER PRIMARY KEY AUTOINCREMENT, line TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE aliases (name TEXT PRIMARY KEY, expansion TEXT NOT NULL);

CREATE TABLE time_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, kind TEXT DEFAULT 'pomodoro', minutes REAL NOT NULL,
  started_at TEXT, created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE search_fts USING fts5(
  entity UNINDEXED, entity_id UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2'
);
`;

module.exports = [
  { version: 1, name: 'initial schema', up: (db) => db.exec(V1) },
  {
    version: 2,
    name: 'Gene OS 2.0: tool run history',
    up: (db) => db.exec(`
      CREATE TABLE tool_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, tool_id TEXT NOT NULL, title TEXT DEFAULT '',
        inputs TEXT NOT NULL DEFAULT '{}', summary TEXT DEFAULT '', pinned INTEGER DEFAULT 0, created_at TEXT NOT NULL
      );
      CREATE INDEX idx_tool_runs_tool ON tool_runs(tool_id, created_at);
    `),
  },
];
