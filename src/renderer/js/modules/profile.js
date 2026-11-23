// Profile — digital researcher ID card (view only). Editing lives in Settings → Profile.
import { api } from '../api.js';
import { h, clear, toastError, copyText, ibtn } from '../ui.js';
import { icon } from '../icons.js';
import { bus } from '../state.js';

const SILHOUETTE = '      .---.\n     /     \\\n    | () () |\n     \\  ^  /\n      |||||\n    .-------.\n   /         \\\n  |  NO PHOTO |\n  |           |';
let root = null, off = null;
const linkOf = (k, v) => (k === 'telegram' ? `https://t.me/${String(v).replace(/^@/, '')}` : /^https?:/i.test(v) ? v : `https://${v}`);

async function draw() {
  if (!root) return;
  const [p, d] = await Promise.all([api.profile.get(), api.dashboard.summary()]);
  const links = [['telegram', 'TELEGRAM', 'link'], ['website', 'WEBSITE', 'globe'], ['github', 'GITHUB', 'external']].filter(([k]) => p[k]);
  const idno = 'GOS-' + String((p.name || 'X').split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1e6, 7)).padStart(6, '0');
  clear(root).append(h('div.col', { style: { alignItems: 'center', paddingTop: '14px' } },
    h('div.idcard',
      h('div.top', h('span.row', { style: { gap: '8px' } }, icon('dna', 13), 'GENE OS · RESEARCHER ID'), h('span', idno)),
      h('div.body',
        h('div.photo', { title: 'Change the photo in Settings → Profile' }, p.photo ? h('img', { src: p.photo, alt: 'profile' }) : SILHOUETTE),
        h('div.col', { style: { gap: '6px' } },
          h('div.name', (p.name || '').toUpperCase()), h('div.role', p.role || ''),
          h('div.kv', [['UNIVERSITY', p.university], ['DEVELOPER', p.developer], ...links.map(([k, l]) => [l, h('a', { onclick: () => api.system.openExternal(linkOf(k, p[k])).catch(toastError) }, p[k])]), ...(p.fields || []).map((f) => [f.label.toUpperCase(), f.value])].filter(([, v]) => v).flatMap(([k, v]) => [h('span.small', k), v instanceof Node ? v : h('span', v)])),
          p.bio ? h('div.prose.muted', { style: { marginTop: '6px' } }, p.bio) : null)),
      h('div.bottom', h('span', 'ANIMAL BREEDING & GENETICS'), h('span', `${d.counts.tasksDone} TASKS ✓ · ${d.counts.papers} PAPERS · ${d.counts.projects} PROJECTS · ${d.counts.courses} COURSES`))),
    h('div.row', { style: { marginTop: '4px' } },
      ibtn('copy', 'Copy contact card', () => copyText([p.name, p.role, p.university, p.telegram && 'Telegram: ' + p.telegram, p.website && 'Web: ' + p.website, p.github && 'GitHub: ' + p.github].filter(Boolean).join('\n'), 'profile')),
      ibtn('edit', 'Edit in Settings', () => window.__os.nav('settings', { section: 'profile' }), 'ghost'))));
}

export default {
  id: 'profile',
  async mount(el) { root = el; await draw(); off = bus.on('settings', ({ key }) => { if (key === 'profile') draw(); }); },
  unmount() { root = null; off && off(); },
};
