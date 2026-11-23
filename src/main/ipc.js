'use strict';
// Single IPC entry point. Only functions explicitly registered here are callable from the renderer.
// The GUI, the command palette and the terminal all go through this same registry — no duplicated logic.
const { ipcMain } = require('electron');
const log = require('./logger');
const E = require('./services/entities');
const settings = require('./services/settings');
const { tasks } = require('./services/tasks');
const { research } = require('./services/research');
const { courses, notes, bookmarks } = require('./services/academic');
const { library } = require('./services/library');
const { apps } = require('./services/apps');
const { tools } = require('./services/tools');
const { search, activity, clipboard, shellHistory, dashboard } = require('./services/core');
const { notifications } = require('./services/notifications');
const { backup } = require('./services/backup');
const { system } = require('./services/system');

const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

const registry = {
  settings: pick(settings, ['getAll', 'get', 'set', 'setMany', 'reset', 'resetPrefix']),
  security: { setPin: settings.setPin, verifyPin: settings.verifyPin, clearPin: settings.clearPin },
  tasks,
  research,
  courses,
  notes,
  bookmarks,
  library,
  apps: { ...apps },
  tools,
  search,
  activity,
  clipboard,
  shell: shellHistory,
  dashboard: { summary: dashboard },
  notifications,
  backup: {
    ...backup,
    importJson(text) { const r = backup.importJson(text); search.rebuild(); return r; },
    reset(opts) { const r = backup.reset(opts); library.ensureDefaultCollections(); return r; },
  },
  system: { ...system },
  profile: {
    get: () => settings.get('profile'),
    update: (patch) => settings.set('profile', { ...settings.get('profile'), ...patch }),
  },
};
delete registry.apps.inspect; // internal
delete registry.system.setWindowGetter;
delete registry.backup.applyPendingRestore;

function register() {
  ipcMain.handle('gos:invoke', async (_e, service, method, args) => {
    const svc = registry[service];
    const fn = svc && Object.prototype.hasOwnProperty.call(svc, method) ? svc[method] : null;
    if (typeof fn !== 'function') return { ok: false, error: `Unknown command ${service}.${method}` };
    try {
      const value = await fn(...(Array.isArray(args) ? args : []));
      return { ok: true, value };
    } catch (err) {
      log.error(`${service}.${method} failed:`, err);
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
  ipcMain.handle('gos:manifest', () => Object.fromEntries(Object.entries(registry).map(([k, v]) => [k, Object.keys(v).filter((m) => typeof v[m] === 'function')])));
}

module.exports = { register, registry, E };
