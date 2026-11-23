// Renders an application icon consistently everywhere (apps grid, details page, home launcher, palette).
// Stored icon formats: "data:image/...;base64,…" (extracted or chosen image) or "glyph:<text>|<#color>".
import { h, colorFor } from './ui.js';

export function appIcon(a, size = 36) {
  const box = { width: size + 'px', height: size + 'px' };
  const letter = () => {
    const c = colorFor(a.name || '?');
    return h('div.app-ico', { style: { ...box, color: c, background: c + '1f', borderColor: c + '55', fontSize: Math.round(size * 0.44) + 'px' } }, (a.name || '?').trim().slice(0, 1).toUpperCase());
  };
  const icon = String(a.icon || '');
  if (icon.startsWith('glyph:')) {
    const [g, c = '#59D5C3'] = icon.slice(6).split('|');
    return h('div.app-ico', { style: { ...box, color: c, background: c + '1f', borderColor: c + '55', fontSize: Math.round(size * (g.length > 1 && /^[\x20-\x7e]+$/.test(g) ? 0.38 : 0.52)) + 'px' } }, g);
  }
  if (icon.startsWith('data:image/')) {
    const img = h('img.app-img', { src: icon, alt: '', draggable: 'false', style: box });
    img.addEventListener('error', () => img.replaceWith(letter()));
    return img;
  }
  return letter();
}
