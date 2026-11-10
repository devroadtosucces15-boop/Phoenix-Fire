// A9: config-driven channels. Every feature reads its channel from Organization config (discord_channels), /setup channel and
// /setup role write the same rows the website does, and nothing outside bot/orgconfig.js hardcodes a channel or role id.
import fs from 'node:fs';
import { env, sqlite, call, login, ROOT } from './mock.mjs';
import worker from '../bot/worker.js';
import { t, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { channelFor, channelsFor, CHANNEL_PURPOSES, CHANNEL_PURPOSE_INFO } from '../bot/orgconfig.js';
import { memberWatch } from '../bot/servertools.js';

const owner = await login('111', [], 'Owner'); // before Discord is stubbed: login talks to the mock OAuth

// ---------- fake Discord ----------
env.DISCORD_BOT_TOKEN = 'bot-token';
const calls = [];
let members = [];
let channelMsgs = [];
let roles = [{ id: '9', name: '@everyone' }, { id: 'r-mgr', name: 'Manager' }];
let membersStatus = 200;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const method = init.method ?? 'GET';
  if (!url.startsWith('https://discord.com/api/v10')) return realFetch(url, init);
  const body = init.body ? JSON.parse(init.body) : undefined;
  const path = url.slice('https://discord.com/api/v10'.length);
  calls.push({ method, path, body });
  if (path.startsWith('/guilds/%s/members?')) {
    if (membersStatus !== 200) return Response.json({ code: 50001 }, { status: membersStatus });
    const after = new URL('https://x' + path).searchParams.get('after');
    return Response.json(after === '0' ? members : []);
  }
  if (path === '/guilds/%s/roles' && method === 'GET') return Response.json(roles);
  if (path === '/guilds/%s/roles' && method === 'POST') { const r = { id: `r-${roles.length}`, name: body.name }; roles.push(r); return Response.json(r); }
  if (/^\/channels\/[^/]+\/messages\?limit=100$/.test(path)) return Response.json(channelMsgs);
  if (/^\/channels\/[^/]+\/messages$/.test(path)) return Response.json({ id: 'msg' });
  if (/^\/guilds\/9\/members\/[^/]+\/roles\//.test(path)) return new Response(null, { status: 204 });
  if (/messages\/bulk-delete$/.test(path) || method === 'DELETE') return new Response(null, { status: 204 });
  if (path.startsWith('/webhooks/')) return Response.json({});
  return Response.json({ message: 'unexpected ' + path }, { status: 404 });
};
const txt = (d) => plainText(d);
const ids = (d) => (JSON.stringify(d?.components ?? []).match(/"custom_id":"[^"]+"/g) ?? []).map((x) => x.slice(13, -1));
const posts = (channel) => calls.filter((c) => c.method === 'POST' && c.path === `/channels/${channel}/messages`).map((c) => c.body);
const now = Date.now();
const mem = (id, name, o = {}) => ({ user: { id, username: name, avatar: null }, nick: null, roles: [], joined_at: new Date(now - 40 * 864e5).toISOString(), ...o });

// ---------- signed interactions ----------
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex');
const pending = [];
async function send(payload) {
  const body = JSON.stringify(payload), ts = String(Date.now());
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  const res = await worker.fetch(new Request('https://bot/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), env, { waitUntil: (p) => pending.push(p) });
  return res.json();
}
const flush = async () => { while (pending.length) await pending.shift(); };
const as = (uid, roleIds = []) => ({ member: { user: { id: uid, username: `u${uid}` }, roles: roleIds }, channel_id: 'chan-1', token: 'tok' });
const MGR = as('700', ['mgr']), MEMBER = as('701', []);
const slash = (u, name, options = []) => send({ type: 2, data: { name, options }, ...u });
const sub = (u, name, s, options = []) => slash(u, name, [{ type: 1, name: s, options }]);
const opt = (o) => Object.entries(o).map(([name, value]) => ({ name, value }));
const lastPatch = () => txt(calls.filter((c) => c.method === 'PATCH' && c.path.startsWith('/webhooks/')).at(-1)?.body);

const GUILD = '1500000000000000001', CH_Q = '1500000000000000011', CH_LOG = '1500000000000000012', ROLE_M = '1500000000000000021';
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES (?, 'Test server')").run(GUILD);
const inGuild = (u) => ({ ...u, guild_id: GUILD, channel_id: '1500000000000000051' });
const T = (r) => txt(r?.data ?? r);
const rows = (table) => sqlite.prepare(`SELECT * FROM ${table} WHERE server_id = (SELECT id FROM discord_servers WHERE guild_id = ?) ORDER BY id`).all(GUILD);
const strip = (r) => { const { id, ...rest } = r; return rest; };

// ---------- the purpose list is complete and described ----------
for (const p of ['rush_queue', 'rush_queue_reports', 'awards', 'reminders', 'member_log', 'hype', 'voice_recap', 'live_alerts', 'fun_posts', 'automod_alerts', 'welcome'])
  t(`purpose "${p}" exists and has a description`, CHANNEL_PURPOSES.includes(p) && !!CHANNEL_PURPOSE_INFO[p]);

// ---------- /setup channel ----------
t('/setup channel is managers only', /Only managers/.test(T(await sub(inGuild(MEMBER), 'setup', 'channel', opt({ purpose: 'rush_queue', channel: CH_Q })))));
let r = await sub(inGuild(MGR), 'setup', 'channel', opt({ purpose: 'rush_queue', channel: CH_Q }));
t('/setup channel saves the channel under its purpose', /rush queue/.test(T(r)) && (await channelFor(env, 'rush_queue')) === CH_Q);
await sub(inGuild(MGR), 'setup', 'channel', opt({ purpose: 'rush_queue', channel: CH_Q }));
t('running it twice does not add a duplicate row', rows('discord_channels').filter((x) => x.purpose === 'rush_queue').length === 1);
r = await sub(inGuild(MGR), 'setup', 'channel', opt({ purpose: 'rush_queue_reports' }));
t('without a channel it uses the one the command ran in', rows('discord_channels').find((x) => x.purpose === 'rush_queue_reports')?.channel_id === '1500000000000000051');
t('…and an unknown server is refused with a pointer to the website', /not in the Organization config/.test(T(await sub({ ...MGR, guild_id: '1599999999999999999' }, 'setup', 'channel', opt({ purpose: 'welcome', channel: CH_Q })))));

// ---------- site edit and command produce identical rows ----------
const serverId = sqlite.prepare('SELECT id FROM discord_servers WHERE guild_id = ?').get(GUILD).id;
await sub(inGuild(MGR), 'setup', 'channel', opt({ purpose: 'hype', channel: CH_LOG }));
const viaCmd = rows('discord_channels').find((x) => x.purpose === 'hype');
const web = (await call(owner, '/api/org/config/channels', { server_id: serverId, channel_id: CH_LOG, purpose: 'voice_recap', scope_type: 'org', label: '', active: 1 })).d;
const viaWeb = rows('discord_channels').find((x) => x.purpose === 'voice_recap');
t('the website creates a row', !!web?.id && !!viaWeb);
t('command row and website row have the same shape and values apart from purpose', JSON.stringify({ ...strip(viaCmd), purpose: '' }) === JSON.stringify({ ...strip(viaWeb), purpose: '' }));
t('both edits are in the audit log', sqlite.prepare("SELECT COUNT(*) n FROM config_audit WHERE entity = 'channels'").get().n >= 3);

// ---------- /setup role ----------
r = await sub(inGuild(MGR), 'setup', 'role', opt({ group: 'manager', role: ROLE_M }));
const roleRow = rows('discord_roles').find((x) => x.role_id === ROLE_M);
t('/setup role maps the role to a permission group', roleRow?.permission_group === 'manager' && roleRow.scope_type === 'org' && roleRow.active === 1);
const webRole = (await call(owner, '/api/org/config/roles', { server_id: serverId, role_id: '1500000000000000022', permission_group: 'manager', scope_type: 'org', label: '', active: 1 })).d;
const roleRow2 = rows('discord_roles').find((x) => x.role_id === '1500000000000000022');
t('command role row equals the website role row', !!webRole?.id && JSON.stringify({ ...strip(roleRow), role_id: '' }) === JSON.stringify({ ...strip(roleRow2), role_id: '' }));

// ---------- features read their channel from config ----------
const ADD = (purpose, id) => sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, ?, ?, 'org', '', 1)").run(serverId, id, purpose);
t('no channel configured → null, never a guess', (await channelFor(env, 'awards')) === null && (await channelFor(env, 'automod_alerts')) === null);
ADD('awards', '1500000000000000031'); ADD('announcements', '1500000000000000032');
t('a configured purpose is returned', (await channelFor(env, 'awards')) === '1500000000000000031');
t('purposes that fall back to announcements do, and only those', (await channelFor(env, 'reminders')) === '1500000000000000032' && (await channelFor(env, 'live_alerts')) === '1500000000000000032' && (await channelFor(env, 'automod_alerts')) === null);
ADD('reminders', '1500000000000000033');
t('the purpose\'s own row beats the fallback', (await channelFor(env, 'reminders')) === '1500000000000000033');
sqlite.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('awards_channel', 'legacy-1')").run();
t('config wins over the legacy meta value', (await channelFor(env, 'awards')) === '1500000000000000031');
sqlite.prepare("UPDATE discord_channels SET active = 0 WHERE purpose = 'awards'").run();
t('with the config row switched off the legacy value still works (dual read)', (await channelFor(env, 'awards')) === 'legacy-1');
t('several channels per purpose are all returned', (ADD('hype', '1500000000000000034'), (await channelsFor(env, 'hype')).length) >= 2);

// the leave/join watcher posts where member_log points
ADD('member_log', '1500000000000000041');
env.GUILD_ID = '9';
calls.length = 0;
members = [mem('900', 'Alice')]; await memberWatch(env).catch(() => null);
members = []; calls.length = 0; await memberWatch(env).catch(() => null);
t('memberWatch reads the leave/join channel from config (posts nowhere else)', calls.filter((c) => c.method === 'POST' && /\/channels\/\d+\/messages$/.test(c.path)).every((c) => c.path === '/channels/1500000000000000041/messages'));

// ---------- static guard: no hardcoded channel or role ids, no legacy reads outside the one module ----------
const src = (f) => fs.readFileSync(ROOT + 'bot/' + f, 'utf8');
const files = fs.readdirSync(ROOT + 'bot').filter((f) => f.endsWith('.js') && f !== 'orgconfig.js');
const SNOW = /['"`]\d{17,20}['"`]/;
const offenders = files.filter((f) => SNOW.test(src(f).replace(/\/\/.*$/gm, '')));
t('no bot module outside orgconfig.js holds a literal Discord id' + (offenders.length ? ` (${offenders.join(', ')})` : ''), offenders.length === 0);
const legacy = files.filter((f) => /SELECT[^;\n]*(announce_channel|awards_channel)|getMeta\([^)]*(announce_channel|awards_channel)/.test(src(f)));
t('nothing reads the old announce/awards meta keys directly (the older /awards and /docs commands may still write them: dual-read fallback)' + (legacy.length ? ` (${legacy.join(', ')})` : ''), legacy.length === 0);
const site = ['next', 'web'].flatMap((d) => fs.existsSync(ROOT + d) ? fs.readdirSync(ROOT + d).filter((f) => /\.(html|js)$/.test(f)).map((f) => ROOT + d + '/' + f) : []);
const siteHits = site.filter((f) => SNOW.test(fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')));
t('no site page holds a literal channel or role id' + (siteHits.length ? ` (${siteHits.map((f) => f.slice(ROOT.length)).join(', ')})` : ''), siteHits.length === 0);

done();
