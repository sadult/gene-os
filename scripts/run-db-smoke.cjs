'use strict';
// Runs the DB smoke test. better-sqlite3 v13 is an N-API addon, so the same binary loads in Node and Electron.
// If plain Node cannot load it, fall back to Electron's bundled Node (ELECTRON_RUN_AS_NODE).
const { spawnSync } = require('child_process');
const path = require('path');
const test = path.join(__dirname, '..', 'tests', 'db.smoke.cjs');
let r = spawnSync(process.execPath, [test], { stdio: 'inherit' });
if (r.status !== 0 && r.status !== 1) {
  console.log('\nRetrying with Electron as Node…');
  const electron = require('electron');
  r = spawnSync(electron, [test], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
}
process.exit(r.status ?? 1);
