// Phoenix Matchday (bot/matchday.js, wave MB1): /matchday create | checkin | status, the command moves behind the app
// (bot/apps.js homeOf / HELD / transition window), and the preferred position (MB2, bot/prefpos.js). Discord is stubbed.
import { env, sqlite } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import worker from '../bot/worker.js';
import { matchdayBody, matchdayCommand, MATCHDAY_KINDS } from '../bot/matchday.js';
import { log } from '../bot/members.js';
import { plainText } from '../bot/ui.js';
import { COMMANDS, APP_COMMANDS, MOVED_FROM, HELD } from '../bot/commanddefs.js';
import { homeOf, servedBy, movedOnly, movedNote, registeredBy, inGrace, answeringApp, GRACE_DAYS } from '../bot/apps.js';
import { PREF_POSITIONS, cleanPref, expandPref, parsePref, prefSelect, savePref, prefPosSelect } from '../bot/prefpos.js';
import { answerEvents } from '../bot/events.js';

const DAY = 864e5;
// ---------- the command map ----------
const MOVED = ['host', 'lineup', 'matchday']; // schedule, nextevent and availability are now /matchday schedule | next | who
t('matchday owns the match-day commands, rush owns /rush, /lfg and /queue', MOVED.every((n) => APP_COMMANDS.matchday.includes(n)) && APP_COMMANDS.rush.join() === 'rush,lfg,queue,rushhelp');
t('moved commands are off their old apps in the map', !APP_COMMANDS.tools.some((n) => MOVED.includes(n)) && !APP_COMMANDS.stats.includes('rush'));
t('every moved command remembers where it came from', MOVED.every((n) => MOVED_FROM[n] === 'tools') && MOVED_FROM.rush === 'stats');
t('new commands are held until their app exists', HELD.has('lfg') && HELD.has('queue') && HELD.has('rushladder') && !MOVED_FROM.lfg && !MOVED_FROM.queue);
t('/matchday has create, checkin and status; /lfg has now, cancel and list', COMMANDS.find((c) => c.name === 'matchday').options.map((o) => o.name).join() === 'create,checkin,status,schedule,next,who' && COMMANDS.find((c) => c.name === 'lfg').options.map((o) => o.name).join() === 'now,cancel,list');

// ---------- nothing changes for members until the apps exist ----------
const base = { DISCORD_APP_ID: '1', DISCORD_PUBLIC_KEY: 'aa', DISCORD_BOT_TOKEN: 't' };
const old = { ...base, DISCORD_APP_ID_TOOLS: '3', DISCORD_PUBLIC_KEY_TOOLS: 'cc', DISCORD_APP_ID_STATS: '2', DISCORD_PUBLIC_KEY_STATS: 'bb' }; // today: core + stats + tools
t('before the apps: moved commands stay on tools / stats', MOVED.every((n) => homeOf(old, n) === 'tools') && homeOf(old, 'rush') === 'stats' && answeringApp(old, 'host') === 'tools');
t('before the apps: with no tools app they fall back to core', MOVED.every((n) => homeOf(base, n) === 'core') && homeOf(base, 'rush') === 'core');
t('before the apps: /lfg and /queue are nowhere', homeOf(old, 'queue') === null && homeOf(old, 'lfg') === null && !servedBy(old, 'core').has('lfg') && !servedBy(old, 'tools').has('lfg') && answeringApp(old, 'lfg') === 'core');
t('before the apps: nothing is on a transition list', movedOnly(old, 'tools').size === 0 && !movedNote(old, 'tools', 'host'));

// ---------- the apps go live ----------
const live = { ...old, DISCORD_APP_ID_MATCHDAY: '4', DISCORD_PUBLIC_KEY_MATCHDAY: 'dd', DISCORD_APP_ID_RUSH: '5', DISCORD_PUBLIC_KEY_RUSH: 'ee' };
t('live: moved commands belong to the new apps and new ones switch on', MOVED.every((n) => homeOf(live, n) === 'matchday') && homeOf(live, 'rush') === 'rush' && homeOf(live, 'lfg') === 'rush');
t('live: the old apps no longer serve them', !servedBy(live, 'tools').has('host') && !servedBy(live, 'stats').has('rush'));
t('live without a date: no transition window, old apps drop the commands at once', registeredBy(live, 'tools').size === servedBy(live, 'tools').size && !inGrace(live, 'matchday'));
const since = Date.parse('2026-11-20T00:00:00Z');
const graced = { ...live, APP_LIVE_SINCE_MATCHDAY: '2026-11-20', APP_LIVE_SINCE_RUSH: '2026-11-20' };
t('transition: for 14 days the old apps still list the moved commands', GRACE_DAYS === 14 && MOVED.every((n) => movedOnly(graced, 'tools', since + DAY).has(n)) && movedOnly(graced, 'stats', since + DAY).has('rush') && registeredBy(graced, 'tools', since + DAY).has('host'));
t('transition: they only point to the new app, with a one-line reply', movedNote(graced, 'tools', 'host', since + DAY) === '/host moved to Phoenix Matchday – use it there from now on.' && /Phoenix Rush/.test(movedNote(graced, 'stats', 'rush', since + DAY)) && movedNote(graced, 'tools', 'club', since + DAY) === null);
t('transition: it ends after two weeks and never starts early', movedOnly(graced, 'tools', since + 15 * DAY).size === 0 && movedOnly(graced, 'tools', since - DAY).size === 0);
t('every command still has exactly one home', COMMANDS.every((c) => [homeOf(live, c.name)].filter(Boolean).length === 1));

// ---------- the Worker: a held command is dark ----------
env.DISCORD_BOT_TOKEN = 'bot';
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), events: 'members', discordRsvp: 'members' });
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex');
async function send(payload) {
  const body = JSON.stringify(payload), ts = String(Date.now());
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  return (await worker.fetch(new Request('https://bot.example/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), env, { waitUntil() {} })).json();
}
const as = (id, roles = []) => ({ member: { user: { id, username: `u${id}` }, roles }, channel_id: '700100', token: 'tok' });
t('Worker: /lfg on today\'s core answers "not on this bot"', /not on this bot/.test(plainText((await send({ type: 2, data: { name: 'lfg', options: [{ name: 'list', type: 1 }] }, ...as('900', ['mgr']) })).data)));
t('Worker: /host still answers on core when tools is not configured', !/not on this bot/.test(plainText((await send({ type: 2, data: { name: 'host', options: [] }, ...as('801') })).data)));

// ---------- /matchday create ----------
const b = (kind, opponent) => matchdayBody({ kind, opponent }, 'UTC', { date: '2026-11-20', time: '21:00' });
t('kinds: league, playoffs, friendly, tournament, vpg', Object.keys(MATCHDAY_KINDS).join() === 'league,playoffs,friendly,tournament,vpg');
t('league night: league type, no title, 11 players, 2 hours', ((x) => x.type === 'league' && !x.title && x.needs.players === 11 && x.duration === 120 && x.notify)(b('league')));
t('playoffs: its own type; friendly: titled with the opponent', b('playoffs').type === 'playoffs' && b('friendly', 'Shortsquad').title === 'Friendly vs Shortsquad' && b('friendly').title === 'Friendly');
t('tournament and VPG are league-type events with their own title', b('tournament').type === 'league' && b('tournament').title === 'Tournament' && b('vpg', 'Rivals FC').type === 'league' && b('vpg', 'Rivals FC').title === 'VPG match vs Rivals FC');

const now = Date.now();
sqlite.exec(`INSERT INTO users (id, name, avatar, first_at, last_at) VALUES ('801', 'Carded', null, ${now}, ${now}), ('802', 'Second', null, ${now}, ${now}), ('900', 'Boss', null, ${now}, ${now}) ON CONFLICT DO NOTHING`);
sqlite.exec(`INSERT INTO meta (key, value) VALUES ('server_tools', '{"pingRoles":{"match":"7001","rush":"7002"}}') ON CONFLICT (key) DO UPDATE SET value = excluded.value`);
const posts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (!url.startsWith('https://discord.com/api/v10')) return realFetch(url, init);
  const m = url.match(/\/channels\/(\w+)\/messages(?:\/(\w+))?$/);
  if (m && init.method !== 'PATCH') { posts.push({ channel: m[1], ...JSON.parse(init.body) }); return Response.json({ id: `m${posts.length}` }); }
  return Response.json({});
};
const mgr = { u: '900', n: 'Boss', a: null, role: 'manager' }, member = { u: '801', n: 'Carded', a: null, role: 'member' };
const deps = { log, loadSite: async () => ({}) };
const md = (sub, o, me = mgr) => matchdayCommand({ channel_id: '700100', token: 'tok', data: {} }, env, me, me, sub, o, deps);

t('create: members are told it is for managers', /Managers only/.test(plainText((await md('create', { kind: 'vpg', when: 'tomorrow 9pm', timezone: 'UTC' }, member)).data)));
const r = await md('create', { kind: 'vpg', when: 'tomorrow 9pm', timezone: 'UTC', opponent: 'Rivals FC', notes: 'VPG lobby' });
const ev = sqlite.prepare("SELECT * FROM events WHERE title = 'VPG match vs Rivals FC'").get();
t('create: a VPG match day is scheduled like a hosted event', !!ev && ev.type === 'league' && ev.notes === 'VPG lobby' && JSON.parse(ev.needs).players === 11 && /Scheduled/.test(plainText(r.data)));
t('create: posted with the Match night ping and sign-up buttons, in the Phoenix colour', posts.at(-1)?.components[0].content === '<@&7001>' && /norex:ev:\d+:yes/.test(JSON.stringify(posts.at(-1))) && posts.at(-1).components.some((c) => c.accent_color === 0xe8651a));
await md('create', { kind: 'playoffs', when: 'tomorrow 10pm', timezone: 'UTC', weekly: true });
t('create: playoffs repeat weekly ×4', sqlite.prepare("SELECT COUNT(*) n FROM events WHERE type = 'playoffs'").get().n === 4);
t('no NOREX name or colour in the new replies', !/norex|c8352c/i.test(JSON.stringify(posts.at(-1)) + JSON.stringify(r)) || /norex:ev:/.test(JSON.stringify(posts.at(-1))) && !/norex|c8352c/i.test(plainText(r.data) + JSON.stringify(posts.at(-1)).replace(/norex:ev:\d+:\w+/g, '')));

// ---------- /matchday status and checkin ----------
const near = sqlite.prepare("INSERT INTO events (type, title, start, duration, tz, needs, status, by_id, at) VALUES ('league', 'Tonight', ?, 120, 'UTC', '{\"players\":11}', 'scheduled', '900', ?)").run(Date.now() + 20 * 60e3, now);
await answerEvents(env, member, [Number(near.lastInsertRowid)], 'yes');
const st = await md('status', {}, member);
t('status: shows the next match day with who is in', /Tonight/.test(plainText(st.data)) && /Carded/.test(plainText(st.data)));
const ci = await md('checkin', {}, member);
t('checkin: members check in inside the window', /You are on/.test(plainText(ci.data)) && !!sqlite.prepare('SELECT 1 FROM event_checkins WHERE event_id = ? AND user_id = ?').get(Number(near.lastInsertRowid), '801'));
t('unknown subcommand is explained', /create, checkin or status/.test(plainText((await md('nope', {}, member)).data)));

// ---------- MB2: preferred position ----------
t('positions: the eight groups', PREF_POSITIONS.join() === 'GK,CB,LB/RB,CDM,CM,CAM,LW/RW,ST');
t('cleanPref: valid groups only, unique, at most two, order kept', cleanPref(['st', 'ST', 'CAM', 'GK']).join() === 'ST,CAM' && cleanPref(['XX', 7]).length === 0 && cleanPref('ST').length === 0 && cleanPref(null).length === 0);
t('expandPref: wide groups become both sides for the recommender', expandPref(['LB/RB', 'ST']).join() === 'LB,RB,ST' && expandPref(['LW/RW']).join() === 'LW,RW');
t('parsePref: bad stored JSON is no preference', parsePref('not json').length === 0 && parsePref(null).length === 0 && parsePref('["CM"]').join() === 'CM');
const menu = prefSelect(5, ['CM']);
t('select: optional, up to two, current choice ticked, Discord custom id', menu.components[0].min_values === 0 && menu.components[0].max_values === 2 && menu.components[0].custom_id === 'pf:pos:5' && menu.components[0].options.length === 8 && menu.components[0].options.find((o) => o.value === 'CM').default && !menu.components[0].options.find((o) => o.value === 'ST').default);
const evId = Number(near.lastInsertRowid);
t('save: a yes keeps its preference, JSON in order', await savePref(env, evId, '801', ['ST', 'CAM']) && sqlite.prepare('SELECT pref_pos FROM event_rsvps WHERE event_id = ? AND user_id = ?').get(evId, '801').pref_pos === '["ST","CAM"]');
t('save: nobody who has not answered can set one', (await savePref(env, evId, '802', ['ST'])) === false);
const pick = await prefPosSelect({ data: { custom_id: `pf:pos:${evId}`, values: ['CB'] } }, env, member);
t('the select answers privately and stores the choice', /Noted: CB/.test(plainText(pick.data)) && (pick.data.flags & 64) === 64 && sqlite.prepare('SELECT pref_pos FROM event_rsvps WHERE event_id = ? AND user_id = ?').get(evId, '801').pref_pos === '["CB"]');
await prefPosSelect({ data: { custom_id: `pf:pos:${evId}`, values: [] } }, env, member);
t('choosing nothing clears it', sqlite.prepare('SELECT pref_pos FROM event_rsvps WHERE event_id = ? AND user_id = ?').get(evId, '801').pref_pos === null);
await answerEvents(env, member, [evId], 'yes', ['GK']);
t('answerEvents can carry the preference, and a plain re-answer keeps it', sqlite.prepare('SELECT pref_pos FROM event_rsvps WHERE event_id = ? AND user_id = ?').get(evId, '801').pref_pos === '["GK"]');
await answerEvents(env, member, [evId], 'maybe');
t('a maybe keeps it; a no drops it', sqlite.prepare('SELECT pref_pos FROM event_rsvps WHERE event_id = ? AND user_id = ?').get(evId, '801').pref_pos === '["GK"]');
await answerEvents(env, member, [evId], 'no');
t('a no drops it', sqlite.prepare('SELECT pref_pos FROM event_rsvps WHERE event_id = ? AND user_id = ?').get(evId, '801').pref_pos === null);
// the button on the post asks for it
await answerEvents(env, member, [evId], 'yes');
const btn = await send({ type: 3, data: { custom_id: `norex:ev:${evId}:yes` }, ...as('801') });
t('Discord: tapping in answers and shows the position select under the confirmation', JSON.stringify(btn).includes(`pf:pos:${evId}`) && /You’re in/.test(plainText(btn.data)));
const noBtn = await send({ type: 3, data: { custom_id: `norex:ev:${evId}:no` }, ...as('801') });
t('Discord: tapping can’t make it asks nothing', !JSON.stringify(noBtn).includes('pf:pos:'));
const sel = await send({ type: 3, data: { custom_id: `pf:pos:${evId}`, component_type: 3, values: ['CDM', 'CM'] }, ...as('801') });
await send({ type: 3, data: { custom_id: `norex:ev:${evId}:yes` }, ...as('801') });
const sel2 = await send({ type: 3, data: { custom_id: `pf:pos:${evId}`, component_type: 3, values: ['CDM', 'CM'] }, ...as('801') });
t('Discord: the select reaches its handler through the Worker', /Noted: CDM \/ CM/.test(plainText(sel2.data)) && /Answer first|Noted/.test(plainText(sel.data)));
globalThis.fetch = realFetch;
done();
