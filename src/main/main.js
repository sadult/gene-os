'use strict';
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const paths = require('./paths');
const log = require('./logger');
const protocol = require('./protocol');

// Single instance: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

app.setAppUserModelId('ir.10ck.geneos');
protocol.registerSchemes();

let win = null;
const DEV = process.argv.includes('--dev');

function fatal(title, err) {
  log.error(title, err);
  const { dialog } = require('electron');
  dialog.showErrorBox('Gene OS — ' + title, `${err && err.message ? err.message : err}\n\nLog: ${log.file() || 'n/a'}`);
}

async function boot() {
  paths.init(app);
  log.init(paths.logsDir());
  log.info(`Gene OS ${app.getVersion()} starting (electron ${process.versions.electron}, data: ${paths.dataDir()})`);
  if (paths.migratedFrom()) log.info('Migrated Gene Terminal 1.x data from', paths.migratedFrom());

  const { backup, startScheduler } = require('./services/backup');
  try { backup.applyPendingRestore(); } catch (e) { fatal('Restore failed', e); }

  const database = require('./db/database');
  try { database.open(paths.dbFile()); } catch (e) { fatal('Database error', e); app.exit(1); return; }

  const ipc = require('./ipc');
  const { library } = require('./services/library');
  const { search } = require('./services/core');
  const settings = require('./services/settings');
  library.ensureDefaultCollections();
  if (!database.get().prepare('SELECT COUNT(*) c FROM search_fts').get().c) search.rebuild();

  protocol.handle((id) => library.filePath(id));
  ipc.register();

  const s = settings.getAll();
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 620,
    show: false, frame: false, backgroundColor: '#0B0F14', title: 'Gene OS',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    fullscreen: !!s['behavior.fullscreen'],
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
      devTools: true,
    },
  });
  require('./services/system').system.setWindowGetter(() => win);

  win.once('ready-to-show', () => {
    if (s['behavior.startMinimized']) win.minimize(); else { if (!s['behavior.fullscreen']) win.maximize(); win.show(); }
  });
  const sendState = () => win && !win.isDestroyed() && win.webContents.send('gos:window', { fullscreen: win.isFullScreen(), maximized: win.isMaximized() });
  ['enter-full-screen', 'leave-full-screen', 'maximize', 'unmaximize'].forEach((ev) => win.on(ev, sendState));

  // Never navigate the app window away; open external links in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  win.webContents.on('render-process-gone', (_e, d) => log.error('renderer gone', d));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) { win.webContents.toggleDevTools(); e.preventDefault(); }
  });

  await win.loadURL('app://geneos/renderer/index.html');
  if (DEV) win.webContents.openDevTools({ mode: 'detach' });

  require('./services/notifications').start((fresh) => win && !win.isDestroyed() && win.webContents.send('gos:notifications', fresh));
  startScheduler();
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.whenReady().then(boot).catch((e) => { fatal('Startup failed', e); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  try { require('./services/notifications').stop(); require('./services/backup').stopScheduler(); require('./db/database').close(); } catch (e) { log.error('shutdown', e); }
});
process.on('uncaughtException', (e) => log.error('uncaughtException', e));
process.on('unhandledRejection', (e) => log.error('unhandledRejection', e));
ipcMain.on('gos:ping', (e) => { e.returnValue = 'pong'; });
