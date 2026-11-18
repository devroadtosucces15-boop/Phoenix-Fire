// PF-024 Item 19 – birthdays (bot/birthday.js): /birthday set | visible | show | clear and the one daily poster.
// Guardrails: hidden by default, month and day only (no year, no age), private replies, UTC date, channel by purpose `birthdays` from config (never code),
// ping role optional and never @everyone, one post and one DM per member (claims), DM from real data with a safe fallback, Phoenix branding with no NOREX name/colour/crest, date never logged.
import fs from 'node:fs';
import { env, sqlite } from './mock.mjs';
import { t, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { COMMANDS, APP_COMMANDS } from '../bot/commanddefs.js';
import { PERMS } from '../bot/roles.js';
import { CHANNEL_PURPOSES } from '../bot/orgconsts.js';
import { CHANNEL_PURPOSE_INFO, PING_GROUPS } from '../bot/orgconfig.js';
import { birthdayCommand, birthdayCheck, birthdayPanel, birthdayDm, birthdayFacts, prettyDay } from '../bot/birthday.js';
import { bioMessage } from '../bot/biocard.js';
import { birthday as parseBirthday } from '../bot/profiles.js';

const FEAT0 = JSON.parse(env.FEATURES);
env.FEATURES = JSON.stringify({ ...FEAT0, birthday: 'members' });
Object.assign(env, { DISCORD_BOT_TOKEN: 'tok', DISCORD_GUILD_ID: 'g-bd' });
const T = Date.UTC(2026, 6, 14, 9), MEMBER = { u: '500', role: 'member' }, src = fs.readFileSync(new URL('../bot/birthday.js', import.meta.url), 'utf8');
const logs = []; const reallog = console.log; console.log = (...a) => { logs.push(a.join(' ')); reallog(...a); };
const ia = (id, sub, options = []) => ({ member: { user: { id, username: `u${id}` } }, token: 'tok', data: { name: 'birthday', options: [{ name: sub, type: 1, options }] } });
const o = (obj) => Object.entries(obj).map(([name, value]) => ({ name, value }));
const run = async (sub, opts = {}, who = MEMBER, e = env) => plainText((await birthdayCommand(ia(who.u, sub, o(opts)), e, who, T)).data);
const row = (id) => sqlite.prepare('SELECT * FROM profiles WHERE user_id = ?').get(id);
const brand = (s) => !/norex/i.test(s) && !/c8352c/i.test(s) && !/080b11/i.test(s);

sqlite.prepare("INSERT OR IGNORE INTO users (id, name, first_at, last_at, points) VALUES ('500', 'Ash', ?, ?, 0), ('501', 'Bo', ?, ?, 0), ('502', 'Cy', ?, ?, 0)").run(Date.UTC(2025, 2, 1), T, Date.UTC(2026, 0, 5), T, T, T);

// ---------- wiring ----------
t('command: /birthday is in the matchday app with set, visible, show, clear', APP_COMMANDS.matchday.includes('birthday') && COMMANDS.find((c) => c.name === 'birthday')?.options.map((x) => x.name).join() === 'set,visible,show,clear');
t('permission, purpose, ping group and flag exist', PERMS['birthday.set'] === 'member' && CHANNEL_PURPOSES.includes('birthdays') && !!CHANNEL_PURPOSE_INFO.birthdays && PING_GROUPS.includes('ping_birthdays') && JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url))).features.birthday === 'owner');
t('date helpers: 07-14 → 14 July; no year anywhere', prettyDay('07-14') === '14 July' && prettyDay('') === '' && parseBirthday('7/14') === '07-14');

// ---------- gates ----------
env.FEATURES = JSON.stringify({ ...FEAT0, birthday: 'owner' });
t('flag owner: a plain member is told it is not on yet', /not switched on/i.test(await run('show')));
env.FEATURES = JSON.stringify({ ...FEAT0, birthday: 'members' });

// ---------- /birthday ----------
const set1 = await run('set', { date: '07-14' });
t('set: saves month and day, hidden by default, no year, UTC note', /14 July/.test(set1) && /Visible to the club: \*\*no\*\*/.test(set1) && /UTC/.test(set1) && row('500').birthday === '07-14' && JSON.parse(row('500').bio_show).birthday === false);
t('set: a year, a bad date or an empty value is refused and nothing is stored', /month and day/.test(await run('set', { date: '1990-07-14' }, { u: '501', role: 'member' })) && /doesn’t exist/.test(await run('set', { date: '02-30' }, { u: '501', role: 'member' })) && !row('501'));
t('show: only the caller sees it; the reply is private', /14 July/.test(await run('show')) && (await birthdayCommand(ia('500', 'show'), env, MEMBER, T)).data.flags & 64);
t('visible needs a saved date first', /Save a birthday first/.test(await run('visible', { on: true }, { u: '501', role: 'member' })));
t('visible on / off flips only the flag', /visible/i.test(await run('visible', { on: true })) && JSON.parse(row('500').bio_show).birthday === true && /hidden/i.test(await run('visible', { on: false })) && JSON.parse(row('500').bio_show).birthday === false && row('500').birthday === '07-14');
t('set with visible:true saves and shows in one step', /Visible to the club: \*\*yes\*\*/.test(await run('set', { date: '07-14', visible: true }, { u: '501', role: 'member' })) && JSON.parse(row('501').bio_show).birthday === true);
t('clear: deletes the date and turns visibility off', /removed/i.test(await run('clear', {}, { u: '501', role: 'member' })) && row('501').birthday === '' && JSON.parse(row('501').bio_show).birthday === false);
t('replies are Phoenix-branded (no NOREX name/colour)', brand(set1 + JSON.stringify(await birthdayCommand(ia('500', 'show'), env, MEMBER, T))));

// ---------- the bio card (Item 16) shows the day only when visible ----------
const profile = (show) => ({ bio: 'hi', positions: ['ST'], rushPositions: [], ids: {}, birthday: '07-14', bioShow: { birthday: show } });
const user = { id: '500', name: 'Ash', avatar: null };
const shown = plainText(bioMessage(env, { user, claim: { player_name: 'Ash' }, profile: profile(true) }).msg), hidden = plainText(bioMessage(env, { user, claim: { player_name: 'Ash' }, profile: profile(false) }).msg);
t('bio card: the birthday row is there only when visible and never has a year', /Birthday/.test(shown) && /14 July/.test(shown) && !/Birthday|14 July/.test(hidden) && !/\b(19|20)\d\d\b/.test(shown.replace(/Phoenix Fire/, '')));

// ---------- daily poster ----------
const posts = [], dms = [];
const post = async (e, channel, role, msg) => { posts.push({ channel, msg }); return { ok: true }; };
const dmFn = async (e, id, msg) => { dms.push({ id, msg }); return true; };
const clear = () => { posts.length = 0; dms.length = 0; sqlite.exec("DELETE FROM meta WHERE key LIKE 'birthday%'; DELETE FROM discord_channels; DELETE FROM discord_roles"); };
sqlite.prepare("UPDATE profiles SET birthday = '' WHERE user_id != '500'").run();
sqlite.prepare("INSERT INTO profiles (user_id, birthday, bio_show, updated) VALUES ('502', '07-14', '{}', 1) ON CONFLICT (user_id) DO UPDATE SET birthday = '07-14', bio_show = '{}'").run();
await run('visible', { on: false }); // 500 hidden, 502 never chose
clear();
t('nobody visible: nothing is posted, no DM (hidden by default)', (await birthdayCheck(env, post, T, { dmFn })).reason === 'none-today' && !posts.length && !dms.length);
await run('visible', { on: true });
t('no channel configured: no post, the reason is said; the private DM still goes once', (await birthdayCheck(env, post, T, { dmFn })).reason === 'no-channel' && !posts.length && dms.length === 1 && dms[0].id === '500');
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('g-bd', 'Test')").run();
const sid = sqlite.prepare("SELECT id FROM discord_servers WHERE guild_id = 'g-bd'").get().id;
sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '7901', 'birthdays', 'org', '', 1)").run(sid);
t('before 08:00 UTC nothing happens', (await birthdayCheck(env, post, Date.UTC(2026, 6, 14, 7), { dmFn })).reason === 'too-early');
const r1 = await birthdayCheck(env, post, T, { dmFn }), p = posts[0]?.msg, ptxt = plainText(p ?? {});
t('visible member: one panel in the configured birthdays channel mentioning only them', r1.posted && posts.length === 1 && posts[0].channel === '7901' && /Happy birthday/.test(ptxt) && /<@500>/.test(ptxt) && !/<@502>/.test(ptxt) && p.allowed_mentions.users.join() === '500');
t('mentions: no @everyone, no @here, no role ping by default', !JSON.stringify(p).includes('@everyone') && !JSON.stringify(p).includes('@here') && !p.allowed_mentions.roles.length && !p.allowed_mentions.parse);
t('ping role is optional and role-only: a configured role is mentioned, still never everyone', (() => { const m = birthdayPanel([{ user_id: '500' }], env, { pingRole: '888' }); return m.allowed_mentions.roles.join() === '888' && /<@&888>/.test(plainText(m)) && !m.allowed_mentions.parse; })());
t('one post a day and one DM a year per member (claims)', (await birthdayCheck(env, post, T + 36e5, { dmFn })).reason === 'already-posted' && posts.length === 1 && dms.length === 1);
t('a failed post gives its claim back so the next run retries', (await (async () => { clear(); sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '7901', 'birthdays', 'org', '', 1)").run(sid); const bad = await birthdayCheck(env, async () => ({ ok: false }), T, { dmFn }); const again = await birthdayCheck(env, post, T + 6e4, { dmFn }); return !bad.posted && again.posted; })()));
t('29 Feb is celebrated on 1 March in a non-leap year', await (async () => { clear(); sqlite.prepare("UPDATE profiles SET birthday = '02-29' WHERE user_id = '500'").run(); sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '7901', 'birthdays', 'org', '', 1)").run(sid); const r = await birthdayCheck(env, post, Date.UTC(2026, 2, 1, 9), { dmFn }); sqlite.prepare("UPDATE profiles SET birthday = '07-14' WHERE user_id = '500'").run(); return r.posted; })());

// ---------- the DM ----------
const facts = await birthdayFacts(env, '500');
t('DM facts: join date from real data, points and badges only when present, nothing invented', facts.joined === 'March 2025' && facts.points === undefined && facts.games === undefined);
const full = plainText(birthdayDm(env, { joined: 'March 2025', games: 12, goals: 7, assists: 3, motm: 2, badges: 4, points: 90 }, 'Ash')), fallback = plainText(birthdayDm(env, {}, ''));
t('DM: real data lines when present', /March 2025/.test(full) && /12 matches/.test(full) && /7 goals/.test(full) && /2 man of the match/.test(full) && /4 badges/.test(full) && /90 club points/.test(full) && /Happy birthday, Ash/.test(full));
t('DM: the safe fallback has a heartfelt line and no empty stats', /Thank you for being part of/.test(fallback) && !/undefined|NaN|0 matches/.test(fallback));
t('DM is Phoenix-branded and tells the member how to stop it', brand(JSON.stringify(birthdayDm(env, facts, 'Ash'))) && /Rise\. Burn\. Repeat/.test(full) && /visible off/.test(full) && /Phoenix Fire/i.test(full));
t('panel is Phoenix-branded, gold, with the Phoenix birthday banner', brand(JSON.stringify(birthdayPanel([{ user_id: '500' }], env))) && /Phoenix Fire/i.test(plainText(birthdayPanel([{ user_id: '500' }], env))) && JSON.stringify(birthdayPanel([{ user_id: '500' }], env)).includes('post-birthday'));

// ---------- privacy and code rules ----------
t('the date is never logged', !logs.some((l) => !/^[✔✘]/.test(l) && /07-14|14 July/.test(l)));
t('the module reads its channel and ping role from config, names no id or NOREX, stores no year', /channelFor\(env, 'birthdays'\)/.test(src) && /pingRoleFor\(env, 'ping_birthdays'\)/.test(src) && !/\b\d{17,20}\b/.test(src) && !/norex/i.test(src) && !/@everyone|@here/.test(src.replace(/^\/\/.*$/gm, '')));
t('fun.js no longer posts birthdays itself (one poster, no duplicate)', !/birthday_day|prepare/.test(fs.readFileSync(new URL('../bot/fun.js', import.meta.url), 'utf8').split('// ---------- birthdays ----------')[1]?.split('\n\n')[0] ?? ''));
console.log = reallog;
done();
