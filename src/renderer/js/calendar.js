// Calendar & region helpers shared by Tasks, Home, gsh (`cal`, `date`) and the lock screen.
import { settings } from './state.js';
import { dateToJalali, toGregorian, jalaliMonthLength, formatJalali, JALALI_MONTHS } from '../../shared/jalali.mjs';

const ORDER = { sun: 0, mon: 1, sat: 6 };
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekStart = () => ORDER[settings.get('calendar.weekStart')] ?? 1;
export const jalaliOn = () => !!settings.get('calendar.jalali');
// Column index (0..6) of a JS weekday given the configured week start.
export const colOf = (dow) => (dow - weekStart() + 7) % 7;
export const weekdayHeaders = (len = 3) => Array.from({ length: 7 }, (_, i) => SHORT[(weekStart() + i) % 7].slice(0, len));
export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// "Monday 23 Nov 2026 · 2 Azar 1405" when Jalali display is enabled
export function dualDate(d = new Date(), { weekday = true } = {}) {
  const g = d.toLocaleDateString('en-GB', { ...(weekday ? { weekday: 'long' } : {}), day: 'numeric', month: 'short', year: 'numeric' });
  return jalaliOn() ? `${g} · ${formatJalali(d, 'long')}` : g;
}

// Month grid: cells for a Gregorian month (y, m0) or a Jalali month (jy, jm). Each cell → { date, day, inMonth }.
export function monthGrid({ jalali = false, y, m }) {
  let first, days, title;
  if (jalali) {
    const g = toGregorian(y, m, 1); first = new Date(g.gy, g.gm - 1, g.gd); days = jalaliMonthLength(y, m); title = `${JALALI_MONTHS[m - 1]} ${y}`;
  } else { first = new Date(y, m, 1); days = new Date(y, m + 1, 0).getDate(); title = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  const lead = colOf(first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(first); d.setDate(first.getDate() + i - lead);
    const inMonth = i >= lead && i < lead + days;
    cells.push({ date: d, day: jalali ? dateToJalali(d).jd : d.getDate(), inMonth });
  }
  const rows = Math.ceil((lead + days) / 7);
  return { title, cells: cells.slice(0, rows * 7), lead, days, first };
}
export const secondaryDay = (d) => (jalaliOn() ? dateToJalali(d).jd : null);
export { dateToJalali, formatJalali, JALALI_MONTHS };
