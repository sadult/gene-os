// Procedural ASCII double helix (horizontal for the header, vertical for the boot screen).
const PAIRS = [['A', 'T'], ['T', 'A'], ['G', 'C'], ['C', 'G']];
const seq = Array.from({ length: 512 }, (_, i) => PAIRS[(i * 7 + (i >> 2) * 3 + (i % 5)) % 4]);

function toHtml(grid, cls) {
  let out = '';
  for (let r = 0; r < grid.length; r++) {
    let run = '', rc = null;
    for (let c = 0; c < grid[r].length; c++) {
      const k = cls[r][c];
      if (k !== rc) { if (run) out += rc ? `<span class="${rc}">${run}</span>` : run; run = ''; rc = k; }
      run += grid[r][c];
    }
    if (run) out += rc ? `<span class="${rc}">${run}</span>` : run;
    out += '\n';
  }
  return out;
}

export function helixH(width, rows, phase, offset = 0) {
  const g = Array.from({ length: rows }, () => Array(width).fill(' '));
  const k = Array.from({ length: rows }, () => Array(width).fill(null));
  const c = (rows - 1) / 2;
  for (let x = 0; x < width; x++) {
    const a = x * 0.3 + phase;
    const s = Math.sin(a), front = Math.cos(a) > 0;
    const r1 = Math.round(c + c * s), r2 = Math.round(c - c * s);
    const col = x + offset;
    if (col % 3 === 0 && Math.abs(r1 - r2) > 1) {
      const [top, bot] = seq[(col / 3) % seq.length];
      const lo = Math.min(r1, r2), hi = Math.max(r1, r2);
      for (let r = lo + 1; r < hi; r++) { const upper = r < c; g[r][x] = upper ? top : bot; k[r][x] = (upper ? top : bot) === 'A' || (upper ? top : bot) === 'T' ? 'bA' : 'bG'; }
      if (hi - lo > 2) { g[Math.round(c)][x] = '·'; k[Math.round(c)][x] = 'bp'; }
    }
    g[r1][x] = front ? '█' : '▒'; k[r1][x] = null;
    g[r2][x] = front ? '▒' : '█'; k[r2][x] = 's2';
  }
  return toHtml(g, k);
}

export function helixV(width, height, phase) {
  const g = Array.from({ length: height }, () => Array(width).fill(' '));
  const k = Array.from({ length: height }, () => Array(width).fill(null));
  const c = (width - 1) / 2;
  for (let y = 0; y < height; y++) {
    const a = y * 0.42 + phase; const s = Math.sin(a), front = Math.cos(a) > 0;
    const x1 = Math.round(c + c * s), x2 = Math.round(c - c * s);
    const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
    if (hi - lo > 2) {
      const [l, r] = seq[y % seq.length];
      for (let x = lo + 1; x < hi; x++) { const left = x < c; g[y][x] = x === lo + 1 ? (left ? l : r) : x === hi - 1 ? (left ? l : r) : '─'; k[y][x] = x === lo + 1 || x === hi - 1 ? ((left ? l : r) === 'A' || (left ? l : r) === 'T' ? 'bA' : 'bG') : 'bp'; }
      g[y][lo + 1] = l; g[y][hi - 1] = r; k[y][lo + 1] = l === 'A' || l === 'T' ? 'bA' : 'bG'; k[y][hi - 1] = r === 'A' || r === 'T' ? 'bA' : 'bG';
    }
    g[y][x1] = front ? '█' : '▓'; k[y][x1] = null;
    g[y][x2] = front ? '▓' : '█'; k[y][x2] = 's2';
  }
  return toHtml(g, k);
}

// Animator that pauses when hidden/disabled. Returns stop().
export function animate(el, render, fps = 8) {
  let phase = 0, timer = null;
  const tick = () => { if (!document.hidden) { phase += 0.18; el.innerHTML = render(phase); } };
  el.innerHTML = render(0);
  const start = () => { if (!timer) timer = setInterval(tick, 1000 / fps); };
  const stop = () => { clearInterval(timer); timer = null; };
  start();
  return { stop, start };
}
