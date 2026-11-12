// MB5 – Rush LFG (PLANNING/BOT-SPLIT.md "Rush bot, later"). /lfg now posts "available for Rush" to the channel, tagging the
// Rush role (never @everyone), with "I'm in" / "later" buttons. It expires on its own (default 60 min, max 180), each player
// has a cooldown, moderation-muted members cannot post, and members can mute the alerts in the notification settings (type
// `lfg`). Flag `rushLfg` (default owner). Dark until the Phoenix Rush app is configured (bot/apps.js HELD).
import { can, flagOn, muted } from './roles.js';
import { getToolSettings } from './servertools.js';
import { message, header, text, facts, footer, buttons, reply, pictureNote, picture, sep } from './ui.js';

export const LFG_DEFAULT_MIN = 60, LFG_MAX_MIN = 180, LFG_COOLDOWN_MIN = 10;
export const LFG_ID = /^pf:lfg:\d+:(in|later)$/;
const MIN = 60e3;
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>@`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// Short private replies carry a drawn picture: the shared "not available" / "check and try again" ones, or this command's own (scripts/cards.mjs SLASH).
const say = (env, key, title, body, accent) => reply(pictureNote(env, key, title, body, accent ? { accent } : {}));
const rows = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results);

// What a post looks like. `answers` = [{ user_id, name, answer }]. Only the role (if any) may be pinged: never everyone or users.
export function lfgMessage(post, answers = [], { roleId = '', now = Date.now(), env = null } = {}) {
  const open = post.status === 'open' && post.expires > now;
  const names = (a) => answers.filter((x) => x.answer === a).map((x) => x.name);
  const list = (a) => (a.length ? a.slice(0, 20).join(', ') + (a.length > 20 ? ' …' : '') : '–');
  const unix = Math.floor(post.expires / 1000);
  return message({
    accent: open ? 'red' : 'steel', ping: open && roleId ? `<@&${roleId}>` : null, mentions: open && roleId ? { parse: [], roles: [roleId] } : { parse: [] },
    blocks: [
      picture(env, 'cmd-lfg-post'),
      header({ eyebrow: 'PHOENIX FIRE · Rush', title: `⚡ ${post.name} is available for Rush`, sub: open ? `Until <t:${unix}:t> · <t:${unix}:R>` : 'This call is over' }),
      post.note ? text(`📝 ${post.note}`) : null,
      sep(),
      facts([['✅ In', list(names('in'))], ['⏰ Later', list(names('later'))]]),
      footer(open ? 'Tap a button to answer' : 'Expired or taken down'),
      open ? buttons([{ label: 'I’m in', emoji: '✅', style: 'ok', id: `pf:lfg:${post.id}:in` }, { label: 'Later', emoji: '⏰', style: 'grey', id: `pf:lfg:${post.id}:later` }]) : null,
    ].filter(Boolean),
  });
}

// Marks posts past their time as expired (cron). Returns how many.
export async function lfgExpire(env, now = Date.now()) {
  const r = await env.DB.prepare("UPDATE rush_lfg SET status = 'expired' WHERE status = 'open' AND expires <= ?").bind(now).run();
  return r.meta?.changes ?? r.changes ?? 0;
}

// `sub` = now | cancel | list; o = its options by name; me/who resolved by the caller. `now` is injectable for tests.
export async function lfgCommand(i, env, me, who, sub, o = {}, now = Date.now()) {
  if (!env.DB) return say(env, 'cmd-problem', 'The member database is not connected', '');
  if (!flagOn(env, who, 'rushLfg')) return say(env, 'cmd-locked', 'Rush LFG is not switched on for you yet', 'Ask a manager.');
  if (!can(who, 'events.rsvp')) return say(env, 'cmd-locked', 'Members only', 'Join the Phoenix Fire server and link your account first.');
  await lfgExpire(env, now);
  if (sub === 'list') {
    const open = await rows(env, "SELECT * FROM rush_lfg WHERE status = 'open' AND expires > ? ORDER BY at", now);
    if (!open.length) return say(env, 'cmd-empty', 'Nobody is available right now', 'Post with /lfg now and the Rush role is tagged.');
    return say(env, 'cmd-lfg-list', `⚡ Available for Rush (${open.length})`, open.map((p) => `**${p.name}** · until <t:${Math.floor(p.expires / 1000)}:t>${p.note ? ` · ${p.note}` : ''}`).join('\n'));
  }
  if (sub === 'cancel') {
    const r = await env.DB.prepare("UPDATE rush_lfg SET status = 'cancelled' WHERE user_id = ? AND status = 'open'").bind(me.u).run();
    return (r.meta?.changes ?? r.changes ?? 0) ? say(env, 'cmd-lfg-off', 'Taken down', 'Your Rush availability is off.', 'win') : say(env, 'cmd-empty', 'Nothing to take down', 'You have no open Rush call.');
  }
  if (sub !== 'now') return say(env, 'cmd-problem', 'Unknown /lfg command', 'Use now, cancel or list.');
  if (await muted(env, me.u)) return say(env, 'cmd-locked', 'You are muted', 'A manager has muted you; you cannot post calls until it ends.');
  const last = await env.DB.prepare('SELECT at FROM rush_lfg WHERE user_id = ? ORDER BY at DESC LIMIT 1').bind(me.u).first();
  if (last && now - last.at < LFG_COOLDOWN_MIN * MIN) {
    const free = Math.floor((last.at + LFG_COOLDOWN_MIN * MIN) / 1000);
    return say(env, 'cmd-problem', 'Slow down', `You can post again <t:${free}:R>. Your last call is still up – use /lfg cancel to take it down.`);
  }
  const minutes = Math.min(LFG_MAX_MIN, Math.max(15, Math.round(Number(o.minutes) || LFG_DEFAULT_MIN)));
  await env.DB.prepare("UPDATE rush_lfg SET status = 'cancelled' WHERE user_id = ? AND status = 'open'").bind(me.u).run();
  const post = { user_id: me.u, name: clean(me.n, 40) || 'A member', avatar: me.a ?? null, note: clean(o.note, 80), channel: i.channel_id ?? null, at: now, expires: now + minutes * MIN, status: 'open' };
  const res = await env.DB.prepare('INSERT INTO rush_lfg (user_id, name, avatar, note, channel, at, expires, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(post.user_id, post.name, post.avatar, post.note, post.channel, post.at, post.expires, post.status).run();
  post.id = res.meta?.last_row_id ?? res.lastRowId;
  const roleId = String((await getToolSettings(env)).pingRoles?.rush ?? '').replace(/\D/g, '');
  return reply(lfgMessage(post, [], { roleId, now, env }));
}

// "I'm in" / "Later" on a post (component interaction pf:lfg:<id>:<answer>): records it and refreshes the post for everyone.
export async function lfgButton(i, env, me, who, now = Date.now()) {
  if (!env.DB) return say(env, 'cmd-problem', 'The member database is not connected', '');
  if (!flagOn(env, who, 'rushLfg') || !can(who, 'events.rsvp')) return say(env, 'cmd-locked', 'Rush LFG is not switched on for you yet', '');
  const [, , id, answer] = String(i.data?.custom_id).split(':');
  const post = await env.DB.prepare('SELECT * FROM rush_lfg WHERE id = ?').bind(Number(id)).first();
  if (!post) return say(env, 'cmd-empty', 'That call is gone', '');
  if (post.status !== 'open' || post.expires <= now) return say(env, 'cmd-empty', 'That call is over', 'Post your own with /lfg now.');
  await env.DB.prepare('INSERT INTO rush_lfg_answers (lfg_id, user_id, name, answer, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (lfg_id, user_id) DO UPDATE SET answer = excluded.answer, name = excluded.name, at = excluded.at')
    .bind(post.id, me.u, clean(me.n, 40), answer === 'in' ? 'in' : 'later', now).run();
  const answers = await rows(env, 'SELECT user_id, name, answer FROM rush_lfg_answers WHERE lfg_id = ? ORDER BY at', post.id);
  return { type: 7, data: lfgMessage(post, answers, { roleId: '', now, env }) }; // a refresh never pings again
}
