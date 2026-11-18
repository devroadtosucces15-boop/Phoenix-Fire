// PF-024 Item 19 – birthdays: /birthday set | show | visible | clear (matchday app) and the ONE daily birthday poster (folded in from bot/fun.js).
// Storage: profiles.birthday ("MM-DD", no year, ever) and profiles.bio_show.birthday (the visibility flag, hidden until the member turns it on). No migration needed.
// PRIVACY: the date is shown to nobody but the member until they switch visibility on; no year or age is ever stored or shown; the date is never logged.
// Daily (cron, after 08:00 UTC, the date is the UTC date): for members who made it visible, ONE Phoenix panel in the channel for the purpose `birthdays`
// (falls back to `fun_posts`, then announcements, by Organization config) that mentions them, plus an optional ping role (group `ping_birthdays`, none by default):
// never @everyone. Each member also gets ONE private DM built from real data (joined, games, goals, assists, MOTMs, badges, points), with a safe fallback.
// Claims (bot/once.js) make a second cron run, a second app or a retry post nothing twice. No channel configured = no post, the reason is returned.
import { can, flagOn } from './roles.js';
import { message, notice, reply, header, text, sep, footer, picture } from './ui.js';
import { orgName, channelFor, pingRoleFor } from './orgconfig.js';
import { discord } from './servertools.js';
import { once, unclaim } from './once.js';
import { birthday as parseBirthday, BIO_SHOW_DEFAULT } from './profiles.js';

export const BIRTHDAY_COMMANDS = new Set(['birthday']);
export const BIRTHDAY_FLAG = 'birthday';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const note = (title, body = '') => reply(notice(title, body));
const userOf = (i) => i.member?.user?.id ?? i.user?.id ?? '';
const parseShow = (s) => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };
/** "07-14" → "14 July" (never a year) */
export const prettyDay = (md) => { const m = /^(\d{2})-(\d{2})$/.exec(md ?? ''); return m && MONTHS[+m[1] - 1] ? `${+m[2]} ${MONTHS[+m[1] - 1]}` : ''; };

// Profiles keep MM-DD only. In a non-leap year 29 Feb is celebrated on 1 March.
export function birthdaysOn(now) {
  const d = new Date(now), mo = d.getUTCMonth() + 1, day = d.getUTCDate();
  const leap = new Date(Date.UTC(d.getUTCFullYear(), 1, 29)).getUTCMonth() === 1;
  const key = (m, dd) => `${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return [key(mo, day), ...(mo === 3 && day === 1 && !leap ? ['02-29'] : [])];
}

/** the public panel for today's visible birthdays: rows = [{ user_id }] */
export function birthdayPanel(rows, env, { pingRole = null } = {}) {
  const ids = rows.map((r) => String(r.user_id));
  const ping = ids.map((u) => `<@${u}>`).join(' ') + (pingRole ? ` <@&${pingRole}>` : '');
  return message({ accent: 'gold', ping, mentions: { users: ids, roles: pingRole ? [pingRole] : [] }, blocks: [
    header({ eyebrow: `${orgName(env).toUpperCase()} · Birthdays`, title: rows.length === 1 ? '🎂 Happy birthday!' : `🎂 ${rows.length} birthdays today`, size: 2 }),
    picture(env, 'post-birthday'),
    text(ids.map((u) => `🎉 <@${u}>`).join('\n')),
    sep(),
    footer('From everyone at the club – have a good one'),
  ] });
}

/** real facts for the DM. Every line is optional: a missing source is skipped, never invented. */
export async function birthdayFacts(env, uid) {
  const out = {};
  try {
    const u = await env.DB.prepare('SELECT first_at, points FROM users WHERE id = ?').bind(uid).first();
    if (u?.first_at) out.joined = `${MONTHS[new Date(u.first_at).getUTCMonth()]} ${new Date(u.first_at).getUTCFullYear()}`;
    if (u?.points > 0) out.points = u.points;
    const b = await env.DB.prepare('SELECT COUNT(*) AS n FROM badges WHERE to_id = ?').bind(uid).first();
    if (b?.n > 0) out.badges = b.n;
    const c = await env.DB.prepare("SELECT player FROM claims WHERE user_id = ? AND status = 'approved'").bind(uid).first();
    if (c?.player) {
      const s = await env.DB.prepare('SELECT COUNT(*) AS games, COALESCE(SUM(goals),0) AS goals, COALESCE(SUM(assists),0) AS assists, COALESCE(SUM(motm),0) AS motm FROM rush_players WHERE player = ?').bind(c.player).first();
      if (s?.games > 0) Object.assign(out, { games: s.games, goals: s.goals, assists: s.assists, motm: s.motm });
    }
  } catch { /* a missing table or row: fewer facts, same message */ }
  return out;
}

/** the private DM (a Phoenix panel); `facts` from birthdayFacts, possibly empty → the safe fallback wording */
export function birthdayDm(env, facts = {}, name = '') {
  const lines = [];
  if (facts.joined) lines.push(`🔥 With us since ${facts.joined}`);
  if (facts.games) lines.push(`🎮 ${facts.games} match${facts.games === 1 ? '' : 'es'} played · ⚽ ${facts.goals} goal${facts.goals === 1 ? '' : 's'} · 🅰️ ${facts.assists} assist${facts.assists === 1 ? '' : 's'}${facts.motm ? ` · ⭐ ${facts.motm} man of the match` : ''}`);
  if (facts.badges) lines.push(`🏅 ${facts.badges} badge${facts.badges === 1 ? '' : 's'} from your teammates`);
  if (facts.points) lines.push(`✨ ${facts.points} club points`);
  const body = lines.length
    ? `Thank you for the time and effort you give ${orgName(env)}. Here is a little of what you have built with us:\n\n${lines.join('\n')}\n\nThe club is better with you in it.`
    : `Thank you for being part of ${orgName(env)}. Whatever the scoreboard says, the club is better with you in it.`;
  return message({ accent: 'gold', blocks: [
    header({ eyebrow: `${orgName(env).toUpperCase()} · Birthday`, title: `🎂 Happy birthday${name ? `, ${String(name).slice(0, 40)}` : ''}!`, size: 2 }),
    picture(env, 'post-birthday'),
    text(body), sep(),
    footer('Rise. Burn. Repeat. · You get this because you chose to share your birthday: /birthday visible off stops it'),
  ] });
}

async function dm(env, userId, msg) {
  try {
    const ch = await discord(env, 'POST', '/users/@me/channels', { recipient_id: String(userId) });
    if (!ch?.id) return false;
    return !!(await discord(env, 'POST', `/channels/${ch.id}/messages`, msg))?.id;
  } catch { return false; } // a closed DM is not an error
}

/** the daily job. post(env, channel, content, msg) as in bot/fun.js. → { posted, count, dms } or { posted:false, reason } */
export async function birthdayCheck(env, post, now = Date.now(), { dmFn = dm } = {}) {
  if (!env.DB || !env.DISCORD_BOT_TOKEN) return { posted: false, reason: 'not-set-up' };
  const d = new Date(now);
  if (d.getUTCHours() < 8) return { posted: false, reason: 'too-early' };
  const day = d.toISOString().slice(0, 10), keys = birthdaysOn(now);
  const all = (await env.DB.prepare(`SELECT p.user_id, p.bio_show, u.name FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.birthday IN (${keys.map(() => '?').join(',')})`).bind(...keys).all()).results ?? [];
  const rows = all.filter((r) => parseShow(r.bio_show).birthday === true); // hidden by default: only members who switched it on
  if (!rows.length) return { posted: false, reason: 'none-today' };
  const out = { posted: false, count: rows.length, dms: 0 };
  for (const r of rows) { // one private DM per member per year
    if (!(await once(env, `birthday-dm:${r.user_id}:${day.slice(0, 4)}`))) continue;
    if (await dmFn(env, r.user_id, birthdayDm(env, await birthdayFacts(env, r.user_id), r.name))) out.dms++;
  }
  const channel = (await channelFor(env, 'birthdays')) || '';
  if (!channel) return { ...out, reason: 'no-channel' }; // the purpose is not set in the Organization config: say so, never guess a channel
  if (!(await once(env, `birthday:${day}`))) return { ...out, reason: 'already-posted' };
  const pingRole = await pingRoleFor(env, 'ping_birthdays').catch(() => null);
  const res = await post(env, channel, '', birthdayPanel(rows, env, { pingRole }));
  if (!res?.ok) await unclaim(env, `birthday:${day}`); // a failed post may be retried by the next run
  return { ...out, posted: !!res?.ok };
}

// ---------- /birthday ----------
async function setRow(env, uid, md, visible, now) {
  const cur = await env.DB.prepare('SELECT bio_show FROM profiles WHERE user_id = ?').bind(uid).first();
  const show = { ...BIO_SHOW_DEFAULT, ...parseShow(cur?.bio_show), birthday: !!visible };
  if (cur) await env.DB.prepare('UPDATE profiles SET birthday = COALESCE(?, birthday), bio_show = ?, updated = ? WHERE user_id = ?').bind(md, JSON.stringify(show), now, uid).run();
  else await env.DB.prepare('INSERT INTO profiles (user_id, birthday, bio_show, updated) VALUES (?, ?, ?, ?)').bind(uid, md ?? '', JSON.stringify(show), now).run();
}
const status = (md, visible) => md
  ? `Saved: **${prettyDay(md)}** (no year is kept). Visible to the club: **${visible ? 'yes' : 'no'}**.\n-# Dates are the UTC date. Nobody else sees it unless you turn visibility on.`
  : 'No birthday saved.';

export async function birthdayCommand(i, env, who, now = Date.now()) {
  if (!flagOn(env, who, BIRTHDAY_FLAG)) return note('Not switched on yet', 'Birthdays are being tested.');
  if (!can(who, 'birthday.set')) return note('Members only');
  if (!env.DB) return note('The member database is not connected');
  const uid = userOf(i), sub = i.data?.options?.[0], o = Object.fromEntries((sub?.options ?? []).map((x) => [x.name, x.value]));
  const row = await env.DB.prepare('SELECT birthday, bio_show FROM profiles WHERE user_id = ?').bind(uid).first();
  const md = row?.birthday || '', visible = parseShow(row?.bio_show).birthday === true;
  if (sub?.name === 'set') {
    let v; try { v = parseBirthday(o.date); } catch (e) { return note('Birthday not saved', e.message); }
    if (!v) return note('Birthday not saved', 'Give a month and day, like 07-14.');
    await setRow(env, uid, v, o.visible ?? visible, now);
    return note('Birthday saved', status(v, o.visible ?? visible));
  }
  if (sub?.name === 'visible') {
    if (!md) return note('Save a birthday first', 'Use /birthday set date:07-14');
    await setRow(env, uid, null, !!o.on, now);
    return note(o.on ? 'Birthday is visible' : 'Birthday is hidden', o.on ? 'The club will celebrate it on the day, and you get a private message.' : 'Nobody sees it and nothing is posted.');
  }
  if (sub?.name === 'clear') {
    await env.DB.prepare('UPDATE profiles SET birthday = ?, bio_show = ?, updated = ? WHERE user_id = ?').bind('', JSON.stringify({ ...BIO_SHOW_DEFAULT, ...parseShow(row?.bio_show), birthday: false }), now, uid).run();
    return note('Birthday removed', 'Your date is deleted.');
  }
  return note('Your birthday', status(md, visible)); // show: private to the member
}
