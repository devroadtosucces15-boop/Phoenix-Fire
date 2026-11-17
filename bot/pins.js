// PF-024 Item 11b – the pin tool. A manager right clicks a message → Apps → "Pin to bottom"; the bot posts a Phoenix "Pinned" panel with
// its text and then keeps it the NEWEST message in that channel: the 1-minute cron looks at the channel's last message and, when
// someone else has posted since, re-posts the panel and deletes the old copy (the Rush board's trick, bot/rushqueue.js). One pin per
// channel; a new pin replaces the old one; a pin ends with /unpin, its Unpin button, or after PIN_DAYS.
// No gateway, no Message Content intent: the text arrives resolved in the interaction; the cron only reads message IDs.
// Channels come from the Organization config purpose `pinned_posts` (pins work only in those channels; none set = it says so).
import { can, flagOn } from './roles.js';
import { message, notice, reply, header, text, footer, buttons } from './ui.js';
import { orgName, channelsFor } from './orgconfig.js';
import { discord } from './servertools.js';
import { appConfigured, appEnv } from './apps.js';
import { once, unclaim } from './once.js';

export const PIN_COMMANDS = new Set(['Pin to bottom', 'unpin']);
export const PIN_BUTTON = /^norex:pin:/;
export const PIN_DAYS = 30;
export const PIN_MAX_CHARS = 1800;
const DAY = 864e5;
// Buttons only work on messages the app that handles them posted: pin posts come from the tools app when it exists (the cron runs as core).
export const pinEnv = (env) => (appConfigured(env, 'tools') && env.BOT_APP !== 'tools' ? appEnv(env, 'tools') : env);

// The pinned text: the message as written (Discord renders its markdown), mentions never ping.
export function pinModel(msg) {
  if (!msg || msg.author?.bot) return null;
  const body = String(msg.content ?? '').trim();
  if (!body) return null;
  return { body: body.length > PIN_MAX_CHARS ? `${body.slice(0, PIN_MAX_CHARS - 1)}…` : body, author: msg.author?.global_name || msg.author?.username || null };
}
export const pinMessage = (env, row) => message({
  accent: 'red',
  blocks: [
    header({ eyebrow: 'Pinned', title: '📌 Pinned', size: 3 }),
    text(row.body),
    footer(`${orgName(env)} · pinned by ${row.by_name ?? 'a manager'}${row.source_author ? ` · from ${row.source_author}` : ''}`),
    buttons([{ label: 'Unpin', id: `norex:pin:off:${row.id}`, emoji: '📌' }]),
  ],
  mentions: { parse: [] },
});
const note = (title, body = '') => reply(notice(title, body));

async function removeCopy(env, row) {
  if (row.message_id) await discord(pinEnv(env), 'DELETE', `/channels/${row.channel_id}/messages/${row.message_id}`).catch(() => null);
}
async function endPin(env, row) {
  await env.DB.prepare('UPDATE bot_pins SET active = 0 WHERE id = ?').bind(row.id).run();
  await removeCopy(env, row);
}
const byOf = (i) => i.member?.nick || i.member?.user?.global_name || i.member?.user?.username || null;

export async function pinCommand(i, env, who, now = Date.now()) {
  if (!flagOn(env, who, 'pins') || !can(who, 'pins.manage')) return note('Managers only', 'The pin tool is for managers, and it is not switched on for everyone yet.');
  if (!env.DB) return note('The member database is not connected');
  const channel = String(i.channel_id ?? i.channel?.id ?? '');
  const allowed = await channelsFor(env, 'pinned_posts').catch(() => []);
  if (!allowed.length) return note('No pin channel is set', 'A manager sets the channels for pinned posts in the Organization config (purpose: pinned_posts).');
  if (!allowed.includes(channel)) return note('Not a pin channel', `Pins work in ${allowed.map((c) => `<#${c}>`).join(', ')}.`);
  const old = await env.DB.prepare('SELECT * FROM bot_pins WHERE channel_id = ? AND active = 1').bind(channel).first();
  if (i.data.name === 'unpin') {
    if (!old) return note('Nothing is pinned here');
    await endPin(env, old);
    return note('Unpinned', 'The pinned post is gone from this channel.');
  }
  const model = pinModel(i.data.resolved?.messages?.[i.data.target_id]);
  if (!model) return note('Nothing to pin', 'I can only pin a message with text, written by a person.');
  if (old) await endPin(env, old);
  const row = { channel_id: channel, body: model.body, source_author: model.author, by_id: i.member?.user?.id ?? i.user?.id ?? '', by_name: byOf(i) };
  const res = await env.DB.prepare('INSERT INTO bot_pins (channel_id, body, source_author, by_id, by_name, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(channel, row.body, row.source_author, row.by_id, row.by_name, now, now + PIN_DAYS * DAY).run();
  row.id = res.meta?.last_row_id;
  try {
    const m = await discord(pinEnv(env), 'POST', `/channels/${channel}/messages`, pinMessage(env, row));
    await env.DB.prepare('UPDATE bot_pins SET message_id = ?, posted_at = ? WHERE id = ?').bind(m?.id ?? null, now, row.id).run();
  } catch (e) {
    await env.DB.prepare('UPDATE bot_pins SET active = 0 WHERE id = ?').bind(row.id).run();
    return note('I could not post the pin', e.message === 'no-access' ? 'Give the bot View Channel, Send Messages and Manage Messages in this channel.' : e.message);
  }
  return note('Pinned', `It stays the newest message here until you /unpin it or ${PIN_DAYS} days pass${old ? ' (the previous pin was replaced)' : ''}.`);
}

export async function pinButton(i, env, who) {
  if (!can(who, 'pins.manage')) return note('Managers only', 'Ask a manager to unpin it.');
  const id = Number(String(i.data?.custom_id ?? '').split(':')[3]);
  const row = env.DB ? await env.DB.prepare('SELECT * FROM bot_pins WHERE id = ? AND active = 1').bind(id).first() : null;
  if (!row) return note('Already unpinned');
  await endPin(env, row);
  return note('Unpinned', 'The pinned post is gone from this channel.');
}

// The 1-minute cron. For each active pin: expired → end it; someone posted after it → post it again at the bottom, then delete the old copy.
// `once` claims (pin id + the message that pushed it up) so two runs or two apps cannot both re-post. → { checked, reposted, ended }
export async function pinTick(env, now = Date.now()) {
  const out = { checked: 0, reposted: 0, ended: 0 };
  if (!env.DB || !env.DISCORD_BOT_TOKEN) return out;
  const rows = (await env.DB.prepare('SELECT * FROM bot_pins WHERE active = 1 ORDER BY id LIMIT 25').all()).results ?? [];
  const e = pinEnv(env);
  for (const row of rows) {
    out.checked++;
    if (row.expires_at && now >= row.expires_at) { await endPin(env, row); out.ended++; continue; }
    let latest;
    try { latest = (await discord(e, 'GET', `/channels/${row.channel_id}/messages?limit=1`))?.[0]; }
    catch (err) { if (err.status === 404) { await endPin(env, row); out.ended++; } else console.log('pin check failed', row.channel_id, err.message); continue; }
    if (row.message_id && (!latest || latest.id === row.message_id)) continue;
    const claim = `pin:${row.id}:${latest?.id ?? 'none'}`;
    if (!(await once(env, claim))) continue;
    try {
      const m = await discord(e, 'POST', `/channels/${row.channel_id}/messages`, pinMessage(env, row));
      await env.DB.prepare('UPDATE bot_pins SET message_id = ?, posted_at = ? WHERE id = ?').bind(m?.id ?? null, now, row.id).run();
      await removeCopy(env, row);
      out.reposted++;
    } catch (err) { await unclaim(env, claim); console.log('pin repost failed', row.channel_id, err.message); }
  }
  return out;
}
