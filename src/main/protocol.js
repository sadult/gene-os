'use strict';
// Custom protocols:
//   app://geneos/<path>      -> files under src/ (renderer + shared). Traversal-safe, explicit MIME types.
//   gosfile://file/<id>   -> a library file by record id (used for inline image/text previews only).
const fs = require('fs');
const path = require('path');
const { protocol, net } = require('electron');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

function registerSchemes() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
    { scheme: 'gosfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

function handle(getFilePath) {
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  protocol.handle('gosfile', async (req) => {
    const url = new URL(req.url);
    const id = Number(url.pathname.replace(/\//g, ''));
    const file = Number.isInteger(id) ? getFilePath(id) : null;
    if (!file || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

module.exports = { registerSchemes, handle };
