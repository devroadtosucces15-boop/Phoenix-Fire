// PF-024 Item 24b – engagement points and placeholder prizes. Community activity counts (numbers only), weekly cap on match points, prizes with a status,
// manager gift and refund. Owner-first behind the flag `engagementPoints`.
import { call, env, login, sqlite } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import { RULE_DEFAULTS, loadRules, defaultRules, cleanRules, standing, awardPoints, pointsKey, PLACEHOLDER_PRIZES } from '../bot/points.js';
import { dayPoints, fold, hoursOf, dayOf, settle, recordCommand, availabilityPoint, pollChannels, tracking, paying } from '../bot/engagement.js';
import { ROUTES, routeOf } from '../bot/ccpermissions.js';
import fs from 'node:fs';

const setFlags = (o) => { env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), ...o }); };
setFlags({ points: 'members', pointsEconomy: 'members', engagementPoints: 'members', notifications: 'members' });
env.DISCORD_CLIENT_SECRET ||= 'secret-for-tests';
const mgr = await login('333', ['mgr'], 'Manager'), ash = await login('801', [], 'Ash'), bo = await login('802', [], 'Bo');

// ---------- the rules ----------
const a = defaultRules().amounts;
t('engagement rules exist with defaults and the match points have a weekly cap', a['engagement.active_day'] === 3 && a['engagement.streak_week'] === 10 && a['match.weekly_cap'] === 40);
t('every engagement rule is editable like the others (labelled, 0..1000)', Object.keys(RULE_DEFAULTS).filter((k) => k.startsWith('engagement.')).length === 8 && !cleanRules({ amounts: { 'engagement.hour': 5000 } }).rules);

// ---------- one day of activity → points ----------
const rules = defaultRules();
const quiet = dayPoints(rules, { chs: '', hours: 0, msgs: 0, cmds: 0 });
t('a day with nothing pays nothing', quiet.delta === 0);
const busy = dayPoints(rules, { chs: 'a,b,c', hours: 0b1111, msgs: 40, cmds: 2 });
t('active + 2 extra channels + 4 hours + a command = 3 + 2 + 4 + 1', busy.delta === 10, busy.delta);
const spam = dayPoints(rules, { chs: 'a', hours: 0b1, msgs: 5000, cmds: 0 });
t('messages pay nothing: 5000 messages in one hour of one channel pays the same as 1', spam.delta === dayPoints(rules, { chs: 'a', hours: 0b1, msgs: 1, cmds: 0 }).delta && spam.delta === 4);
const wide = dayPoints(rules, { chs: Array.from({ length: 30 }, (_, i) => 'c' + i).join(','), hours: 0xffffff, msgs: 99, cmds: 9 });
t('channels and hours are limited per day (4 extra channels, 6 hours)', wide.delta === 3 + 4 + 6 + 1, wide.delta);
t('a command alone pays only the command rule', dayPoints(rules, { chs: '', hours: 0, msgs: 0, cmds: 1 }).delta === 1);
t('hoursOf counts the distinct hours of a mask', hoursOf(0b101101) === 4);

// ---------- collecting counts: no text ----------
const agg = fold([{ author: '801', ch: 'c1', at: '2026-11-18T09:05:00Z' }, { author: '801', ch: 'c2', at: '2026-11-18T09:50:00Z' }, { author: '801', ch: 'c2', at: '2026-11-18T14:00:00Z' }, { author: '802', ch: 'c1', at: '2026-11-18T23:59:00Z' }]);
const e = agg.get('801|2026-11-18');
t('fold: channels, hours and a message count per member per UTC day', e.chs.size === 2 && e.msgs === 3 && hoursOf(e.hours) === 2 && agg.has('802|2026-11-18'));
t('fold takes no text field at all (only author, channel, time)', fold([{ author: '1', ch: 'c', at: '2026-11-18T01:00:00Z', content: 'secret words' }]).get('1|2026-11-18').msgs === 1 && !JSON.stringify([...fold([{ author: '1', ch: 'c', at: '2026-11-18T01:00:00Z', content: 'secret words' }])]).includes('secret'));

// ---------- the poll: only public channels, counts only, no backfill ----------
sqlite.exec("DELETE FROM meta WHERE key = 'eng_state'; DELETE FROM engagement_days;");
env.DISCORD_GUILD_ID = '900'; env.DISCORD_BOT_TOKEN = 'tok';
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0), snow = (ms) => String((BigInt(ms - 1420070400000) << 22n));
const realFetch = globalThis.fetch, urls = [];
globalThis.fetch = async (url) => {
  url = String(url); urls.push(url);
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (url.endsWith('/guilds/900/channels')) return json([{ id: '1', type: 0, name: 'general-room', parent_id: null, permission_overwrites: [] }, { id: '2', type: 0, name: 'staff-room', permission_overwrites: [] }, { id: '3', type: 0, name: 'secret', permission_overwrites: [{ id: '900', deny: '1024', allow: '0' }] }, { id: '4', type: 2, name: 'voice', permission_overwrites: [] }]);
  if (url.endsWith('/guilds/900/roles')) return json([{ id: '900', permissions: '1024' }]);
  if (url.includes('/channels/1/messages')) return json([{ id: snow(NOW - 60e3), type: 0, content: 'SECRET TEXT SHOULD NEVER BE KEPT', author: { id: '801' }, timestamp: new Date(NOW - 60e3).toISOString() }, { id: snow(NOW - 50e3), type: 0, content: 'bot', author: { id: '999', bot: true }, timestamp: new Date(NOW - 50e3).toISOString() }]);
  return json({}, 404);
};
const logs = []; const oldLog = console.log; console.log = (...x) => { logs.push(x.join(' ')); };
const r = await pollChannels(env, NOW);
console.log = oldLog; globalThis.fetch = realFetch;
t('the poll reads only the public text channel (not staff-named, private or voice)', r.ran && urls.filter((u) => u.includes('/messages')).length === 1 && urls.some((u) => u.includes('/channels/1/messages')));
const row = sqlite.prepare("SELECT * FROM engagement_days WHERE user_id = '801'").get();
t('it stored counts for the member (channel, hour, 1 message), none for the bot', row?.msgs === 1 && row.chs === '1' && hoursOf(row.hours) === 1 && !sqlite.prepare("SELECT 1 FROM engagement_days WHERE user_id = '999'").get());
t('NO message text reached the database, the state or any log line', !JSON.stringify(sqlite.prepare('SELECT * FROM engagement_days').all()).includes('SECRET') && !JSON.stringify(sqlite.prepare("SELECT * FROM meta WHERE key = 'eng_state'").all()).includes('SECRET') && !logs.join(' ').includes('SECRET'));
t('the read position is saved so the next run continues where this one stopped', JSON.parse(sqlite.prepare("SELECT value FROM meta WHERE key = 'eng_state'").get().value).cur['1'] === snow(NOW - 50e3) || !!JSON.parse(sqlite.prepare("SELECT value FROM meta WHERE key = 'eng_state'").get().value).cur['1']);
setFlags({ engagementPoints: 'off' });
t('with the flag off nothing runs and no Discord call is made', !tracking(env) && (await pollChannels(env, NOW)).ran === false);
setFlags({ engagementPoints: 'owner' });
t('owner-only: tracking runs, points are not paid', tracking(env) && !paying(env));
setFlags({ engagementPoints: 'members' });

// ---------- paying: once per member per day, never today ----------
sqlite.exec("DELETE FROM engagement_days; DELETE FROM points_log WHERE user_id IN ('801','802'); UPDATE users SET points = 0, points_spent = 0 WHERE id IN ('801','802');");
const today = dayOf(NOW), yday = dayOf(NOW - 86400e3);
const put = sqlite.prepare('INSERT INTO engagement_days (user_id, day, chs, hours, msgs, cmds) VALUES (?, ?, ?, ?, ?, ?)');
put.run('801', yday, 'a,b', 0b11, 9, 1); put.run('801', today, 'a', 1, 3, 0); put.run('802', yday, '', 0, 0, 0);
const s1 = await settle(env, NOW), s2 = await settle(env, NOW);
t('yesterday is paid (3 + 1 + 2 + 1 = 7), today is not paid because it is not over', (await standing(env, '801')).earned === 7 && s1.paid >= 7);
t('settling twice pays nothing more (once per member per day)', s2.paid === 0 && (await standing(env, '801')).earned === 7);
t('a day with no activity pays nothing', (await standing(env, '802')).earned === 0);
t('the points land in the engagement category', (await standing(env, '801')).by.engagement === 7);
for (let k = 1; k <= 5; k++) { sqlite.prepare('INSERT OR IGNORE INTO engagement_days (user_id, day, chs, hours, msgs, cmds, paid) VALUES (?, ?, ?, ?, ?, ?, 1)').run('802', dayOf(Date.UTC(2026, 10, 9 + k)), 'a', 1, 2, 0); } // Mon 9 .. Fri 13 Nov: five active days
await settle(env, NOW);
t('five active days in a week pay the streak bonus once', (await standing(env, '802')).earned === 10);
await settle(env, NOW);
t('...and only once', (await standing(env, '802')).earned === 10);
setFlags({ engagementPoints: 'owner' });
sqlite.exec("UPDATE engagement_days SET paid = 0, msgs = 5, chs = 'a', hours = 1 WHERE user_id = '802' AND day = '" + yday + "'");
const before = (await standing(env, '802')).earned; await settle(env, NOW);
t('while the flag is owner-only nobody is paid', (await standing(env, '802')).earned === before);
setFlags({ engagementPoints: 'members' });

// ---------- commands and availability ----------
await recordCommand(env, '801', NOW); await recordCommand(env, '801', NOW);
t('commands are counted per day, no command name is kept', sqlite.prepare("SELECT cmds FROM engagement_days WHERE user_id = '801' AND day = ?").get(today).cmds === 2 && !sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'engagement_days'").get().sql.toLowerCase().includes('command_name'));
const b0 = (await standing(env, '801')).earned;
const av = await call(ash, '/api/availability', { dates: [dayOf(Date.now() + 86400e3)], status: 'yes' });
await availabilityPoint(env, '801', NOW); await availabilityPoint(env, '801', NOW);
t('setting availability pays once a week', (await standing(env, '801')).earned === b0 + 3);

// ---------- match points are capped per week ----------
sqlite.exec("DELETE FROM points_log WHERE user_id = '801'; UPDATE users SET points = 0 WHERE id = '801';");
await awardPoints(env, '801', 'match', 38, 'earlier matches', 'm:1');
sqlite.prepare("INSERT OR REPLACE INTO claims (user_id, player, player_name, status, at, name) VALUES ('801', 'AshPlayer', 'AshPlayer', 'approved', ?, 'Ash')").run(Date.now());
const key = await pointsKey(env.DISCORD_CLIENT_SECRET);
const { default: worker } = await import('../bot/worker.js');
const rr = await worker.fetch(new Request('https://bot/api/points/match', { method: 'POST', headers: { 'X-Phoenix-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId: '123456', win: true, players: [{ name: 'AshPlayer', goals: 5, assists: 3, mom: true }] }) }), env, { waitUntil() {} });
const mrt = await rr.json().catch(() => ({}));
t('the weekly cap trims a big match: 38 already earned this week, so a huge match stops at 40', rr.status === 200 && (await standing(env, '801')).earned === 40, (await standing(env, '801')).earned);

// ---------- placeholder prizes ----------
const adm = await call(mgr, '/api/points/admin');
t('the manager sees five placeholder prizes', adm.d.rules.prices.length === 5 && adm.d.rules.prices.every((p) => p.status === 'placeholder'));
t('there are the five example prizes', PLACEHOLDER_PRIZES.map((p) => p.id).join() === 'role-colour,profile-flair,rush-skip,mascot-shout,captain-night');
sqlite.exec("UPDATE users SET points = 1000, points_spent = 0 WHERE id = '801'");
const mine = await call(ash, '/api/points');
t('a member does not see placeholder prizes', mine.s === 200 && (mine.d.prices ?? []).length === 0);
const buy = await call(ash, '/api/points/redeem', { item: 'role-colour' });
t('a placeholder cannot be bought (409, nothing spent)', buy.s === 409 && (await standing(env, '801')).spent === 0);
const sv = await call(mgr, '/api/controlcenter/settings/points', { prices: adm.d.rules.prices.map((p) => ({ ...p, status: p.id === 'role-colour' ? 'approved' : p.status })) });
t('a manager approves one prize from the Control Center', sv.s === 200 && sv.d.value.rules.prices.find((p) => p.id === 'role-colour').status === 'approved');
const mine2 = await call(ash, '/api/points');
t('members now see only the approved prize', mine2.d.prices.length === 1 && mine2.d.prices[0].id === 'role-colour');
const ok = await call(ash, '/api/points/redeem', { item: 'role-colour' });
t('the approved prize can be bought', ok.s === 200 && (await standing(env, '801')).spent === 150);
const off = await call(mgr, '/api/controlcenter/settings/points', { prices: [{ ...sv.d.value.rules.prices[0], status: 'off' }] });
t('a prize set to off, or deleted, cannot be bought', (await call(ash, '/api/points/redeem', { item: 'role-colour' })).s === 404 && off.d.value.rules.prices.length === 1);
t('an unknown status is refused', !!cleanRules({ prices: [{ name: 'X', cost: 5, status: 'free' }] }).error);
t('a price saved the old way (no status) counts as approved', cleanRules({ prices: [{ name: 'Old', cost: 5 }] }).rules.prices[0].status === 'approved');

// ---------- gift and refund by hand ----------
const rf = await call(mgr, '/api/points/admin/refund', { user: '801', amount: 150, item: 'Custom Discord role colour', note: 'bought by mistake' });
t('a manager refunds a checkout mistake: the points come back', rf.s === 200 && (await standing(env, '801')).spent === 0);
t('a refund cannot exceed what was spent', (await call(mgr, '/api/points/admin/refund', { user: '801', amount: 5 })).s === 409);
const gf = await call(mgr, '/api/points/admin/gift', { user: '802', item: 'Mascot shout-out', note: 'for the MOTM night' });
t('a manager gifts a prize for free: no points move, it is in the ledger and the audit trail', gf.s === 200 && (await standing(env, '802')).spent === 0 && sqlite.prepare("SELECT COUNT(*) AS n FROM points_log WHERE user_id = '802' AND reason LIKE 'Gift%'").get().n === 1 && sqlite.prepare("SELECT COUNT(*) AS n FROM config_audit WHERE action IN ('gift','refund')").get().n === 2);
t('members cannot gift or refund', (await call(ash, '/api/points/admin/gift', { user: '802', item: 'x' })).s >= 403 && (await call(ash, '/api/points/admin/refund', { user: '801', amount: 1 })).s >= 403);
t('the new routes are manager routes in the Control Center matrix', routeOf('POST', '/api/points/admin/gift')?.min === 'manager' && routeOf('POST', '/api/points/admin/refund')?.min === 'manager');

// ---------- brand + config rules ----------
const src = fs.readFileSync(new URL('../bot/engagement.js', import.meta.url), 'utf8');
t('no channel or role ID and no NOREX name is written in the engagement code (channels come from Discord and the Organization config)', !/\d{17,20}/.test(src) && !/norex/i.test(src));
t('the flag engagementPoints ships owner', JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).features.engagementPoints === 'owner');
t('the Control Center prize table has status, add and delete and the gift and refund forms', /data-cs-prizeadd/.test(fs.readFileSync(new URL('../next/static/ccsettings.js', import.meta.url), 'utf8')) && /points_gift/.test(fs.readFileSync(new URL('../next/static/ccsettings.js', import.meta.url), 'utf8')) && /points_refund/.test(fs.readFileSync(new URL('../next/static/ccsettings.js', import.meta.url), 'utf8')));
done();
