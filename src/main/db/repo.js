'use strict';
// Generic repository: CRUD over one table with JSON/boolean column codecs, safe filtering
// (column whitelist only), full-text index maintenance and activity logging.
const { now } = require('./database');

function createRepo(getDb, def) {
  const { table, entity, columns, json = [], bool = [], search, label = (r) => r.title || r.name, defaultSort = 'updated_at', track = true } = def;
  const allowed = new Set(['id', 'created_at', 'updated_at', ...columns]);
  const jsonSet = new Set(json);
  const boolSet = new Set(bool);
  const db = () => getDb();

  function decode(row) {
    if (!row) return null;
    for (const k of jsonSet) { try { row[k] = JSON.parse(row[k] ?? 'null'); } catch { row[k] = null; } }
    for (const k of boolSet) row[k] = !!row[k];
    return row;
  }
  function encode(data) {
    const out = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (!columns.includes(k)) continue;
      if (jsonSet.has(k)) out[k] = JSON.stringify(v ?? (k === 'review' || k === 'metadata' || k === 'data' ? {} : []));
      else if (boolSet.has(k)) out[k] = v ? 1 : 0;
      else if (v === undefined) continue;
      else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
      else out[k] = v === '' && (k.endsWith('_id') || k === 'year') ? null : v;
    }
    return out;
  }

  function index(row) {
    if (!search || !row) return;
    const d = db();
    d.prepare('DELETE FROM search_fts WHERE entity = ? AND entity_id = ?').run(entity, row.id);
    const { title, body } = search(row);
    d.prepare('INSERT INTO search_fts (entity, entity_id, title, body) VALUES (?, ?, ?, ?)').run(entity, row.id, title || '', body || '');
  }
  function unindex(id) {
    if (search) db().prepare('DELETE FROM search_fts WHERE entity = ? AND entity_id = ?').run(entity, id);
  }
  function activity(action, row) {
    if (!track || !row) return;
    const d = db();
    if (action === 'updated') {
      const last = d.prepare('SELECT created_at FROM activity WHERE entity=? AND entity_id=? ORDER BY id DESC LIMIT 1').get(entity, row.id);
      if (last && Date.now() - Date.parse(last.created_at) < 10 * 60 * 1000) return; // de-noise autosaves
    }
    d.prepare('INSERT INTO activity (action, entity, entity_id, label, created_at) VALUES (?,?,?,?,?)')
      .run(action, entity, row.id, String(label(row) || '').slice(0, 200), now());
  }

  function buildWhere(filter = {}) {
    const parts = [];
    const params = [];
    for (const [k, v] of Object.entries(filter)) {
      if (k === 'q' || v === undefined || v === '' || v === 'all') continue;
      if (!allowed.has(k)) throw new Error(`Unknown filter column '${k}' for ${table}`);
      if (Array.isArray(v)) { parts.push(`${k} IN (${v.map(() => '?').join(',')})`); params.push(...v); }
      else if (v === null) parts.push(`${k} IS NULL`);
      else { parts.push(`${k} = ?`); params.push(boolSet.has(k) || typeof v === 'boolean' ? (v ? 1 : 0) : v); }
    }
    if (filter.q && def.textColumns) {
      parts.push('(' + def.textColumns.map((c) => `${c} LIKE ?`).join(' OR ') + ')');
      for (let i = 0; i < def.textColumns.length; i++) params.push(`%${filter.q}%`);
    }
    return { sql: parts.length ? 'WHERE ' + parts.join(' AND ') : '', params };
  }

  const repo = {
    entity, table,
    list(opts = {}) {
      const { filter = {}, sort = defaultSort, dir = 'DESC', limit = 5000, offset = 0 } = opts;
      if (!allowed.has(sort)) throw new Error(`Unknown sort column '${sort}'`);
      const w = buildWhere(filter);
      const d = dir === 'ASC' ? 'ASC' : 'DESC';
      const rows = db().prepare(`SELECT * FROM ${table} ${w.sql} ORDER BY ${sort} ${d}, id DESC LIMIT ? OFFSET ?`).all(...w.params, limit, offset);
      return rows.map(decode);
    },
    count(filter = {}) {
      const w = buildWhere(filter);
      return db().prepare(`SELECT COUNT(*) c FROM ${table} ${w.sql}`).get(...w.params).c;
    },
    get(id) { return decode(db().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)); },
    create(data) {
      const t = now();
      const enc = encode(data);
      enc.created_at = t; enc.updated_at = t;
      const keys = Object.keys(enc);
      return db().transaction(() => {
        const info = db().prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((k) => '@' + k).join(',')})`).run(enc);
        const row = repo.get(info.lastInsertRowid);
        index(row); activity('created', row);
        return row;
      })();
    },
    update(id, patch) {
      const enc = encode(patch);
      enc.updated_at = now();
      const keys = Object.keys(enc);
      return db().transaction(() => {
        const info = db().prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @__id`).run({ ...enc, __id: id });
        if (!info.changes) throw new Error(`${entity} #${id} not found`);
        const row = repo.get(id);
        index(row); activity('updated', row);
        return row;
      })();
    },
    remove(id) {
      return db().transaction(() => {
        const row = repo.get(id);
        if (!row) return false;
        db().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
        unindex(id); activity('deleted', row);
        return true;
      })();
    },
    reindexAll() {
      if (!search) return 0;
      const rows = db().prepare(`SELECT * FROM ${table}`).all().map(decode);
      rows.forEach(index);
      return rows.length;
    },
    decode, encode,
  };
  return repo;
}

module.exports = { createRepo };
