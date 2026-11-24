// Match-day commands for the Worker: /host, /matchday (create · checkin · next · schedule · who · cancel), /lineup, the ✅ ❔ ❌ buttons,
// the position picker and the one-hour reminder. Storage and wording live in core/store.js and core/matchday.js.
import { notice, IS_V2, EPHEMERAL } from '../core/ui.js';
import { parseWhen, validZone, zonedToUtc, zoneChoices } from '../core/when.js';
import { eventPanel, schedulePanel, createdPanel, eventTitle, KINDS, POSITIONS } from '../core/matchday.js';
import { who, mainClub, nextOne, gate } from './access.js';
import { setupCommand, setLineup, lineupView, suggestCommand, linkCommand } from './lineup.js';

const API = 'https://discord.com/api/v10';
export const MATCHDAY_COMMANDS = new Set(['host', 'matchday', 'lineup', 'setup', 'setlineup', 'suggestlineup', 'link']);
const ephemeral = (d) => ({ ...d, flags: (d.flags & IS_V2) | EPHEMERAL });
const say = (h, title, body, o = {}) => h.reply(notice(title, body, { ephemeral: true, ...o }));

// ---- Discord posts that carry mentions (the rest of the bot never pings) ----
const bot = (env) => ({ 'Content-Type': 'application/json', Authorization: `Bot ${env.DISCORD_TOKEN}` });
async function postEvent(env, channel, data, mentions) {
  return fetch(`${API}/channels/${channel}/messages`, { method: 'POST', headers: bot(env), body: JSON.stringify({ flags: data.flags & IS_V2, components: data.components, allowed_mentions: mentions }) });
}
const editPost = (env, e, data) => (e.channel_id && e.message_id
  ? fetch(`${API}/channels/${e.channel_id}/messages/${e.message_id}`, { method: 'PATCH', headers: bot(env), body: JSON.stringify({ flags: data.flags & IS_V2, components: data.components, allowed_mentions: { parse: [] } }) }).catch(() => null) : null);
export async function refreshPost(env, st, e) { return editPost(env, e, eventPanel(e, await st.rsvps(e.id), { club: await mainClub(st, e.guild_id) })); }

// ---- create ----
const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
async function create(env, ctx, st, i, h, kind) {
  const bad = await gate(st, i, 'matchday');
  if (bad) return h.reply(bad);
  const me = who(i);
  const tz = String(h.opt(i, 'timezone') || (await st.getTz(me.id)) || '').trim();
  if (!tz) return say(h, 'Which time zone are you in?', 'Add `timezone:` (start typing your city). I remember it, so you only need it once.');
  if (!validZone(tz)) return say(h, `I don’t know the time zone “${tz}”`, 'Start typing a city in `timezone:` and pick one from the list.');
  const w = parseWhen(h.opt(i, 'when'), tz);
  if (w.error) return say(h, 'I couldn’t read that time', w.error);
  await st.setTz(me.id, tz);
  const opponent = String(h.opt(i, 'opponent') ?? '').trim() || null, club = await mainClub(st, i.guild_id);
  const channel = h.opt(i, 'channel') || i.channel_id, role = h.opt(i, 'silent') ? null : h.opt(i, 'ping') ?? null;
  const total = h.opt(i, 'weekly') ? 4 : 1, made = [];
  for (let k = 0; k < total; k++) {
    const date = addDays(w.date, 7 * k);
    const e = { id: crypto.randomUUID().slice(0, 8), guild: i.guild_id, channel, club: club?.id, kind, title: eventTitle(kind, opponent), opponent, start: zonedToUtc(date, w.time, tz), duration: h.opt(i, 'length') ?? 120,
      tz, players: h.opt(i, 'players') ?? 11, notes: h.opt(i, 'notes') ?? '', role, by: me.id };
    await st.addEvent(e);
    const row = await st.getEvent(e.id);
    const res = await postEvent(env, channel, eventPanel(row, [], { club, ping: k === 0 ? role : null }), { roles: k === 0 && role ? [role] : [] });
    if (!res.ok) {
      await st.cancelEvent(e.id);
      return say(h, `I couldn’t post in <#${channel}>`, res.status === 403 || res.status === 404 ? 'Give me View Channel and Send Messages there, or pick another `channel:`.' : `Discord said ${res.status}.`);
    }
    const posted = await res.json().catch(() => ({}));
    await st.setEventMessage(e.id, channel, posted.id ?? null);
    made.push(row);
  }
  return h.reply(createdPanel(made[0], `Posted in <#${channel}> with sign-up buttons.`, [made.length > 1 ? `Repeats weekly: ${made.length} dates.` : null, `Time zone saved: ${tz.replace(/_/g, ' ')}.`]));
}

export async function matchdayCommand(env, ctx, st, i, h) {
  const name = i.data.name, sub = i.data.options?.[0]?.name;
  if (name === 'host') return create(env, ctx, st, i, h, h.opt(i, 'kind') === 'friendly' ? 'friendly' : 'session');
  if (name === 'lineup') return lineupView(env, ctx, st, i, h);
  if (name === 'setup') return setupCommand(st, i, h);
  if (name === 'setlineup') return setLineup(env, ctx, st, i, h);
  if (name === 'suggestlineup') return suggestCommand(st, i, h);
  if (name === 'link') return linkCommand(st, i, h);
  if (sub === 'create') return create(env, ctx, st, i, h, h.opt(i, 'kind') in KINDS ? h.opt(i, 'kind') : 'league');
  const club = await mainClub(st, i.guild_id);
  if (sub === 'schedule') {
    const events = await st.upcoming(i.guild_id, 4), c = await st.countsFor(i.guild_id);
    return h.reply(schedulePanel(events, (id) => ({ yes: c.get(`${id}|yes`) ?? 0, maybe: c.get(`${id}|maybe`) ?? 0, no: c.get(`${id}|no`) ?? 0 }), club));
  }
  const e = await nextOne(st, i);
  if (!e) return say(h, 'Nothing scheduled yet', 'Managers add a match day with `/matchday create` or `/host`.');
  if (sub === 'next') return h.reply(eventPanel(e, await st.rsvps(e.id), { club, ephemeral: true }));
  if (sub === 'who') return h.reply(eventPanel(e, await st.rsvps(e.id), { club, who: true, answers: false, ephemeral: true }));
  if (sub === 'cancel') {
    const bad = await gate(st, i, 'matchday');
    if (bad) return h.reply(bad);
    await st.cancelEvent(e.id);
    if (e.channel_id && e.message_id) ctx.waitUntil(fetch(`${API}/channels/${e.channel_id}/messages/${e.message_id}`, { method: 'DELETE', headers: bot(env) }).catch(() => null));
    return say(h, `Cancelled ${e.title}`, `It was <t:${Math.floor(e.start / 1000)}:F>. Its post is removed.`, { accent: 'loss' });
  }
  if (sub === 'checkin') {
    const opens = e.start - 3600_000;
    if (Date.now() < opens) return say(h, 'Check-in is not open yet', `It opens <t:${Math.floor(opens / 1000)}:R>, an hour before kick-off.`);
    const me = who(i);
    await st.checkIn(e.id, me.id, me.name);
    ctx.waitUntil(ensureAvatar(env, st, i, h));
    ctx.waitUntil(refreshPost(env, st, e));
    return say(h, '✅ You are on', `Checked in for **${e.title}**. Good luck.`, { accent: 'win' });
  }
  return say(h, 'Unknown /matchday command', 'Use create, checkin, next, schedule, who or cancel.');
}

// ---- the buttons: ml:ev:<event>:<yes|maybe|no> and the position picker ml:evp:<event> ----
export async function eventComponent(env, ctx, st, i, h, kind, eventId, value) {
  const e = await st.getEvent(eventId);
  if (!e) return h.reply({ ...notice('This match day is gone', 'It was cancelled or already played.'), flags: IS_V2 }, 7);
  const me = who(i);
  ctx.waitUntil(ensureAvatar(env, st, i, h));
  if (kind === 'ev' && ['yes', 'maybe', 'no'].includes(value)) await st.answer(e.id, me.id, me.name, value);
  else if (kind === 'evp' && POSITIONS.includes(i.data.values?.[0])) await st.setPos(e.id, me.id, me.name, i.data.values[0]);
  const club = await mainClub(st, e.guild_id), panel = eventPanel(e, await st.rsvps(e.id), { club, ping: null });
  if (i.message?.id !== e.message_id) ctx.waitUntil(refreshPost(env, st, e)); // answered from /matchday next or schedule: keep the channel post current too
  return h.reply({ ...panel, flags: panel.flags & IS_V2 }, 7);
}

// ---- autocomplete for timezone ----
export const zoneAutocomplete = (q) => zoneChoices(q);

// ---- reminder: runs every 10 minutes, tells everyone who is in or maybe when a match day is less than an hour away ----
export async function reminders(env, st) {
  for (const e of await st.dueReminders()) {
    await st.markReminded(e.id);
    if (!e.channel_id) continue;
    const ids = (await st.rsvps(e.id)).filter((r) => r.status !== 'no').map((r) => r.user_id).slice(0, 40);
    const mention = ids.map((u) => `<@${u}>`).join(' ');
    await postEvent(env, e.channel_id, { flags: IS_V2, components: [{ type: 17, accent_color: 0xb54cff, components: [{ type: 10, content: `⏰ **${e.title}** starts <t:${Math.floor(e.start / 1000)}:R>\n${mention || '_nobody has signed up yet_'}\nCheck in with \`/matchday checkin\`, see the lineup with \`/lineup\`.` }] }] }, { users: ids });
  }
}

// ---- round profile pictures: the picture is cut into a circle by the Actions job, uploaded here and kept as an application emoji ----
const avatarUrl = (uid, hash) => (/^d\d$/.test(hash) ? `https://cdn.discordapp.com/embed/avatars/${hash.slice(1)}.png` : `https://cdn.discordapp.com/avatars/${uid}/${hash}.png?size=128`);
export const avatarJob = (uid, hash) => (/^\d{5,25}$/.test(uid) && /^(a_)?[a-f0-9]{8,40}$|^d[0-5]$/.test(hash) ? { kind: 'avatar', ref: uid, key: `avatars/${uid}-${hash}.png`, data: { url: avatarUrl(uid, hash) } } : null);
// First time we see someone (or their picture changed): ask for a round version once.
export async function ensureAvatar(env, st, i, h) {
  const u = i.member?.user ?? i.user;
  if (!/^\d{5,25}$/.test(u?.id ?? '')) return;
  const hash = u.avatar ?? `d${Number((BigInt(u.id) >> 22n) % 6n)}`, row = await st.avatarOf(u.id);
  if (row && row.hash === hash && (row.emoji_id || Date.now() - row.at < 30 * 60_000)) return;
  await st.setAvatar(u.id, hash, row?.hash === hash ? row.emoji_id : row?.emoji_id ?? null, row?.name ?? null);
  await h.dispatch(env, { ref: '', kind: 'draw', q: '-', game: '1', extra: `avatar:${u.id}:${hash}` });
}
// The circle arrived: make it an emoji (replacing the old one), then refresh the sign-up posts that show this person.
export async function onAvatar(env, st, key, b64) {
  const m = key.match(/^avatars\/(\d+)-([a-z0-9_]+)\.png$/);
  if (!m) return false;
  const [, uid, hash] = m, row = await st.avatarOf(uid);
  if (!row || row.hash !== hash) return true; // an older picture: ignore
  const name = `av${uid.slice(-10)}${hash.replace(/[^a-z0-9]/g, '').slice(0, 8)}`;
  const res = await fetch(`${API}/applications/${env.DISCORD_APP_ID}/emojis`, { method: 'POST', headers: bot(env), body: JSON.stringify({ name, image: `data:image/png;base64,${b64}` }) }).catch(() => null);
  if (!res?.ok) { console.error(`avatar emoji ${res?.status}`); return false; }
  const emoji = await res.json().catch(() => ({}));
  await st.setAvatar(uid, hash, emoji.id, name);
  if (row.emoji_id && row.emoji_id !== emoji.id) await fetch(`${API}/applications/${env.DISCORD_APP_ID}/emojis/${row.emoji_id}`, { method: 'DELETE', headers: bot(env) }).catch(() => null);
  for (const e of await st.eventsOfUser(uid)) await refreshPost(env, st, e);
  return true;
}
