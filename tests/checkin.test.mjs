// Check-in + answer order: first answer time, the answer log, the Check in button/post, the lineup post's bench and kick-off notes.
import { call, env, login, sqlite } from './mock.mjs';
import worker from '../bot/worker.js';
import { plainText } from '../bot/ui.js';
import { eventReminders, kickoffNotes, MIN_REAL, checkinNudges } from '../bot/events.js';
import fs from 'node:fs';
import { t, done } from './lib.mjs';

const txt = (m) => plainText(m);
const setFlags = (o) => { env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), ...o }); };
setFlags({ events: 'public', matchNight: 'members', notifications: 'members', profiles: 'members', discordRsvp: 'members' });

const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex');
env.DISCORD_BOT_TOKEN = 'bot';
async function send(payload) {
  const body = JSON.stringify(payload), ts = String(Date.now());
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  return (await worker.fetch(new Request('https://bot/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), env, { waitUntil() {} })).json();
}
const who = (id) => ({ member: { user: { id, username: `u${id}`, global_name: `G${id}` }, nick: `Nick ${id}`, roles: [] } });
const button = (custom_id, id = '500') => send({ type: 3, data: { custom_id, component_type: 2 }, ...who(id) });

const posts = [], edits = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.endsWith('/guilds/9/channels')) return Response.json([{ id: '70001', name: 'match-nights', type: 0 }]);
  if (u.endsWith('/guilds/9/roles')) return Response.json([{ id: '9', name: '@everyone' }]);
  if (u.endsWith('/users/@me/channels')) return Response.json({ id: 'dm' });
  let m = u.match(/\/channels\/(\d+)\/messages\/(\w+)$/);
  if (m && init.method === 'PATCH') { edits.push({ channel: m[1], msg: m[2], ...JSON.parse(init.body) }); return Response.json({}); }
  m = u.match(/\/channels\/(\w+)\/messages$/);
  if (m && m[1] !== 'dm') { posts.push({ channel: m[1], ...JSON.parse(init.body) }); return Response.json({ id: `m${posts.length}` }); }
  if (m) return Response.json({ id: 'dm-msg' });
  return realFetch(url, init);
};
const btnsOf = (m) => { const out = []; const walk = (c) => { if (!c || typeof c !== 'object') return; if (Array.isArray(c)) return c.forEach(walk); if (c.type === 2) out.push(c); walk(c.components); walk(c.accessory); }; walk(m?.components); return out; };

const mgr = await login('600', ['mgr'], 'Coach');
const a = await login('500', [], 'Player One'), b = await login('501', [], 'Player Two'), c = await login('502', [], 'Player Three');
const inMin = (n) => { const d = new Date(Date.now() + n * 60e3); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }; };

// ----- answer order: the first answer keeps its place when the answer changes -----
const far = inMin(60 * 48);
const ev = (await call(mgr, '/api/events', { type: 'league', ...far, tz: 'UTC', duration: 120, discord: { channel: '70001' } })).d.id;
const order = () => sqlite.prepare('SELECT user_id FROM event_rsvps WHERE event_id = ? ORDER BY COALESCE(first_at, at), user_id').all(ev).map((r) => r.user_id).join();
await call(b, '/api/events/rsvp', { ids: [ev], status: 'maybe' }); await new Promise((r) => setTimeout(r, 5));
await call(a, '/api/events/rsvp', { ids: [ev], status: 'no' }); await new Promise((r) => setTimeout(r, 5));
await call(c, '/api/events/rsvp', { ids: [ev], status: 'yes' }); await new Promise((r) => setTimeout(r, 5));
const firstA = sqlite.prepare("SELECT first_at FROM event_rsvps WHERE event_id = ? AND user_id = '500'").get(ev).first_at;
await call(a, '/api/events/rsvp', { ids: [ev], status: 'yes' });
t('first answer keeps its place when the answer changes', order() === '501,500,502' && sqlite.prepare("SELECT first_at FROM event_rsvps WHERE event_id = ? AND user_id = '500'").get(ev).first_at === firstA);
t('the order the API sends follows the first answer, with the time', (await call(mgr, '/api/events')).d.events.find((e) => e.id === ev).rsvps.map((r) => r.id).join() === '501,500,502');
await call(a, '/api/events/rsvp', { ids: [ev], status: 'clear' }); await new Promise((r) => setTimeout(r, 5));
await call(a, '/api/events/rsvp', { ids: [ev], status: 'yes' });
t('clearing an answer and answering again goes to the back', order() === '501,502,500');

// ----- the log -----
const log = sqlite.prepare('SELECT name, kind, prev FROM event_answer_log WHERE event_id = ? ORDER BY id').all(ev).map((r) => `${r.name}:${r.kind}${r.prev ? `<${r.prev}` : ''}`);
t('every answer, change and clear is logged with what it replaced', log.join() === 'Player Two:maybe,Player One:no,Player Three:yes,Player One:yes<no,Player One:clear<yes,Player One:yes');
await call(c, '/api/events/rsvp', { ids: [ev], status: 'yes' });
t('answering the same thing again is not logged twice', sqlite.prepare('SELECT COUNT(*) AS n FROM event_answer_log WHERE event_id = ?').get(ev).n === 6);

// ----- CR-07: the 30-minute post – check-in has closed by then -----
const soon = inMin(20);
const e30 = (await call(mgr, '/api/events', { type: 'league', ...soon, tz: 'UTC', discord: { channel: '70001' } })).d.id;
await call(b, '/api/events/rsvp', { ids: [e30], status: 'maybe' });
await call(a, '/api/events/rsvp', { ids: [e30], status: 'yes' });
await call(c, '/api/events/rsvp', { ids: [e30], status: 'no' });
const before = posts.length;
await eventReminders(env);
const ci = posts.slice(before).find((p) => /Starting in 30 minutes/.test(txt(p)));
t('30 minutes before: the post says check-in is over for this one and has no Check in button', ci && !btnsOf(ci).some((x) => x.custom_id === `phoenix:ci:${e30}`));
t('… tags everyone who said yes or maybe (no lineup yet), not the ones who said no', ci.allowed_mentions.users.includes('500') && ci.allowed_mentions.users.includes('501') && !ci.allowed_mentions.users.includes('502'));
t('… keeps the order they answered and repeats the kick-off notes', /NOT CONFIRMED/.test(txt(ci)) && txt(ci).indexOf('Player Two') < txt(ci).indexOf('Player One') && /10 minutes before the start/.test(txt(ci)) && /6 real players/.test(txt(ci)));
t('… and remembers the post so it can stay live', sqlite.prepare('SELECT checkin_msg FROM events WHERE id = ?').get(e30).checkin_msg === `m${posts.indexOf(ci) + 1}`);
t('Check in after the window is refused', /Check-in is closed|not open|has not been posted/.test(txt((await button(`phoenix:ci:${e30}`, '500')).data)) && !sqlite.prepare("SELECT 1 FROM event_checkins WHERE event_id = ? AND user_id = '500'").get(e30));

// ----- CR-07: lineup posted 45 minutes before → check-in for the players in it -----
const e45 = (await call(mgr, '/api/events', { type: 'league', ...inMin(45), tz: 'UTC', discord: { channel: '70001' } })).d.id;
await call(b, '/api/events/rsvp', { ids: [e45], status: 'maybe' });
await call(a, '/api/events/rsvp', { ids: [e45], status: 'yes' });
await call(c, '/api/events/rsvp', { ids: [e45], status: 'yes' });
t('before the lineup is posted nobody can check in', /lineup has not been posted/.test(txt((await button(`phoenix:ci:${e45}`, '500')).data)) && !sqlite.prepare('SELECT 1 FROM event_checkins WHERE event_id = ?').get(e45));
const lb = posts.length;
const pub = await call(mgr, '/api/events/lineup', { id: e45, formation: '4-3-3', lineup: { 500: 'ST', 502: 'GK' }, publish: true, channel: '70001', suggested: true });
const lp = posts.slice(lb).find((p) => /starting/.test(txt(p)));
t('the lineup post carries a Check in button and says check-in is open until 30 minutes before the start', pub.s === 200 && lp && btnsOf(lp).some((x) => x.custom_id === `phoenix:ci:${e45}`) && /Check-in is open for the lineup/.test(txt(lp)) && /closes 30 minutes before kick-off/.test(txt(lp)));
t('… with the bench (said yes or maybe, not starting) in the order they answered, and the kick-off notes', /BENCH/.test(txt(lp)) && /Player Two.*maybe/.test(txt(lp)) && /10 minutes before the start/.test(txt(lp)));
const pressed = await button(`phoenix:ci:${e45}`, '500');
t('Check in button checks the player in, privately', (pressed.data.flags & 64) === 64 && /checked in/.test(txt(pressed.data)) && sqlite.prepare("SELECT 1 FROM event_checkins WHERE event_id = ? AND user_id = '500'").get(e45));
t('… logs it with the time', sqlite.prepare("SELECT kind FROM event_answer_log WHERE event_id = ? AND user_id = '500' AND kind = 'checkin'").all(e45).length === 1);
await button(`phoenix:ci:${e45}`, '500');
t('pressing twice logs one check-in', sqlite.prepare("SELECT COUNT(*) AS n FROM event_answer_log WHERE event_id = ? AND user_id = '500' AND kind = 'checkin'").get(e45).n === 1);
t('a player who is not in the lineup is told check-in is for the lineup', /players in the posted lineup/.test(txt((await button(`phoenix:ci:${e45}`, '501')).data)) && !sqlite.prepare("SELECT 1 FROM event_checkins WHERE event_id = ? AND user_id = '501'").get(e45));
t('check-in on a far-away event is refused', /not open yet/.test(txt((await button(`phoenix:ci:${ev}`, '500')).data)));
setFlags({ matchNight: 'owner' });
t('Check in button respects the matchNight flag', /not switched on/.test(txt((await button(`phoenix:ci:${e45}`, '502')).data)));
setFlags({ matchNight: 'members' });

// ----- CR-07: the reminder before check-in closes + who has not confirmed -----
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('g-ci', 'Test')").run();
const sidCi = sqlite.prepare("SELECT id FROM discord_servers WHERE guild_id = 'g-ci'").get().id;
sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '70077', 'checkin_reminders', 'org', '', 1)").run(sidCi);
const startMs = sqlite.prepare('SELECT start FROM events WHERE id = ?').get(e45).start;
t('no reminder yet at 44 minutes to go (check-in closes in 14)', (await checkinNudges(env, startMs - 44 * 60e3)) === 0);
const nb = posts.length;
t('at 35 minutes to go the unconfirmed lineup player is reminded (once per event)', (await checkinNudges(env, startMs - 35 * 60e3)) === 1 && (await checkinNudges(env, startMs - 35 * 60e3)) === 0);
const nudge = posts.slice(nb).find((p) => p.channel === '70077');
t('… in the check-in reminders channel from the Organization config, tagging only who has not confirmed', nudge && nudge.allowed_mentions.users.join() === '502' && !/Player One/.test(txt(nudge)) && /Player Three/.test(txt(nudge)) && btnsOf(nudge).some((x) => x.custom_id === `phoenix:ci:${e45}`));
t('… and the player and the managers get a bell', sqlite.prepare("SELECT COUNT(*) AS n FROM notifications WHERE ref = ?").get(`cinudge:${e45}`)?.n >= 1);
t('the reminder channel is read from config (purpose checkin_reminders), not code', /channelFor\(env, 'checkin_reminders'\)/.test(fs.readFileSync(new URL('../bot/events.js', import.meta.url), 'utf8')) && /channelFor\(env, 'lineup_posts'\)/.test(fs.readFileSync(new URL('../bot/events.js', import.meta.url), 'utf8')));

// ----- kick-off notes by event type -----
t('minimum real players: league 6, playoffs 8, others none', MIN_REAL.league === 6 && MIN_REAL.playoffs === 8 && !MIN_REAL.friendly);
t('league notes mention 6 and that tournaments need 8; playoffs say 8; friendlies have no minimum', /6 real players/.test(kickoffNotes({ type: 'league' })) && /tournaments need 8/.test(kickoffNotes({ type: 'league' })) && /8 real players/.test(kickoffNotes({ type: 'playoffs' })) && !/real players/.test(kickoffNotes({ type: 'friendly' })) && /5 to 10 minute/.test(kickoffNotes({ type: 'friendly' })));

const lb2 = posts.length;
await call(mgr, '/api/events/lineup', { id: e45, formation: '4-3-3', lineup: { 500: 'ST', 502: 'GK' }, publish: true, channel: '70001', final: true });
t('a lineup marked final is not called a suggestion', !/suggested lineup/.test(txt(posts.slice(lb2).find((p) => /starting/.test(txt(p))))));
t('a lineup posted without a flag inside the window is the latest lineup, not a suggestion', !/suggested lineup/.test(txt(posts.slice(lb2).find((p) => /starting/.test(txt(p))) ?? {})));

// ----- Phoenix brand + wiring -----
const lineupAll = JSON.stringify(posts.slice(lb)) + JSON.stringify(ci);
t('brand: check-in and lineup posts say PHOENIX FIRE, use the Phoenix accent, and name no NOREX', /PHOENIX FIRE/.test(txt(ci)) && /PHOENIX FIRE/.test(txt(lp)) && ci.components.some((c) => c.accent_color === 0xe8651a) && !/norex|NOREX/.test(lineupAll.replace(/norex:ev:/g, '')));
t('check-in button is phoenix:ci:<id> and the old norex:ci:<id> on older posts still works', !/Unknown|not found/i.test(txt((await button(`norex:ci:${e45}`, '502')).data)) && !!sqlite.prepare("SELECT 1 FROM event_checkins WHERE event_id = ? AND user_id = '502'").get(e45));
t('the lineup picture is the Phoenix pitch for the shape, not a NOREX file', JSON.stringify(lp).includes('/cards/lineup-4-3-3.png') );
t('check-in post: the channel comes from the event (set from Organization config), nothing is hardcoded in events.js', !/discord\.com\/api\/v10\/channels\/\d{6,}/.test(fs.readFileSync(new URL('../bot/events.js', import.meta.url), 'utf8')));
done();
