// Jalali (Solar Hijri / Persian) calendar helpers built on the ICU "persian" calendar (Intl), which
// ships with Chromium/Electron and Node. Gregorian → Jalali is a direct ICU lookup; Jalali → Gregorian
// searches around an arithmetic estimate and verifies every candidate with ICU, so no hand-written
// leap-year tables are involved.
export const JALALI_MONTHS = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'];
export const JALALI_MONTHS_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const WEEKDAYS_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

let fmt = null;
function formatter() {
  if (!fmt) fmt = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  return fmt;
}
const utcNoon = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12));

// Gregorian (y, m, d) → { jy, jm, jd }
export function toJalali(gy, gm, gd) {
  const parts = formatter().formatToParts(utcNoon(gy, gm, gd));
  const get = (t) => Number((parts.find((p) => p.type === t) || {}).value);
  return { jy: get('year'), jm: get('month'), jd: get('day') };
}
export function dateToJalali(date) { const d = date instanceof Date ? date : new Date(date); return toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()); }

export function isValidJalali(jy, jm, jd) {
  if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd) || jm < 1 || jm > 12 || jd < 1) return false;
  if (jd > jalaliMonthLength(jy, jm)) return false;
  return true;
}
// Jalali (y, m, d) → { gy, gm, gd } (throws on invalid input)
export function toGregorian(jy, jm, jd) {
  if (!(Number.isInteger(jy) && Number.isInteger(jm) && Number.isInteger(jd) && jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31 && jy > 0 && jy < 3000)) throw new Error('Invalid Jalali date');
  try { return toGregorianUnchecked(jy, jm, jd); } catch { throw new Error(`${jy}/${jm}/${jd} does not exist in the Jalali calendar`); }
}
export function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // Esfand: 30 days in leap years — check whether 1 Farvardin of the next year is 30 days after 1 Esfand
  const s = toGregorianUnchecked(jy, 12, 1), n = toGregorianUnchecked(jy + 1, 1, 1);
  return Math.round((Date.UTC(n.gy, n.gm - 1, n.gd) - Date.UTC(s.gy, s.gm - 1, s.gd)) / 864e5);
}
function toGregorianUnchecked(jy, jm, jd) {
  const doy = jm <= 7 ? (jm - 1) * 31 + jd : 186 + (jm - 7) * 30 + jd;
  const base = Date.UTC(jy + 621, 2, 20, 12) + (doy - 1) * 864e5;
  for (const off of [0, 1, -1, 2, -2]) {
    const d = new Date(base + off * 864e5);
    const j = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    if (j.jy === jy && j.jm === jm && j.jd === jd) return { gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() };
  }
  throw new Error('conversion failed');
}
export const isJalaliLeap = (jy) => jalaliMonthLength(jy, 12) === 30;

const pad = (n) => String(n).padStart(2, '0');
// "1405/09/02" or "2 Azar 1405"
export function formatJalali(date, style = 'numeric') {
  const { jy, jm, jd } = dateToJalali(date);
  if (style === 'long') return `${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`;
  if (style === 'fa') return `${jd} ${JALALI_MONTHS_FA[jm - 1]} ${jy}`;
  return `${jy}/${pad(jm)}/${pad(jd)}`;
}
// Parse "1405/09/02", "1405-9-2" → { jy, jm, jd } or null
export function parseJalali(s) {
  const m = /^\s*(\d{3,4})[/\-.](\d{1,2})[/\-.](\d{1,2})\s*$/.exec(String(s || ''));
  if (!m) return null;
  return { jy: +m[1], jm: +m[2], jd: +m[3] };
}
