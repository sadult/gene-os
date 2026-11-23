// App state: settings cache, event bus, theme application.
import { api, native } from './api.js';

const listeners = new Map();
export const bus = {
  on(ev, fn) { (listeners.get(ev) || listeners.set(ev, new Set()).get(ev)).add(fn); return () => listeners.get(ev).delete(fn); },
  emit(ev, data) { for (const fn of listeners.get(ev) || []) { try { fn(data); } catch (e) { console.error(e); } } },
};

export const THEMES = {
  'gene-dark': { name: 'Gene Dark', bg: '#0B0F14', bg2: '#111720', panel: '#151D27', panel2: '#1a2431', border: '#253140', border2: '#2f3d4f', text: '#DCE6F0', muted: '#8493A5', dim: '#5d6b7c' },
  'deep-ocean': { name: 'Deep Ocean', bg: '#080c18', bg2: '#0d1324', panel: '#121a30', panel2: '#17213b', border: '#22304f', border2: '#2c3c60', text: '#d6def0', muted: '#7d8bab', dim: '#56617d' },
  graphite: { name: 'Graphite', bg: '#0e0e10', bg2: '#141417', panel: '#1a1a1e', panel2: '#212126', border: '#2c2c33', border2: '#3a3a42', text: '#e2e2e6', muted: '#8f8f99', dim: '#62626b' },
  'nord-lab': { name: 'Nord Lab', bg: '#1f232b', bg2: '#242933', panel: '#2a303b', panel2: '#313846', border: '#3b4252', border2: '#4c566a', text: '#e5e9f0', muted: '#a3abb9', dim: '#7b8496' },
  'phosphor': { name: 'Phosphor', bg: '#050805', bg2: '#081008', panel: '#0c160c', panel2: '#102010', border: '#1c3a1c', border2: '#275227', text: '#c8f0c8', muted: '#78a878', dim: '#4d754d' },
};
export const ACCENTS = ['#59D5C3', '#7AA2F7', '#B48EAD', '#E5B567', '#98C379', '#E06C75', '#56B6C2'];

let cache = {};
export const settings = {
  async load() { cache = await api.settings.getAll(); return cache; },
  get: (k) => cache[k],
  all: () => cache,
  async set(k, v) { cache[k] = v; await api.settings.set(k, v); if (k.startsWith('appearance.')) applyAppearance(); bus.emit('settings', { key: k, value: v }); return v; },
};

export function applyAppearance() {
  const s = cache; const root = document.documentElement.style;
  const theme = { ...(THEMES[s['appearance.theme']] || THEMES['gene-dark']), ...(s['appearance.theme'] === 'custom' ? s['appearance.customTheme'] || {} : {}) };
  for (const k of ['bg', 'bg2', 'panel', 'panel2', 'border', 'border2', 'text', 'muted', 'dim']) if (theme[k]) root.setProperty('--' + k, theme[k]);
  root.setProperty('--accent', s['appearance.accent'] || '#59D5C3');
  const font = s['appearance.font'];
  root.setProperty('--font', `${font && font !== 'JetBrains Mono' ? `'${font}', ` : ''}'GOS Mono', 'JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', 'IBM Plex Mono', Consolas, monospace`);
  root.setProperty('--fs', (s['appearance.fontSize'] || 13) + 'px');
  document.body.classList.toggle('compact', !!s['appearance.compact']);
  document.body.classList.toggle('no-anim', s['appearance.animations'] === false);
  document.body.classList.toggle('transparent', !!s['appearance.transparency']);
  native.setZoom(s['appearance.zoom'] || 1);
}
