// Time handling for match days: "fri 8:30pm" read in the host's own zone, shown to everyone in theirs (Discord timestamps).
// Pure functions, no I/O (works in the Worker and in tests).
export const validZone = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: String(tz) }); return !!tz; } catch { return false; } };
const UNIT = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
// "2h" · "90m" · "1h30m" → milliseconds (0 when unreadable)
export function parseDuration(s) {
  let total = 0, left = String(s ?? '').toLowerCase().replace(/\s+/g, '');
  const re = /^(\d+(?:\.\d+)?)(s|m|h|d|min|mins|minutes?|hours?|hrs?|days?)/;
  while (left) { const m = left.match(re); if (!m) return 0; total += parseFloat(m[1]) * UNIT[m[2][0] === 'm' ? 'm' : m[2][0]]; left = left.slice(m[0].length); }
  return total;
}
// wall clock in `tz` → UTC milliseconds
export function zonedToUtc(date, time, tz) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number), want = Date.UTC(y, mo - 1, d, h, mi);
  let guess = want;
  for (let k = 0; k < 3; k++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(guess).map((x) => [x.type, x.value]));
    guess += want - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  }
  return guess;
}
export const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Toronto', 'America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Caracas', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'America/Puerto_Rico', 'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Rome',
  'Europe/Stockholm', 'Europe/Athens', 'Europe/Istanbul', 'Africa/Lagos', 'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata',
  'Asia/Manila', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'UTC'];
export const zoneChoices = (q) => {
  const s = String(q ?? '').toLowerCase().replace(/\s+/g, '_');
  return ZONES.filter((z) => z.toLowerCase().includes(s)).slice(0, 25).map((z) => ({ name: z.replace(/_/g, ' '), value: z }));
};

const DAY = 864e5;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
// Wall-clock date/time/weekday of an instant in a zone.
function local(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long', hourCycle: 'h23' })
    .formatToParts(ms).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, wd: WEEKDAYS.indexOf(p.weekday.toLowerCase()) };
}
const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const HELP = 'Try `tonight 9pm`, `tomorrow 20:30`, `fri 8:30pm`, `oct 14 9pm` or `in 2h`.';

// "fri 8:30pm" in `tz` → { date: 'YYYY-MM-DD', time: 'HH:MM' } (wall clock in tz), or { error }.
export function parseWhen(input, tz, now = Date.now()) {
  let s = String(input ?? '').toLowerCase().replace(/[,@]/g, ' ').replace(/\bat\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return { error: `When does it start? ${HELP}` };
  const rel = s.match(/^in (.+)$/);
  if (rel) {
    const ms = parseDuration(rel[1]);
    if (!ms) return { error: `I couldn’t read “${input}”. ${HELP}` };
    const at = local(now + ms, tz);
    return { date: at.date, time: at.time };
  }
  const today = local(now, tz);
  // the time: 9pm · 9:30pm · 21:00 · 21.00 · noon / midnight
  let time = null;
  s = s.replace(/\b(noon|midday|midnight)\b/, (w) => { time = w === 'midnight' ? '00:00' : '12:00'; return ' '; })
    .replace(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a|p)\b|\b(\d{1,2})[:.](\d{2})\b/, (_, h1, m1, ap, h2, m2) => {
      let h = Number(h1 ?? h2), m = Number(m1 ?? m2 ?? 0);
      if (ap) { if (h < 1 || h > 12) return _; h = (h % 12) + (ap[0] === 'p' ? 12 : 0); }
      if (h > 23 || m > 59) return _;
      time = `${pad(h)}:${pad(m)}`;
      return ' ';
    }).trim();
  if (!time && /\btonight\b/.test(s)) { // "tonight 9" → 21:00
    s = s.replace(/\b(\d{1,2})\b/, (_, h) => { if (+h >= 1 && +h <= 11) time = `${pad(+h + 12)}:00`; return ' '; }).trim();
  }
  if (!time) return { error: `What time? ${HELP}` };
  // the day
  let date = null, flexible = false;
  const words = s.replace(/\b(next|this|on)\b/g, ' ').replace(/\s+/g, ' ').trim();
  let m;
  if (!words || /^(today|tonight|tdy)$/.test(words)) { date = today.date; flexible = !words; }
  else if (/^(tomorrow|tmr|tmrw|tom)$/.test(words)) date = addDays(today.date, 1);
  else if ((m = words.match(/^(\d{4})-(\d{2})-(\d{2})$/))) date = words;
  else if ((m = words.match(/^([a-z]{3})[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?$/) ?? words.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3})[a-z]*\.?$/))) {
    const [mon, d] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
    const mi = MONTHS.indexOf(mon);
    if (mi < 0 || +d < 1 || +d > 31) return { error: `I couldn’t read the date in “${input}”. ${HELP}` };
    let y = Number(today.date.slice(0, 4));
    if (`${y}-${pad(mi + 1)}-${pad(+d)}` < today.date) y++; // "jan 3" in December means next year
    date = `${y}-${pad(mi + 1)}-${pad(+d)}`;
  } else {
    const wd = WEEKDAYS.findIndex((w) => words === w || words === w.slice(0, 3) || (words.length >= 3 && w.startsWith(words)));
    if (wd < 0) return { error: `I couldn’t read the day in “${input}”. ${HELP}` };
    date = addDays(today.date, (wd - today.wd + 7) % 7);
    flexible = true; // "fri" on a Friday after the time has passed → next Friday
  }
  if (isNaN(Date.parse(`${date}T00:00:00Z`))) return { error: `That date doesn’t exist. ${HELP}` };
  if (zonedToUtc(date, time, tz) <= now) {
    if (flexible) date = addDays(date, words && !/^(today|tonight|tdy)$/.test(words) ? 7 : 1);
    else return { error: 'That time has already passed – pick a time in the future.' };
  }
  return { date, time };
}

