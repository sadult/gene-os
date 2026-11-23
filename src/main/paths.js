'use strict';
// Resolves every on-disk location used by Gene OS. Nothing else may hardcode paths.
//  - Installed build: %APPDATA%/Gene OS/data  (overridable via geneos-location.json pointer)
//  - Portable build:  <folder of portable exe>/GeneOSData
// Data from the previous product name (Gene Terminal 1.x) is migrated automatically on first start.
const fs = require('fs');
const path = require('path');

const DB_NAME = 'gene-os.db';
const LEGACY_DB = 'gene-terminal.db';
let p = null;

function renameDb(dir) {
  // Same folder, old file name (e.g. a relocated or portable data folder from 1.x).
  if (fs.existsSync(path.join(dir, DB_NAME)) || !fs.existsSync(path.join(dir, LEGACY_DB))) return false;
  for (const ext of ['', '-wal', '-shm']) {
    const from = path.join(dir, LEGACY_DB + ext);
    if (fs.existsSync(from)) fs.renameSync(from, path.join(dir, DB_NAME + ext));
  }
  return true;
}

function migrateLegacy(target, legacyDirs) {
  if (fs.existsSync(path.join(target, DB_NAME))) return null;
  for (const dir of legacyDirs) {
    if (!dir || !fs.existsSync(path.join(dir, LEGACY_DB))) continue;
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(dir, target, { recursive: true, force: false, errorOnExist: false });
    renameDb(target);
    return dir;
  }
  return null;
}

function init(app) {
  const userData = app.getPath('userData');
  const appData = app.getPath('appData');
  const pointer = path.join(userData, 'geneos-location.json');
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  let dataDir = portableDir ? path.join(portableDir, 'GeneOSData') : path.join(userData, 'data');
  let custom = false;
  if (!portableDir) {
    try {
      const cfg = JSON.parse(fs.readFileSync(pointer, 'utf8'));
      if (cfg && cfg.dataDir && fs.existsSync(cfg.dataDir)) { dataDir = cfg.dataDir; custom = true; }
    } catch { /* no pointer file: default location */ }
  }
  let migratedFrom = null;
  try {
    if (custom) renameDb(dataDir);
    else migratedFrom = migrateLegacy(dataDir, portableDir ? [path.join(portableDir, 'GeneTerminalData')] : [path.join(appData, 'Gene Terminal', 'data')]);
    renameDb(dataDir);
  } catch (e) { migratedFrom = 'failed: ' + e.message; }
  fs.mkdirSync(dataDir, { recursive: true });
  p = { userData, pointer, dataDir, portable: !!portableDir, migratedFrom };
  for (const d of [libraryDir(), backupsDir(), logsDir()]) fs.mkdirSync(d, { recursive: true });
}

const dataDir = () => p.dataDir;
const dbFile = () => path.join(p.dataDir, DB_NAME);
const pendingRestore = () => path.join(p.dataDir, 'pending-restore.db');
const libraryDir = () => path.join(p.dataDir, 'library');
const backupsDir = () => path.join(p.dataDir, 'backups');
const logsDir = () => path.join(p.dataDir, 'logs');

function setDataDir(dir) {
  if (p.portable) throw new Error('The portable build always stores data next to the executable.');
  fs.writeFileSync(p.pointer, JSON.stringify({ dataDir: dir }, null, 2));
}

module.exports = {
  init, dataDir, dbFile, pendingRestore, libraryDir, backupsDir, logsDir, setDataDir,
  isPortable: () => p.portable,
  migratedFrom: () => p.migratedFrom,
  info: () => ({ ...p, dbFile: dbFile(), libraryDir: libraryDir(), backupsDir: backupsDir(), logsDir: logsDir() }),
};
