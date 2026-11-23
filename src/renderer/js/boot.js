// Gene OS boot sequence: POST → logo, helix & module loading with progress → hand-off to login/desktop.
// Every step performs a real start-up check; minimum step durations only pace the animation and
// collapse to zero when the user presses a key or clicks (skip).
import { api } from './api.js';
import { h, fmtBytes } from './ui.js';
import { helixV, animate } from './helix.js';

// "ANSI Shadow"-style block letters drawn for Gene OS.
const FONT = {
  G: [' ██████╗ ', '██╔════╝ ', '██║  ███╗', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  N: ['███╗   ██╗', '████╗  ██║', '██╔██╗ ██║', '██║╚██╗██║', '██║ ╚████║', '╚═╝  ╚═══╝'],
  O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
};
export const blockWord = (w) => FONT.G.map((_, row) => [...w].map((ch) => (FONT[ch] ? FONT[ch][row] : '  ')).join(''));
export function logoNode() {
  const a = blockWord('GENE'), b = blockWord('OS');
  return h('pre.boot-logo', a.map((l, i) => [l, '   ', h('span.os', b[i]), i < a.length - 1 ? '\n' : '']));
}

export async function runBoot({ animated, version, onReady }) {
  const steps = [
    ['Mounting kernel modules', async () => { await Promise.all([import('./modules/home.js'), import('./commands.js'), import('./terminal/shell.js')]); return 'gsh · home · command registry'; }],
    ['Checking local database', async () => { const s = await api.system.status(); if (s.db !== 'ok') throw new Error('integrity: ' + s.db); return `sqlite schema v${s.schema} · ${fmtBytes(s.dbSize)}`; }],
    ['Loading user profile', async () => { const p = await api.profile.get(); return p && p.name ? `${p.name} · ${p.university || ''}` : 'profile'; }],
    ['Loading research environment', async () => { const a = await api.research.active(); return a ? `active: ${a.name}` : 'no active project'; }],
    ['Indexing applications', async () => { const l = await api.apps.list({ sort: 'name', dir: 'ASC' }); const b = l.filter((x) => x.broken).length; return `${l.length} registered${b ? ` · ${b} broken` : ''}`; }],
    ['Starting notification center', async () => `${await api.notifications.unread()} unread`],
    ['Starting gsh shell', async () => { const sh = await import('./terminal/shell.js'); await sh.shell.ready(); return 'ready'; }],
  ];
  const root = document.getElementById('boot');
  if (!animated) {
    root.style.display = 'none';
    for (const [, fn] of steps) { try { await fn(); } catch (e) { console.error(e); } }
    await onReady();
    return;
  }
  let skip = false;
  const onSkip = () => { skip = true; };
  window.addEventListener('keydown', onSkip);
  root.addEventListener('mousedown', onSkip);
  const wait = (ms) => new Promise((r) => setTimeout(r, skip ? 0 : ms));

  // ── stage 1: POST ──
  const post = h('div.post');
  root.append(post, h('div.boot-foot', 'PRESS ANY KEY TO SKIP'));
  const info = await Promise.race([api.system.fetchInfo().catch(() => null), new Promise((r) => setTimeout(() => r(null), 700))]);
  const gb = (b) => (b / 1073741824).toFixed(1) + ' GB';
  const lines = [
    [h('span.hl', `GENE OS BIOS v${version}`), '   ', h('span.dim', '(c) 2026 Bitologist · 10ck.ir')],
    [''],
    ['CPU ........ ', h('span.hl', info ? `${info.cpu} × ${info.cores}` : (navigator.hardwareConcurrency || '?') + ' logical cores')],
    ['MEMORY ..... ', h('span.hl', info ? `${gb(info.memTotal)} total · ${gb(info.memTotal - info.memUsed)} free` : 'ok')],
    ['PLATFORM ... ', h('span.hl', info ? `${info.os} · ${info.arch}` : navigator.platform)],
    ['RUNTIME .... ', h('span.hl', info ? `Electron ${info.electron} · Chromium ${info.chrome.split('.')[0]} · Node ${info.node}` : 'Electron')],
    ['STORAGE .... ', h('span.hl', info ? `${info.portable ? 'portable · ' : ''}${info.dataDir}` : 'local'), '  ', h('span.okk', '[ OK ]')],
    ['GENOME ..... ', 'loading chromosome map ', h('span.okk', '█'.repeat(18)), ' ', h('span.okk', '[ OK ]')],
  ];
  for (const l of lines) { post.append(h('div', l)); await wait(85); }
  await wait(260);
  post.classList.add('fade');
  await wait(260);

  // ── stage 2: logo + helix + module loading ──
  const pre = h('pre.bh');
  const stepsEl = h('div.boot-steps');
  const bar = h('i');
  const stage = h('div.boot-stage', pre, h('div', logoNode(), h('div.boot-sub', `RESEARCH OPERATING ENVIRONMENT  ·  v${version}`), stepsEl, h('div.boot-progress', bar)));
  root.append(stage);
  const anim = animate(pre, (p) => helixV(17, 24, p), 16);
  requestAnimationFrame(() => stage.classList.add('in'));
  await wait(380);
  let i = 0;
  for (const [label, fn] of steps) {
    const tag = h('span.tag', '[ .. ]');
    const det = h('span.det', '');
    stepsEl.append(h('div', tag, h('span', label.padEnd(30, ' ')), det));
    const t0 = performance.now();
    try { det.textContent = await fn(); tag.className = 'tag okk'; tag.textContent = '[ OK ]'; }
    catch (e) { tag.className = 'tag bad'; tag.textContent = '[FAIL]'; det.textContent = e.message; }
    bar.style.width = `${Math.round((++i / steps.length) * 100)}%`;
    await wait(Math.max(0, 300 - (performance.now() - t0)));
  }
  stepsEl.append(h('div', h('span.tag.okk', '  ▸   '), h('span.okk', 'System ready — welcome to Gene OS')));
  await wait(520);

  // ── stage 3: hand-off ──
  await onReady();
  window.removeEventListener('keydown', onSkip);
  root.classList.add('out');
  await new Promise((r) => setTimeout(r, 430));
  anim.stop();
}
