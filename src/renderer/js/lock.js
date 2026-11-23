// Login / lock screen. Shown after boot (optional) and on demand (Ctrl+Alt+L, `lock`, top-bar button).
// With a PIN configured (Settings → Behavior) the PIN is verified in the main process. This is a
// privacy screen — it does not encrypt data.
import { api } from './api.js';
import { h, clear } from './ui.js';
import { icon } from './icons.js';
import { settings } from './state.js';
import { helixV } from './helix.js';
import { jalaliOn, formatJalali } from './calendar.js';

let locked = false;
export const isLocked = () => locked;

export function showLock({ initial = false } = {}) {
  if (locked) return Promise.resolve();
  locked = true;
  const el = document.getElementById('lock');
  const p = settings.get('profile') || {};
  const hasPin = !!settings.get('security.hasPin');
  const time = h('div.lock-time'), date = h('div.lock-date');
  const tick = () => { const d = new Date(); time.textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); date.textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() + (jalaliOn() ? `  ·  ${formatJalali(d, 'long').toUpperCase()}` : ''); };
  tick();
  const timer = setInterval(tick, 1000);
  const initials = (p.name || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  const pin = h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, placeholder: 'PIN', autocomplete: 'off', 'aria-label': 'PIN' });
  const hint = h('div.lock-hint', hasPin ? 'Enter your PIN and press Enter' : initial ? 'Press Enter or click to sign in' : 'Locked — press Enter to unlock');
  return new Promise((resolve) => {
    const unlock = async () => {
      if (hasPin) {
        const ok = await api.security.verifyPin(pin.value).catch(() => false);
        if (!ok) { pin.classList.remove('shake'); void pin.offsetWidth; pin.classList.add('shake'); pin.value = ''; hint.textContent = 'Incorrect PIN'; return; }
      }
      clearInterval(timer);
      window.removeEventListener('keydown', onKey, true);
      el.classList.add('out');
      setTimeout(() => { el.hidden = true; el.classList.remove('out'); clear(el); locked = false; resolve(); const t = document.querySelector('.ti-in'); if (t) t.focus(); }, 380);
    };
    const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); unlock(); } else if (!hasPin) e.stopPropagation(); };
    clear(el).append(
      h('pre.lock-bg.l', { html: helixV(13, 34, 0.4) }), h('pre.lock-bg.r', { html: helixV(13, 34, 2.1) }),
      h('div.lock-center',
        time, date,
        h('div.lock-avatar', p.photo ? h('img', { src: p.photo, alt: '' }) : initials),
        h('div.lock-name', (p.name || 'User').toUpperCase()),
        h('div.lock-role', p.role || ''), h('div.lock-uni', p.university || ''),
        hasPin ? h('div.lock-pin', pin, h('button.lock-go', { onclick: unlock }, icon('chevron', 14))) : h('button.lock-go', { onclick: unlock }, icon('power', 15), initial ? 'SIGN IN' : 'UNLOCK'),
        hint));
    el.hidden = false;
    window.addEventListener('keydown', onKey, true);
    setTimeout(() => (hasPin ? pin.focus() : el.querySelector('.lock-go')?.focus()), 60);
  });
}
