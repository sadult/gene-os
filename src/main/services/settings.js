'use strict';
const crypto = require('crypto');
const database = require('../db/database');

const DEFAULTS = {
  'appearance.theme': 'gene-dark',
  'appearance.accent': '#59D5C3',
  'appearance.font': 'JetBrains Mono',
  'appearance.fontSize': 13,
  'appearance.zoom': 1,
  'appearance.compact': false,
  'appearance.animations': true,
  'appearance.transparency': false,
  'appearance.moduleColors': true,
  'appearance.customTheme': null,
  'behavior.fullscreen': true,
  'behavior.bootAnimation': true,
  'behavior.loginScreen': true,
  'behavior.startMinimized': false,
  'behavior.landing': 'home',
  'behavior.confirmDelete': true,
  'behavior.autosaveMs': 1200,
  'behavior.preload': ['tasks', 'apps', 'tools'],
  'library.importMode': 'linked',
  'backup.auto': 'weekly',
  'backup.keep': 10,
  'backup.last': null,
  'notifications.enabled': true,
  'notifications.native': true,
  'notifications.dueSoonHours': 24,
  'notifications.backupReminder': true,
  'dashboard.layout': ['research', 'tasks', 'academic', 'stats', 'activity', 'apps', 'deadlines'],
  'dashboard.hidden': [],
  'home.focusGoal': 120,
  'home.metricsMs': 2000,
  'keyboard.bindings': {},
  'pomodoro.work': 25,
  'pomodoro.break': 5,
  'terminal.prompt': 'powerline',
  'terminal.highlight': true,
  'terminal.ghost': true,
  'terminal.startup': 'gfetch',
  'terminal.maxLines': 2000,
  'tools.digits': 4,
  'tools.autoCalc': true,
  'tools.favorites': [],
  'calendar.weekStart': 'mon',
  'calendar.jalali': false,
  'home.preset': 'balanced',
  'home.slots': {},
  'profile': {
    name: 'Mersad',
    role: 'MSc Student — Animal Breeding & Genetics',
    university: 'Tarbiat Modares University',
    developer: 'Bitologist',
    telegram: '@Bitologist',
    website: '10ck.ir',
    github: 'github.com/sadult',
    bio: 'Graduate researcher in quantitative and population genetics, animal genetic improvement and statistical analysis.',
    photo: '',
    fields: [],
  },
};
// Keys that the renderer may never read or write directly.
const PRIVATE = new Set(['security.pinHash', 'security.pinSalt']);

function db() { return database.get(); }
function raw(key) {
  const row = db().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return DEFAULTS[key];
  try { return JSON.parse(row.value); } catch { return DEFAULTS[key]; }
}
function write(key, value) {
  db().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
  return value;
}

function getAll() {
  const out = { ...DEFAULTS };
  for (const { key, value } of db().prepare('SELECT key, value FROM settings').all()) {
    if (PRIVATE.has(key)) continue;
    try { out[key] = JSON.parse(value); } catch { /* keep default */ }
  }
  out['security.hasPin'] = !!raw('security.pinHash');
  return out;
}
function get(key) { if (PRIVATE.has(key)) throw new Error('Not readable'); return raw(key); }
function set(key, value) {
  if (typeof key !== 'string' || !key) throw new Error('Invalid settings key');
  if (key.startsWith('security.')) throw new Error('Security settings are changed through the PIN functions');
  return write(key, value);
}
function setMany(obj) {
  db().transaction(() => { for (const [k, v] of Object.entries(obj || {})) set(k, v); })();
  return getAll();
}
function reset(key) {
  if (key) { if (key.startsWith('security.')) throw new Error('Not allowed'); db().prepare('DELETE FROM settings WHERE key = ?').run(key); }
  else db().prepare("DELETE FROM settings WHERE key <> 'profile' AND key NOT LIKE 'security.%'").run();
  return getAll();
}
// Removes every key under a prefix (e.g. "tools.") — used by "Reset to defaults" buttons.
function resetPrefix(prefix) {
  if (!/^[a-z]+\.$/.test(prefix) || prefix === 'security.') throw new Error('Invalid prefix');
  db().prepare('DELETE FROM settings WHERE key LIKE ?').run(prefix + '%');
  return getAll();
}

// Lock-screen PIN (privacy screen, not encryption): salted SHA-256, verified in the main process.
const hash = (salt, pin) => crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');
function setPin(pin) {
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('PIN must be 4–8 digits');
  const salt = crypto.randomBytes(16).toString('hex');
  write('security.pinSalt', salt); write('security.pinHash', hash(salt, String(pin)));
  return true;
}
function verifyPin(pin) {
  const h = raw('security.pinHash');
  if (!h) return true;
  const a = Buffer.from(hash(raw('security.pinSalt') || '', String(pin ?? '')), 'hex'), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function clearPin(current) {
  if (!verifyPin(current)) throw new Error('Current PIN is incorrect');
  db().prepare("DELETE FROM settings WHERE key LIKE 'security.%'").run();
  return true;
}

module.exports = { DEFAULTS, getAll, get, set, setMany, reset, resetPrefix, setPin, verifyPin, clearPin };
