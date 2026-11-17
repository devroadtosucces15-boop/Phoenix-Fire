// PF-024 Item 12 – the server navigator (bot/navigator.js): scan → intent → who sees what → panel, wiki, rescan diff.
import { env, sqlite, config } from './mock.mjs';
import worker from '../bot/worker.js';
import { t, tt, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { intentOf, audienceOf, buildMap, diffMaps, wikiEntries, askWiki, scanServer, navCron, loadMap, loadChanges, SCAN_EVERY } from '../bot/navigator.js';
import { COMMANDS, APP_COMMANDS } from '../bot/commanddefs.js';
import { PERMS } from '../bot/roles.js';
import fs from 'node:fs';

const G = 'g-nav', VIEW = String(1 << 10);
const ch = (id, name, type = 0, extra = {}) => ({ id, name, type, position: Number(id), ...extra });
const channels = [
  ch('1', 'START', 4), ch('2', 'rules', 0, { parent_id: '1', topic: 'Read these' }), ch('3', 'welcome-and-intros', 0, { parent_id: '1' }),
  ch('10', 'PLAY', 4), ch('11', 'rush-lfg', 0, { parent_id: '10' }), ch('12', 'chat-room', 0, { parent_id: '10', topic: 'Talk about anything' }), ch('13', 'Squad 1', 2, { parent_id: '10' }), ch('14', 'tactic-board', 0, { parent_id: '10' }),
  ch('20', 'STAFF', 4, { permission_overwrites: [{ id: G, type: 0, allow: '0', deny: VIEW }, { id: 'mgr', type: 0, allow: VIEW, deny: '0' }] }),
  ch('21', 'manager-chat', 0, { parent_id: '20' }), ch('22', 'recaps', 0, { parent_id: '20' }),
  ch('30', 'members-only', 0, { permission_overwrites: [{ id: G, type: 0, allow: '0', deny: VIEW }, { id: 'memberrole', type: 0, allow: VIEW, deny: '0' }] }),
  ch('40', 'zzz-misc', 0),
];
const roles = [{ id: G, name: '@everyone' }, { id: 'mgr', name: 'Manager' }, { id: 'memberrole', name: 'Member' }];

// ---------- intent ----------
t('intent: a configured purpose beats the name', (() => { const i = intentOf({ name: 'zzz-misc' }, ['match_results']); return i.key === 'results' && i.source === 'configured'; })());
t('intent: a purpose with no catalogue entry still gets a label and the config description', (() => { const i = intentOf({ name: 'x' }, ['pinned_posts']); return i.source === 'configured' && i.label === 'Pinned posts' && /managers may pin/.test(i.blurb); })());
t('intent: guessed from the name, marked as a guess', (() => { const a = intentOf({ name: 'rush-lfg' }), b = intentOf({ name: 'welcome-and-intros' }), c = intentOf({ name: 'zzz-misc' }); return a.key === 'rush' && a.source === 'guess' && b.key === 'welcome' && c.key === 'other' && c.source === 'none'; })());
t('intent: the topic is used when the name says nothing', intentOf({ name: 'room-2', topic: 'Post your best goals and clips' }).key === 'media');

// ---------- who sees what ----------
t('audience: no overwrite = public; an everyone-deny with only staff roles = staff; with a member role = roles; a channel inherits its category', (() => {
  const staffCat = channels.find((c) => c.id === '20');
  return audienceOf(channels[1], channels[0], G, ['mgr']).audience === 'public'
    && audienceOf(channels.find((c) => c.id === '21'), staffCat, G, ['mgr']).audience === 'staff'
    && audienceOf(channels.find((c) => c.id === '30'), undefined, G, ['mgr']).audience === 'roles';
})());

// ---------- the map ----------
const map = buildMap({ guildId: G, channels, roles, purposeOf: new Map([['22', ['session_recaps']]]), staffRoleIds: ['mgr'], now: 1000 });
t('map: sections in order, an "Other channels" section for loose channels, voice channels included', map.sections.map((s) => s.name).join() === 'START,PLAY,STAFF,Other channels' && map.channels.some((c) => c.kind === 'voice') && map.channels.find((c) => c.id === '40').section === null);
t('map: purposes and audiences recorded per channel (role ids kept for the visibility check)', map.channels.find((c) => c.id === '22').source === 'configured' && map.channels.find((c) => c.id === '21').audience === 'staff' && map.channels.find((c) => c.id === '30').roleIds.join() === 'memberrole' && map.channels.find((c) => c.id === '30').roles.join() === 'Member');

// ---------- rescan diff ----------
const channels2 = channels.filter((c) => c.id !== '14').map((c) => (c.id === '12' ? { ...c, name: 'banter' } : c)).concat([ch('15', 'clips-and-goals', 0, { parent_id: '10' })]).map((c) => (c.id === '11' ? { ...c, parent_id: '1' } : c));
const map2 = buildMap({ guildId: G, channels: channels2, roles, purposeOf: new Map(), staffRoleIds: ['mgr'], now: 2000 });
const d = diffMaps(map, map2), kinds = (k) => d.filter((x) => x.kind === k).map((x) => x.id).join();
t('diff: new, removed, renamed, moved and purpose-changed channels are reported', kinds('new') === '15' && kinds('removed') === '14' && kinds('renamed') === '12' && kinds('moved') === '11' && kinds('purpose') === '22' && diffMaps(null, map2).length === 0);

// ---------- wiki ----------
const pub = { staff: false, roleIds: [] }, entries = wikiEntries(map, pub);
t('wiki: where-is answers name public channels only; staff channels stay out', entries.some((e) => /Where do I find rush/.test(e.q) && e.a.includes('<#11>')) && !entries.some((e) => e.a.includes('<#21>')) && wikiEntries(map, { staff: true, roleIds: [] }).some((e) => e.a.includes('<#21>')));
t('wiki: what-does-/command-do entries for public commands only (no staff, no context menu)', entries.some((e) => e.q === 'What does /club do?') && !entries.some((e) => /\/purge|\/unpin|Translate message/.test(e.q)));
t('wiki: a question finds the matching answer', askWiki(entries, 'where do I find a rush game')[0]?.q.includes('rush') && askWiki(entries, 'xyzzy').length === 0 && askWiki(entries, '').length === 0);
t('wiki: a role-only channel is shown to someone who holds the role', wikiEntries(map, { staff: false, roleIds: ['memberrole'] }).length >= entries.length);

// ---------- the Worker, with a fake Discord ----------
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex');
Object.assign(env, { DISCORD_BOT_TOKEN: 'tok', DISCORD_APP_ID: '100', DISCORD_GUILD_ID: G });
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), navigator: 'members' });
async function send(payload) {
  const body = JSON.stringify(payload), ts = String(Date.now());
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  const res = await worker.fetch(new Request('https://bot/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), env, { waitUntil: () => {} });
  return { s: res.status, d: await res.json().catch(() => null) };
}
const as = (id, name, roles = []) => ({ member: { user: { id, username: name }, roles }, channel_id: 'c1', token: 'tok' });
const MEMBER = as('500', 'Ash'), MGR = as('900', 'Coach', ['mgr']);
let live = channels, calls = 0, deny = false;
const real = globalThis.fetch;
globalThis.fetch = async (u, init = {}) => {
  u = String(u);
  if (u.startsWith('https://discord.com/')) {
    calls++;
    if (deny) return new Response('{"code":50001}', { status: 403 });
    if (u.endsWith(`/guilds/${G}/channels`)) return Response.json(live);
    if (u.endsWith(`/guilds/${G}/roles`)) return Response.json(roles);
    return Response.json({});
  }
  return real(u, init);
};
try {
  await tt('/navigator: private home panel, sections listed, staff section hidden from a member', async () => {
    const r = await send({ type: 2, ...MEMBER, data: { name: 'navigator' } }), txt = plainText(r.d.data);
    return r.d.type === 4 && !!(r.d.data.flags & 64) && /START/.test(txt) && /PLAY/.test(txt) && !/STAFF/.test(txt) && /server navigator/i.test(txt) && /phoenix fire/i.test(txt) && !/norex|c8352c/i.test(JSON.stringify(r.d.data).replace(/norex:nav:[a-z]+/g, ''));
  });
  t('the first use scanned the server and stored the map', !!(await loadMap(env)) && calls === 2);
  await tt('a section page lists channels with their purpose; a guess is marked', async () => {
    const r = await send({ type: 3, ...MEMBER, data: { component_type: 3, custom_id: 'norex:nav:sec', values: ['1'] } }), txt = plainText(r.d.data);
    return r.d.type === 7 && /<#11>/.test(txt) && /Rush/.test(txt) && /a guess/.test(txt) && !/<#21>/.test(txt);
  });
  await tt('a manager sees the staff section, marked, and the staff buttons', async () => {
    const home = await send({ type: 2, ...MGR, data: { name: 'navigator' } }), sec = await send({ type: 3, ...MGR, data: { component_type: 3, custom_id: 'norex:nav:sec', values: ['2'] } });
    return /STAFF/.test(plainText(home.d.data)) && /<#21>/.test(plainText(sec.d.data)) && /🔒/.test(plainText(sec.d.data)) && /norex:nav:scan/.test(JSON.stringify(home.d.data));
  });
  await tt('/navigator question: answers from the wiki', async () => /Rush/.test(plainText((await send({ type: 2, ...MEMBER, data: { name: 'navigator', options: [{ name: 'question', value: 'where do I find a rush game' }] } })).d.data)));
  await tt('Q&A page and an answer', async () => {
    const qa = await send({ type: 3, ...MEMBER, data: { component_type: 2, custom_id: 'norex:nav:qa' } }), a = await send({ type: 3, ...MEMBER, data: { component_type: 3, custom_id: 'norex:nav:q', values: ['0'] } });
    return qa.d.type === 7 && /Questions and answers/.test(plainText(qa.d.data)) && a.d.type === 7 && /Where do I find/.test(plainText(a.d.data));
  });
  await tt('Rescan now and What changed are for managers', async () => {
    live = channels2; const denied = await send({ type: 3, ...MEMBER, data: { component_type: 2, custom_id: 'norex:nav:scan' } });
    const ok = await send({ type: 3, ...MGR, data: { component_type: 2, custom_id: 'norex:nav:scan' } }), chg = await send({ type: 3, ...MGR, data: { component_type: 2, custom_id: 'norex:nav:chg' } });
    const memberChg = await send({ type: 3, ...MEMBER, data: { component_type: 2, custom_id: 'norex:nav:chg' } });
    return /Managers only/.test(plainText(denied.d.data)) && ok.d.type === 7 && /new <#15>|renamed <#12>/.test(plainText(chg.d.data)) && !/What changed.*renamed/s.test(plainText(memberChg.d.data));
  });
  t('the rescan kept what changed', (await loadChanges(env)).length === 1 && (await loadChanges(env))[0].changes.length >= 4);
  // ---------- the cron ----------
  calls = 0; const m0 = await loadMap(env);
  t('cron: a fresh map is not rescanned (no Discord call)', (await navCron(env, m0.at + 1000)).scanned === false && calls === 0);
  const r2 = await navCron(env, m0.at + SCAN_EVERY + 1000);
  t('cron: an old map is rescanned', r2.scanned === true && calls === 2);
  deny = true;
  await tt('the bot cannot see the server → a plain explanation, no crash', async () => { sqlite.exec("DELETE FROM meta WHERE key = 'nav:map'"); const r = await send({ type: 2, ...MEMBER, data: { name: 'navigator' } }); return /cannot see the server/.test(plainText(r.d.data)); });
  deny = false;
  await tt('flag off → locked', async () => { const e = { ...env, FEATURES: JSON.stringify({ ...JSON.parse(env.FEATURES), navigator: 'off' }) }; const body = JSON.stringify({ type: 2, ...MEMBER, data: { name: 'navigator' } }), ts = String(Date.now()); const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex'); const res = await (await worker.fetch(new Request('https://bot/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), e, { waitUntil: () => {} })).json(); return /Not switched on/.test(plainText(res.data)); });
} finally { globalThis.fetch = real; }

// ---------- definitions, config, branding ----------
const src = fs.readFileSync(new URL('../bot/navigator.js', import.meta.url), 'utf8');
t('/navigator is a tools command with an optional question; navigator.manage is a manager permission; the flag ships owner-only', COMMANDS.find((c) => c.name === 'navigator')?.options?.[0]?.name === 'question' && !COMMANDS.find((c) => c.name === 'navigator').options[0].required && APP_COMMANDS.tools.includes('navigator') && PERMS['navigator.manage'] === 'manager' && config.features.navigator === 'owner');
t('the navigator names no channel or ID in code, no NOREX, and reads purposes from the Organization config table', !/\b\d{17,20}\b/.test(src) && !/norex(?!:nav)/i.test(src.replace(/norex:nav/g, '')) && /FROM discord_channels/.test(src));
done();
