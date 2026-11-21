// "Watch in Discord": the go-live card of the club's Twitch channel carries an Activity invite for the configured voice channel, and /streamalerts watch posts the launcher.
// The voice channel comes from the Organization config (purpose stream_watch), never from code.
import fs from 'node:fs';
import { env, sqlite, ROOT } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { watchInvite, watchPanel, watchCommand } from '../bot/streamwatch.js';
import { livePanel, streamAlertsCron } from '../bot/streamalerts.js';
import { CHANNEL_PURPOSES } from '../bot/orgconsts.js';

env.DISCORD_BOT_TOKEN = 'bot'; env.DISCORD_GUILD_ID = '9'; env.DISCORD_APP_ID = '1569450321057550537';
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), streamAlerts: 'public' });
const invites = [], posts = []; let inviteReply = { ok: true, body: { code: 'abcDEF1' } }, twitchLive = true;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  let m = u.match(/\/channels\/(\d+)\/invites$/);
  if (m) { invites.push({ channel: m[1], ...JSON.parse(init.body), auth: init.headers.Authorization }); return Response.json(inviteReply.body, { status: inviteReply.ok ? 200 : 403 }); }
  m = u.match(/\/channels\/(\d+)\/messages$/);
  if (m) { posts.push({ channel: m[1], ...JSON.parse(init.body) }); return Response.json({ id: 'm1' }); }
  if (u.includes('gql.twitch.tv')) return Response.json({ data: { user: { stream: twitchLive ? { type: 'live', title: 'FC night', viewersCount: 7, game: { name: 'EA Sports FC' }, previewImageURL: 'https://x/p.jpg' } : null } } });
  if (u.startsWith('https://www.twitch.tv/')) return new Response(twitchLive ? '"isLiveBroadcast":true' : '<html></html>');
  return realFetch(url, init);
};
const flat = (o) => JSON.stringify(o);

t('stream_watch is a channel purpose (so /setup channel and the website can set it)', CHANNEL_PURPOSES.includes('stream_watch'));

// ---------- no voice channel configured ----------
await tt('no channel set → watchInvite says none and calls Discord for nothing', async () => (await watchInvite(env)).none === true && invites.length === 0);
const owner = { u: '111', role: 'owner', n: 'Boss' };
const member = { u: '500', role: 'member', n: 'Mem' }, guest = { u: '9', role: 'guest', n: 'Visitor' };
const watchCmd = { data: { name: 'watchlive' }, channel_id: 'c1' };
await tt('/watchlive with no channel says how to set it', async () => /No channel is set for stream watch/.test(plainText((await watchCommand(watchCmd, env, member)).data)));
await tt('live card without a channel has no Discord button', async () => !/Watch in Discord/.test(flat(livePanel({ scope: 'main', platform: 'twitch', handle: 'x', url: 'https://www.twitch.tv/x' }, { live: true }, 'https://s/', false, env))));

// ---------- configured ----------
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('g-sw', 'Test')").run();
const sid = sqlite.prepare("SELECT id FROM discord_servers WHERE guild_id = 'g-sw'").get().id;
sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '5550001', 'stream_watch', 'org', '', 1)").run(sid);
await tt('the invite asks Discord for an Activity invite on the configured voice channel for this app', async () => {
  const r = await watchInvite(env), i = invites.at(-1);
  return r.url === 'https://discord.gg/abcDEF1' && i.channel === '5550001' && i.target_type === 2 && i.target_application_id === env.DISCORD_APP_ID && i.auth === 'Bot bot' && i.max_age > 0 && i.max_uses === 0;
});
await tt('a Discord refusal comes back as a readable error, not a crash', async () => { inviteReply = { ok: false, body: { message: 'Missing Permissions' } }; const r = await watchInvite(env); inviteReply = { ok: true, body: { code: 'abcDEF1' } }; return /Missing Permissions/.test(r.error ?? ''); });
await tt('livePanel with a watch url shows the button; offline cards never do', async () => {
  const src = { scope: 'main', platform: 'twitch', handle: 'x', url: 'https://www.twitch.tv/x' };
  return /Watch in Discord/.test(flat(livePanel(src, { live: true }, 'https://s/', false, env, Date.now(), 'https://discord.gg/q'))) && !/Watch in Discord/.test(flat(livePanel(src, { live: false }, 'https://s/', false, env, Date.now(), 'https://discord.gg/q')));
});
await tt('/watchlive: a member gets the launcher with the invite link, shown only to them', async () => { const r = await watchCommand(watchCmd, env, member); return /Watch in Discord/.test(flat(r.data)) && flat(r.data).includes('https://discord.gg/abcDEF1') && (r.data.flags & 64) === 64; });
await tt('/watchlive: anyone above member can too (manager, owner)', async () => ['manager', 'owner'].every(async (role) => /Watch in Discord/.test(flat((await watchCommand(watchCmd, env, { u: '1', role })).data))));
await tt('/watchlive: a visitor who is not a member is told members only, and no invite is made', async () => { const n = invites.length, r = await watchCommand(watchCmd, env, guest); return /Members only/.test(plainText(r.data)) && invites.length === n; });
await tt('/watchlive: when Discord refuses the invite a member sees a plain "not ready" note, no internals', async () => { inviteReply = { ok: false, body: { message: 'Missing Permissions' } }; const r = await watchCommand(watchCmd, env, member); inviteReply = { ok: true, body: { code: 'abcDEF1' } }; return /not ready/.test(plainText(r.data)) && !/Missing Permissions/.test(plainText(r.data)); });
t('/watchlive is registered on the core app with no owner-only permission bit', (() => { const src = fs.readFileSync(ROOT + 'bot/commanddefs.js', 'utf8'); return /name: 'watchlive', description: [^\n]*contexts: \[0\] \}/.test(src) && !/name: 'watch'[^\n]*default_member_permissions/.test(src) && /'streamalerts', 'watchlive'/.test(src); })());

// ---------- go live ----------
sqlite.prepare("INSERT INTO stream_sources (scope, platform, handle, url, label, channel_id, want_live, want_posts, at) VALUES ('main', 'twitch', 'phoenixfirefc', 'https://www.twitch.tv/phoenixfirefc', 'Club', '7770001', 1, 0, ?)").run(Date.now());
sqlite.prepare("INSERT INTO stream_sources (scope, platform, handle, url, label, channel_id, want_live, want_posts, at) VALUES ('contributor', 'twitch', 'friend', 'https://www.twitch.tv/friend', 'Friend', '8880001', 1, 0, ?)").run(Date.now());
await tt('going live: the club card (and only the club card) gets the Watch in Discord button', async () => {
  const out = await streamAlertsCron(env, Date.now(), globalThis.fetch);
  const club = posts.find((p) => p.channel === '7770001'), friend = posts.find((p) => p.channel === '8880001');
  return out.live === 2 && /Watch in Discord/.test(flat(club)) && flat(club).includes('discord.gg/abcDEF1') && !/Watch in Discord/.test(flat(friend));
});
await tt('an invite failure does not stop the go-live post', async () => {
  sqlite.prepare('UPDATE stream_sources SET live = 0, live_announced_at = NULL').run(); posts.length = 0; inviteReply = { ok: false, body: {} };
  const out = await streamAlertsCron(env, Date.now(), globalThis.fetch); inviteReply = { ok: true, body: { code: 'abcDEF1' } };
  return out.live === 2 && !/Watch in Discord/.test(flat(posts.find((p) => p.channel === '7770001')));
});

// ---------- branding + no hardcoded ids ----------
const src = fs.readFileSync(ROOT + 'bot/streamwatch.js', 'utf8');
t('streamwatch.js hardcodes no channel or application id and names no other club', !/\d{15,}/.test(src) && !/norex|c8352c/i.test(src));
t('the launcher card carries the club name from config, not another club', !/norex/i.test(plainText(watchPanel(env, 'https://discord.gg/x'))) && !/c8352c/i.test(JSON.stringify(watchPanel(env, 'https://discord.gg/x'))));
// ---------- the Activity page ----------
for (const f of ['index.html', 'activity.js', 'activity.css', 'activity-config.js']) t(`activity/${f}: no NOREX name, red or blue-black`, !/norex|#c8352c|#080b11/i.test(fs.readFileSync(ROOT + 'next/stream/activity/' + f, 'utf8')));
t('the Activity reads its channel from config (no channel name in the page code)', !/phoenixfire/i.test(fs.readFileSync(ROOT + 'next/stream/activity/activity.js', 'utf8')) && /channel: ''/.test(fs.readFileSync(ROOT + 'next/stream/activity/activity-config.js', 'utf8')));
t('inside Discord the player goes through the mapped /.proxy/twitch path', /\/\.proxy\/twitch\//.test(fs.readFileSync(ROOT + 'next/stream/activity/activity.js', 'utf8')));
if (fs.existsSync(ROOT + 'site/phoenix/activity/activity-config.js')) t('built: the Activity channel is the one in config.json streams.twitch', fs.readFileSync(ROOT + 'site/phoenix/activity/activity-config.js', 'utf8').includes(JSON.parse(fs.readFileSync(ROOT + 'config.json', 'utf8')).streams.twitch.match(/twitch\.tv\/([A-Za-z0-9_]+)/)[1].toLowerCase()));
done();
