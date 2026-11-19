// PF-028 – the live "Available for Rush" board. ONE message per board channel (Organization purpose `rush_lfg`, set with /lfg setup or on the website) that
// lists everyone who is available right now and carries the buttons. It is the only place availability is shown and answered: /lfg now and /lfg cancel
// work only while a board exists. The bot keeps it the newest message in its channel 24/7 (1-minute cron, bot/lfg.js lfgTick) and deletes the old copy
// each time it is sent again. Availability rows are rush_lfg (one open row per member, `msg_id` stays NULL); the per-post messages of PF-027 are only
// still served for posts that were made before the board existed.
// Channel and ping role come from the Organization config, never from code. KV `lfg:board:<channel>` = { id, at } of the board message.
import { channelsFor, pingRoleFor, orgName } from './orgconfig.js';
import { RUSH_POSITIONS, ANY, cleanPositions, posLabel } from './rushmatch.js';
import { rushEnv, postAll, failureText } from './rushqueue.js';
import { discord } from './servertools.js';
import { kvOf } from './kv.js';
import { message, header, text, footer, buttons, picture, sep } from './ui.js';

export const BOARD_KEY = 'lfg:board:', BOARD_GAP_MS = 1500, BOARD_LIST_MAX = 15, MAX_POSITIONS = 4;
const rows = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results ?? []);

export const posText = (post) => cleanPositions(post.positions, MAX_POSITIONS).map(posLabel).join(' / ');
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>@`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** the board: `posts` = rush_lfg rows (any status, only open and unexpired ones are listed). A role ping sits above it only when `roleId` is given. */
export function boardMessage(posts, { now = Date.now(), roleId = '', env = null, org = 'Phoenix Fire' } = {}) {
  const live = posts.filter((p) => p.status === 'open' && p.expires > now).sort((a, b) => a.at - b.at);
  const lines = live.slice(0, BOARD_LIST_MAX).map((p) => `**${clean(p.name, 40)}** · ${posText(p)} · until <t:${Math.floor(p.expires / 1000)}:t>${p.note ? ` · ${clean(p.note, 80)}` : ''}`);
  if (live.length > BOARD_LIST_MAX) lines.push(`…and ${live.length - BOARD_LIST_MAX} more`);
  return message({
    accent: live.length ? 'red' : 'steel', ping: roleId ? `<@&${roleId}>` : null, mentions: roleId ? { parse: [], roles: [String(roleId)] } : { parse: [] },
    blocks: [
      picture(env, 'cmd-lfg-post'),
      header({ eyebrow: `${org} · Rush`, title: live.length ? `⚡ Available for Rush (${live.length})` : '⚡ Nobody is available yet', sub: live.length ? 'Tap I’m in, pick your position and you are on the list' : 'Be the first: tap I’m in and pick your position' }),
      sep(),
      text(lines.length ? lines.join('\n') : 'The list is empty. Calls end by themselves; **+1 hour** keeps yours up.'),
      footer('Make a lobby asks the people above by DM · Alert me sends you a DM when a lobby needs your position'),
      buttons([
        { label: 'I’m in', emoji: '✅', style: 'ok', id: 'pf:lfg:board:in' }, { label: 'Make a lobby', emoji: '🎮', style: 'brand', id: 'pf:lfg:board:lobby' },
        { label: '+1 hour', emoji: '⏱️', id: 'pf:lfg:board:plus' }, { label: 'Take me off', emoji: '✋', id: 'pf:lfg:board:off' }, { label: 'Alert me', emoji: '🔔', id: 'pf:lfg:alert' },
      ]),
    ].filter(Boolean),
  });
}

/** the position dropdown (private): pick one or several; `minutes` rides in the id so the choice needs no stored state. `defaults` = what they have now. */
export function positionPicker(defaults = [], minutes = 30, org = 'Phoenix Fire') {
  const have = new Set(cleanPositions(defaults, MAX_POSITIONS));
  const options = [...Object.entries(RUSH_POSITIONS), [ANY, 'Any position']].map(([value, label]) => ({ label, value, default: have.has(value) && defaults.length > 0 }));
  return message({ accent: 'steel', ephemeral: true, mentions: { parse: [] }, blocks: [
    header({ eyebrow: `${org} · Rush`, title: 'Which position do you want?', sub: 'Pick one or several. Nothing here changes your profile.' }),
    { type: 1, components: [{ type: 3, custom_id: `pf:lfg:pos:${minutes}`, placeholder: 'Pick your position(s)', min_values: 1, max_values: options.length, options }] },
  ] });
}

/** Posts the board again at the bottom (delete the old copy) or edits it where it is. Returns { channels, posted, edited, failures }; never throws.
 *  A role ping only goes with a NEW post (`ping`). When the board is already the newest message it is edited in place unless it must carry a ping or `force`. */
export async function refreshLfgBoard(env, { now = Date.now(), ping = false, force = false } = {}) {
  const none = { channels: 0, posted: 0, edited: 0, failures: [] };
  if (!env.DB) return none;
  const channels = await channelsFor(env, 'rush_lfg').catch(() => []);
  if (!channels.length) return none;
  const e = rushEnv(env), kv = kvOf(env), failures = [];
  const posts = await rows(env, "SELECT * FROM rush_lfg WHERE status = 'open' AND expires > ? ORDER BY at", now);
  const roleId = ping ? (await pingRoleFor(env, 'ping_rush')) ?? '' : '';
  const msg = boardMessage(posts, { now, env, org: orgName(env), roleId });
  let posted = 0, edited = 0;
  for (const ch of channels) {
    const old = await kv?.get(BOARD_KEY + ch, 'json').catch(() => null);
    if (old?.id && !force && !roleId) {
      const last = await discord(e, 'GET', `/channels/${ch}`).catch(() => null);
      if (last?.last_message_id === old.id || (now >= (old.at ?? 0) && now - (old.at ?? 0) < BOARD_GAP_MS)) {
        const ok = await discord(e, 'PATCH', `/channels/${ch}/messages/${old.id}`, { flags: msg.flags, components: msg.components, allowed_mentions: msg.allowed_mentions }).catch(() => null);
        if (ok) { edited++; continue; }
      }
    }
    const r = await postAll(e, [ch], msg, 'lfg board');
    failures.push(...r.failures);
    if (r.sent[0]) {
      if (old?.id) await discord(e, 'DELETE', `/channels/${ch}/messages/${old.id}`).catch(() => null);
      await kv?.put(BOARD_KEY + ch, JSON.stringify({ id: r.sent[0].id, at: now })); posted++; // only a board Discord took is remembered
    }
  }
  return { channels: channels.length, posted, edited, failures };
}

/** the 1-minute check: the board must be the newest message of its channel. `changed` = the list changed (a call ended): refresh it even if it is newest. */
export async function lfgBoardTick(env, now = Date.now(), { changed = false } = {}) {
  if (!env.DB) return { skipped: true };
  const channels = await channelsFor(env, 'rush_lfg').catch(() => []);
  if (!channels.length) return { skipped: true, noChannel: true };
  const kv = kvOf(env);
  let stale = changed;
  for (const ch of channels) {
    if (stale) break;
    const have = await kv?.get(BOARD_KEY + ch, 'json').catch(() => null);
    const last = await discord(rushEnv(env), 'GET', `/channels/${ch}`).catch(() => null);
    if (!have?.id || (last?.last_message_id && last.last_message_id !== have.id)) stale = true;
  }
  if (!stale) return { skipped: false, refreshed: false };
  const r = await refreshLfgBoard(env, { now });
  return { skipped: false, refreshed: true, posted: r.posted, edited: r.edited };
}

/** the private answer to /lfg setup */
export function setupAnswer(r, ch) {
  const landed = r.posted + r.edited;
  const why = [...new Set(r.failures.map((f) => failureText(f, { retry: '`/lfg setup`' })))].join('\n');
  return { landed, why, ch };
}
