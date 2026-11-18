// PF-024 Item 24 – the shared points economy on top of the P11.3 ledger (bot/points.js): seasonal reset, spendable credit that never goes below 0,
// rules editable in the Control Center, once-per-match performance points from the keyed Actions route, the weekly balance DM, no daily caps,
// Phoenix branding. Owner-first behind the flag `pointsEconomy`.
import { call, env, login, sqlite } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import { awardPoints, awardRule, spendPoints, loadRules, cleanRules, defaultRules, matchAward, RULE_DEFAULTS, weeklyDue, weekKey, digestText, weeklyDigest, pointsKey, seasonOf, standing } from '../bot/points.js';
import { matchPointRows } from '../scripts/lib/pointspush.mjs';
import { TYPES } from '../bot/notify.js';
import { bannerForDm } from '../bot/banners.js';
import { ROUTES, routeOf, ccDenied } from '../bot/ccpermissions.js';
import { SPLIT } from '../bot/ccsettings.js';
import fs from 'node:fs';

const setFlags = (o) => { env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), ...o }); };
setFlags({ points: 'members', pointsEconomy: 'members', notifications: 'members' });
env.DISCORD_CLIENT_SECRET ||= 'secret-for-tests';
const owner = await login('111', [], 'Owner'), mgr = await login('333', ['mgr'], 'Manager'), ash = await login('801', [], 'Ash'), bo = await login('802', [], 'Bo');

// ---------- rules ----------
const d = defaultRules();
t('every rule has a default and the defaults keep the old amounts (check-in 5, rating 2, vote 2, clean week 3)', d.amounts['attendance.checkin'] === 5 && d.amounts['community.rating'] === 2 && d.amounts['community.motm_vote'] === 2 && d.amounts['behaviour.clean_streak'] === 3 && Object.keys(RULE_DEFAULTS).length === Object.keys(d.amounts).length);
t('the price list starts empty (the owner has not set prices)', d.prices.length === 0);
t('cleanRules: bad amounts and unknown keys are refused or dropped', !!cleanRules({ amounts: { 'match.goal': -1 } }).error && !!cleanRules({ amounts: { 'match.goal': 5000 } }).error && !('nope' in cleanRules({ amounts: { nope: 3 } }).rules.amounts));
t('cleanRules: prices need a name and a cost, ids are made unique', !!cleanRules({ prices: [{ name: '', cost: 5 }] }).error && !!cleanRules({ prices: [{ name: 'A', cost: 0 }] }).error && !!cleanRules({ prices: [{ name: 'A', cost: 5 }, { name: 'a', cost: 6 }] }).error && cleanRules({ prices: [{ name: 'Gold Role', cost: '50' }] }).rules.prices[0].id === 'gold-role');

// ---------- editing the rules in the Control Center (area `points`, manager level) ----------
t('points is a manager area of the Control Center settings', SPLIT.manager.includes('points'));
const asMember = await call(ash, '/api/controlcenter/settings/points', { amounts: { 'match.goal': 9 } });
t('a member cannot edit the rules', asMember.s === 403);
const save = await call(mgr, '/api/controlcenter/settings/points', { amounts: { 'match.goal': 4, 'attendance.checkin': 6 }, prices: [{ name: 'Custom role colour', cost: 40, note: 'one season' }] });
t('a manager saves the rules and the price list', save.s === 200 && save.d.value.rules.amounts['match.goal'] === 4 && save.d.value.rules.prices[0].id === 'custom-role-colour');
t('the save is in the audit trail (cc:points)', sqlite.prepare("SELECT COUNT(*) AS n FROM config_audit WHERE entity = 'cc:points'").get().n === 1);
t('the rules are read from the saved row, not from code', (await loadRules(env)).amounts['match.goal'] === 4);
await awardRule(env, '801', 'attendance.checkin', 'Checked in');
t('awardRule pays the amount the managers set (6, not the old 5)', (await standing(env, '801')).earned === 6);
await call(mgr, '/api/controlcenter/settings/points', { amounts: { 'attendance.checkin': 0 } });
await awardRule(env, '801', 'attendance.checkin', 'Checked in again');
t('0 switches a rule off', (await standing(env, '801')).earned === 6);
await call(mgr, '/api/controlcenter/settings/points', { amounts: { 'attendance.checkin': 6 } });

// ---------- no daily caps ----------
for (let i = 0; i < 30; i++) await awardPoints(env, '802', 'community', 2, `vote ${i}`);
t('no daily cap: thirty awards in a row all count', (await standing(env, '802')).earned === 60);

// ---------- match performance (keyed route from Actions) ----------
const key = await pointsKey(env.DISCORD_CLIENT_SECRET);
const post = (body, k = key) => env.DB && fetchRoute('/api/points/match', body, k);
const { default: worker } = await import('../bot/worker.js');
async function fetchRoute(path, body, k) {
  const r = await worker.fetch(new Request('https://bot' + path, { method: 'POST', headers: { 'X-Phoenix-Key': k, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  return { s: r.status, d: await r.json().catch(() => null) };
}
sqlite.prepare("INSERT OR REPLACE INTO claims (user_id, player, player_name, status, at) VALUES ('801', 'ashfire', 'AshFire', 'approved', 1)").run();
const M = { matchId: '100030000000001', win: true, players: [{ name: 'ashfire', goals: 2, assists: 1, mom: true }, { name: 'Stranger', goals: 5 }] };
t('the match route refuses a wrong key', (await post(M, 'nope')).s === 403);
const before = (await standing(env, '801')).earned;
const m1 = await post(M);
t('match points: played 1 + 2 goals x4 + 1 assist + motm 5 + win 3 = 18, one unmatched player', m1.s === 200 && m1.d.awarded === 18 && m1.d.members === 1 && m1.d.unmatched === 1 && (await standing(env, '801')).earned === before + 18);
const m2 = await post(M);
t('sending the same match again pays nothing (once per member per match)', m2.d.awarded === 0 && (await standing(env, '801')).earned === before + 18);
t('the ledger row says what it was for', /Match 100030000000001: played, 2 goals, 1 assist, man of the match, win/.test(sqlite.prepare("SELECT reason FROM points_log WHERE ref = 'm:100030000000001'").get().reason));
t('matchAward is pure: a loss with nothing else is just "played"', matchAward(defaultRules(), { played: true, goals: 0, assists: 0, mom: false, win: false }).delta === 1);
const rows = matchPointRows({ matchId: '77', clubs: { 5: { goals: '3', goalsAgainst: '1' } }, players: { 5: { 1: { playername: 'AshFire', goals: '2', assists: '0', mom: '1' } }, 9: { 2: { playername: 'Other', goals: '1' } } } }, ['5']);
t('the Actions helper sends only our club players with goals, assists and man of the match', rows.win === true && rows.players.length === 1 && rows.players[0].name === 'AshFire' && rows.players[0].goals === 2 && rows.players[0].mom === true && !matchPointRows({ matchId: '1', players: { 9: {} } }, ['5']));
setFlags({ pointsEconomy: 'off' });
t('the match route does nothing while pointsEconomy is off', (await post({ ...M, matchId: '100030000000002' })).d.awarded === 0);
setFlags({ pointsEconomy: 'members' });

// ---------- spendable credit ----------
const bal = (await standing(env, '801')).balance;
const s1 = await spendPoints(env, '801', 10, 'Custom role colour', { by: { u: '333', n: 'Manager' } });
t('a spend lowers the balance and keeps the earned total', s1.ok && s1.balance === bal - 10 && (await standing(env, '801')).earned === bal && (await standing(env, '801')).spent === 10);
t('a spend is a ledger entry (category spend, negative) and an audit row', sqlite.prepare("SELECT delta FROM points_log WHERE user_id = '801' AND category = 'spend'").get().delta === -10 && sqlite.prepare("SELECT COUNT(*) AS n FROM config_audit WHERE entity = 'points:spend'").get().n === 1);
const over = await spendPoints(env, '801', 100000, 'Too much');
t('a balance never goes below 0: an overspend is refused and changes nothing', over.status === 409 && (await standing(env, '801')).balance === bal - 10 && sqlite.prepare("SELECT COUNT(*) AS n FROM points_log WHERE category = 'spend' AND user_id = '801'").get().n === 1);
t('spend refuses zero, negative and fractions', (await spendPoints(env, '801', 0, 'x')).status === 400 && (await spendPoints(env, '801', -5, 'x')).status === 400 && (await spendPoints(env, '801', 'abc', 'x')).status === 400);
t('the leaderboard ranks what was earned, not what is left', (await call(ash, '/api/points/leaderboard')).d.rows.find((r) => r.id === '801').pts === bal);

// ---------- member view and redeeming ----------
const me = await call(ash, '/api/points');
t('GET /api/points: season, earned, spent, balance, rank, breakdown and the price list', me.d.season === 'S1' && me.d.total === bal && me.d.spent === 10 && me.d.balance === bal - 10 && me.d.by.match === 18 && me.d.prices.length === 1 && me.d.recent[0].category === 'spend');
const red = await call(bo, '/api/points/redeem', { item: 'custom-role-colour' });
t('a member redeems an item from the price list (price 40 from the rules): 60 → 20', red.s === 200 && red.d.balance === 20 && red.d.item === 'Custom role colour');
t('an item not on the list is refused', (await call(bo, '/api/points/redeem', { item: 'nope' })).s === 404);
const broke = await call(ash, '/api/points/redeem', { item: 'custom-role-colour' });
t('redeeming without enough points is refused (409) and nothing is taken', broke.s === 409 && (await standing(env, '801')).balance === bal - 10);
setFlags({ pointsEconomy: 'owner' });
t('while the flag is owner-only members see no economy, get no match points and no DM', (await call(ash, '/api/points/redeem', { item: 'custom-role-colour' })).s === 404 && (await call(ash, '/api/points')).d.prices === undefined && (await weeklyDigest(env, Date.UTC(2026, 10, 23, 9, 30))).sent === 0);
setFlags({ pointsEconomy: 'off' });
t('with pointsEconomy off the spend routes and the price list are not there', (await call(ash, '/api/points/redeem', { item: 'custom-role-colour' })).s === 404 && (await call(ash, '/api/points')).d.prices === undefined);
setFlags({ pointsEconomy: 'members' });

// ---------- staff tools and permissions ----------
const adm = await call(mgr, '/api/points/admin');
t('managers see the rules, the season and the recent spends', adm.s === 200 && adm.d.season === 'S1' && adm.d.spends.length >= 2 && adm.d.rules.prices.length === 1);
t('a member is refused the staff view', (await call(ash, '/api/points/admin')).s === 403 || (await call(ash, '/api/points/admin')).s === 404);
const sp = await call(mgr, '/api/points/admin/spend', { user: '802', amount: 5, item: 'Shoutout', note: 'by hand' });
t('a manager records a spend for a member', sp.s === 200 && sp.d.balance === 15);
t('...and an overspend is a clear 409', (await call(mgr, '/api/points/admin/spend', { user: '802', amount: 9999, item: 'x' })).s === 409);
t('the routes are in the Control Center matrix: managers for the tools, owner for the season reset', routeOf('POST', '/api/points/admin/spend')?.min === 'manager' && routeOf('POST', '/api/points/admin/reset-season')?.min === 'owner' && !!ccDenied({ role: 'manager' }, 'POST', '/api/points/admin/reset-season') && ccDenied({ role: 'manager' }, 'POST', '/api/points/admin/spend') === null);

// ---------- weekly balance DM ----------
const mon = Date.UTC(2026, 10, 23, 9, 30); // a Monday 09:30 UTC
t('the digest is due Monday from 09:00 UTC, once a week', weeklyDue(mon, 0) && !weeklyDue(mon, weekKey(mon)) && !weeklyDue(mon - 3 * 3600e3, 0) && weeklyDue(mon + 7 * 86400e3, weekKey(mon)));
const text = digestText({ season: 'S1', earned: 60, spent: 45, balance: 15, rank: 2 }, { community: 12, match: 6 });
t('the DM text has the balance, the breakdown and the rank, with Phoenix wording only', /Balance: 15 points/.test(text) && /Community \+12/.test(text) && /Match performance \+6/.test(text) && /#2/.test(text) && !/norex/i.test(text));
t('the DM kind `points` exists in the DM matrix source, off-by-default is not forced, gold stripe and its own picture', TYPES.points?.def === 'dm' && bannerForDm('points') === 'dm-points');
const dmCard = fs.readFileSync(new URL('../scripts/cards.mjs', import.meta.url), 'utf8');
t('the DM picture is in the Phoenix card list', /'dm-points': \{[^}]*Your points/.test(dmCard) && fs.existsSync(new URL('../tools/bot-audit/out/cards/banner-dm-points.png', import.meta.url)));
sqlite.exec("DELETE FROM notifications; DELETE FROM meta WHERE key = 'points_weekly'");
const sent = await weeklyDigest(env, mon);
const dms = sqlite.prepare("SELECT user_id, title, body FROM notifications WHERE type = 'points'").all();
t('the weekly run sends one notification per member with points, with a balance', sent.sent >= 2 && dms.length === sent.sent && dms.some((x) => x.user_id === '801' && /to spend/.test(x.title)) && dms.every((x) => !/norex/i.test(x.title + x.body)));
t('running it again the same week sends nothing', (await weeklyDigest(env, mon + 3600e3)).sent === 0);
setFlags({ pointsEconomy: 'off' });
sqlite.exec("DELETE FROM meta WHERE key = 'points_weekly'");
t('while pointsEconomy is off no weekly DM goes out', (await weeklyDigest(env, mon)).sent === 0);
setFlags({ pointsEconomy: 'members' });

// ---------- season reset ----------
t('a manager cannot reset the season', (await call(mgr, '/api/points/admin/reset-season', { confirm: 'RESET' })).s === 403);
t('the owner must type RESET', (await call(owner, '/api/points/admin/reset-season', { label: 'S2' })).s === 400);
const preTop = (await call(ash, '/api/points/leaderboard')).d.rows[0];
const rs = await call(owner, '/api/points/admin/reset-season', { label: 'S2', confirm: 'RESET' });
t('the reset archives every member and starts S2', rs.s === 200 && rs.d.closed === 'S1' && rs.d.season === 'S2' && rs.d.members >= 2 && (await seasonOf(env)) === 'S2');
const arch = sqlite.prepare("SELECT earned, rank FROM points_seasons WHERE season = 'S1' ORDER BY rank LIMIT 1").get();
t('the archive keeps the closed season totals and ranks', arch.earned === preTop.pts && arch.rank === 1);
const post1 = await standing(env, '801');
t('everyone starts the new season at 0, spent too', post1.earned === 0 && post1.spent === 0 && post1.balance === 0 && Object.values(post1.by).every((n) => n === 0));
await awardPoints(env, '801', 'community', 3, 'new season vote');
t('points earned after the reset count for S2 only', (await standing(env, '801')).by.community === 3 && sqlite.prepare("SELECT season FROM points_log WHERE reason = 'new season vote'").get().season === 'S2');
t('the same match cannot pay again after a reset (the ref is for good)', (await post(M)).d.awarded === 0);
t('the reset is in the audit trail', sqlite.prepare("SELECT COUNT(*) AS n FROM config_audit WHERE entity = 'points:season'").get().n === 1);
t('the same season name is refused', (await call(owner, '/api/points/admin/reset-season', { label: 'S2', confirm: 'RESET' })).s === 400);

// ---------- Phoenix branding of everything this item outputs ----------
const src = ['bot/points.js', 'scripts/lib/pointspush.mjs'].map((f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
t('no NOREX name, red or crest in the points module or the Actions helper', !/norex|c8352c|080b11/i.test(src.replace(/norex-?crawl/gi, '')));
t('no channel or role id is hardcoded (the economy posts nothing to a channel; DMs only)', !/\b\d{17,20}\b/.test(src));
done();
