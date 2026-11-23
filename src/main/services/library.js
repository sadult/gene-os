'use strict';
// Scientific library. Storage strategy:
//  - 'linked'  (default): the record points at the user's original file. Gene OS never moves,
//               renames or deletes linked originals.
//  - 'managed': a single copy is placed in <data>/library/<year>/<hash8>-<name>. Only managed copies may be
//               renamed or deleted on disk by Gene OS.
// Duplicates are detected by SHA-256 content hash before anything is copied.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { shell } = require('electron');
const E = require('./entities');
const database = require('../db/database');
const paths = require('../paths');
const settings = require('./settings');
const log = require('../logger');

const TYPE_BY_EXT = {
  pdf: 'article', doc: 'document', docx: 'document', txt: 'note', md: 'note', rtf: 'document',
  xlsx: 'data', xls: 'data', csv: 'data', tsv: 'data', json: 'data', xml: 'data', dat: 'data', ped: 'data', map: 'data',
  pptx: 'slides', ppt: 'slides', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image',
  zip: 'archive', '7z': 'archive', rar: 'archive', gz: 'archive',
  r: 'script', rmd: 'script', sas: 'script', py: 'script', ipynb: 'script', sh: 'script', f90: 'script', txt_out: 'output', lst: 'output', log: 'output',
};
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'xml', 'r', 'rmd', 'sas', 'py', 'sh', 'f90', 'log', 'lst', 'dat', 'ped', 'map', 'ini', 'yaml', 'yml', 'html', 'js', 'tex', 'bib']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('error', reject).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex')));
  });
}
const extOf = (f) => path.extname(f).slice(1).toLowerCase();
const safeName = (n) => n.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180);

async function walk(p, out, depth = 0) {
  const st = await fsp.stat(p);
  if (st.isDirectory()) {
    if (depth > 6) return;
    for (const e of await fsp.readdir(p)) { if (!e.startsWith('.')) await walk(path.join(p, e), out, depth + 1); }
  } else if (st.isFile()) out.push(p);
}

const library = {
  list(opts = {}) {
    const filter = { ...(opts.filter || {}) };
    if (filter.archived === undefined) filter.archived = false;
    return E.files.list({ ...opts, filter });
  },
  count: (filter) => E.files.count(filter),
  get: (id) => E.files.get(id),
  update(id, patch) {
    delete patch.stored_path; delete patch.original_path; delete patch.storage_mode; delete patch.hash;
    return E.files.update(id, patch);
  },
  async importPaths(inputPaths, opts = {}) {
    const mode = opts.mode || settings.get('library.importMode') || 'linked';
    const all = [];
    for (const p of inputPaths || []) { try { await walk(p, all); } catch (e) { log.warn('import walk failed', p, e.message); } }
    const result = { imported: [], duplicates: [], errors: [] };
    for (const file of all) {
      try {
        const st = await fsp.stat(file);
        const hash = await hashFile(file);
        const dup = database.get().prepare('SELECT id, name FROM files WHERE hash = ? LIMIT 1').get(hash);
        if (dup && !opts.allowDuplicates) { result.duplicates.push({ file, existing: dup }); continue; }
        let stored = file;
        if (mode === 'managed') {
          const dir = path.join(paths.libraryDir(), String(new Date().getFullYear()));
          await fsp.mkdir(dir, { recursive: true });
          stored = path.join(dir, `${hash.slice(0, 8)}-${safeName(path.basename(file))}`);
          if (!fs.existsSync(stored)) await fsp.copyFile(file, stored, fs.constants.COPYFILE_EXCL);
        }
        const ext = extOf(file);
        const row = E.files.create({
          name: path.basename(file, path.extname(file)), original_path: file, stored_path: stored, storage_mode: mode,
          ext, size: st.size, hash, doc_type: opts.doc_type || TYPE_BY_EXT[ext] || 'document',
          collection_id: opts.collection_id || null, course_id: opts.course_id || null, project_id: opts.project_id || null,
          tags: opts.tags || [], year: guessYear(path.basename(file)),
        });
        result.imported.push(row);
      } catch (e) {
        log.error('import failed', file, e);
        result.errors.push({ file, error: e.message });
      }
    }
    return result;
  },
  async remove(id, { deleteManagedCopy = false } = {}) {
    const f = E.files.get(id);
    if (!f) return false;
    if (deleteManagedCopy && f.storage_mode === 'managed' && isInside(f.stored_path, paths.libraryDir())) {
      const others = database.get().prepare('SELECT COUNT(*) c FROM files WHERE stored_path = ? AND id <> ?').get(f.stored_path, id).c;
      if (!others) await fsp.rm(f.stored_path, { force: true });
    }
    return E.files.remove(id);
  },
  async renameOnDisk(id, newBase) {
    const f = E.files.get(id);
    if (!f) throw new Error('File not found');
    if (f.storage_mode !== 'managed') throw new Error('Linked originals are never renamed by Gene OS. Only the display name was changed.');
    const target = path.join(path.dirname(f.stored_path), safeName(newBase) + (f.ext ? '.' + f.ext : ''));
    if (fs.existsSync(target)) throw new Error('A file with that name already exists');
    await fsp.rename(f.stored_path, target);
    return E.files.update(id, { stored_path: target, name: newBase });
  },
  async open(id) {
    const f = E.files.get(id);
    if (!f) throw new Error('File not found');
    if (!fs.existsSync(f.stored_path)) throw new Error('File is missing on disk: ' + f.stored_path);
    const err = await shell.openPath(f.stored_path);
    if (err) throw new Error(err);
    E.files.update(id, { last_opened_at: new Date().toISOString() });
    return true;
  },
  showInFolder(id) { const f = E.files.get(id); if (f) shell.showItemInFolder(f.stored_path); return !!f; },
  async readText(id, maxBytes = 2 * 1024 * 1024) {
    const f = E.files.get(id);
    if (!f) throw new Error('File not found');
    const fh = await fsp.open(f.stored_path, 'r');
    try {
      const buf = Buffer.alloc(Math.min(maxBytes, f.size || maxBytes));
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      return { text: buf.subarray(0, bytesRead).toString('utf8'), truncated: (f.size || 0) > bytesRead };
    } finally { await fh.close(); }
  },
  previewKind(f) {
    const e = (f.ext || '').toLowerCase();
    if (e === 'pdf') return 'pdf';
    if (IMAGE_EXT.has(e)) return 'image';
    if (e === 'csv' || e === 'tsv') return 'csv';
    if (e === 'md') return 'markdown';
    if (TEXT_EXT.has(e)) return 'text';
    return 'none';
  },
  checkMissing() {
    const rows = database.get().prepare('SELECT id, name, stored_path FROM files WHERE archived = 0').all();
    return rows.filter((r) => !fs.existsSync(r.stored_path));
  },
  duplicates() {
    return database.get().prepare("SELECT hash, COUNT(*) n, GROUP_CONCAT(id) ids, GROUP_CONCAT(name, ' | ') names FROM files WHERE hash <> '' GROUP BY hash HAVING n > 1").all();
  },
  recent: (limit = 8) => database.get().prepare('SELECT id, name, ext, doc_type, last_opened_at FROM files WHERE last_opened_at IS NOT NULL ORDER BY last_opened_at DESC LIMIT ?').all(limit),
  facets() {
    const d = database.get();
    return {
      types: d.prepare('SELECT doc_type k, COUNT(*) n FROM files WHERE archived=0 GROUP BY doc_type ORDER BY n DESC').all(),
      exts: d.prepare('SELECT ext k, COUNT(*) n FROM files WHERE archived=0 GROUP BY ext ORDER BY n DESC').all(),
      archived: d.prepare('SELECT COUNT(*) n FROM files WHERE archived=1').get().n,
      favorites: d.prepare('SELECT COUNT(*) n FROM files WHERE favorite=1 AND archived=0').get().n,
    };
  },
  collections: {
    list: () => E.collections.list({ sort: 'sort', dir: 'ASC' }),
    create: (name, parent_id = null) => E.collections.create({ name, parent_id, sort: Date.now() % 1e9 }),
    rename: (id, name) => E.collections.update(id, { name }),
    remove(id) {
      database.get().transaction(() => {
        database.get().prepare('UPDATE files SET collection_id = NULL WHERE collection_id = ?').run(id);
        database.get().prepare('UPDATE collections SET parent_id = NULL WHERE parent_id = ?').run(id);
        E.collections.remove(id);
      })();
      return true;
    },
    ensureDefaults() {
      if (E.collections.count({})) return false;
      ['Genetics', 'Animal Breeding', 'Quantitative Genetics', 'Population Genetics', 'Genomics', 'Statistics', 'Thesis', 'Courses', 'Programming', 'Books', 'Articles', 'Data']
        .forEach((name, i) => E.collections.create({ name, sort: i }));
      return true;
    },
  },
  filePath(id) { const f = E.files.get(id); return f ? f.stored_path : null; },
};
library.collectionList = library.collections.list;
library.collectionCreate = library.collections.create;
library.collectionRename = library.collections.rename;
library.collectionRemove = library.collections.remove;
const ensureDefaults = library.collections.ensureDefaults;
delete library.collections;
library.ensureDefaultCollections = ensureDefaults;

function guessYear(name) { const m = name.match(/(?:^|\D)(19[5-9]\d|20[0-4]\d)(?:\D|$)/); return m ? Number(m[1]) : null; }
function isInside(file, dir) { const rel = path.relative(dir, file); return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel); }

module.exports = { library, hashFile, TYPE_BY_EXT };
