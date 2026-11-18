// PF-024 Item 17 – the absence notice, one command in the matchday app (the tools app is at the 25 help-page limit): /absence notice | mine | cancel | list.
//   notice  a member says they will be away or play less (kind, optional from / until dates, an optional free-text reason). It posts ONE card to the managers'
//           channel (Organization config purpose `absence_notices`) with an Acknowledge button. No channel set = nothing is posted and the member is told.
//   mine    the member's own open notices (no reason shown back, no public post).   cancel  withdraws one (the card is edited, not deleted).
//   list    managers: who is away now, with status.
// PRIVACY: the free-text reason is private to managers. It is stored in D1, shown only in the manager card (a managers-only channel) and by the manager API /api/intel/absences,
// and is never put in a public post, a log line, a DM or a member view. The member's confirmation does not repeat it.
// Expiry: a notice ends on its until-date (end of that day, UTC), else 30 days after it was filed; the 10-minute cron edits expired cards to say so.
// Who may acknowledge: the manager level (`absence.ack`, the Control Center matrix level). Flag `absence` (owner first). Channels never hardcoded.
import { can, flagOn } from './roles.js';
import { message, notice, reply, header, text, sep, footer, buttons, cards, bannerUrl } from './ui.js';
import { orgName, channelFor } from './orgconfig.js';
import { discord } from './servertools.js';
import { appConfigured, appEnv } from './apps.js';

export const ABSENCE_COMMANDS = new Set(['absence']);
export const ABSENCE_ID = /^norex:abs:/;
export const ABSENCE_FLAG = 'absence';
export const OPEN_DAYS = 30;
const DAY = 864e5;
export const KINDS = { away: ['🌴', 'Away'], less: ['🕒', 'Playing less'], matches: ['📅', 'Cannot make matches'], other: ['💬', 'Other'] };
const clean = (s, n) => String(s ?? '').replace(/<(@[!&]?|#)\d+>|@(everyone|here)/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const note = (title, body = '') => reply(notice(title, body));
// buttons only work on messages the app that handles them posted: the cron runs as core, the card must come from the matchday app, where /absence lives
export const absenceEnv = (env) => (appConfigured(env, 'matchday') && env.BOT_APP !== 'matchday' ? appEnv(env, 'matchday') : env);

/** "2026-12-24", "24/12" or "24/12/2026" → "YYYY-MM-DD" (a day already passed this year rolls to next year only for the end date), or null */
export function parseDay(s, now = Date.now()) {
  const v = String(s ?? '').trim(); if (!v) return null;
  let y, m, d, mt;
  if ((mt = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+mt[1], +mt[2], +mt[3]];
  else if ((mt = v.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/))) { d = +mt[1]; m = +mt[2]; y = mt[3] ? (+mt[3] < 100 ? 2000 + +mt[3] : +mt[3]) : new Date(now).getUTCFullYear(); }
  else return null;
  const t = Date.UTC(y, m - 1, d);
  if (m < 1 || m > 12 || d < 1 || new Date(t).getUTCMonth() !== m - 1) return null;
  return new Date(t).toISOString().slice(0, 10);
}
export const dayEnd = (day) => Date.parse(`${day}T00:00:00Z`) + DAY - 1;
/** open | acknowledged | cancelled | expired (an open or acknowledged notice past its end date) */
export const statusOf = (row, now = Date.now()) => (row.status === 'cancelled' ? 'cancelled' : now >= row.expires_at ? 'expired' : row.status);
export const isActive = (row, now = Date.now()) => ['open', 'acknowledged'].includes(statusOf(row, now)) && (!row.from_day || now >= Date.parse(`${row.from_day}T00:00:00Z`));
const span = (r) => (r.from_day && r.until_day ? `${r.from_day} → ${r.until_day}` : r.until_day ? `until ${r.until_day}` : r.from_day ? `from ${r.from_day}` : 'from now, open ended');
const STATUS = { open: '🟠 Waiting for a manager', acknowledged: '✅ Acknowledged', cancelled: '⚪ Withdrawn by the member', expired: '⌛ Ended' };

/** the manager card. `withReason` is true only for the managers' channel card and the manager list: never for anything a member or the public can see. */
export function absenceMessage(env, row, now = Date.now()) {
  const st = statusOf(row, now), [icon, kindName] = KINDS[row.kind] ?? KINDS.other, live = st === 'open';
  const ack = row.ack_name ? ` by ${clean(row.ack_name, 40)}` : '';
  const rows = [['Who', `<@${row.user_id}>`], ['Type', `${icon} ${kindName}`], ['When', span(row)], ['Status', `${STATUS[st]}${st === 'acknowledged' ? ack : ''}`], row.reason ? ['Reason (managers only)', clean(row.reason, 300)] : null].filter(Boolean);
  return message({
    accent: st === 'acknowledged' ? 'win' : st === 'open' ? 'red' : 'steel',
    mentions: { parse: [] }, // no pings: the card sits in the managers' channel for them to read
    blocks: [cards(bannerUrl(env, 'absence')), header({ eyebrow: `${orgName(env)} · Absence notice`, title: clean(row.user_name, 40) || 'A player', sub: `${icon} ${kindName}`, size: 3 }),
      text(rows.map(([k, v]) => `**${k}**\n${v}`).join('\n\n')), sep(),
      live ? buttons([{ label: 'Acknowledge', id: `norex:abs:ack:${row.id}`, style: 'ok', emoji: '✅' }]) : null,
      footer(`${orgName(env)} · the reason is private to managers. Keep this channel managers-only.`)].filter(Boolean),
  });
}
/** what the member sees about their own notices: never the reason */
export const memberLine = (r, now = Date.now()) => `${KINDS[r.kind]?.[0] ?? '💬'} #${r.id} · ${span(r)} · ${STATUS[statusOf(r, now)]}`;

const byOf = (i) => i.member?.nick || i.member?.user?.global_name || i.member?.user?.username || i.user?.username || 'Member';
const userOf = (i) => i.member?.user?.id ?? i.user?.id ?? '';

async function postCard(env, row, now) {
  const channel = await channelFor(env, 'absence_notices');
  if (!channel) return { skipped: 'no-channel' };
  try {
    const m = await discord(absenceEnv(env), 'POST', `/channels/${channel}/messages`, absenceMessage(env, row, now));
    await env.DB.prepare('UPDATE absences SET channel_id = ?, message_id = ? WHERE id = ?').bind(channel, m?.id ?? null, row.id).run();
    return { posted: true };
  } catch (e) { return { skipped: e.message === 'no-access' ? 'no-access' : 'error' }; } // never log the notice: the reason is private
}
async function refreshCard(env, row, now) {
  if (!row.channel_id || !row.message_id) return;
  const m = absenceMessage(env, row, now);
  await discord(absenceEnv(env), 'PATCH', `/channels/${row.channel_id}/messages/${row.message_id}`, { flags: m.flags, components: m.components, allowed_mentions: m.allowed_mentions }).catch(() => null);
}

async function fileNotice(i, env, who, o, now) {
  const uid = userOf(i); if (!uid) return note('I could not tell who you are');
  const from = o.from ? parseDay(o.from, now) : null, until = o.until ? parseDay(o.until, now) : null;
  if ((o.from && !from) || (o.until && !until)) return note('I could not read that date', 'Use 2026-12-24 or 24/12 (day/month).');
  if (from && until && until < from) return note('The end is before the start', 'Check the two dates.');
  if (until && dayEnd(until) < now) return note('That date has passed', 'Give an end date that is today or later.');
  const channel = await channelFor(env, 'absence_notices');
  if (!channel) return note('No absence channel is set', 'A manager sets the channel for absence notices in the Organization config (purpose: absence_notices), then you can file it.');
  const kind = KINDS[o.type] ? o.type : 'away', reason = clean(o.reason, 300);
  const expires = until ? dayEnd(until) : now + OPEN_DAYS * DAY;
  const res = await env.DB.prepare('INSERT INTO absences (user_id, user_name, kind, from_day, until_day, reason, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(uid, clean(byOf(i), 40), kind, from, until, reason, now, expires).run();
  const row = await env.DB.prepare('SELECT * FROM absences WHERE id = ?').bind(res.meta?.last_row_id).first();
  const r = await postCard(env, row, now);
  if (r.skipped) { await env.DB.prepare("UPDATE absences SET status = 'cancelled' WHERE id = ?").bind(row.id).run(); return note('I could not tell the managers', r.skipped === 'no-access' ? 'The bot cannot post in the managers channel: a manager must give it View Channel and Send Messages there.' : 'Try again in a minute.'); }
  return note('Managers have been told', `${KINDS[kind][0]} ${KINDS[kind][1]} · ${span(row)}.${reason ? ' Your reason went to managers only.' : ''} /absence cancel withdraws it.`);
}

async function mine(env, uid, now) {
  const rows = (await env.DB.prepare("SELECT * FROM absences WHERE user_id = ? AND status != 'cancelled' ORDER BY id DESC LIMIT 10").bind(uid).all()).results ?? [];
  return note('Your absence notices', rows.length ? rows.map((r) => memberLine(r, now)).join('\n') : 'None filed.');
}
async function cancel(env, uid, id, now) {
  const row = id ? await env.DB.prepare('SELECT * FROM absences WHERE id = ? AND user_id = ?').bind(id, uid).first()
    : await env.DB.prepare("SELECT * FROM absences WHERE user_id = ? AND status != 'cancelled' AND expires_at > ? ORDER BY id DESC LIMIT 1").bind(uid, now).first();
  if (!row || row.status === 'cancelled') return note('Nothing to withdraw', id ? 'No open notice with that number is yours.' : 'You have no open notice.');
  await env.DB.prepare("UPDATE absences SET status = 'cancelled' WHERE id = ?").bind(row.id).run();
  await refreshCard(env, { ...row, status: 'cancelled' }, now);
  return note('Withdrawn', `Notice #${row.id} is cancelled and the managers' card says so.`);
}
async function listFor(env, now) {
  const rows = (await env.DB.prepare("SELECT * FROM absences WHERE status != 'cancelled' AND expires_at > ? ORDER BY id DESC LIMIT 25").bind(now).all()).results ?? [];
  return rows;
}

export async function absenceCommand(i, env, who, now = Date.now()) {
  if (!flagOn(env, who, ABSENCE_FLAG)) return note('Not switched on yet', 'Absence notices are being tested.');
  if (!env.DB) return note('The member database is not connected');
  const sub = i.data?.options?.[0], o = Object.fromEntries((sub?.options ?? []).map((x) => [x.name, x.value]));
  if (sub?.name === 'notice') return fileNotice(i, env, who, o, now);
  if (sub?.name === 'mine') return mine(env, userOf(i), now);
  if (sub?.name === 'cancel') return cancel(env, userOf(i), Number(o.number) || 0, now);
  if (sub?.name === 'list') {
    if (!can(who, 'absence.ack')) return note('Managers only');
    const rows = await listFor(env, now);
    return reply(message({ accent: 'red', ephemeral: true, blocks: [header({ eyebrow: `${orgName(env)} · Absences`, title: 'Who is away', size: 3 }), text(rows.length ? rows.map((r) => `${memberLine(r, now)} · <@${r.user_id}>`).join('\n') : 'Nobody has an open notice.'), footer('Reasons are on each notice card in the managers channel.')] }));
  }
  return note('Pick notice, mine, cancel or list');
}

export async function absenceButton(i, env, who, now = Date.now()) {
  if (!can(who, 'absence.ack')) return note('Managers only', 'A manager acknowledges absence notices.');
  const id = Number(String(i.data?.custom_id ?? '').split(':')[3]);
  const row = env.DB ? await env.DB.prepare('SELECT * FROM absences WHERE id = ?').bind(id).first() : null;
  if (!row) return note('That notice is gone');
  let cur = row;
  if (row.status === 'open' && statusOf(row, now) === 'open') {
    await env.DB.prepare("UPDATE absences SET status = 'acknowledged', ack_by = ?, ack_name = ?, ack_at = ? WHERE id = ? AND status = 'open'").bind(userOf(i), clean(byOf(i), 40), now, id).run();
    cur = await env.DB.prepare('SELECT * FROM absences WHERE id = ?').bind(id).first();
  }
  const m = absenceMessage(env, cur, now);
  return { type: 7, data: { flags: m.flags, components: m.components, allowed_mentions: m.allowed_mentions } };
}

/** the 10-minute cron: edit cards whose notice has ended, once. → { ended } */
export async function absenceTick(env, now = Date.now()) {
  const out = { ended: 0 };
  if (!env.DB || !env.DISCORD_BOT_TOKEN) return out;
  const rows = (await env.DB.prepare("SELECT * FROM absences WHERE status IN ('open', 'acknowledged') AND expires_at <= ? LIMIT 25").bind(now).all()).results ?? [];
  for (const r of rows) {
    await env.DB.prepare("UPDATE absences SET status = 'expired' WHERE id = ? AND status IN ('open', 'acknowledged')").bind(r.id).run().catch(() => null);
    await refreshCard(env, { ...r, status: 'expired' }, now);
    out.ended++;
  }
  return out;
}

/** GET /api/intel/absences (managers; listed in bot/ccpermissions.js): current notices WITH the reason, for the Control Center and the lineup/Dugout views */
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
export async function absenceRoute(p, method, me, env, now = Date.now()) {
  if (p !== '/api/intel/absences') return null;
  if (method !== 'GET') return json({ error: 'Not found' }, 404);
  if (!flagOn(env, me, ABSENCE_FLAG)) return json({ error: 'Not available yet.' }, 404);
  if (!can(me, 'absence.ack')) return json({ error: 'Managers only.' }, 403);
  const rows = env.DB ? await listFor(env, now) : [];
  return json({ absences: rows.map((r) => ({ id: r.id, userId: r.user_id, name: r.user_name, kind: r.kind, from: r.from_day, until: r.until_day, reason: r.reason, status: statusOf(r, now), active: isActive(r, now), ackBy: r.ack_name, createdAt: r.created_at, expiresAt: r.expires_at })) });
}
