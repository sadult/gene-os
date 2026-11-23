'use strict';
// Local file logger with simple size-based rotation (gene-os.log -> gene-os.log.1)
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 5 * 1024 * 1024;
let stream = null;
let filePath = null;

function init(dir) {
  fs.mkdirSync(dir, { recursive: true });
  filePath = path.join(dir, 'gene-os.log');
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > MAX_BYTES) {
      fs.renameSync(filePath, filePath + '.1');
    }
  } catch { /* rotation is best effort */ }
  stream = fs.createWriteStream(filePath, { flags: 'a' });
}

function fmt(a) {
  if (a instanceof Error) return a.stack || a.message;
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch { return String(a); }
}

function write(level, args) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${args.map(fmt).join(' ')}\n`;
  if (level === 'error' || process.env.GENEOS_DEBUG) process.stderr.write(line);
  if (stream) stream.write(line);
}

module.exports = {
  init,
  file: () => filePath,
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
  debug: (...a) => { if (process.env.GENEOS_DEBUG) write('debug', a); },
  close: () => new Promise((r) => (stream ? stream.end(r) : r())),
};
