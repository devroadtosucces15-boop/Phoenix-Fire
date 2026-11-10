// Phase 2 Discord side: the Worker reads the Discord server and the owner/manager roles from the Organization config instead of
// wrangler vars, notification routing and result posting resolve their channel through resolveChannel, and a missing
// destination is reported – never replaced by some other channel. Three clubs, two divisions.
import fs from 'node:fs';
import { call, env, login, sqlite, W } from './mock.mjs';
import { resolveChannel, withOrgEnv, resetOrgEnvCache } from '../bot/orgconfig.js';
import { discordRole } from '../bot/roles.js';
import { routeNotification } from '../bot/routing.js';
import { settingsKey } from '../bot/settings.js';
import { t, tt, done } from './lib.mjs';

const owner = await login('111', [], 'Owner');
const G = '1328821938243637381';
const C = (n) => `15000000000000${String(n).padStart(5, '0')}`;
const post = async (tok, path, body) => (await call(tok, path, body)).d;

// ---------- the three clubs ----------
const cfg = (await call(owner, '/api/org/config')).d;
const s1 = cfg.servers.find((s) => s.guild_id === G);
const lg = await post(owner, '/api/org/config/divisions', { name: 'League' });
const mx = await post(owner, '/api/org/config/divisions', { name: 'Mixed' });
const home = cfg.clubs.find((c) => c.ea_club_id === '1111');
await post(owner, '/api/org/config/clubs', { id: home.id, ea_club_id: '1111', display_name: 'Phoenix Fire', division_id: lg.id });
const c2 = await post(owner, '/api/org/config/clubs', { ea_club_id: '2222', display_name: 'Phoenix Mixed', division_id: mx.id });
const c3 = await post(owner, '/api/org/config/clubs', { ea_club_id: '3333', display_name: 'Phoenix Rush', division_id: mx.id });
const key = await settingsKey(env.DISCORD_CLIENT_SECRET);
const route = async (q, k = key) => W(`/api/org/route/public?${q}`, { headers: k ? { 'X-Norex-Key': k } : {} });

// ---------- /api/org/route/public ----------
t('the route needs the key', (await route('purpose=match_results&club=1111', '')).status === 403);
t('an unknown purpose is refused', (await route('purpose=gossip')).status === 400);
const none = await (await route('purpose=match_results&club=1111')).json();
t('nothing configured → channelId null with a reason, not a default', none.channelId === null && /no destination/.test(none.reason));
await post(owner, '/api/org/config/channels', { server_id: s1.id, channel_id: C(1), purpose: 'match_results' });
await post(owner, '/api/org/config/channels', { server_id: s1.id, channel_id: C(2), purpose: 'match_results', scope_type: 'division', scope_id: mx.id });
await post(owner, '/api/org/config/channels', { server_id: s1.id, channel_id: C(3), purpose: 'match_results', scope_type: 'club', scope_id: c3.id });
const r = async (club) => (await (await route(`purpose=match_results&club=${club}`)).json());
t('club 1111 → the organization channel', (await r('1111')).channelId === C(1) && (await r('1111')).scope === 'org');
t('club 2222 → its division\'s channel', (await r('2222')).channelId === C(2) && (await r('2222')).scope === 'division');
t('club 3333 → its own club channel (beats the division)', (await r('3333')).channelId === C(3) && (await r('3333')).scope === 'club');
t('an EA club that is not in the organization is reported, not routed', (await r('9999')).channelId === null && (await r('9999')).reason === 'unknown club');
t('a purpose with no channel at any scope stays null', (await (await route('purpose=recruitment&club=2222')).json()).channelId === null);

// ---------- hydrating the Discord env from the config ----------
await post(owner, '/api/org/config/roles', { server_id: s1.id, role_id: C(7), permission_group: 'owner' });
await post(owner, '/api/org/config/roles', { server_id: s1.id, role_id: C(8), permission_group: 'manager' });
await post(owner, '/api/org/config/roles', { server_id: s1.id, role_id: C(9), permission_group: 'club_manager', scope_type: 'club', scope_id: c2.id });
const bare = { DB: env.DB, DISCORD_CLIENT_SECRET: 'x', ADMIN_IDS: '111' }; // what wrangler.toml now provides: no guild, no role IDs
resetOrgEnvCache();
const h = await withOrgEnv(bare);
t('the Discord server comes from the active server row', h.DISCORD_GUILD_ID === G);
t('owner / manager roles come from the role mappings', h.ORG_ROLES.owner.includes(C(7)) && h.ORG_ROLES.manager.includes(C(8)) && !!h.OWNER_ROLE_ID && !!h.ADMIN_ROLE_ID);
t('every mapped manager-type role is kept (manager and club_manager)', h.ORG_ROLES.manager.includes(C(8)) && h.ORG_ROLES.manager.includes(C(9)) && h.ORG_ROLES.owner.includes('1328824547104919604') && h.ORG_ROLES.manager.includes('1344757388766482452'));
t('the shared env is never mutated', bare.DISCORD_GUILD_ID === undefined && bare.ORG_ROLES === undefined);
const pinned = await withOrgEnv({ ...bare, DISCORD_GUILD_ID: '42', OWNER_ROLE_ID: 'keep' });
t('a value still set in wrangler/secrets wins over the config', pinned.DISCORD_GUILD_ID === '42' && pinned.OWNER_ROLE_ID === 'keep');
t('no database → untouched, never a baked-in ID', (await withOrgEnv({ ADMIN_IDS: '1' })).DISCORD_GUILD_ID === undefined);
t('discordRole: the mapped owner role is owner', discordRole(h, '500', [C(7)]) === 'owner');
t('discordRole: any mapped manager group is a manager', discordRole(h, '500', [C(8)]) === 'manager' && discordRole(h, '500', [C(9)]) === 'manager');
t('the seeded production roles (migration 0055) map owner/admin and manager', discordRole(h, '500', ['1328824547104919604']) === 'owner' && discordRole(h, '500', ['1440063888388391041']) === 'manager' && discordRole(h, '500', ['1328824701409038337']) === 'member');
t('discordRole: no mapped role is a plain member', discordRole(h, '500', ['somerole']) === 'member');
t('discordRole: ADMIN_IDS still bootstraps the owner', discordRole(h, '111', []) === 'owner');
t('discordRole: roles are not guessed when nothing is configured', discordRole({ ADMIN_IDS: '1' }, '500', [C(7)]) === 'member');
sqlite.prepare("UPDATE discord_servers SET active = 0 WHERE guild_id = ?").run(G);
resetOrgEnvCache();
t('an inactive server is not hydrated (empty, not the old ID)', (await withOrgEnv(bare)).DISCORD_GUILD_ID === '');
sqlite.prepare("UPDATE discord_servers SET active = 1 WHERE guild_id = ?").run(G);
resetOrgEnvCache();

// ---------- notification routing resolves its channel from the config ----------
const posts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const m = String(url).match(/channels\/(\d+)\/messages/);
  if (m) { posts.push({ channel: m[1], body: JSON.parse(init.body ?? '{}') }); return new Response(JSON.stringify({ id: 'm1' }), { status: 200 }); }
  return realFetch(url, init);
};
const rules = (rs) => sqlite.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('notify_routes', ?)").run(JSON.stringify(rs));
const penv = { ...env, DISCORD_BOT_TOKEN: 'tok' };
const ctx = (extra = {}) => ({ build: async () => ({ content: 'hi' }), groups: {}, ...extra });
await post(owner, '/api/org/config/channels', { server_id: s1.id, channel_id: C(5), purpose: 'match_notifications', scope_type: 'division', scope_id: mx.id });
rules([{ action: 'event.created', group: 'everyone', method: 'channel', on: true }]);

const viaDivision = await routeNotification(penv, 'event.created', ctx({ divisionId: mx.id }));
t('a rule with no channel posts to match_notifications for that division', viaDivision.posts[0]?.ok && posts.at(-1).channel === C(5));
posts.length = 0;
const missing = await routeNotification(penv, 'event.created', ctx({ divisionId: lg.id }));
t('no match_notifications destination for that division → reported, nothing posted', posts.length === 0 && missing.errors.some((e) => /no destination/.test(e)) && missing.posts.length === 0);
await call(owner, '/api/bot/settings', { reminderChannel: C(6) }).catch(() => {});
sqlite.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('announce_channel', ?)").run(C(4));
const noSubstitute = await routeNotification(penv, 'event.created', ctx({ divisionId: lg.id }));
t('the old reminder / announce channels are NOT silently used instead', posts.length === 0 && noSubstitute.errors.length === 1);
const explicit = await routeNotification(penv, 'event.created', ctx({ divisionId: lg.id, channel: C(4) }));
t('an explicit channel (the event\'s own post) is still honoured', explicit.posts[0]?.ok && posts.at(-1).channel === C(4));
posts.length = 0;
rules([{ action: 'event.created', group: 'everyone', method: 'channel', channel: C(6), on: true }]);
const ruleChannel = await routeNotification(penv, 'event.created', ctx({ divisionId: lg.id }));
t('a channel picked on the rule wins', ruleChannel.posts[0]?.ok && posts.at(-1).channel === C(6));
globalThis.fetch = realFetch;

// ---------- nothing hardcoded is left in the deploy config ----------
const toml = fs.readFileSync(new URL('../bot/wrangler.toml', import.meta.url), 'utf8');
const vars = (toml.match(/^[A-Z_]+ = /gm) ?? []).map((v) => v.replace(' = ', ''));
t('wrangler.toml no longer sets the Discord server or role IDs', !vars.some((v) => ['DISCORD_GUILD_ID', 'OWNER_ROLE_ID', 'ADMIN_ROLE_ID', 'MEMBER_ROLE_ID'].includes(v)));
t('ADMIN_IDS stays as the bootstrap owner (a user ID cannot come from a role mapping)', vars.includes('ADMIN_IDS'));
t('the guild ID is only in the seed migration, not in code', !fs.readdirSync(new URL('../bot/', import.meta.url)).filter((f) => f.endsWith('.js')).some((f) => fs.readFileSync(new URL(`../bot/${f}`, import.meta.url), 'utf8').includes(G)));

done();
