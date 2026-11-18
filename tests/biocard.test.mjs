// PF-024 Item 16 – the player bio card (bot/biocard.js): posted once when a member with an approved claim saves their profile, edited on later saves,
// shows only what the member chose to share, mentions the player (+ an optional configured role, never @everyone), channel and role from the Organization config.
import fs from 'node:fs';
import { env, sqlite } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { saveProfile, memberCard } from '../bot/profiles.js';
import { bioMessage, postBio, scheduleLines } from '../bot/biocard.js';
import { CHANNEL_PURPOSES, PERMISSION_GROUPS } from '../bot/orgconsts.js';

const me = { u: '5001', role: 'member', n: 'Ash' };
Object.assign(env, { DISCORD_BOT_TOKEN: 'tok', DISCORD_GUILD_ID: 'g-bio' });
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), bioCard: 'members' });
sqlite.prepare("INSERT OR REPLACE INTO users (id, name, avatar, tag, admin, first_at, last_at, logins) VALUES (?, 'Ash', 'abc123', 'ash', 0, 1, 1, 1)").run(me.u);

// ---------- profile fields ----------
t('age is validated and optional; language and the visibility switches are saved', (await saveProfile(env, me, { age: 12 })).error?.includes('13') && (await saveProfile(env, me, { age: 'x' })).error && !(await saveProfile(env, me, { age: 24, language: 'English, Spanish', country: 'GB', positions: ['ST', 'CAM'], platform: 'PS5', ids: { psn: 'AshPlays' }, tz: 'Europe/London', playTimes: [0b111100000000000000, 0, 0, 0, 0, 0, 0], bio: 'Poacher with pace' })).error);
const row = sqlite.prepare('SELECT age, language, bio_show FROM profiles WHERE user_id = ?').get(me.u);
t('stored: age, language, and the visibility defaults (country, age, language hidden)', row.age === 24 && row.language === 'English, Spanish' && JSON.parse(row.bio_show).age === false && JSON.parse(row.bio_show).country === false);
t('privacy: another member never sees age or language until they are switched on', await (async () => {
  const other = { u: '9', role: 'member' }, hidden = await memberCard(env, other, me.u);
  await saveProfile(env, me, { bioShow: { age: true } });
  const shown = await memberCard(env, other, me.u), own = await memberCard(env, me, me.u);
  return hidden.profile.age === null && hidden.profile.language === '' && shown.profile.age === 24 && shown.profile.language === '' && own.profile.language === 'English, Spanish';
})());
t('schedule lines: hour bits become readable ranges', scheduleLines([0b111100000000000000, 0, 0, 0, 0, 0, 0])[0] === 'Mon 14:00–18:00');

// ---------- the card ----------
const user = { id: me.u, name: 'Ash', avatar: 'abc123' }, claim = { player_name: 'Ash Ketchum' };
const prof = (o = {}) => ({ bio: 'Poacher', positions: ['ST'], rushPositions: ['CAM'], platform: 'PS5', ids: { psn: 'AshPlays' }, tz: 'Europe/London', playTimes: [0b1111000000000000, 0, 0, 0, 0, 0, 0], country: 'GB', age: 24, language: 'English', bioShow: {}, ...o });
const txt = (o, extra = {}) => plainText(bioMessage(env, { user, claim, profile: prof(o), ...extra }).msg);
t('the card shows player, positions, Rush, game IDs and schedule by default', ['Ash Ketchum', 'ST', 'CAM', 'AshPlays', 'Mon'].every((x) => txt().includes(x)));
t('country, age and language stay hidden unless the member switched them on', !/GB|24|English|Country|Age|Language/.test(txt()) && /Country/.test(txt({ bioShow: { country: true } })) && /Age/.test(txt({ bioShow: { age: true } })) && /Language/.test(txt({ bioShow: { language: true } })));
t('the member can hide their game IDs and schedule too', !/AshPlays|Plays/.test(txt({ bioShow: { ids: false, schedule: false } })));
const first = bioMessage(env, { user, claim, profile: prof(), pingRole: '777', first: true }).msg, again = bioMessage(env, { user, claim, profile: prof(), pingRole: '777', first: false }).msg;
t('first post mentions the player and the configured role only; an edit pings nobody; never @everyone', JSON.stringify(first.allowed_mentions) === JSON.stringify({ users: ['5001'], roles: ['777'] }) && (again.allowed_mentions.parse ?? []).length === 0 && !JSON.stringify(first).includes('@everyone') && !(first.allowed_mentions.parse ?? []).includes('everyone'));
t('Phoenix branding: the card names the club and carries no NOREX name, colour or crest', /phoenix fire/i.test(txt()) && !/norex|c8352c|080b11/i.test(JSON.stringify(first)));
t('the card is a Components V2 panel under the limits', (first.flags & (1 << 15)) !== 0 && JSON.stringify(first).length < 6000);

// ---------- posting: new, then edited, never duplicated ----------
const calls = []; let del = false;
const fake = async (e, method, path, body) => { calls.push({ method, path, body }); if (method === 'PATCH' && del) throw Object.assign(new Error('Unknown Message'), { status: 404 }); return method === 'POST' ? { id: `m${calls.filter((c) => c.method === 'POST').length}` } : {}; };
const reset = () => { calls.length = 0; sqlite.exec("DELETE FROM meta WHERE key LIKE 'bio_msg:%'; DELETE FROM claims; DELETE FROM discord_channels; DELETE FROM discord_roles"); };
const claimIt = () => sqlite.prepare("INSERT OR REPLACE INTO claims (user_id, player, player_name, status, at) VALUES (?, 'p1', 'Ash Ketchum', 'approved', 1)").run(me.u);
reset();
t('no approved claim → no card', (await postBio(env, me, { discordFn: fake })).skipped === 'no-claim' && calls.length === 0);
claimIt();
t('no member_bios channel in the Organization config → no card, and it says so', (await postBio(env, me, { discordFn: fake })).skipped === 'no-channel' && calls.length === 0);
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('g-bio', 'Test')").run();
const sid = sqlite.prepare("SELECT id FROM discord_servers WHERE guild_id = 'g-bio'").get().id;
sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '9901', 'member_bios', 'org', '', 1)").run(sid);
const r1 = await postBio(env, me, { discordFn: fake });
t('first save posts one card to the configured channel', r1.posted === 'new' && calls.length === 1 && calls[0].method === 'POST' && calls[0].path === '/channels/9901/messages');
t('saving again with nothing changed touches nothing', (await postBio(env, me, { discordFn: fake })).skipped === 'unchanged' && calls.length === 1);
await saveProfile(env, me, { bio: 'Poacher with pace and a new haircut' });
const r3 = await postBio(env, me, { discordFn: fake });
t('a changed profile EDITS the same message instead of posting another', r3.posted === 'edited' && calls.length === 2 && calls[1].method === 'PATCH' && calls[1].path === '/channels/9901/messages/m1' && calls.filter((c) => c.method === 'POST').length === 1);
del = true; await saveProfile(env, me, { bio: 'Third version' });
const r4 = await postBio(env, me, { discordFn: fake }); del = false;
t('if the card was deleted in Discord a fresh one is posted', r4.posted === 'new' && calls.filter((c) => c.method === 'POST').length === 2);
await saveProfile(env, me, { bio: 'Fourth version' });
t('a Discord error is swallowed and reported', (await postBio(env, me, { discordFn: async () => { throw new Error('boom'); } })).skipped === 'error');
const flagOff = { ...env, FEATURES: JSON.stringify({ ...JSON.parse(env.FEATURES), bioCard: 'off' }) };
t('flag off → nothing posted', (await postBio(flagOff, me, { discordFn: fake })).skipped === 'flag-off');

// ---------- config, source ----------
const src = fs.readFileSync(new URL('../bot/biocard.js', import.meta.url), 'utf8');
t('member_bios is an Organization config purpose and ping_bios a ping role group; the flag ships owner-only', CHANNEL_PURPOSES.includes('member_bios') && PERMISSION_GROUPS.includes('ping_bios') && JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).features.bioCard === 'owner');
t('the module names no channel or role id, reads both from the config, and has no NOREX name or colour', !/\b\d{17,20}\b/.test(src) && /channelFor\(env, 'member_bios'\)/.test(src) && /pingRoleFor\(env, 'ping_bios'\)/.test(src) && !/norex|c8352c|080b11/i.test(src));
t('the profile save route posts the card without failing the save', /postBio\(env, me\)/.test(fs.readFileSync(new URL('../bot/members.js', import.meta.url), 'utf8')));
done();
