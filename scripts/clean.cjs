'use strict';
// Clean rebuild helper: removes build output and caches. Use `npm run clean`, then `npm install` and `npm run build`.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const targets = ['dist', 'out', '.cache'];
if (process.argv.includes('--all')) targets.push('node_modules');
for (const t of targets) {
  const p = path.join(root, t);
  if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); console.log('removed', t); }
}
console.log('clean complete');
