'use strict';
// System service: window control, native dialogs, shell integration, environment status.
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { app, dialog, shell, BrowserWindow, clipboard, nativeImage, screen } = require('electron');
const paths = require('../paths');
const database = require('../db/database');
const log = require('../logger');

let getWin = () => BrowserWindow.getAllWindows()[0];
const startedAt = Date.now();
let lastCpu = null;
let gpuCache = null;

function cpuSample() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) { for (const k of Object.keys(c.times)) total += c.times[k]; idle += c.times.idle; }
  return { idle, total };
}
function osName() {
  if (process.platform !== 'win32') return `${os.type()} ${os.release()}`;
  let v = typeof os.version === 'function' ? os.version() : 'Windows';
  const build = Number(String(os.release()).split('.')[2] || 0);
  if (build >= 22000) v = v.replace('Windows 10', 'Windows 11'); // registry still reports "Windows 10" on Windows 11
  return v;
}
function dirSize(dir, depth = 0) {
  let n = 0;
  try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (depth < 4) n += dirSize(p, depth + 1); } else n += fs.statSync(p).size; } } catch { /* ignore */ }
  return n;
}
async function gpuName() {
  if (gpuCache !== null) return gpuCache;
  try {
    const info = await Promise.race([app.getGPUInfo('complete'), new Promise((r) => setTimeout(() => r(null), 2500))]);
    const renderer = info && info.auxAttributes && info.auxAttributes.glRenderer;
    gpuCache = renderer ? String(renderer).replace(/^ANGLE \(|\)$/g, '').replace(/,?\s*Direct3D.*$/i, '').replace(/\s*\(0x[0-9A-F]+\)/gi, '').trim() : '';
    if (!gpuCache && info && info.gpuDevice && info.gpuDevice[0]) { const g = info.gpuDevice[0]; gpuCache = `vendor 0x${g.vendorId.toString(16)} device 0x${g.deviceId.toString(16)}`; }
  } catch { gpuCache = ''; }
  return gpuCache;
}

const FILTERS = {
  apps: [{ name: 'Applications & shortcuts', extensions: ['exe', 'lnk', 'bat', 'cmd', 'msc'] }],
  icons: [{ name: 'Icons, images & programs', extensions: ['ico', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'exe', 'dll', 'lnk'] }],
  images: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'ico'] }],
  docs: [{ name: 'Supported files', extensions: ['pdf', 'docx', 'doc', 'txt', 'md', 'xlsx', 'xls', 'csv', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip', 'r', 'rmd', 'sas', 'py', 'json', 'xml', 'tsv', 'dat', 'ped'] }, { name: 'All files', extensions: ['*'] }],
  db: [{ name: 'Gene OS backup', extensions: ['db', 'gtbak', 'sqlite'] }],
  json: [{ name: 'JSON', extensions: ['json'] }],
  bookmarks: [{ name: 'Bookmarks (JSON or HTML)', extensions: ['json', 'html', 'htm'] }],
  md: [{ name: 'Markdown', extensions: ['md'] }],
  csv: [{ name: 'CSV', extensions: ['csv'] }],
  text: [{ name: 'Text', extensions: ['txt', 'csv', 'md', 'dat', 'ped', 'json'] }],
  any: [{ name: 'All files', extensions: ['*'] }],
};

const system = {
  setWindowGetter(fn) { getWin = fn; },
  info() {
    return {
      version: app.getVersion(), name: app.getName(), electron: process.versions.electron, chrome: process.versions.chrome,
      node: process.versions.node, platform: process.platform, arch: process.arch, packaged: app.isPackaged,
      host: os.hostname(), user: (() => { try { return os.userInfo().username; } catch { return ''; } })(),
      schema: database.get().pragma('user_version', { simple: true }), paths: paths.info(), log: log.file(),
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    };
  },
  // Lightweight resource snapshot for the Home "System overview" widget and `top`.
  metrics() {
    const s = cpuSample();
    let cpu = null;
    if (lastCpu) { const dt = s.total - lastCpu.total, di = s.idle - lastCpu.idle; cpu = dt > 0 ? Math.max(0, Math.min(100, (1 - di / dt) * 100)) : 0; }
    lastCpu = s;
    const memTotal = os.totalmem(), memFree = os.freemem();
    let appMem = 0, procs = 0;
    try { for (const m of app.getAppMetrics()) { appMem += (m.memory && m.memory.workingSetSize || 0) * 1024; procs++; } } catch { /* ignore */ }
    let disk = null;
    try { const st = fs.statfsSync(paths.dataDir()); disk = { total: st.blocks * st.bsize, free: st.bavail * st.bsize }; } catch { /* ignore */ }
    let dbSize = 0;
    try { dbSize = fs.statSync(paths.dbFile()).size + (fs.existsSync(paths.dbFile() + '-wal') ? fs.statSync(paths.dbFile() + '-wal').size : 0); } catch { /* ignore */ }
    return { cpu, cores: os.cpus().length, memTotal, memUsed: memTotal - memFree, appMem, procs, uptime: os.uptime(), appUptime: (Date.now() - startedAt) / 1000, disk, dbSize, load: os.loadavg() };
  },
  // Detailed environment report for `gfetch` and the boot screen.
  async fetchInfo() {
    const cpus = os.cpus();
    let display = null;
    try { const d = screen.getPrimaryDisplay(); display = { w: Math.round(d.size.width * d.scaleFactor), h: Math.round(d.size.height * d.scaleFactor), scale: d.scaleFactor, count: screen.getAllDisplays().length, hz: d.displayFrequency || null }; } catch { /* ignore */ }
    let user = '';
    try { user = os.userInfo().username; } catch { /* ignore */ }
    const m = system.metrics();
    return {
      product: 'Gene OS', version: app.getVersion(), packaged: app.isPackaged,
      os: osName(), release: os.release(), platform: process.platform, arch: process.arch, kernel: `${os.type()} ${os.release()}`,
      host: os.hostname(), user, locale: app.getLocale(),
      cpu: cpus[0] ? cpus[0].model.replace(/\s+/g, ' ').trim() : 'unknown', cores: cpus.length, mhz: cpus[0] ? cpus[0].speed : 0,
      gpu: await gpuName(), display,
      memTotal: m.memTotal, memUsed: m.memUsed, appMem: m.appMem, disk: m.disk, uptime: m.uptime, appUptime: m.appUptime,
      electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, v8: process.versions.v8,
      sqlite: (() => { try { return database.get().prepare('select sqlite_version() v').get().v; } catch { return ''; } })(),
      schema: database.get().pragma('user_version', { simple: true }), dbSize: m.dbSize,
      dataDir: paths.dataDir(), dataSize: dirSize(paths.dataDir()), portable: paths.isPortable(), migratedFrom: paths.migratedFrom(),
    };
  },
  pngDataUrl(file, size = 64) {
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) throw new Error('Unsupported or unreadable image');
    return img.resize({ width: size, height: size, quality: 'best' }).toDataURL();
  },
  status() {
    const db = database.get();
    const integrity = db.pragma('quick_check', { simple: true });
    let dbSize = 0;
    try { dbSize = fs.statSync(paths.dbFile()).size + (fs.existsSync(paths.dbFile() + '-wal') ? fs.statSync(paths.dbFile() + '-wal').size : 0); } catch { /* ignore */ }
    return { db: integrity === 'ok' ? 'ok' : integrity, dbSize, schema: db.pragma('user_version', { simple: true }), portable: paths.isPortable(), memoryMB: Math.round(process.memoryUsage().rss / 1048576) };
  },
  async openFiles({ kind = 'docs', multi = true, folders = false, title } = {}) {
    const props = [folders ? 'openDirectory' : 'openFile'];
    if (multi) props.push('multiSelections');
    const r = await dialog.showOpenDialog(getWin(), { title, properties: props, filters: folders ? undefined : FILTERS[kind] || FILTERS.any });
    return r.canceled ? [] : r.filePaths;
  },
  async saveFile({ kind = 'any', defaultName = 'export.txt', content, title } = {}) {
    const r = await dialog.showSaveDialog(getWin(), { title, defaultPath: path.join(app.getPath('documents'), defaultName), filters: FILTERS[kind] || FILTERS.any });
    if (r.canceled || !r.filePath) return null;
    if (content !== undefined) await fsp.writeFile(r.filePath, content, 'utf8');
    return r.filePath;
  },
  async readTextFile(file) { return fsp.readFile(file, 'utf8'); },
  readImageDataUrl(file, max = 360) {
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) throw new Error('Unsupported or unreadable image');
    const { width, height } = img.getSize();
    const k = Math.min(1, max / Math.max(width, height));
    return 'data:image/jpeg;base64,' + img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'best' }).toJPEG(88).toString('base64');
  },
  async openExternal(url) {
    const u = new URL(url);
    if (!['http:', 'https:', 'mailto:', 'tg:'].includes(u.protocol)) throw new Error('Blocked URL scheme ' + u.protocol);
    await shell.openExternal(u.toString());
    return true;
  },
  async openPath(p) { const err = await shell.openPath(p); if (err) throw new Error(err); return true; },
  showInFolder(p) { shell.showItemInFolder(p); return true; },
  pathExists(p) { return fs.existsSync(p); },
  copyText(text) { clipboard.writeText(String(text ?? '')); return true; },
  minimize() { getWin()?.minimize(); return true; },
  toggleMaximize() { const w = getWin(); if (!w) return false; if (w.isFullScreen()) w.setFullScreen(false); else if (w.isMaximized()) w.unmaximize(); else w.maximize(); return system.windowState(); },
  toggleFullscreen() { const w = getWin(); if (w) w.setFullScreen(!w.isFullScreen()); return system.windowState(); },
  windowState() { const w = getWin(); return w ? { fullscreen: w.isFullScreen(), maximized: w.isMaximized() } : {}; },
  quit() { app.quit(); return true; },
  relaunch() { app.relaunch(); app.exit(0); return true; },
  logRenderer(level, message) { (log[level] || log.info)('[renderer]', message); return true; },
  openLogFolder() { shell.openPath(paths.logsDir()); return true; },
  openDataFolder() { shell.openPath(paths.dataDir()); return true; },
  async chooseDataDir() {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Choose a folder for Gene OS data', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const dir = r.filePaths[0];
    // Copy a consistent snapshot of the DB to the new location; it will be used after relaunch.
    const target = path.join(dir, 'gene-os.db');
    if (!fs.existsSync(target)) await database.get().backup(target);
    paths.setDataDir(dir);
    return dir;
  },
  async pdfWindow(file, title) {
    if (!fs.existsSync(file)) throw new Error('File missing: ' + file);
    const w = new BrowserWindow({ width: 1100, height: 900, title: title || path.basename(file), backgroundColor: '#0B0F14', autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true } });
    await w.loadURL(require('url').pathToFileURL(file).toString());
    return true;
  },
};

module.exports = { system };
