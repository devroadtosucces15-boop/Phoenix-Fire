// Control Center backend (PF-022a): the settings areas behind CC routes (owner/manager split), legacy channel and ping-role fold-in, registry kinds
// setting + dj, config-only items in D1, and the one audit read.
import fs from 'node:fs';
import { call, env, login, sqlite, ROOT, config } from './mock.mjs';
import { t, done } from './lib.mjs';
import { REGISTRY, REGISTRY_KEYS } from '../bot/registry.gen.js';
import { SPLIT, AREAS, areaLevel, ccConfig, ccStored, CC_DEFAULTS, auditFeed } from '../bot/ccsettings.js';
import { pingRoleFor, foldLegacy, channelFor, PING_GROUPS } from '../bot/orgconfig.js';
import { CHANNEL_PURPOSES, PERMISSION_GROUPS } from '../bot/orgconsts.js';
import { audienceOf, postChannels, resetControlsCache } from '../bot/controls.js';
import { saveControl } from '../bot/controlcenter.js';
import { djCommands } from '../tools/bot-studio/lib/registry.mjs';

const read = (f) => fs.readFileSync(ROOT + f, 'utf8');
const owner = await login('111', [], 'Founder'), mgr = await login('600', ['mgr'], 'Coach'), member = await login('500', [], 'Player One');
const meta = (k) => JSON.parse(sqlite.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value ?? 'null');
const setMeta = (k, v) => sqlite.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const audited = (area) => sqlite.prepare("SELECT * FROM config_audit WHERE entity = ? ORDER BY id DESC").all(`cc:${area}`);

// ---------- step 1: the split and the routes ----------
t('every area has exactly one level (owner or manager) and the split lists every area', Object.keys(AREAS).every((a) => areaLevel(a)) && [...SPLIT.owner, ...SPLIT.manager].sort().join() === Object.keys(AREAS).sort().join());
t('only bot personalisation is owner-only; operational settings are the managers\'', SPLIT.owner.join() === 'bot' && ['routes', 'rush', 'tools', 'profanity', 'stream_sources', 'recruitment', 'matchAlert', 'streams'].every((a) => SPLIT.manager.includes(a)));
t('a plain member cannot read or write the settings', (await call(member, '/api/controlcenter/settings')).s === 403 && (await call(member, '/api/controlcenter/settings/rush', { failedPolicy: 'bottom' })).s === 403);
let r = await call(mgr, '/api/controlcenter/settings');
t('a manager reads every area, with who may write each', r.s === 200 && Object.keys(AREAS).every((a) => r.d.areas[a]) && r.d.areas.bot.canWrite === false && r.d.areas.routes.canWrite === true && r.d.split.owner[0] === 'bot');
t('the owner-only area refuses a manager and accepts the owner', (await call(mgr, '/api/controlcenter/settings/bot', { color: '#112233' })).s === 403 && (await call(owner, '/api/controlcenter/settings/bot', { color: '#112233', emoji: '🔥' })).s === 200 && meta('bot_settings').color === '112233');
t('the old owner routes still work and write the same blob', (await call(owner, '/api/bot/settings', { color: 'e8651a', emoji: '⚽' })).s === 200 && meta('bot_settings').color === 'e8651a');
r = await call(mgr, '/api/controlcenter/settings/rush', { greenWarnMin: 3, failedPolicy: 'bottom' });
t('Rush queue settings: validated through the same function, stored in the same row, audited', r.s === 200 && r.d.value.failedPolicy === 'bottom' && meta('rush_queue_settings').failedPolicy === 'bottom' && audited('rush')[0].name === 'Coach');
t('…the same values again are a no-op (no second audit row)', (await call(mgr, '/api/controlcenter/settings/rush', { failedPolicy: 'bottom' })).d.unchanged === true && audited('rush').length === 1);
r = await call(mgr, '/api/controlcenter/settings/routes', { rules: [{ action: 'event.created', group: 'everyone', method: 'channel', channel: '12345678' }] });
t('notification routes: saved through the routing validator', r.s === 200 && meta('notify_routes').length === 1 && (await call(mgr, '/api/controlcenter/settings/routes', { rules: [{ action: 'nope', group: 'everyone', method: 'dm' }] })).s === 400);
r = await call(mgr, '/api/controlcenter/settings/tools', { welcomeText: 'Welcome to the Fire', leaveChannel: '23456789', welcomeChannel: '34567890', pingRoles: { rush: '45678901', match: '56789012' } });
t('server tools: welcome text, channels and ping roles', r.s === 200 && meta('server_tools').welcomeText === 'Welcome to the Fire' && meta('server_tools').pingRoles.rush === '45678901');
t('…the channels and ping roles also land in the Organization config', (await channelFor(env, 'member_log')) === '23456789' && (await channelFor(env, 'welcome')) === '34567890' && (await pingRoleFor(env, 'ping_rush')) === '45678901' && (await pingRoleFor(env, 'ping_match')) === '56789012');
t('a bad channel id is refused', (await call(mgr, '/api/controlcenter/settings/tools', { leaveChannel: 'general' })).s === 400);
r = await call(mgr, '/api/controlcenter/settings/profanity', { channelId: '67890123' });
t('profanity alert channel: stored where the cron reads it and in the Organization config', r.s === 200 && meta('profanity_config').channelId === '67890123' && (await channelFor(env, 'automod_alerts')) === '67890123');
r = await call(mgr, '/api/controlcenter/settings/stream_sources', { link: 'https://www.twitch.tv/phoenixfirefc', channel: '78901234', what: 'live', name: 'Club' });
const src = sqlite.prepare('SELECT * FROM stream_sources WHERE active = 1').get();
t('stream sources: add through the same table as /streamalerts', r.s === 200 && src.platform === 'twitch' && src.channel_id === '78901234' && src.want_live === 1 && src.want_posts === 0);
t('…a bad link is refused and a source can be removed', (await call(mgr, '/api/controlcenter/settings/stream_sources', { link: 'hello' })).s === 400 && (await call(mgr, '/api/controlcenter/settings/stream_sources', { action: 'remove', id: src.id })).s === 200 && !sqlite.prepare('SELECT 1 FROM stream_sources WHERE active = 1').get());
t('stream sources with no channel and no live_alerts purpose say where to set it', /No channel is set for live alerts/.test((await call(mgr, '/api/controlcenter/settings/stream_sources', { link: 'https://www.twitch.tv/phoenixfirefc' })).d.error));

// ---------- step 2: legacy fallbacks fold into purposes ----------
t('hype and voice recap channels, result and reminder channels, and the ping role are all legacy homes the fold-in knows', ['hype', 'voice_recap', 'match_results', 'reminders', 'announcements', 'awards', 'member_log', 'welcome', 'automod_alerts'].every((p) => CHANNEL_PURPOSES.includes(p)) && PING_GROUPS.join() === 'ping_results,ping_events,ping_rush,ping_match,ping_bios,ping_birthdays' && PING_GROUPS.every((g) => PERMISSION_GROUPS.includes(g)));
sqlite.prepare('DELETE FROM discord_channels').run(); sqlite.prepare('DELETE FROM discord_roles').run();
setMeta('bot_settings', { resultChannel: '81000001', reminderChannel: '81000002', pingRole: '82000001', color: 'e8651a', emoji: '⚽', autoPosts: { results: true, reminders: true, awards: true } });
setMeta('announce_channel', '81000003');
const hype = env.HYPE_CHANNEL; env.HYPE_CHANNEL = JSON.stringify({ channel: '81000004' }); env.VOICE_CHANNEL = JSON.stringify({ channel: '81000005' });
t('before the fold-in the legacy values still resolve (nothing breaks)', (await channelFor(env, 'match_results')) === '81000001' && (await channelFor(env, 'hype')) === '81000004' && (await channelFor(env, 'voice_recap')) === '81000005' && (await pingRoleFor(env, 'ping_events')) === '82000001');
r = await call(mgr, '/api/controlcenter/settings/fold-legacy', {});
const rows = (purpose) => sqlite.prepare("SELECT channel_id FROM discord_channels WHERE purpose = ? AND active = 1").all(purpose).map((x) => x.channel_id);
t('fold-in copies each legacy channel into its purpose', r.s === 200 && r.d.channels.match_results === 'folded' && rows('match_results')[0] === '81000001' && rows('reminders')[0] === '81000002' && rows('announcements')[0] === '81000003' && rows('hype')[0] === '81000004' && rows('voice_recap')[0] === '81000005');
t('…and the result/reminder ping role into the ping groups', r.d.roles.ping_results === 'folded' && sqlite.prepare("SELECT role_id FROM discord_roles WHERE permission_group = 'ping_events'").get().role_id === '82000001');
setMeta('bot_settings', { resultChannel: '99999999', color: 'e8651a', emoji: '⚽', autoPosts: { results: true, reminders: true, awards: true } });
const again = await foldLegacy(env, { u: '600', n: 'Coach' });
t('running it again changes nothing: a configured purpose is never overridden (the row wins over the legacy value)', again.channels.match_results === 'kept' && rows('match_results').length === 1 && (await channelFor(env, 'match_results')) === '81000001' && audited('fold-legacy').length >= 1);
env.HYPE_CHANNEL = hype; delete env.VOICE_CHANNEL;
const src2 = ['events.js', 'lfg.js', 'rushqueue.js', 'host.js'].map((f) => read(`bot/${f}`)).join('\n');
t('no reader takes a ping role straight from the old settings any more', !/pingRoles\??\.(rush|match)/.test(src2) && !/s\.pingRole/.test(src2) && /pingRoleFor\(env, 'ping_events'\)/.test(src2));

// ---------- step 3: registry kinds, postChannels / audienceOf ----------
t('the registry has one setting entry per area, each pointing at its level and the commands that write the same rows', Object.keys(AREAS).every((a) => REGISTRY_KEYS.has(`setting:${a}`)) && REGISTRY.items.find((i) => i.key === 'setting:tools').via.includes('/setup pingroles') && REGISTRY.items.find((i) => i.key === 'setting:bot').level === 'owner');
t('the registry has a dj kind with every DJ slash command (read from dj/src/commands.js)', djCommands().length >= 17 && djCommands().every((d) => REGISTRY_KEYS.has(`dj:/${d.name}`)) && REGISTRY.apps.dj === 'Phoenix DJ' && REGISTRY.items.filter((i) => i.kind === 'dj').every((i) => i.app === 'dj' && i.summary));
await saveControl(env, { u: '600', n: 'Coach' }, 'dj:/play', { enabled: true, rules: { allow_roles: ['90001'], post_channels: ['91000001'] } });
t('audienceOf and postChannels work for dj keys: the row wins', (await audienceOf(env, 'dj:/play')).roles[0] === '90001' && (await postChannels(env, 'dj:/play', 'announcements'))[0] === '91000001');
t('audienceOf falls back to the feature default only when the row names nobody', (await audienceOf(env, 'dj:/skip', { roles: ['92000001'] })).roles[0] === '92000001' && (await audienceOf(env, 'dj:/play', { roles: ['92000001'] })).roles[0] === '90001');
t('postChannels takes a list of purposes and uses the first that has a channel', (await postChannels(env, 'dj:/skip', ['rush_board', 'hype']))[0] === '81000004' && (await postChannels(env, 'dj:/skip', ['rush_board', 'season_stats'])).length === 0);
resetControlsCache();

// ---------- step 4: config-only items in D1 ----------
const mig = read('bot/migrations/0065_cc_config.sql');
t('the migration exists, is not applied by code, creates cc_config and seeds the three items from config.json', /CREATE TABLE IF NOT EXISTS cc_config/.test(mig) && ['recruitment', 'matchAlert', 'streams'].every((k) => mig.includes(JSON.stringify(config[k]).replace(/"([^"]+)":/g, '"$1":'))));
t('the code defaults equal config.json (so a deployment without the migration behaves the same)', JSON.stringify(CC_DEFAULTS) === JSON.stringify({ recruitment: config.recruitment, matchAlert: config.matchAlert, streams: config.streams }));
r = await call(mgr, '/api/controlcenter/settings/matchAlert', { loseBy: 4 });
t('match alert margin: saved as a D1 row and read by the alert route', r.s === 200 && (await ccStored(env, 'matchAlert')).loseBy === 4 && (await call(mgr, '/api/controlcenter/settings/matchAlert', { loseBy: 99 })).s === 400);
r = await call(mgr, '/api/controlcenter/settings/recruitment', { open: false, requirements: ['Mic', 'Discord'], positions: ['gk', 'ST'] });
t('recruitment: open flag, requirements and positions are cleaned', r.s === 200 && r.d.value.open === false && r.d.value.requirements.length === 2 && r.d.value.positions.join() === 'ST' && r.d.value.headline === config.recruitment.headline);
t('club stream links: only real Twitch / YouTube links', (await call(mgr, '/api/controlcenter/settings/streams', { twitch: 'https://www.twitch.tv/phoenixfire' })).s === 200 && (await call(mgr, '/api/controlcenter/settings/streams', { twitch: 'https://evil.example/x' })).s === 400 && (await ccConfig(env, 'streams')).twitch === 'https://www.twitch.tv/phoenixfire');
sqlite.exec('DROP TABLE cc_config');
t('before the migration is applied: reads fall back to the defaults, a save says what the owner must do', (await ccConfig(env, 'matchAlert')).loseBy === config.matchAlert.loseBy && (await call(mgr, '/api/controlcenter/settings/matchAlert', { loseBy: 2 })).s === 503);
const pub = await (await import('../bot/ccsettings.js')).ccConfigPublicRoute(new Request('http://x/api/org/cc-config'), env);
t('the keyed public read refuses a request without the shared key', pub.status === 403);

// ---------- step 6: one audit read ----------
sqlite.prepare("INSERT INTO activity (at, user_id, name, type, detail) VALUES (?, '500', 'Player One', 'login', 'signed in')").run(Date.now() - 1000);
sqlite.prepare("INSERT INTO role_history (user_id, from_role, to_role, at) VALUES ('500', 'member', 'manager', ?)").run(Date.now() - 500);
r = await call(mgr, '/api/controlcenter/audit?limit=300');
t('one feed holds settings changes, activity and role history, newest first', r.s === 200 && ['config', 'activity', 'roles'].every((s) => r.d.items.some((x) => x.source === s)) && r.d.items.every((x, i, a) => !i || a[i - 1].at >= x.at));
t('a settings change shows who, what and before/after', r.d.items.some((x) => x.source === 'config' && x.who === 'Coach' && x.entity === 'cc:rush' && x.after?.failedPolicy === 'bottom'));
t('the feed filters by source and text, and pages back', (await call(mgr, '/api/controlcenter/audit?source=roles')).d.items.every((x) => x.source === 'roles') && (await call(mgr, '/api/controlcenter/audit?q=Player%20One')).d.items.length >= 2 && (await auditFeed(env, { limit: 1 })).next > 0 && (await call(mgr, '/api/controlcenter/audit?limit=2&before=1')).d.items.length === 0);
t('a plain member cannot read the audit feed', (await call(member, '/api/controlcenter/audit')).s === 403);
done();
