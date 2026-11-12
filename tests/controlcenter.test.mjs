// Control Center (PLANNING/CONTROL-CENTER.md): the registry cannot go stale, every output is controllable at runtime, the website and /setup write the same rows,
// changes are audited and role-gated, notifications are independent checkboxes that default to on, nothing hardcodes a channel or role, and the page is Phoenix.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { call, env, login, sqlite, ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';
import { COMMANDS } from '../bot/commanddefs.js';
import { TYPES, notify, methodsOf, allOn } from '../bot/notify.js';
import { REGISTRY, REGISTRY_KEYS } from '../bot/registry.gen.js';
import { buildRegistry, renderRegistryFile, jobsFromWorker, REGISTRY_FILE } from '../tools/bot-studio/lib/registry.mjs';
import * as C from '../bot/controls.js';
import { saveControl, setOutput, outputChoices } from '../bot/controlcenter.js';
import { commandBlocked, getCommandSettings } from '../bot/botcommands.js';
import { CHANNEL_PURPOSES } from '../bot/orgconsts.js';
import { CHANNEL_PURPOSE_INFO } from '../bot/orgconfig.js';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const config = JSON.parse(read('config.json'));
const botFiles = fs.readdirSync(path.join(ROOT, 'bot')).filter((f) => f.endsWith('.js') && f !== 'registry.gen.js');

// ---------- the registry is generated from live code and covers everything ----------
t('bot/registry.gen.js is current (run: node tools/bot-studio/studio.mjs registry)', fs.readFileSync(REGISTRY_FILE, 'utf8') === renderRegistryFile(buildRegistry()));
t('every slash command in COMMANDS has a registry entry', COMMANDS.every((c) => REGISTRY_KEYS.has(`slash:/${c.name}`)));
t('every notification type has a registry entry (hidden test type excepted)', Object.entries(TYPES).filter(([, x]) => !x.hidden).every(([k]) => REGISTRY_KEYS.has(`dm:notify:${k}`)));
t('every site feature switch has a registry entry', Object.keys(config.features).every((f) => REGISTRY_KEYS.has(`site:${f}`)));
const wsrc = read('bot/worker.js'), sched = wsrc.slice(wsrc.indexOf('async scheduled('), wsrc.indexOf('async fetch('));
t('every scheduled job has a registry entry, and none is started outside job() (a bare waitUntil would have no switch)', jobsFromWorker().every((j) => REGISTRY_KEYS.has(`job:${j.fn}`)) && !/ctx\.waitUntil\(/.test(sched.replace("ctx.waitUntil(make());", '')));
t('the Rush queue buttons and the Need a player call are registered', ['join', 'leave', 'crew', 'search', 'found', 'failed', 'need', 'report'].every((a) => REGISTRY_KEYS.has(`comp:pf:rq:${a}`)) && REGISTRY_KEYS.has('auto:rush-need') && REGISTRY_KEYS.has('auto:rush-board'));
t('every kind the page shows is present', ['command', 'component', 'automated', 'scheduled', 'dm', 'site'].every((k) => REGISTRY.items.some((i) => i.kind === k)));
t('every item has a key, kind, name and app, and keys are unique', REGISTRY.items.every((i) => i.key && i.kind && i.name && i.app) && new Set(REGISTRY.items.map((i) => i.key)).size === REGISTRY.items.length);
// A module that posts to a Discord channel must be the source of a registered output (or a generic sender): a new automated post cannot slip in unregistered.
const POSTERS = botFiles.filter((f) => /\/channels\/\$\{[^}]+\}\/messages`/.test(read(`bot/${f}`)) && /method: 'POST'|'POST'/.test(read(`bot/${f}`)));
const HELPERS = new Set(['monitor.js', 'servertools.js', 'insights.js', 'notify.js', 'routing.js', 'docs.js', 'botcommands.js', 'playmedia.js']); // generic senders: the outputs that use them are registered under their own modules
const unregistered = POSTERS.filter((f) => !HELPERS.has(f) && !REGISTRY.items.some((i) => String(i.source ?? '').includes(f)));
t(`every module that posts to a channel is the source of a registered output (${unregistered.join(', ') || 'none missing'})`, unregistered.length === 0);
const used = new Set();
for (const f of botFiles) for (const m of read(`bot/${f}`).matchAll(/(?:audienceOf|controlOf|postChannels|gate)\(\s*env,\s*'((?:auto|job|dm|slash|site|comp):[^']+)'/g)) used.add(m[1]);
t(`every Control Center key used in code is in the registry (${[...used].join(', ')})`, [...used].every((k) => REGISTRY_KEYS.has(k)));

// ---------- no hardcoded channel or role (name or ID) anywhere ----------
const dirs = { bot: /\.(js|mjs)$/, web: /\.js$/, next: /\.(mjs|js)$/, scripts: /\.m?js$/ };
const files = Object.entries(dirs).flatMap(([dir, re]) => fs.readdirSync(path.join(ROOT, dir), { recursive: true }).filter((f) => re.test(f) && !/node_modules|\/out\/|registry\.gen|icons|emojis\.gen/.test(f)).map((f) => `${dir}/${f}`).filter((f) => fs.statSync(path.join(ROOT, f)).isFile()));
const ids = files.filter((f) => /\b\d{17,20}\b/.test(read(f).replace(/\/\/.*$/gm, '')));
t(`no Discord ID (channel, role, server, user) is typed into bot, web, next or scripts code${ids.length ? ': ' + ids.join(', ') : ''}`, ids.length === 0);
const NAMES = /(?<![(\w])['"`]#(?:general|announcements?|rules|rush-?[a-z-]*|results?|match-?[a-z-]*|staff|managers?|lfg|logs?|welcome|bot-?[a-z-]*)['"`]/i;
const named = files.filter((f) => NAMES.test(read(f)));
t(`no channel name is typed into code${named.length ? ': ' + named.join(', ') : ''}`, named.length === 0);
const purposes = new Set();
for (const f of botFiles) for (const m of read(`bot/${f}`).matchAll(/(?:channelsFor|channelFor|resolveChannel|mirrorChannel)\(\s*(?:env|e)?,?\s*'([a-z_]+)'/g)) purposes.add(m[1]);
t(`every channel purpose the code asks for is a configured purpose (${[...purposes].filter((p) => !CHANNEL_PURPOSES.includes(p)).join(', ') || 'all known'}), each with the words managers see`, [...purposes].every((p) => CHANNEL_PURPOSES.includes(p)) && CHANNEL_PURPOSES.every((p) => CHANNEL_PURPOSE_INFO[p]));

// ---------- runtime rules (bot/controls.js) ----------
const R = (o) => ({ enabled: true, rules: C.normalizeRules(o) });
t('no row: on, default rules, nothing restricted', C.decide(undefined, { userId: '1', channelId: '2' }).ok);
t('off blocks', C.decide({ enabled: false, rules: C.normalizeRules({}) }, {}).why === 'off');
t('an allow list of roles lets those roles in and keeps others out', C.decide(R({ allow_roles: ['90001'] }), { roleIds: ['90001'] }).ok && C.decide(R({ allow_roles: ['90001'] }), { roleIds: ['90002'] }).why === 'not-allowed');
t('allow members and allow roles are alternatives (several of each)', C.decide(R({ allow_roles: ['90001'], allow_members: ['70001', '70002'] }), { userId: '70002', roleIds: [] }).ok);
t('deny always wins over allow', C.decide(R({ allow_roles: ['90001'], deny_members: ['70001'] }), { userId: '70001', roleIds: ['90001'] }).why === 'denied-member' && C.decide(R({ allow_members: ['70001'], deny_roles: ['90003'] }), { userId: '70001', roleIds: ['90003'] }).why === 'denied-role');
t('channel allow list and deny list (several of each)', C.decide(R({ allow_channels: ['111111', '222222'] }), { channelId: '222222' }).ok && C.decide(R({ allow_channels: ['111111'] }), { channelId: '333333' }).why === 'wrong-channel' && C.decide(R({ deny_channels: ['333333', '444444'] }), { channelId: '444444' }).why === 'denied-channel');
const win = R({ windows: [{ days: [1], from: '08:00', to: '10:00' }] });
t('time windows (UTC) include and exclude, including across midnight', C.decide(win, { now: Date.parse('2026-11-09T09:00:00Z') }).ok && C.decide(win, { now: Date.parse('2026-11-09T11:00:00Z') }).why === 'outside-window' && C.decide(R({ windows: [{ days: [0, 1, 2, 3, 4, 5, 6], from: '22:00', to: '02:00' }] }), { now: Date.parse('2026-11-09T01:00:00Z') }).ok);
t('lists are cleaned: digits only, unique, junk dropped; levels must be real site roles', JSON.stringify(C.normalizeRules({ allow_roles: ['<@&90001>', '90001', 'x'] }).allow_roles) === '["90001"]' && C.normalizeRules({ allow_levels: ['manager', 'wizard'] }).allow_levels.join() === 'manager');
t('the component key folds ids the same way on both sides', C.componentKey('pf:lfg:12345:in') === 'comp:pf:lfg:N:in' && C.componentKey('pf:rq:join') === 'comp:pf:rq:join');

// ---------- API: role-gated, audited, one write path ----------
const owner = await login('111', [], 'Founder');
const mgr = await login('600', ['mgr'], 'Coach');
const member = await login('500', [], 'Player One');
t('a plain member cannot open the Control Center or write to it', (await call(member, '/api/controlcenter')).s === 403 && (await call(member, '/api/controlcenter/save', { key: 'slash:/club', enabled: false })).s === 403);
const g = await call(mgr, '/api/controlcenter');
t('a manager can open it: the whole registry, the purposes and the audit log, but not the owner-only Organization rows', g.s === 200 && g.d.items.length === REGISTRY.items.length && !!g.d.purposes.rush_need && Array.isArray(g.d.audit) && g.d.me.manage && !g.d.me.org && !g.d.org);
t('the owner also gets the Organization config and the site access rights', await (async () => { const o = (await call(owner, '/api/controlcenter')).d; return o.me.org && o.me.flags && !!o.org?.channels; })());
t('an unknown output is refused', (await call(mgr, '/api/controlcenter/save', { key: 'slash:/nothing', enabled: false })).s === 404);
let r = await call(mgr, '/api/controlcenter/save', { key: 'slash:/club', enabled: false, rules: { deny_roles: ['90003'], post_channels: ['333333', '444444'] } });
t('a manager switches a command off and sets several deny roles and post channels', r.s === 200 && r.d.row.enabled === false && r.d.row.rules.post_channels.length === 2);
t('…it is one stored row and the audit log says who, what and when', sqlite.prepare("SELECT enabled FROM output_controls WHERE key = 'slash:/club'").get().enabled === 0 && (await call(mgr, '/api/controlcenter')).d.audit.some((a) => a.name === 'Coach' && a.after.key === 'slash:/club' && a.after.enabled === false && a.at > 0));
t('the same change again is a no-op (no second audit row)', (await call(mgr, '/api/controlcenter/save', { key: 'slash:/club', enabled: false, rules: { deny_roles: ['90003'], post_channels: ['333333', '444444'] } })).d.unchanged === true);
const who = { u: '500', role: 'member' };
t('the worker reads it at runtime: a switched-off command is refused for members, never for the owner', /switched off/.test(await commandBlocked(env, 'club', who, '555555', undefined, { roleIds: [] })) && (await commandBlocked(env, 'club', { u: '111', role: 'owner' }, '555555', undefined, { roleIds: [] })) === null);
await call(mgr, '/api/controlcenter/save', { key: 'slash:/club', enabled: true, rules: { deny_roles: ['90003'], min: 'member' } });
t('deny roles apply from the interaction\'s Discord roles; the lowest level still applies', /not available to your role/.test(await commandBlocked(env, 'club', who, '1', undefined, { roleIds: ['90003'] })) && (await commandBlocked(env, 'club', who, '1', undefined, { roleIds: [] })) === null && (await getCommandSettings(env)).club.min === 'member');
r = await call(mgr, '/api/controlcenter/reset', { key: 'slash:/club' });
t('back to default removes the row and is audited', r.s === 200 && !sqlite.prepare("SELECT 1 FROM output_controls WHERE key = 'slash:/club'").get() && (await call(mgr, '/api/controlcenter')).d.audit.some((a) => a.action === 'reset'));
r = await call(owner, '/api/bot/commands', { commands: { club: { enabled: false, min: 'manager', channels: ['11111111'], reply: 'private', postTo: '22222222' } } });
const row = sqlite.prepare("SELECT enabled, rules FROM output_controls WHERE key = 'slash:/club'").get();
t('the old /api/bot/commands panel now writes the Control Center rows (one store) and the old blob is gone', r.s === 200 && row.enabled === 0 && JSON.parse(row.rules).allow_channels[0] === '11111111' && JSON.parse(row.rules).post_channels[0] === '22222222' && !sqlite.prepare("SELECT 1 FROM meta WHERE key = 'bot_commands'").get() && (await getCommandSettings(env)).club.min === 'manager');
await call(owner, '/api/bot/commands', { commands: {} });
t('…and clearing it there clears the row', !sqlite.prepare("SELECT 1 FROM output_controls WHERE key = 'slash:/club'").get());
r = await setOutput(env, { u: '600', n: 'Coach' }, { output: 'auto:rush-need', state: 'off', channel: '33333333', role: '90001' });
t('/setup output writes the same row the website reads', r.row.enabled === false && r.row.rules.post_channels[0] === '33333333' && r.row.rules.allow_roles[0] === '90001' && (await call(mgr, '/api/controlcenter')).d.items.find((i) => i.key === 'auto:rush-need').row.rules.post_channels[0] === '33333333');
r = await setOutput(env, { u: '600', n: 'Coach' }, { output: 'auto:rush-need', channel: '44444444' });
t('…another change adds to the lists (several channels) instead of replacing them', r.row.rules.post_channels.join() === '33333333,44444444' && r.row.enabled === false);
t('/setup output default clears it; an unknown output is explained', (await setOutput(env, { u: '600' }, { output: 'auto:rush-need', state: 'default' })).row.enabled === true && /not an output/.test((await setOutput(env, { u: '600' }, { output: 'nope' })).error));
t('the output option autocompletes from the registry', outputChoices('queue').some((c) => c.value === 'slash:/queue') && outputChoices('').length === 25);
t('/setup has the output subcommand with an autocomplete option', COMMANDS.find((c) => c.name === 'setup').options.some((o) => o.name === 'output' && o.options.some((x) => x.autocomplete)));
const realFetch = globalThis.fetch, made = [];
globalThis.fetch = async (url, init) => { if (/\/guilds\/9\/(channels|roles)/.test(String(url))) { made.push({ url: String(url), body: JSON.parse(init.body) }); return Response.json({ id: '7777777', name: JSON.parse(init.body).name }); } return realFetch(url, init); };
env.DISCORD_BOT_TOKEN = 'tok';
r = await call(mgr, '/api/controlcenter/create', { kind: 'channel', name: 'Rush Calls!' });
t('the page can create a Discord channel (named safely) and a role, then attach it', r.s === 200 && r.d.id === '7777777' && made[0].body.name === 'rush-calls' && (await call(mgr, '/api/controlcenter/create', { kind: 'role', name: 'Rush' })).s === 200 && /roles/.test(made[1].url));
globalThis.fetch = realFetch; delete env.DISCORD_BOT_TOKEN;

// ---------- jobs ----------
await saveControl(env, { u: '600', n: 'Coach' }, 'job:checkHype', { enabled: false });
t('a scheduled job can be switched off at runtime', (await C.disabledOutputs(env, 'job:')).has('job:checkHype') && !(await C.disabledOutputs(env, 'slash:/')).has('job:checkHype'));
await saveControl(env, { u: '600' }, 'job:checkHype', { enabled: true });

// ---------- notifications: independent methods, on by default, manager rules, migration ----------
const nm = await login('70510', [], 'Notif Member'), nm2 = await login('70511', [], 'Notif Two');
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), notifications: 'members', push: 'members' });
t('every type starts with every method on, for everyone', Object.keys(TYPES).every((k) => JSON.stringify(methodsOf({}, k)) === JSON.stringify(allOn())));
t('stored old settings migrate on read: dm = all three, site = site only, off = none (announcements cannot be fully muted)', methodsOf({ rush: 'dm' }, 'rush').dm && !methodsOf({ rush: 'site' }, 'rush').dm && methodsOf({ rush: 'site' }, 'rush').site && !methodsOf({ rush: 'off' }, 'rush').site && methodsOf({ announce: 'off' }, 'announce').site);
const s = (await call(nm, '/api/notify')).d;
t('the member sees checkboxes per type: site, dm, push, all ticked by default', s.types.every((x) => x.methods.site && x.methods.dm && x.methods.push) && s.types.length > 10);
r = await call(nm, '/api/notify/prefs', { prefs: { rush: { site: true, dm: false, push: false }, badge: 'off' } });
t('each box is saved on its own (the old string form still works)', r.s === 200 && r.d.types.find((x) => x.k === 'rush').methods.dm === false && r.d.types.find((x) => x.k === 'rush').methods.site && r.d.types.find((x) => x.k === 'badge').methods.site === false);
t('announcements keep at least one box', (await call(nm, '/api/notify/prefs', { prefs: { announce: { site: false, dm: false, push: false } } })).s === 400 && (await call(nm, '/api/notify/prefs', { prefs: { announce: { site: true, dm: false, push: false } } })).s === 200);
const dmRow = (uid, type) => sqlite.prepare('SELECT dm, on_site FROM notifications WHERE user_id = ? AND type = ? ORDER BY id DESC').get(uid, type);
await notify(env, ['70510', '70511'], { type: 'rush', title: 'Rush result confirmed' });
t('a notification honours each person\'s boxes: no DM for the one who unticked it, both get the site entry', dmRow('70510', 'rush').dm === null && dmRow('70510', 'rush').on_site === 1 && dmRow('70511', 'rush').dm === 'queued');
await call(nm, '/api/notify/prefs', { prefs: { badge: { site: false, dm: true, push: false } } });
await notify(env, ['70510'], { type: 'badge', title: 'Another badge' });
t('a type with the site box off but DM on is delivered by DM only and stays off the site list', dmRow('70510', 'badge').dm === 'queued' && dmRow('70510', 'badge').on_site === 0 && !(await call(nm, '/api/notify')).d.items.some((x) => x.title === 'Another badge'));
await saveControl(env, { u: '600', n: 'Coach' }, 'dm:notify:play', { rules: { allow_members: ['70511'] } });
await notify(env, ['70510', '70511'], { type: 'play', title: 'New play' });
t('a manager rule limits who gets a notification (members)', !dmRow('70510', 'play') && !!dmRow('70511', 'play'));
await saveControl(env, { u: '600' }, 'dm:notify:play', { rules: { allow_members: [], deny_levels: ['member'] } });
await notify(env, ['70511'], { type: 'play', title: 'Second play' });
t('…and by level (denying the members level: nobody gets it)', sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = '70511' AND type = 'play'").get().n === 1);
await saveControl(env, { u: '600' }, 'dm:notify:play', { rules: { deny_levels: [], methods: { site: true, dm: false, push: false } } });
await notify(env, ['70511'], { type: 'play', title: 'Third play' });
t('a manager can switch a method off for a type: no DM although the member has it ticked, and the member sees it greyed', dmRow('70511', 'play').dm === null && dmRow('70511', 'play').on_site === 1 && (await call(nm2, '/api/notify')).d.types.find((x) => x.k === 'play').allowed.dm === false);
await saveControl(env, { u: '600' }, 'dm:notify:play', { rules: { methods: { site: true, dm: true, push: true }, windows: [{ days: [], from: '00:00', to: '00:01' }] } });
await notify(env, ['70511'], { type: 'play', title: 'Windowed play' });
t('outside a manager\'s time window the site still gets it and the DM is held back', dmRow('70511', 'play').dm === null && dmRow('70511', 'play').on_site === 1);
await saveControl(env, { u: '600' }, 'dm:notify:play', { enabled: false });
const before = sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE type = 'play'").get().n;
await notify(env, ['70510', '70511'], { type: 'play', title: 'Off play' });
t('a notification type switched off sends nothing to anyone', sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE type = 'play'").get().n === before);

// ---------- Phoenix branding of the Control Center page and everything it adds ----------
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-site-'));
execFileSync(process.execPath, ['phoenix/build.mjs', '--out', out], { cwd: ROOT, stdio: 'pipe' });
const rd = (f) => fs.readFileSync(path.join(out, f), 'utf8');
const page = rd('staff-controlcenter.html'), js = rd('controlcenter.js'), css = rd('controlcenter.css'), org = rd('orgpanel.js');
const visible = page.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
t('Control Center page: Phoenix name, no NOREX in anything people read, the scripts are loaded', !/norex/i.test(visible) && /Phoenix Fire/i.test(page) && page.includes('controlcenter.js') && page.includes('orgpanel.js') && page.includes('id="ccLive"'));
t('Control Center page, script and styles: no NOREX red or blue-black, no club-name leftovers, orange accent', !/#c8352c|#080b11/i.test(page + js + css + org) && /#e8651a/i.test(css) && !/NOREX UNITED/i.test(page + js + css + org));
t('the page is linked from the staff hub and the Boardroom points to it', /staff-controlcenter\.html/.test(rd('staff.html')) && /staff-controlcenter\.html/.test(rd('boardroom.js')));
t('the notification boxes ship in the site and the Hub; no preset dropdown or button wording is left', /data-pm=/.test(rd('alerts.js')) && !/Site \+ DM|DM \+ site/.test(rd('alerts.js') + read('web/notify.js')));
fs.rmSync(out, { recursive: true, force: true });
const rq = read('bot/rushqueue.js');
t('the Rush board and the Need a player call read their channel and audience through the Control Center, with no ID in the module', /postChannels\(env, 'auto:rush-board', 'rush_queue'\)/.test(rq) && /audienceOf\(env, 'auto:rush-need'\)/.test(rq) && !/\d{17,20}/.test(rq));

done();
