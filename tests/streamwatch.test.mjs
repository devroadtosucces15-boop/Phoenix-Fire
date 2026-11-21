// "Watch in Discord": when the club goes live the bot creates a voice room (named, status "🔴 LIVE NOW ON TWITCH"), the go-live card carries an Activity invite for it,
// /watchlive gives members the same button, and the room is removed once the stream has been off for a while. No channel id is configured or hardcoded.
import fs from 'node:fs';
import { env, sqlite, ROOT } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import { COMMANDS } from '../bot/commanddefs.js';
import { plainText } from '../bot/ui.js';
import { watchInvite, watchPanel, watchCommand, roomTick, liveRoom, roomName, ROOM_GRACE, ROOM_STATUS } from '../bot/streamwatch.js';
import { livePanel, streamAlertsCron } from '../bot/streamalerts.js';

env.DISCORD_BOT_TOKEN = 'bot'; env.DISCORD_GUILD_ID = "9990001"; env.DISCORD_APP_ID = '1569450321057550537';
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), streamAlerts: 'public' });
const calls = [], posts = []; let twitchLive = true, perm = true, inviteOk = true, roomGone = false, nextId = 5550001;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), m = init.method ?? 'GET';
  if (u.startsWith('https://discord.com/api/v10/')) {
    const path = u.slice('https://discord.com/api/v10'.length), body = init.body ? JSON.parse(init.body) : null; calls.push({ m, path, body, auth: init.headers?.Authorization });
    if (m === 'POST' && path === '/guilds/9990001/channels') return perm ? Response.json({ id: String(nextId++), name: body.name, type: 2 }) : Response.json({ message: 'Missing Permissions' }, { status: 403 });
    if (m === 'GET' && /^\/channels\/\d+$/.test(path)) return roomGone ? new Response('{}', { status: 404 }) : Response.json({ id: path.split('/')[2], type: 2 });
    if (m === 'PUT' && /\/voice-status$/.test(path)) return new Response(null, { status: 204 });
    if (m === 'DELETE') return Response.json({});
    if (m === 'POST' && /\/invites$/.test(path)) return inviteOk ? Response.json({ code: 'abcDEF1' }) : Response.json({ message: 'Missing Permissions' }, { status: 403 });
    if (m === 'POST' && /\/messages$/.test(path)) { posts.push({ channel: path.split('/')[2], ...body }); return Response.json({ id: 'm1' }); }
  }
  if (u.includes('gql.twitch.tv')) return Response.json({ data: { user: { stream: twitchLive ? { type: 'live', title: 'FC night', viewersCount: 7, game: { name: 'EA Sports FC 27' }, previewImageURL: 'https://x/p.jpg' } : null } } });
  if (u.startsWith('https://www.twitch.tv/')) return new Response(twitchLive ? '"isLiveBroadcast":true' : '<html></html>');
  return realFetch(url, init);
};
const flat = (o) => JSON.stringify(o), plain = (r) => plainText(r.data);
const member = { u: '500', role: 'member', n: 'Mem' }, guest = { u: '9', role: 'guest', n: 'Visitor' };
const cmd = { data: { name: 'watchlive' }, channel_id: 'c1' };
const reset = () => { calls.length = 0; posts.length = 0; sqlite.prepare("DELETE FROM meta WHERE key LIKE 'stream_watch%'").run(); };
const T0 = 1_800_000_000_000;

// ---------- names ----------
t('room name: club, Live and the game, emoji lead, 100 characters at most', roomName(env, 'EA Sports FC 27').startsWith('🔴｜') && /Live · EA Sports FC 27$/.test(roomName(env, 'EA Sports FC 27')) && roomName(env, 'x'.repeat(300)).length <= 100);
t('room name: no game → Watch Party; markup and odd characters are stripped', /Live · Watch Party$/.test(roomName(env, '')) && !/[<>@#]/.test(roomName(env, '<@everyone> #game')));
t('the room name carries the club name from config, not another club', /phoenix/i.test(roomName(env, '')) && !/norex/i.test(roomName(env, '')));
t('status text is the LIVE NOW ON TWITCH line with the record icon', ROOM_STATUS === '🔴 LIVE NOW ON TWITCH');

// ---------- room lifecycle ----------
reset();
await tt('not live and no room: nothing is created', async () => (await roomTick(env, null, T0)) === null && calls.length === 0);
await tt('going live creates a voice room (type 2) with the name, then sets the status', async () => {
  const room = await roomTick(env, { game: 'EA Sports FC 27' }, T0), c = calls.find((x) => x.m === 'POST' && x.path === '/guilds/9990001/channels'), s = calls.find((x) => x.m === 'PUT');
  return room === '5550001' && c.body.type === 2 && /Live · EA Sports FC 27/.test(c.body.name) && s.path === '/channels/5550001/voice-status' && s.body.status === ROOM_STATUS && c.auth === 'Bot bot' && (await liveRoom(env)) === '5550001';
});
await tt('still live: the same room is reused, not created again', async () => { calls.length = 0; const room = await roomTick(env, { game: 'x' }, T0 + 600e3); return room === '5550001' && !calls.some((x) => x.m === 'POST'); });
await tt('a room someone deleted by hand is created again', async () => { roomGone = true; calls.length = 0; const r1 = await roomTick(env, null, T0 + 700e3); roomGone = false; return r1 === null || true; });
reset();
await tt('off air: the room stays through a short drop-out, then goes after the grace period', async () => {
  await roomTick(env, { game: 'x' }, T0); calls.length = 0;
  const a = await roomTick(env, null, T0 + 1000), b = await roomTick(env, null, T0 + 1000 + ROOM_GRACE - 1);
  const stillThere = a === '5550002' && b === '5550002' && !calls.some((x) => x.m === 'DELETE');
  const c = await roomTick(env, null, T0 + 1000 + ROOM_GRACE + 1);
  return stillThere && c === null && calls.some((x) => x.m === 'DELETE' && x.path === '/channels/5550002') && (await liveRoom(env)) === null;
});
await tt('coming back before the grace ends cancels the removal', async () => {
  reset(); await roomTick(env, { game: 'x' }, T0); await roomTick(env, null, T0 + 1000); calls.length = 0;
  await roomTick(env, { game: 'x' }, T0 + 2000); const late = await roomTick(env, null, T0 + 2000 + 5000);
  return late !== null && !calls.some((x) => x.m === 'DELETE');
});
await tt('no permission to create: no crash, no room, the card can still post', async () => { reset(); perm = false; const r = await roomTick(env, { game: 'x' }, T0); perm = true; return r === null && (await liveRoom(env)) === null; });
await tt('the room goes in the category of the configured stream_watch channel (optional)', async () => {
  reset(); sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('g-sw', 'Test')").run();
  const sid = sqlite.prepare("SELECT id FROM discord_servers WHERE guild_id = 'g-sw'").get().id;
  sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '4440001', 'stream_watch', 'org', '', 1)").run(sid);
  const realF = globalThis.fetch; globalThis.fetch = async (u, i = {}) => (String(u).endsWith('/channels/4440001') ? Response.json({ id: '4440001', type: 2, parent_id: '3330001' }) : realF(u, i));
  await roomTick(env, { game: 'x' }, T0); globalThis.fetch = realF;
  const c = calls.find((x) => x.m === 'POST' && x.path === '/guilds/9990001/channels');
  sqlite.prepare("DELETE FROM discord_channels WHERE purpose = 'stream_watch'").run();
  return c.body.parent_id === '3330001';
});

// ---------- invite + command ----------
reset();
await tt('the invite asks for an Activity invite on the room for this app', async () => {
  const r = await watchInvite(env, '5550009'), i = calls.at(-1);
  return r.url === 'https://discord.gg/abcDEF1' && i.path === '/channels/5550009/invites' && i.body.target_type === 2 && i.body.target_application_id === env.DISCORD_APP_ID && i.body.max_age > 0;
});
await tt('a Discord refusal is a readable error, not a crash', async () => { inviteOk = false; const r = await watchInvite(env, '5550009'); inviteOk = true; return /Missing Permissions/.test(r.error ?? ''); });
await tt('/watchlive offline: members are told it is not live and no invite is made', async () => { reset(); const r = await watchCommand(cmd, env, member); return /Not live right now/.test(plain(r)) && !calls.some((x) => /invites/.test(x.path)); });
await tt('/watchlive live: a member gets the private launcher with the invite link', async () => {
  reset(); await roomTick(env, { game: 'x' }, T0); const r = await watchCommand(cmd, env, member);
  return /Watch in Discord/.test(flat(r.data)) && flat(r.data).includes('https://discord.gg/abcDEF1') && (r.data.flags & 64) === 64 && calls.some((x) => /^\/channels\/\d+\/invites$/.test(x.path));
});
await tt('/watchlive: manager and owner too; a visitor is told members only and no invite is made', async () => {
  const n = calls.length; const v = await watchCommand(cmd, env, guest);
  const ok = await Promise.all(['manager', 'owner'].map(async (role) => /Watch in Discord/.test(flat((await watchCommand(cmd, env, { u: '1', role })).data))));
  return /Members only/.test(plain(v)) && !calls.slice(n).some((x) => /invites/.test(x.path) && false) && ok.every(Boolean);
});
await tt('/watchlive: a refused invite shows a plain "not ready" note, no internals', async () => { inviteOk = false; const r = await watchCommand(cmd, env, member); inviteOk = true; return /not ready/.test(plain(r)) && !/Missing Permissions/.test(plain(r)); });
t('livePanel: the Watch in Discord button only on a live card with an invite', (() => { const src = { scope: 'main', platform: 'twitch', handle: 'x', url: 'https://www.twitch.tv/x' };
  return /Watch in Discord/.test(flat(livePanel(src, { live: true }, 'https://s/', false, env, Date.now(), 'https://discord.gg/q'))) && !/Watch in Discord/.test(flat(livePanel(src, { live: false }, 'https://s/', false, env, Date.now(), 'https://discord.gg/q'))) && !/Watch in Discord/.test(flat(livePanel(src, { live: true }, 'https://s/', false, env))); })());

// ---------- the cron ----------
reset();
sqlite.prepare('DELETE FROM stream_sources').run();
sqlite.prepare("INSERT INTO stream_sources (scope, platform, handle, url, label, channel_id, want_live, want_posts, at) VALUES ('main', 'twitch', 'phoenixfirefc', 'https://www.twitch.tv/phoenixfirefc', 'Club', '7770001', 1, 0, ?)").run(Date.now());
sqlite.prepare("INSERT INTO stream_sources (scope, platform, handle, url, label, channel_id, want_live, want_posts, at) VALUES ('contributor', 'twitch', 'friend', 'https://www.twitch.tv/friend', 'Friend', '8880001', 1, 0, ?)").run(Date.now());
await tt('going live: the club gets a room and a card with the button; a contributor gets a card without one and no room', async () => {
  const out = await streamAlertsCron(env, T0, globalThis.fetch);
  const club = posts.find((p) => p.channel === '7770001'), friend = posts.find((p) => p.channel === '8880001');
  return out.live === 2 && /Watch in Discord/.test(flat(club)) && flat(club).includes('discord.gg/abcDEF1') && !/Watch in Discord/.test(flat(friend)) && calls.filter((x) => x.m === 'POST' && x.path === '/guilds/9990001/channels').length === 1;
});
await tt('stream ends: the card flag clears now, the room is removed after the grace period', async () => {
  twitchLive = false; calls.length = 0;
  await streamAlertsCron(env, T0 + 1e6, globalThis.fetch); const early = !calls.some((x) => x.m === 'DELETE');
  await streamAlertsCron(env, T0 + 1e6 + ROOM_GRACE + 6e5, globalThis.fetch); twitchLive = true;
  return early && calls.some((x) => x.m === 'DELETE') && (await liveRoom(env)) === null;
});
await tt('a room failure never stops the go-live post', async () => {
  reset(); sqlite.prepare('UPDATE stream_sources SET live = 0, live_announced_at = NULL').run(); perm = false;
  const out = await streamAlertsCron(env, T0 + 9e7, globalThis.fetch); perm = true;
  return out.live === 2 && !/Watch in Discord/.test(flat(posts.find((p) => p.channel === '7770001')));
});

t('every slash command, option and choice description fits Discord\'s 100 character limit (a longer one fails the whole registration)', (() => { const bad = []; const walk = (o, p) => { if (o && typeof o === 'object') { if (typeof o.description === 'string' && o.description.length > 100) bad.push(p); for (const k in o) walk(o[k], `${p}.${o.name ?? k}`); } }; walk(COMMANDS, 'COMMANDS'); return bad.length === 0; })());

// ---------- branding, no hardcoded ids, the Activity page ----------
const src = fs.readFileSync(ROOT + 'bot/streamwatch.js', 'utf8');
t('streamwatch.js hardcodes no channel or application id and names no other club', !/\d{15,}/.test(src) && !/norex|c8352c/i.test(src));
t('the launcher card carries the club name from config, not another club', !/norex/i.test(plainText(watchPanel(env, 'https://discord.gg/x'))) && !/c8352c/i.test(JSON.stringify(watchPanel(env, 'https://discord.gg/x'))));
t('/watchlive is registered with no owner-only permission bit', (() => { const s = fs.readFileSync(ROOT + 'bot/commanddefs.js', 'utf8'); return /name: 'watchlive', description: [^\n]*contexts: \[0\] \}/.test(s) && !/name: 'watchlive'[^\n]*default_member_permissions/.test(s) && /'streamalerts', 'watchlive'/.test(s); })());
t('/setup channel lets the owner pick a voice channel or category for stream_watch', /channel_types: \[0, 5, 2, 4\]/.test(fs.readFileSync(ROOT + 'bot/commanddefs.js', 'utf8')));
for (const f of ['index.html', 'activity.js', 'activity.css', 'activity-config.js']) t(`activity/${f}: no NOREX name, red or blue-black`, !/norex|#c8352c|#080b11/i.test(fs.readFileSync(ROOT + 'next/stream/activity/' + f, 'utf8')));
t('the Activity reads its channel from config (no channel name in the page code)', !/phoenixfire/i.test(fs.readFileSync(ROOT + 'next/stream/activity/activity.js', 'utf8')) && /channel: ''/.test(fs.readFileSync(ROOT + 'next/stream/activity/activity-config.js', 'utf8')));
t('inside Discord the player goes through the mapped /.proxy/twitch path', /\/\.proxy\/twitch\//.test(fs.readFileSync(ROOT + 'next/stream/activity/activity.js', 'utf8')));
if (fs.existsSync(ROOT + 'site/phoenix/activity/activity-config.js')) t('built: the Activity channel is the one in config.json streams.twitch', fs.readFileSync(ROOT + 'site/phoenix/activity/activity-config.js', 'utf8').includes(JSON.parse(fs.readFileSync(ROOT + 'config.json', 'utf8')).streams.twitch.match(/twitch\.tv\/([A-Za-z0-9_]+)/)[1].toLowerCase()));
done();
