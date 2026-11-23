'use strict';
// Application manager: registers .exe / .lnk (and .bat/.cmd/.msc/.url) entries, resolves shortcut targets,
// extracts icons and version metadata, detects broken paths and launches reliably.
//
// Icon pipeline (why icons used to go missing): shortcuts often reference their icon as
// "%SystemRoot%\...\shell32.dll,42" or an MSI-advertised target with no path, and app.getFileIcon()
// can return an empty / fully transparent bitmap for .lnk files. We now try, in order:
//   1. the shortcut's own icon location (env vars expanded, icon index honoured via ExtractIconEx),
//   2. the resolved target executable, 3. the registered file itself,
// using nativeImage for image files, Electron's getFileIcon (rejecting blank bitmaps) and finally a
// PowerShell/.NET extractor. Icons are stored as normalized 64×64 PNG data URLs.
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { app, shell, nativeImage } = require('electron');
const E = require('./entities');
const log = require('../logger');

const ALLOWED = new Set(['.exe', '.lnk', '.bat', '.cmd', '.msc', '.url', '.appref-ms']);
const IMAGE_EXT = new Set(['.ico', '.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp']);
const ICON_SIZE = 64;

function parseArgs(s) {
  const out = []; let cur = ''; let q = false; let has = false;
  for (const ch of String(s || '')) {
    if (ch === '"') { q = !q; has = true; continue; }
    if (!q && /\s/.test(ch)) { if (has || cur) { out.push(cur); cur = ''; has = false; } continue; }
    cur += ch; has = true;
  }
  if (has || cur) out.push(cur);
  return out;
}
// Expand %VAR% (case-insensitive) and strip quotes / trailing ",index".
function expandEnv(p) {
  if (!p) return '';
  const env = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k.toLowerCase(), v]));
  return String(p).trim().replace(/^"|"$/g, '').replace(/%([^%]+)%/g, (m, k) => env[k.toLowerCase()] ?? m);
}
function splitIconLocation(loc, index = 0) {
  const m = /^(.*?),\s*(-?\d+)$/.exec(String(loc || ''));
  return m ? { file: expandEnv(m[1]), index: Number(m[2]) } : { file: expandEnv(loc), index: Number(index) || 0 };
}

function runPs(script, env, timeout = 9000) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve('');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env: { ...process.env, ...env }, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => { if (err) { log.warn('powershell failed', err.message); return resolve(''); } resolve(String(stdout || '').trim()); });
  });
}

function versionInfo(file) {
  if (process.platform !== 'win32' || !file || !fs.existsSync(file) || !/\.(exe|dll)$/i.test(file)) return Promise.resolve({});
  const ps = '$v=(Get-Item -LiteralPath $env:GOS_TARGET).VersionInfo; [pscustomobject]@{ProductName=$v.ProductName;FileDescription=$v.FileDescription;CompanyName=$v.CompanyName;FileVersion=$v.FileVersion;ProductVersion=$v.ProductVersion;LegalCopyright=$v.LegalCopyright;OriginalFilename=$v.OriginalFilename} | ConvertTo-Json -Compress';
  return runPs(ps, { GOS_TARGET: file }, 8000).then((out) => {
    try { const o = JSON.parse(out || '{}'); for (const k of Object.keys(o)) if (!o[k]) delete o[k]; return o; } catch { return {}; }
  });
}

const PS_ICON = `
Add-Type -AssemblyName System.Drawing
$p=$env:GOS_ICON_PATH; $i=[int]$env:GOS_ICON_INDEX; $bmp=$null
try {
  $sig='[DllImport("shell32.dll",CharSet=CharSet.Unicode)] public static extern int ExtractIconEx(string f,int i,IntPtr[] l,IntPtr[] s,int n); [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);'
  $t=Add-Type -MemberDefinition $sig -Name IconX -Namespace GeneOS -PassThru
  $l=New-Object IntPtr[] 1; $s=New-Object IntPtr[] 1
  if($t::ExtractIconEx($p,$i,$l,$s,1) -gt 0 -and $l[0] -ne [IntPtr]::Zero){ $bmp=([System.Drawing.Icon]::FromHandle($l[0])).ToBitmap(); [void]$t::DestroyIcon($l[0]); if($s[0] -ne [IntPtr]::Zero){[void]$t::DestroyIcon($s[0])} }
} catch {}
if(-not $bmp){ try { $ico=[System.Drawing.Icon]::ExtractAssociatedIcon($p); if($ico){ $bmp=$ico.ToBitmap() } } catch {} }
if($bmp){ $ms=New-Object System.IO.MemoryStream; $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($ms.ToArray()) }`;

function isBlank(img) {
  if (!img || img.isEmpty()) return true;
  const bmp = img.toBitmap(); // BGRA
  for (let i = 3; i < bmp.length; i += 4) if (bmp[i] > 8) return false;
  return true;
}
const normalize = (img) => img.resize({ width: ICON_SIZE, height: ICON_SIZE, quality: 'best' }).toDataURL();

async function iconFromFile(file, index = 0) {
  if (!file || !fs.existsSync(file)) return '';
  const ext = path.extname(file).toLowerCase();
  try {
    if (IMAGE_EXT.has(ext)) { const img = nativeImage.createFromPath(file); if (!isBlank(img)) return normalize(img); }
    if (index !== 0 || ext === '.dll') {
      const b64 = await runPs(PS_ICON, { GOS_ICON_PATH: file, GOS_ICON_INDEX: String(index) });
      if (b64) { const img = nativeImage.createFromBuffer(Buffer.from(b64, 'base64')); if (!isBlank(img)) return normalize(img); }
    }
    for (const size of ['large', 'normal']) {
      const img = await app.getFileIcon(file, { size });
      if (!isBlank(img)) return normalize(img);
    }
    const b64 = await runPs(PS_ICON, { GOS_ICON_PATH: file, GOS_ICON_INDEX: '0' });
    if (b64) { const img = nativeImage.createFromBuffer(Buffer.from(b64, 'base64')); if (!isBlank(img)) return normalize(img); }
  } catch (e) { log.warn('icon extraction failed', file, e.message); }
  return '';
}
async function bestIcon(candidates) {
  for (const c of candidates) { const icon = await iconFromFile(c.file, c.index || 0); if (icon) return icon; }
  return '';
}

async function inspect(p) {
  const ext = path.extname(p).toLowerCase();
  if (!ALLOWED.has(ext)) throw new Error(`Unsupported application type '${ext}'. Use .exe or .lnk (also .bat/.cmd/.msc/.url).`);
  if (!fs.existsSync(p)) throw new Error('File does not exist: ' + p);
  const info = { path: p, target_path: '', args: '', cwd: '', description: '', name: path.basename(p, ext), metadata: { type: ext.slice(1) } };
  const iconCandidates = [];
  if (ext === '.lnk') {
    try {
      const l = shell.readShortcutLink(p);
      info.target_path = expandEnv(l.target);
      info.args = l.args || '';
      info.cwd = expandEnv(l.cwd);
      info.description = l.description || '';
      if (l.icon) iconCandidates.push(splitIconLocation(l.icon, l.iconIndex));
      info.metadata.shortcut = { target: l.target, icon: l.icon, iconIndex: l.iconIndex, appUserModelId: l.appUserModelId };
      if (!info.target_path) info.metadata.advertised = true; // MSI/Store "advertised" shortcut: launched through the shell
    } catch (e) { log.warn('readShortcutLink failed', p, e.message); info.metadata.advertised = true; }
  } else if (ext === '.exe') info.target_path = p;
  const exe = info.target_path && fs.existsSync(info.target_path) ? info.target_path : '';
  if (exe) iconCandidates.push({ file: exe, index: 0 });
  iconCandidates.push({ file: p, index: 0 });
  const ver = await versionInfo(exe || (ext === '.exe' ? p : ''));
  Object.assign(info.metadata, ver);
  if (ext === '.exe' && (ver.FileDescription || ver.ProductName)) {
    const nice = (ver.FileDescription || ver.ProductName).trim();
    if (nice.length <= 60) info.name = nice;
  }
  if (!info.description) info.description = [ver.CompanyName, ver.ProductVersion || ver.FileVersion].filter(Boolean).join(' · ');
  if (exe) { try { info.metadata.size = fs.statSync(exe).size; info.metadata.modified = fs.statSync(exe).mtime.toISOString(); } catch { /* ignore */ } }
  info.icon = await bestIcon(iconCandidates);
  info.metadata.iconSource = info.icon ? 'detected' : 'none';
  return info;
}

function status(a) {
  const pathOk = fs.existsSync(a.path);
  const targetOk = !a.target_path || fs.existsSync(a.target_path);
  const lnk = path.extname(a.path).toLowerCase() === '.lnk';
  return { pathOk, targetOk, broken: !pathOk || (lnk && !targetOk && !(a.metadata || {}).advertised) };
}
const withStatus = (a) => (a ? { ...a, ...status(a) } : null);

const apps = {
  list(opts) { return E.apps.list(opts || { sort: 'name', dir: 'ASC' }).map(withStatus); },
  get(id) { return withStatus(E.apps.get(id)); },
  inspect,
  async register(p, overrides = {}) {
    const dup = E.apps.list({ filter: { path: p } })[0];
    if (dup) throw new Error(`Already registered as "${dup.name}"`);
    const info = await inspect(p);
    return withStatus(E.apps.create({ category: 'General', ...info, ...overrides }));
  },
  async registerMany(list) {
    const res = { added: [], errors: [] };
    for (const p of list || []) { try { res.added.push(await apps.register(p)); } catch (e) { res.errors.push({ path: p, error: e.message }); } }
    return res;
  },
  update(id, patch) {
    if (patch.icon !== undefined && patch.icon !== '' && !/^(data:image\/(png|jpeg|gif|webp|x-icon|bmp);base64,|glyph:)/.test(patch.icon)) throw new Error('Invalid icon');
    return withStatus(E.apps.update(id, patch));
  },
  remove: (id) => E.apps.remove(id),
  async refresh(id) {
    const a = E.apps.get(id);
    const info = await inspect(a.path);
    const patch = { target_path: info.target_path, metadata: { ...(a.metadata || {}), ...info.metadata } };
    if (!a.custom_icon) patch.icon = info.icon;
    return withStatus(E.apps.update(id, patch));
  },
  // Icon from an image (.ico/.png/.jpg…), a program/library (.exe/.dll, optional index) or a shortcut.
  async setIcon(id, file, index = 0) {
    const ext = path.extname(file || '').toLowerCase();
    let icon = '';
    if (ext === '.lnk') { try { const l = shell.readShortcutLink(file); icon = await bestIcon([splitIconLocation(l.icon, l.iconIndex), { file: expandEnv(l.target) }, { file }]); } catch { icon = await iconFromFile(file); } }
    else icon = await iconFromFile(file, Number(index) || 0);
    if (!icon) throw new Error('Could not read an icon from that file');
    return withStatus(E.apps.update(id, { icon, custom_icon: true }));
  },
  setGlyph(id, glyph, color = '#59D5C3') {
    const g = String(glyph || '').trim().slice(0, 4);
    if (!g) throw new Error('Enter an emoji or 1–2 letters');
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Color must be #RRGGBB');
    return withStatus(E.apps.update(id, { icon: `glyph:${g}|${color}`, custom_icon: true }));
  },
  async resetIcon(id) {
    const a = E.apps.get(id);
    const sc = (a.metadata || {}).shortcut;
    const icon = await bestIcon([sc && sc.icon ? splitIconLocation(sc.icon, sc.iconIndex) : null, { file: a.target_path }, { file: a.path }].filter((c) => c && c.file));
    return withStatus(E.apps.update(id, { icon, custom_icon: false }));
  },
  // Re-extract icons for every app without a custom icon (fixes entries registered by 1.x).
  async repairIcons() {
    let fixed = 0;
    for (const a of E.apps.list({})) {
      if (a.custom_icon) continue;
      const r = await apps.resetIcon(a.id);
      if (r.icon && r.icon !== a.icon) fixed++;
    }
    return { fixed };
  },
  showInFolder(id) {
    const a = E.apps.get(id);
    if (!a) return false;
    shell.showItemInFolder(a.target_path && fs.existsSync(a.target_path) ? a.target_path : a.path);
    return true;
  },
  async launch(idOrName) {
    let a = typeof idOrName === 'number' ? E.apps.get(idOrName) : null;
    if (!a && typeof idOrName === 'string') {
      const q = idOrName.toLowerCase();
      const list = E.apps.list({});
      a = list.find((x) => x.name.toLowerCase() === q) || list.find((x) => x.name.toLowerCase().startsWith(q)) || list.find((x) => x.name.toLowerCase().includes(q));
    }
    if (!a) throw new Error(`No application matches '${idOrName}'`);
    const ext = path.extname(a.path).toLowerCase();
    if (status(a).broken) throw new Error(`Path is broken for "${a.name}": ${a.target_path || a.path}`);
    const exe = ext === '.exe' ? a.path : (a.target_path && fs.existsSync(a.target_path) && path.extname(a.target_path).toLowerCase() === '.exe' ? a.target_path : '');
    if (exe) await spawnDetached(exe, parseArgs(a.args), a.cwd && fs.existsSync(a.cwd) ? a.cwd : path.dirname(exe));
    else { const err = await shell.openPath(a.path); if (err) throw new Error(err); }
    E.apps.update(a.id, { launch_count: (a.launch_count || 0) + 1, last_launched_at: new Date().toISOString() });
    return { ok: true, id: a.id, name: a.name };
  },
  recent: (limit = 6) => E.apps.list({ sort: 'last_launched_at', dir: 'DESC', limit }).filter((a) => a.last_launched_at).map(withStatus),
  categories: () => [...new Set(E.apps.list({}).map((a) => a.category || 'General'))].sort(),
  groups: () => [...new Set(E.apps.list({}).map((a) => a.group_name).filter(Boolean))].sort(),
};

function spawnDetached(exe, args, cwd) {
  return new Promise((resolve, reject) => {
    let child;
    let settled = false;
    const done = (fn, v) => { if (!settled) { settled = true; fn(v); } };
    async function fallback(e) {
      // Elevation-required programs (ERROR_ELEVATION_REQUIRED=740) fail with spawn; ShellExecute shows the UAC prompt.
      log.warn('spawn failed, falling back to shell', exe, e && e.message);
      const err = await shell.openPath(exe);
      return err ? done(reject, new Error(`Launch failed: ${e.message}; shell: ${err}`)) : done(resolve);
    }
    try { child = spawn(exe, args, { cwd, detached: true, stdio: 'ignore', windowsHide: false }); } catch (e) { fallback(e); return; }
    child.once('spawn', () => { child.unref(); done(resolve); });
    child.once('error', fallback);
  });
}

module.exports = { apps, parseArgs, expandEnv, splitIconLocation };
