'use strict';
// Tool run history (Tools module): saved inputs + a text summary per calculation, newest first.
const database = require('../db/database');
const { now } = database;
const d = () => database.get();
const KEEP = 60;

const decode = (r) => (r ? { ...r, inputs: safe(r.inputs), pinned: !!r.pinned } : null);
function safe(s) { try { return JSON.parse(s); } catch { return {}; } }

const tools = {
  saveRun(toolId, inputs, summary = '', title = '') {
    if (!toolId) throw new Error('toolId required');
    const info = d().prepare('INSERT INTO tool_runs (tool_id, title, inputs, summary, created_at) VALUES (?,?,?,?,?)')
      .run(String(toolId), String(title).slice(0, 200), JSON.stringify(inputs || {}), String(summary).slice(0, 4000), now());
    d().prepare(`DELETE FROM tool_runs WHERE tool_id = ? AND pinned = 0 AND id NOT IN
      (SELECT id FROM tool_runs WHERE tool_id = ? AND pinned = 0 ORDER BY id DESC LIMIT ${KEEP})`).run(toolId, toolId);
    return decode(d().prepare('SELECT * FROM tool_runs WHERE id = ?').get(info.lastInsertRowid));
  },
  runs: (toolId, limit = 30) => d().prepare('SELECT * FROM tool_runs WHERE tool_id = ? ORDER BY pinned DESC, id DESC LIMIT ?').all(toolId, limit).map(decode),
  recent: (limit = 12) => d().prepare('SELECT * FROM tool_runs ORDER BY id DESC LIMIT ?').all(limit).map(decode),
  usage: () => d().prepare('SELECT tool_id, COUNT(*) n, MAX(created_at) last FROM tool_runs GROUP BY tool_id ORDER BY n DESC').all(),
  pinRun: (id, pinned) => d().prepare('UPDATE tool_runs SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id).changes > 0,
  removeRun: (id) => d().prepare('DELETE FROM tool_runs WHERE id = ?').run(id).changes > 0,
  clearRuns: (toolId) => (toolId ? d().prepare('DELETE FROM tool_runs WHERE tool_id = ?').run(toolId) : d().prepare('DELETE FROM tool_runs').run()).changes,
  exportRuns(toolId) {
    const rows = toolId ? tools.runs(toolId, 10000) : d().prepare('SELECT * FROM tool_runs ORDER BY id DESC').all().map(decode);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return ['tool,date,title,inputs,summary', ...rows.map((r) => [r.tool_id, r.created_at, r.title, JSON.stringify(r.inputs), r.summary].map(esc).join(','))].join('\n');
  },
};

module.exports = { tools };
