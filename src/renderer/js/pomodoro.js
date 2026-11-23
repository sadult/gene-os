// Pomodoro / focus timer. Logs completed work sessions as time on the linked task (or as general focus time).
import { api } from './api.js';
import { toast } from './ui.js';
import { bus, settings } from './state.js';

const KEY = 'geneos.pomodoro';
let st = JSON.parse(localStorage.getItem(KEY) || 'null') || { running: false };
let timer = null;

function save() { localStorage.setItem(KEY, JSON.stringify(st)); bus.emit('pomodoro', status()); }
function fmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function status() { return { ...st, remaining: st.running ? fmt(st.endsAt - Date.now()) : '', remainingMs: st.running ? st.endsAt - Date.now() : 0 }; }

async function finish() {
  if (st.mode === 'work') {
    try { await api.tasks.logTime(st.taskId || null, st.minutes, 'pomodoro'); } catch (e) { console.error(e); }
    notify('Pomodoro complete', `${st.minutes} min logged${st.taskTitle ? ' on “' + st.taskTitle + '”' : ''}. Take a break.`);
    const br = settings.get('pomodoro.break') || 5;
    st = { ...st, mode: 'break', minutes: br, endsAt: Date.now() + br * 60e3 };
    bus.emit('changed', 'tasks');
  } else {
    notify('Break finished', 'Ready for the next focus session.');
    st = { running: false };
  }
  save();
}
function notify(title, body) {
  toast(`◷ ${title} — ${body}`, 'ok', 6000);
  try { new Notification(title, { body, silent: false }); } catch { /* notifications may be disabled */ }
}
function loop() {
  clearInterval(timer);
  timer = setInterval(() => { if (!st.running) { clearInterval(timer); return; } if (Date.now() >= st.endsAt) finish(); }, 1000);
}

export const pomodoro = {
  start(minutes, task) {
    const m = Number(minutes) || settings.get('pomodoro.work') || 25;
    st = { running: true, mode: 'work', minutes: m, endsAt: Date.now() + m * 60e3, taskId: task ? task.id : null, taskTitle: task ? task.title : '' };
    save(); loop();
    toast(`◷ Focus ${m} min${task ? ' · ' + task.title : ''}`, 'info', 2000);
  },
  stop() { if (!st.running) return; const elapsed = (Date.now() - (st.endsAt - st.minutes * 60e3)) / 60e3; if (st.mode === 'work' && elapsed >= 1) api.tasks.logTime(st.taskId || null, Math.round(elapsed), 'pomodoro').catch(() => {}); st = { running: false }; save(); toast('Pomodoro stopped', 'info', 1500); },
  status,
};
if (st.running) loop();
