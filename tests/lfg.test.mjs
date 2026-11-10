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
const now = (sub, o, me = ann, at = T0) => lfgCommand(i, env, me, me, sub, o, at);

t('flag rushLfg and rushQueue ship as owner-only', JSON.parse(JSON.stringify(await import('../config.json', { with: { type: 'json' } }).then((m) => m.default.features))).rushLfg === 'owner' && (await import('../config.json', { with: { type: 'json' } })).default.features.rushQueue === 'owner');
t('notification registry has an lfg row so members can mute it', TYPES.lfg && TYPES.lfg.mute !== false);
const off = { ...env, FEATURES: JSON.stringify({ ...JSON.parse(env.FEATURES), rushLfg: 'owner' }) };
t('off for members while the flag is owner-only', /not switched on/.test(plainText((await lfgCommand(i, off, ann, ann, 'now', {}, T0)).data)));

const r = await now('now', { note: 'Need a keeper <@everyone>' });
const post = sqlite.prepare('SELECT * FROM rush_lfg ORDER BY id DESC').get();
t('now: posts publicly, default 60 minutes, note cleaned of mentions', (r.data.flags & 64) === 0 && post.expires - post.at === 60 * MIN && !/[<>@]/.test(post.note));
t('now: tags only the Rush role, never everyone', JSON.stringify(r.data.allowed_mentions) === '{"parse":[],"roles":["7002"]}' && r.data.components[0].content === '<@&7002>');
t('now: I’m in / Later buttons and Phoenix look', /pf:lfg:\d+:in/.test(JSON.stringify(r.data)) && /pf:lfg:\d+:later/.test(JSON.stringify(r.data)) && /PHOENIX FIRE/.test(plainText(r.data)) && !/norex|c8352c/i.test(JSON.stringify(r.data).replace(/norex:\w+(:\w+)*/g, '')) && r.data.components.some((c) => c.accent_color === 0xe8651a));
t('LFG_ID matches the button ids', LFG_ID.test(`pf:lfg:${post.id}:in`) && !LFG_ID.test('pf:lfg:x:in'));
t('cooldown: a second post inside 10 minutes is refused', LFG_COOLDOWN_MIN === 10 && /Slow down/.test(plainText((await now('now', {}, ann, T0 + 5 * MIN)).data)) && sqlite.prepare('SELECT COUNT(*) n FROM rush_lfg').get().n === 1);
const r2 = await now('now', { minutes: 999 }, ann, T0 + 11 * MIN);
const p2 = sqlite.prepare('SELECT * FROM rush_lfg ORDER BY id DESC').get();
t('after the cooldown: allowed, capped at 180 minutes, and the old call is taken down', LFG_MAX_MIN === 180 && p2.expires - p2.at === 180 * MIN && sqlite.prepare('SELECT status FROM rush_lfg WHERE id = ?').get(post.id).status === 'cancelled' && !!r2.data);

const press = (id, answer, me, at) => lfgButton({ data: { custom_id: `pf:lfg:${id}:${answer}` } }, env, me, me, at);
const b1 = await press(p2.id, 'in', bo, T0 + 12 * MIN);
t('button: I’m in refreshes the post for everyone, without a new ping', b1.type === 7 && /Bo/.test(plainText(b1.data)) && b1.data.components[0].type === 17 && JSON.stringify(b1.data.allowed_mentions) === '{"parse":[]}');
await press(p2.id, 'later', bo, T0 + 13 * MIN);
t('button: one answer per member, the last one wins', sqlite.prepare('SELECT answer FROM rush_lfg_answers WHERE lfg_id = ? AND user_id = ?').all(p2.id, '802').map((x) => x.answer).join() === 'later');
t('button: an old or unknown call says so', /gone/.test(plainText((await press(999, 'in', bo, T0)).data)) && /over/.test(plainText((await press(post.id, 'in', bo, T0 + 14 * MIN)).data)));
t('list: shows who is available', /Ann/.test(plainText((await now('list', {}, bo, T0 + 14 * MIN)).data)));
t('cancel: takes it down, then there is nothing to take down', /Taken down/.test(plainText((await now('cancel', {}, ann, T0 + 15 * MIN)).data)) && /Nothing to take down/.test(plainText((await now('cancel', {}, ann, T0 + 16 * MIN)).data)));
t('list: empty says so', /Nobody is available/.test(plainText((await now('list', {}, bo, T0 + 16 * MIN)).data)));

await now('now', { minutes: 15 }, bo, T0 + 20 * MIN);
t('expiry: past its time a call is marked expired and takes no answers', (await lfgExpire(env, T0 + 40 * MIN)) === 1 && sqlite.prepare("SELECT status FROM rush_lfg WHERE user_id = '802' ORDER BY id DESC").get().status === 'expired');
t('an expired post renders as over, with no buttons and no ping', ((m) => /over/.test(plainText(m)) && !/pf:lfg/.test(JSON.stringify(m)) && m.allowed_mentions.parse.length === 0)(lfgMessage({ id: 1, name: 'Bo', status: 'expired', expires: T0 }, [], { roleId: '7002', now: T0 + 1 })));
sqlite.exec(`UPDATE users SET muted_until = ${T0 + 99 * MIN} WHERE id = '801'`);
t('a muted member cannot post', /muted/i.test(plainText((await now('now', {}, ann, T0 + 60 * MIN)).data)));
done();
