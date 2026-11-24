// Match-day commands for the Worker: /host, /matchday (create · checkin · next · schedule · who · cancel), /lineup, the ✅ ❔ ❌ buttons,
// the position picker and the one-hour reminder. Storage and wording live in core/store.js and core/matchday.js.
import { notice, IS_V2, EPHEMERAL } from '../core/ui.js';
import { clubView } from '../core/data.js';
import { parseWhen, validZone, zonedToUtc, zoneChoices } from '../core/when.js';
import { eventPanel, schedulePanel, createdPanel, lineupPanel, lineupOf, lineupKey, eventTitle, KINDS, POSITIONS } from '../core/matchday.js';

const API = 'https://discord.com/api/v10';
const MANAGE_OR_ADMIN = 0x28n; // Manage Server or Administrator
export const MATCHDAY_COMMANDS = new Set(['host', 'matchday', 'lineup']);
const ephemeral = (d) => ({ ...d, flags: (d.flags & IS_V2) | EPHEMERAL });
const say = (h, title, body, o = {}) => h.reply(notice(title, body, { ephemeral: true, ...o }));
const isManager = (i) => (BigInt(i.member?.permissions ?? 0) & MANAGE_OR_ADMIN) !== 0n;
const who = (i) => { const u = i.member?.user ?? i.user ?? {}; return { id: u.id, name: i.member?.nick ?? u.global_name ?? u.username ?? 'Player' }; };
const mainClub = async (st, g) => { const r = (await st.trackedFor(g))[0]; return r ? clubView(r) : null; };

// ---- Discord posts that carry mentions (the rest of the bot never pings) ----
const bot = (env) => ({ 'Content-Type': 'application/json', Authorization: `Bot ${env.DISCORD_TOKEN}` });
async function postEvent(env, channel, data, mentions) {
  return fetch(`${API}/channels/${channel}/messages`, { method: 'POST', headers: bot(env), body: JSON.stringify({ flags: data.flags & IS_V2, components: data.components, allowed_mentions: mentions }) });
}
const editPost = (env, e, data) => (e.channel_id && e.message_id
  ? fetch(`${API}/channels/${e.channel_id}/messages/${e.message_id}`, { method: 'PATCH', headers: bot(env), body: JSON.stringify({ flags: data.flags & IS_V2, components: data.components, allowed_mentions: { parse: [] } }) }).catch(() => null) : null);
async function refreshPost(env, st, e) { return editPost(env, e, eventPanel(e, await st.rsvps(e.id), { club: await mainClub(st, e.guild_id) })); }

// ---- create ----
const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
async function create(env, ctx, st, i, h, kind) {
  if (!isManager(i)) return say(h, 'Managers only', 'You need the Manage Server permission to schedule a match day.');
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

async function nextOne(st, i) { return (await st.upcoming(i.guild_id, 1))[0] ?? null; }

export async function matchdayCommand(env, ctx, st, i, h) {
  const name = i.data.name, sub = i.data.options?.[0]?.name;
  if (name === 'host') return create(env, ctx, st, i, h, h.opt(i, 'kind') === 'friendly' ? 'friendly' : 'session');
  if (name === 'lineup') return lineup(env, ctx, st, i, h);
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
    if (!isManager(i)) return say(h, 'Managers only', 'You need the Manage Server permission to cancel a match day.');
    await st.cancelEvent(e.id);
    if (e.channel_id && e.message_id) ctx.waitUntil(fetch(`${API}/channels/${e.channel_id}/messages/${e.message_id}`, { method: 'DELETE', headers: bot(env) }).catch(() => null));
    return say(h, `Cancelled ${e.title}`, `It was <t:${Math.floor(e.start / 1000)}:F>. Its post is removed.`, { accent: 'loss' });
  }
  if (sub === 'checkin') {
    const opens = e.start - 3600_000;
    if (Date.now() < opens) return say(h, 'Check-in is not open yet', `It opens <t:${Math.floor(opens / 1000)}:R>, an hour before kick-off.`);
    const me = who(i);
    await st.checkIn(e.id, me.id, me.name);
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
  if (kind === 'ev' && ['yes', 'maybe', 'no'].includes(value)) await st.answer(e.id, me.id, me.name, value);
  else if (kind === 'evp' && POSITIONS.includes(i.data.values?.[0])) await st.setPos(e.id, me.id, me.name, i.data.values[0]);
  const club = await mainClub(st, e.guild_id), panel = eventPanel(e, await st.rsvps(e.id), { club, ping: null });
  if (i.message?.id !== e.message_id) ctx.waitUntil(refreshPost(env, st, e)); // answered from /matchday next or schedule: keep the channel post current too
  return h.reply({ ...panel, flags: panel.flags & IS_V2 }, 7);
}

// ---- /lineup ----
async function lineup(env, ctx, st, i, h) {
  const e = await nextOne(st, i);
  if (!e) return say(h, 'Nothing scheduled yet', 'Managers add a match day with `/matchday create`.');
  const rs = await st.rsvps(e.id), L = lineupOf(rs), club = await mainClub(st, i.guild_id);
  if (!L.placed.length) return h.reply(lineupPanel(e, rs, null, club));
  const key = lineupKey(e, L), url = `${String(env.PUBLIC_URL).replace(/\/$/, '')}/c/${key}`;
  if (await st.hasBlob(key)) return h.reply(lineupPanel(e, rs, url, club));
  const ref = crypto.randomUUID().slice(0, 12);
  await st.prunePending();
  await st.addPending({ ref, token: i.token, guild: i.guild_id, channel: i.channel_id, user: who(i).id, kind: 'lineup', game: 1 });
  await st.setPendingMatch(ref, '0', e.id, 0);
  ctx.waitUntil((async () => {
    if (!(await h.dispatch(env, { ref, kind: 'draw', q: '-', game: '1', extra: `lineup:${e.id}` }))) { await st.delPending(ref); await h.edit(env, i.token, lineupPanel(e, rs, null, club)); }
  })());
  return h.json({ type: 5 });
}
// The job asks for the picture's data; /done then builds the final reply.
export async function lineupJob(st, eventId) {
  const e = await st.getEvent(eventId);
  if (!e) return null;
  const L = lineupOf(await st.rsvps(e.id)), club = await mainClub(st, e.guild_id);
  return { kind: 'lineup', ref: '', key: lineupKey(e, L), data: { L: { ...L, title: e.title }, club: { name: club?.name ?? 'Match day' } } };
}
export async function lineupDone(env, st, p, h) {
  const e = await st.getEvent(p.match_id);
  if (!e) return h.edit(env, p.token, notice('That match day is gone'));
  const rs = await st.rsvps(e.id), L = lineupOf(rs), club = await mainClub(st, e.guild_id);
  return h.edit(env, p.token, lineupPanel(e, rs, `${String(env.PUBLIC_URL).replace(/\/$/, '')}/c/${lineupKey(e, L)}`, club));
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
    await postEvent(env, e.channel_id, { flags: IS_V2, components: [{ type: 17, accent_color: 0x4aa8ff, components: [{ type: 10, content: `⏰ **${e.title}** starts <t:${Math.floor(e.start / 1000)}:R>\n${mention || '_nobody has signed up yet_'}\nCheck in with \`/matchday checkin\`, see the lineup with \`/lineup\`.` }] }] }, { users: ids });
  }
}
