// Bot output audit, step 2: everything the bots send WITHOUT a command: cron jobs, result/burner/live posts, alerts, DMs, event posts.
// Real code paths where the repo's mocks allow (cron, notify DMs); the rest are the code's own builders fed sample data ("rebuilt").
// Output: tools/bot-audit/out/auto.json. Run from the repo root: node tools/bot-audit/capture-auto.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env, ctx, settle, resetCalls, worker, config } from './harness.mjs';
import * as H from './harness.mjs';
import { sqlite } from '../../tests/mock.mjs';
import { seedBotSample } from '../../tests/botfeat-sample.mjs';
import { TYPES, notify, deliverDMs } from '../../bot/notify.js';
import { livePost } from '../../bot/live.js';
import { livePanel } from '../../bot/memberlive.js';
import { alertPanel, diff } from '../../bot/monitor.js';
import { reportMessage } from '../../bot/burnerstats.js';
import { videoPanel } from '../../bot/watchlist.js';
import { discoveryPanel } from '../../bot/discoveries.js';
import { birthdayPanel } from '../../bot/fun.js';
import { welcomeMessage, pingPanel } from '../../bot/servertools.js';
import { lfgMessage } from '../../bot/lfg.js';
import { eventMessage } from '../../bot/events.js';
import { autoBanner } from '../../bot/ui.js';

const OUT = fileURLToPath(new URL('./out/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
await seedBotSample().catch(() => {});
// destinations by purpose: seed the Organization config the way the site would (channel IDs are placeholders, named by purpose)
sqlite.exec("INSERT OR IGNORE INTO discord_servers (guild_id, display_name, purpose, active) VALUES ('9','Phoenix Fire','main',1)");
const sid = sqlite.prepare("SELECT id FROM discord_servers WHERE guild_id='9'").get().id;
for (const p of ['announcements', 'match_results', 'match_notifications', 'recruitment', 'claims', 'manager_alerts', 'logs', 'welcome', 'config_audit', 'system_alerts'])
  sqlite.prepare('INSERT INTO discord_channels (server_id, channel_id, label, purpose) VALUES (?,?,?,?)').run(sid, 'CH-' + p, '#' + p, p);

const now = Date.now(), unix = Math.floor(now / 1000);
const out = [];
// posts that carry no picture of their own get their family banner, exactly as the send sites do (bot/ui.js autoBanner)
const add = (e, bodies, how = 'rebuilt') => out.push({ ...e, how: e.how ?? how, bodies: (Array.isArray(bodies) ? bodies : [bodies]).filter(Boolean).map((b) => autoBanner(env, b)) });
const fail = [];
const guard = async (id, fn) => { try { await fn(); } catch (err) { fail.push({ id, error: String(err.message ?? err).slice(0, 160) }); } };

// ---- real cron runs: whatever the 10-minute and 1-minute timers post on a seeded database ----
for (const cron of ['* * * * *', '*/10 * * * *']) await guard('cron ' + cron, async () => {
  resetCalls(); await worker.scheduled({ cron }, { ...env, GH_DISPATCH_TOKEN: '' }, ctx); await settle();
  for (const c of H.calls) out.push({ id: `cron:${cron}:${c.url}`, name: `Cron ${cron}: ${c.method} ${c.url.replace(/\d{6,}/g, 'N')}`, category: 'automated', how: 'real', trigger: `cron ${cron}`, source: 'bot/worker.js scheduled()', bodies: [c.body] });
});

// ---- DMs through the real notify → deliverDMs path (one per notification type) ----
await guard('dm', async () => {
  for (const [type, t] of Object.entries(TYPES)) {
    if (t.hidden && type !== 'test') continue;
    sqlite.prepare("INSERT OR IGNORE INTO users (id, name, role, last_at) VALUES ('222','Mike','member',?)").run(now);
    sqlite.prepare("INSERT INTO notify_prefs (user_id, prefs, updated) VALUES ('222', ?, ?) ON CONFLICT (user_id) DO UPDATE SET prefs = excluded.prefs").run(JSON.stringify({ [type]: 'dm' }), now);
    await notify(env, ['222'], { type, title: `Sample ${t.label}`.slice(0, 120), body: 'Sample notification text, as a member would receive it.', link: 'members.html#alerts', ack: type === 'announce' });
    resetCalls(); await deliverDMs(env, 5);
    const dms = H.calls.filter((c) => /\/messages$/.test(c.url));
    if (dms.length) add({ id: `dm:notify:${type}`, name: `DM · ${t.label}`, category: 'DM', trigger: `notify type "${type}"`, schedule: 'queued, sent by the 10-minute cron (or right after the request)', destination: ['DM'], flag: 'notifications', level: 'members', source: 'bot/notify.js deliverDMs()', dmDefault: t.def, bodies: dms.map((d) => d.body) }, dms.map((d) => d.body), 'real');
  }
});

// ---- builders with sample data ----
const site = env.SITE_URL;
await guard('live', async () => add({ id: 'auto:live', name: 'Club goes live (Twitch / YouTube)', category: 'automated', trigger: 'cron: live check finds the club on air', schedule: 'every 10 min', destination: ['announcements'], flag: 'liveAnnounce', level: 'owner', source: 'bot/live.js livePost()' }, livePost({ platform: 'twitch', title: 'Sample · Pro Clubs night', url: 'https://twitch.tv/sample' }, site, env)));
await guard('mlive', async () => add({ id: 'auto:memberlive', name: 'Member goes live', category: 'automated', trigger: 'cron: member stream check', schedule: 'every 10 min', destination: ['announcements'], flag: 'memberLive', level: 'owner', source: 'bot/memberlive.js livePanel()' }, livePanel({ platform: 'twitch', user_id: '222', name: 'Mike', title: 'Sample · Ranked grind', url: 'https://twitch.tv/sample' }, env)));
await guard('uptime', async () => {
  const d = diff(null, ['Worker: EA relay timed out'], 'Phoenix'); const u = diff({ down: true, problems: ['x'], since: now - 36e5 }, [], 'Phoenix');
  add({ id: 'auto:uptime-down', name: 'Uptime alert: down', category: 'automated', trigger: 'cron: 24/7 monitor sees a problem', schedule: 'every 10 min, only on change', destination: ['DM owner'], flag: 'always on', level: 'owner', source: 'bot/monitor.js alertPanel()' }, alertPanel(d.alert));
  add({ id: 'auto:uptime-up', name: 'Uptime alert: back to normal', category: 'automated', trigger: 'cron: monitor recovers', schedule: 'every 10 min, only on change', destination: ['DM owner'], flag: 'always on', level: 'owner', source: 'bot/monitor.js alertPanel()', related: ['auto:uptime-down'] }, alertPanel(u.alert));
});
await guard('burner', async () => {
  const m = { res: 'W', type: 'leagueMatch', gf: 3, ga: 1, opp: { id: '42', name: 'Sample FC' }, ts: unix, players: [{ n: 'Niko-the-Great', r: 8.4, g: 2, a: 0, mom: true }, { n: 'kingmitch93', r: 7.6, g: 1, a: 1 }, { n: 'Sample Three', r: 6.9, g: 0, a: 1 }] };
  add({ id: 'auto:burner-report', name: 'Burner club match report', category: 'automated', trigger: 'GitHub Action fetch: tracked burner club plays', schedule: 'every update run', destination: ['match_results'], flag: 'burners', level: 'members', source: 'bot/burnerstats.js reportMessage()' }, reportMessage({ id: '42', name: 'Burner FC', crest: null }, m, { w: 5, d: 1, l: 2, gf: 18, ga: 9, winPct: 63, streak: { n: 3, res: 'W' } }, site));
});
await guard('video', async () => add({ id: 'auto:watchlist-video', name: 'New video from a watched creator', category: 'automated', trigger: 'cron: watch list finds a new video', schedule: 'about hourly', destination: ['announcements'], flag: 'watchlist', level: 'owner', source: 'bot/watchlist.js videoPanel()', related: ['slash:/watch'] }, videoPanel({ id: 'sampleVid001', title: 'Sample · Best CAM build for FC 27 Pro Clubs', topic: 'builds', channel_name: 'SAMPLE Channel', thumb: 'https://i.ytimg.com/vi/sampleVid001/hqdefault.jpg' }, 3, env)));
await guard('disc', async () => add({ id: 'auto:discovery', name: 'Approved discovery post', category: 'automated', trigger: 'manager approves a /share tip', schedule: 'on approval', destination: ['announcements'], flag: 'discoveries', level: 'owner', source: 'bot/discoveries.js discoveryPanel()', related: ['slash:/share'] }, discoveryPanel({ id: 1, title: 'Sample · Jockey without fouling', body: 'Hold L1 and a direction.', link: 'https://example.com', user_id: '333', approved_by: '111' }, 2, env)));
await guard('bday', async () => add({ id: 'auto:birthday', name: 'Birthday post', category: 'automated', trigger: 'cron: a member birthday', schedule: 'once a day', destination: ['announcements'], flag: 'fun', level: 'owner', source: 'bot/fun.js birthdayPanel()' }, birthdayPanel([{ user_id: '222' }], env)));
await guard('welcome', async () => add({ id: 'auto:welcome', name: 'Welcome post', category: 'automated', trigger: 'member joins the server', schedule: 'cron: member watch', destination: ['welcome'], flag: 'serverTools', level: 'members', source: 'bot/servertools.js welcomeMessage()', related: ['slash:/setup welcome'] }, welcomeMessage(env, { welcomeText: '' }, { user_id: '222', name: 'Mike', avatar: null })));
await guard('ping', async () => add({ id: 'auto:pingroles', name: 'Ping-roles panel', category: 'automated', trigger: '/setup pingroles', schedule: 'on command', destination: ['configured channel'], flag: 'serverTools', level: 'managers', source: 'bot/servertools.js pingPanel()', related: ['slash:/setup pingroles'] }, pingPanel(env)));
await guard('lfg', async () => {
  const post = { id: 7, name: 'Mike', status: 'open', expires: now + 36e5, note: 'Rush 5v5 anyone?' };
  add({ id: 'auto:lfg-open', name: 'Rush LFG call (open)', category: 'automated', trigger: '/lfg now', schedule: 'on command, expires in 60 min', destination: ['Rush channel + Rush role ping'], flag: 'rushLfg', level: 'owner', source: 'bot/lfg.js lfgMessage()', status: 'owner testing', related: ['slash:/lfg now'] }, lfgMessage(post, [{ answer: 'in', name: 'Jez' }, { answer: 'later', name: 'Kruger' }], { roleId: 'R1', now }));
  add({ id: 'auto:lfg-expired', name: 'Rush LFG call (expired)', category: 'automated', trigger: 'cron: call passes its time', schedule: 'every 10 min', destination: ['edits the original post'], flag: 'rushLfg', level: 'owner', source: 'bot/lfg.js lfgMessage()', status: 'owner testing', related: ['auto:lfg-open'] }, lfgMessage({ ...post, status: 'expired', expires: now - 6e4 }, [], { now }));
});
await guard('events', async () => {
  const e = { id: 1, type: 'league', title: 'League night', start: now + 864e5, duration: 90, notes: 'Be on 10 minutes early.', needs: JSON.stringify({ players: 11, GK: 1, ST: 2 }), status: 'scheduled' };
  const rs = [{ status: 'yes', name: 'Mike', user_id: '222', positions: '["ST"]' }, { status: 'maybe', name: 'Jez', user_id: '333', positions: '["CM"]' }, { status: 'no', name: 'Kruger', user_id: '444', positions: '[]' }];
  const ev = (id, name, trig, extra = {}) => ({ id, name, category: 'automated', trigger: trig, schedule: 'on create, refreshed after every answer', destination: ['match_notifications', 'announcements'], flag: 'events', level: 'public', source: 'bot/events.js eventMessage()', related: ['slash:/schedule', 'slash:/host'], ...extra });
  add(ev('auto:event-league', 'Event post: league night', 'manager creates an event (site or /host)'), eventMessage(env, e, rs, '', { who: true }));
  add(ev('auto:event-rush', 'Event post: Rush session', 'manager creates a Rush event'), eventMessage(env, { ...e, id: 2, type: 'rush', title: 'Rush night' }, rs, ''));
  add(ev('auto:event-cancelled', 'Event post: cancelled', 'manager cancels an event', { related: ['auto:event-league'] }), eventMessage(env, { ...e, id: 3, status: 'cancelled' }, rs, ''));
});


// ---- Rush: queue board, global leaderboard post, season card post (the code's own builders, sample data) ----
await guard('rushqueue', async () => {
  const { boardMessage } = await import('../../bot/rushqueue.js');
  const q = [
    { captain: '222', members: ['333'], status: 'searching', ord: 0, joined_at: now - 9e5, searching_since: now - 95e3, needs: 0 },
    { captain: '444', members: [], status: 'waiting', ord: 1, joined_at: now - 6e5, needs: 1 },
    { captain: '111', members: ['555', '666'], status: 'waiting', ord: 2, joined_at: now - 3e5, paused_until: now + 3e5, needs: 0 },
  ];
  const rq = (id, name, trig, extra = {}) => ({ id, name, category: 'automated', trigger: trig, schedule: 'kept as the newest message by the 1-minute cron', destination: ['rush_queue (Organization channel purpose)'], flag: 'rushQueue', level: 'owner', source: 'bot/rushqueue.js boardMessage()', related: ['slash:/queue'], ...extra });
  add(rq('auto:rushqueue-busy', 'Rush queue board: groups in line', '/queue board, then every button press'), boardMessage(q, { now }));
  add(rq('auto:rushqueue-empty', 'Rush queue board: empty', 'nobody in the queue', { related: ['auto:rushqueue-busy'] }), boardMessage([], { now }));
});
await guard('rushscan', async () => {
  const { boardMessage, seasonCardMessage, DEFAULT_SEASON } = await import('../../bot/rushscan.js');
  const { boardInsights, ladder, boardSeries } = await import('../../bot/lbinsights.js');
  const clubs = ['Sample United', 'Rivals FC', 'Phoenix Fire', 'Night Owls', 'Sample City', 'Last Minute XI'];
  const snap = (hoursAgo, vps) => ({ id: hoursAgo, taken_at: now - hoursAgo * 36e5, us: [...vps.keys()].sort((a, b) => vps[b] - vps[a]).indexOf(2), rows: [...vps.keys()].sort((a, b) => vps[b] - vps[a]).map((k, i) => ({ rank: i + 1, club: clubs[k], vp: vps[k], avg: 38 + k * 1.3, m: 400 + k * 7 })) });
  const snaps = [snap(30, [61200, 58800, 57100, 57900, 52000, 49800]), snap(18, [62400, 59900, 58900, 58600, 52900, 50100]), snap(6, [63100, 60700, 60950, 59200, 53400, 50600])];
  const cur = snaps.at(-1), prev = snaps.at(-2);
  const ins = boardInsights(cur, snaps.slice(0, -1), { season: DEFAULT_SEASON, now });
  add({ id: 'auto:rushladder', name: 'Rush leaderboard post (read from a photo)', category: 'automated', trigger: '/rushladder scan, or a photo saved on the site', schedule: 'on each confirmed photo', destination: ['rush_board (Organization channel purpose)'], flag: 'rushBoard', level: 'owner', source: 'bot/rushscan.js boardMessage()', related: ['slash:/rushladder'] }, boardMessage(env, cur, ins, ladder(cur, prev), boardSeries(snaps), { season: DEFAULT_SEASON, by: 'Mike' }));
  add({ id: 'auto:seasoncard', name: 'Season card post (@here)', category: 'automated', trigger: '/seasoncard scan → Save, or a card saved on the site', schedule: 'on each confirmed card', destination: ['season_cards (Organization channel purpose)'], flag: 'seasonCards', level: 'owner', source: 'bot/rushscan.js seasonCardMessage()', related: ['slash:/seasoncard'] }, seasonCardMessage(env, { user_id: '222', name: 'Mike', season: DEFAULT_SEASON.name, stats: { matches: 184, wins: 121, goals: 263, clubVp: 60950, myVp: 7420, tier: 'Elite', club: 'Phoenix Fire' } }, { vp: 2, winRate: 1, goals: 3, of: 9 }));
});
// ---- /streamalerts sources: a live panel and a new-video panel ----
await guard('streamalerts', async () => {
  const { livePanel: sLive, videoPanel: sVideo } = await import('../../bot/streamalerts.js');
  const src = { platform: 'twitch', handle: 'kingmitch93', url: 'https://www.twitch.tv/kingmitch93', scope: 'main', name: 'kingmitch93' };
  const sa = (id, name, extra = {}) => ({ id, name, category: 'automated', trigger: 'cron: a /streamalerts source goes live or uploads', schedule: 'every 10 min', destination: ['the channel chosen in /streamalerts add'], flag: 'streamAlerts', level: 'owner', source: 'bot/streamalerts.js', related: ['slash:/streamalerts'], ...extra });
  add(sa('auto:stream-live', 'Stream alert: live now'), sLive(src, { live: true, title: 'Sample · Division rivals night', game: 'EA SPORTS FC', viewers: 42, url: src.url }, site, false, env, now));
  add(sa('auto:stream-offline', 'Stream alert: channel card (offline)', { related: ['auto:stream-live'] }), sLive(src, { live: false, url: src.url }, site, false, env, now));
  add(sa('auto:stream-video', 'Stream alert: new video'), sVideo({ platform: 'youtube', handle: '@sample', url: 'https://www.youtube.com/@sample', scope: 'member', name: 'Jez' }, { id: 'sampleVid001', title: 'Sample · Best CAM build for FC 27 Pro Clubs', thumb: 'https://i.ytimg.com/vi/sampleVid001/hqdefault.jpg', short: false }, false, env));
});

// ---- result posts: the real scripts/lib/resultpost.mjs on three real raw matches, with the drawn cards attached ----
await guard('results', async () => {
  const { postResults } = await import('../../scripts/lib/resultpost.mjs');
  const dir = new URL('../../data/matches/', import.meta.url).pathname;
  const matches = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).slice(0, 3).map((f) => JSON.parse(fs.readFileSync(dir + f, 'utf8')));
  const manifest = JSON.parse(fs.readFileSync(new URL('./out/cards.json', import.meta.url), 'utf8'));
  const drawn = { dir: new URL('./out/cards/', import.meta.url).pathname, manifest };
  const homeId = String(config.homeClubId ?? Object.keys(matches[0].clubs)[0]);
  const route = async () => ({ ok: true, channelId: 'CH-match_results' });
  process.env.DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1/x';
  process.env.DISCORD_BOT_TOKEN = 'x';
  resetCalls(); await postResults(structuredClone(matches), { config, homeId, orgIds: [homeId], drawn, route });
  const bot = H.calls.slice();
  add({ id: 'auto:result-panel', name: 'Match result post (score + field cards)', category: 'automated', trigger: 'GitHub Action: a new home match is fetched', schedule: 'every update run (post-results.mjs)', destination: ['match_results'], flag: 'discordMatch', level: 'members', source: 'scripts/lib/resultpost.mjs', related: ['auto:result-webhook'] }, bot.map((c) => c.body), 'real');
  delete process.env.DISCORD_BOT_TOKEN;
  resetCalls(); await postResults(structuredClone(matches), { config, homeId, orgIds: [homeId], drawn: null, route });
  add({ id: 'auto:result-webhook', name: 'Match result post: webhook fallback (classic embed)', category: 'automated', trigger: 'result post when the bot token or discordMatch flag is off', schedule: 'every update run', destination: ['DISCORD_WEBHOOK channel'], flag: 'discordMatch off', level: 'n/a', status: 'fallback only', source: 'scripts/lib/resultpost.mjs', related: ['auto:result-panel'] }, H.calls.map((c) => c.body), 'real');
});

fs.writeFileSync(OUT + 'auto.json', JSON.stringify({ items: out, failures: fail }, null, 1));
console.log('auto items', out.length, '| DMs', out.filter((x) => x.category === 'DM').length, '| failures', fail.length); for (const f of fail) console.log(' x', f.id, f.error);
