// Phoenix Rush (bot/lfg.js, waves MB4/MB5): /lfg now | cancel | list, answer buttons, expiry, cooldown, pings, flag, Phoenix look.
import { env, sqlite } from './mock.mjs';
import { t, done } from './lib.mjs';
import { lfgCommand, lfgButton, lfgExpire, lfgMessage, LFG_ID, LFG_MAX_MIN, LFG_COOLDOWN_MIN } from '../bot/lfg.js';
import { plainText } from '../bot/ui.js';
import { TYPES } from '../bot/notify.js';

const MIN = 60e3, T0 = Date.parse('2026-11-20T20:00:00Z');
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), rushLfg: 'members' });
sqlite.exec(`INSERT INTO meta (key, value) VALUES ('server_tools', '{"pingRoles":{"match":"7001","rush":"7002"}}') ON CONFLICT (key) DO UPDATE SET value = excluded.value`);
sqlite.exec(`INSERT INTO users (id, name, avatar, first_at, last_at) VALUES ('801', 'Ann', null, ${T0}, ${T0}), ('802', 'Bo', null, ${T0}, ${T0}) ON CONFLICT DO NOTHING`);
const ann = { u: '801', n: 'Ann', a: null, role: 'member' }, bo = { u: '802', n: 'Bo', a: null, role: 'member' };
const i = { channel_id: '700200', data: {} };
env.DISCORD_BOT_TOKEN = 'bot-token';
const calls = []; let msgN = 3000000000000000000n; const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (!url.startsWith('https://discord.com/api/v10')) return realFetch(url, init);
  const path = url.slice('https://discord.com/api/v10'.length), method = init.method ?? 'GET';
  calls.push({ method, path, body: init.body ? JSON.parse(init.body) : undefined });
  if (method === 'POST' && /^\/channels\/\w+\/messages$/.test(path)) return Response.json({ id: String(++msgN) });
  if (method === 'POST' && path === '/users/@me/channels') return Response.json({ id: 'dm' });
  return method === 'GET' ? Response.json({ last_message_id: null }) : new Response(null, { status: 204 });
};
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('g-lfg', 'Test')").run();
sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES ((SELECT id FROM discord_servers WHERE guild_id = 'g-lfg'), '700200', 'rush_lfg', 'org', '', 1)").run();
const now = (sub, o, me = ann, at = T0) => lfgCommand(i, env, me, me, sub, o, at);

t('flag rushLfg ships owner-only and rushQueue ships to members', JSON.parse(JSON.stringify(await import('../config.json', { with: { type: 'json' } }).then((m) => m.default.features))).rushLfg === 'owner' && (await import('../config.json', { with: { type: 'json' } })).default.features.rushQueue === 'members');
t('notification registry has an lfg row so members can mute it', TYPES.lfg && TYPES.lfg.mute !== false);
const off = { ...env, FEATURES: JSON.stringify({ ...JSON.parse(env.FEATURES), rushLfg: 'owner' }) };
t('off for members while the flag is owner-only', /not switched on/.test(plainText((await lfgCommand(i, off, ann, ann, 'now', {}, T0)).data)));

const r = await now('now', { position: 'ST', note: 'Need a keeper <@everyone>' });
const post = sqlite.prepare('SELECT * FROM rush_lfg ORDER BY id DESC').get();
t('now: a private confirmation, default 30 minutes, note cleaned of mentions; the call lives on the board, not in a post of its own', (r.data.flags & 64) !== 0 && post.expires - post.at === 30 * MIN && !/[<>@]/.test(post.note) && post.msg_id == null && /on the list/.test(plainText(r.data)));
const bpost = calls.find((c) => c.method === 'POST' && c.path === '/channels/700200/messages')?.body;
t('now: the board tags only the Rush role, never everyone', JSON.stringify(bpost.allowed_mentions) === '{"parse":[],"roles":["7002"]}' && bpost.components[0].content === '<@&7002>');
t('now: the board shows the player, a position and the Phoenix look', /Ann/.test(plainText(bpost)) && /Striker/.test(plainText(bpost)) && /PHOENIX FIRE/.test(plainText(bpost)) && /pf:lfg:board:in/.test(JSON.stringify(bpost)));
t('LFG_ID matches the button ids', LFG_ID.test(`pf:lfg:${post.id}:in`) && !LFG_ID.test('pf:lfg:x:in'));
t('a second /lfg now while on the list just updates the same call', /on the list/.test(plainText((await now('now', { position: 'CB' }, ann, T0 + 5 * MIN)).data)) && sqlite.prepare('SELECT COUNT(*) n FROM rush_lfg').get().n === 1 && JSON.parse(sqlite.prepare('SELECT positions FROM rush_lfg').get().positions).join() === 'CB');
await now('cancel', {}, ann, T0 + 6 * MIN);
t('cooldown: going available again inside 10 minutes of the last call is refused', LFG_COOLDOWN_MIN === 10 && /Slow down/.test(plainText((await now('now', { position: 'ST' }, ann, T0 + 8 * MIN)).data)));
const r2 = await now('now', { position: 'ST', minutes: 999 }, bo, T0 + 11 * MIN);
const p2 = sqlite.prepare("SELECT * FROM rush_lfg WHERE user_id = '802' ORDER BY id DESC").get();
t('a new call is capped at 180 minutes', LFG_MAX_MIN === 180 && p2.expires - p2.at === 180 * MIN);

const press = (id, answer, me, at) => lfgButton({ data: { custom_id: `pf:lfg:${id}:${answer}` } }, env, me, me, at);
const b1 = await press(p2.id, 'in', bo, T0 + 12 * MIN);
t('button: I’m in refreshes the post for everyone, without a new ping', b1.type === 7 && /Bo/.test(plainText(b1.data)) && b1.data.components[0].type === 17 && JSON.stringify(b1.data.allowed_mentions) === '{"parse":[]}');
const lat = await press(p2.id, 'later', bo, T0 + 13 * MIN);
t('button: the removed Later answer says so and the answer stays in', /option was removed/.test(plainText(lat.data)) && sqlite.prepare('SELECT answer FROM rush_lfg_answers WHERE lfg_id = ? AND user_id = ?').all(p2.id, '802').map((x) => x.answer).join() === 'in');
t('button: an old or unknown call says so', /gone/.test(plainText((await press(999, 'in', bo, T0)).data)) && /over/.test(plainText((await press(post.id, 'in', bo, T0 + 14 * MIN)).data)));
t('list: shows who is available', /Bo/.test(plainText((await now('list', {}, ann, T0 + 14 * MIN)).data)));
t('cancel: takes it down, then there is nothing to take down', /Taken down/.test(plainText((await now('cancel', {}, bo, T0 + 15 * MIN)).data)) && /Nothing to take down/.test(plainText((await now('cancel', {}, bo, T0 + 16 * MIN)).data)));
t('list: empty says so', /Nobody is available/.test(plainText((await now('list', {}, bo, T0 + 16 * MIN)).data)));

await now('now', { position: 'ST', minutes: 15 }, ann, T0 + 20 * MIN);
t('expiry: past its time a call is marked expired and takes no answers', (await lfgExpire(env, T0 + 40 * MIN)) === 1 && sqlite.prepare("SELECT status FROM rush_lfg WHERE user_id = '801' ORDER BY id DESC").get().status === 'expired');
t('an expired post renders as over, with no buttons and no ping', ((m) => /over/.test(plainText(m)) && !/pf:lfg/.test(JSON.stringify(m)) && m.allowed_mentions.parse.length === 0)(lfgMessage({ id: 1, name: 'Bo', status: 'expired', expires: T0 }, [], { roleId: '7002', now: T0 + 1 })));
sqlite.exec(`UPDATE users SET muted_until = ${T0 + 99 * MIN} WHERE id = '801'`);
t('a muted member cannot go available', /muted/i.test(plainText((await now('now', { position: 'ST' }, ann, T0 + 60 * MIN)).data)));
done();
