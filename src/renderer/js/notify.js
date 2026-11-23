// Notification center drawer.
import { api } from './api.js';
import { h, clear, relTime, toastError } from './ui.js';
import { bus } from './state.js';

let drawer = null;
const ICON = { overdue: '!', deadline: '◷', reminder: '◉', milestone: '◆', assignment: '✎', exam: '✦', backup: '⛁' };

export function toggleDrawer() { if (drawer) close(); else open(); }
function close() { drawer?.remove(); drawer = null; }
async function open() {
  drawer = h('aside.drawer');
  document.getElementById('layer').append(drawer);
  await render();
}
async function render() {
  if (!drawer) return;
  let list = [];
  try { list = await api.notifications.list(100); } catch (e) { toastError(e); }
  const body = h('div.scroll.grow');
  clear(drawer).append(
    h('div.panel-h', h('span.t', 'Notifications'), h('span.right.row',
      h('button.btn.sm', { onclick: async () => { await api.notifications.scan(); render(); bus.emit('changed', 'notifications'); } }, 'Scan now'),
      h('button.btn.sm', { onclick: async () => { await api.notifications.markAllRead(); render(); bus.emit('changed', 'notifications'); } }, 'Mark all read'),
      h('button.btn.sm', { onclick: async () => { await api.notifications.clear(); render(); } }, 'Clear read'),
      h('button.btn.sm.ghost', { onclick: close }, '✕'))),
    body,
    h('div.panel-h.small', 'Configure in Settings → Notifications'),
  );
  if (!list.length) body.append(h('div.empty', 'No notifications. Deadlines, reminders, milestones, exams and backup reminders appear here.'));
  for (const n of list) {
    body.append(h(`div.item.clickable${n.read ? '' : '.sel'}`, {
      onclick: async () => {
        await api.notifications.markRead(n.id);
        const { nav } = window.__os;
        if (n.entity === 'task') nav('tasks', { open: n.entity_id });
        else if (n.entity === 'project') nav('research', { id: n.entity_id });
        else if (n.entity === 'course') nav('courses', { id: n.entity_id });
        else if (n.entity === 'settings') nav('settings', { section: 'data' });
        close(); bus.emit('changed', 'notifications');
      },
    }, h('span.accent', ICON[n.kind] || '·'), h('div.grow', h('div', n.title), n.body ? h('div.muted.small', n.body) : null), h('span.meta', relTime(n.created_at)),
    h('button.btn.sm.ghost', { title: 'Dismiss', onclick: async (e) => { e.stopPropagation(); await api.notifications.remove(n.id); render(); bus.emit('changed', 'notifications'); } }, '✕')));
  }
}
