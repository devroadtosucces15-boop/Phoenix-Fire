// Step 4: the match alert fires from the result-import step. Rule: a defeat by 3 or more goals (config.matchAlert.loseBy).
// The channel and the roles are read from the Organization config by the Worker, never named in code.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { postResults } from '../scripts/lib/resultpost.mjs';
import { requestMatchAlert, orgKey } from '../scripts/lib/org.mjs';
import { alertLine, loseByOf, matchAlertRoute } from '../bot/matchalert.js';
import { settingsKey } from '../bot/settings.js';
import { t, done } from './lib.mjs';

// ---- the rule
t('a 0–3 defeat trips it', !!alertLine(0, 3));
t('a 1–5 defeat trips it', !!alertLine(1, 5));
t('a 1–3 defeat (2 goals) does not', alertLine(1, 3) === null);
t('a win and a draw never do', alertLine(4, 0) === null && alertLine(2, 2) === null);
t('the margin is config.matchAlert.loseBy, default 3', loseByOf({}) === 3 && loseByOf({ matchAlert: { loseBy: 2 } }) === 2 && !!alertLine(1, 3, 2) && alertLine(1, 3, 0) === null);
t('config.json states the default', JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).matchAlert.loseBy === 3);

// ---- the trigger inside the result import
const mk = (id, us, them) => ({ matchId: id, timestamp: 1791600000 + +id, matchType: 'leagueMatch',
  clubs: { 100: { wins: us > them ? '1' : '0', losses: us < them ? '1' : '0', goals: String(us), details: { name: 'Phoenix Fire' } }, 200: { wins: them > us ? '1' : '0', losses: them < us ? '1' : '0', goals: String(them), details: { name: 'A2Touch' } } },
  players: { 100: { a: { playername: 'Mike', goals: '0', assists: '0', rating: '5.1' } } } });
const config = { siteUrl: 'https://x.test/', features: { discordMatch: 'members' }, hiddenPlayers: [], matchAlert: { loseBy: 3 } };
process.env.DISCORD_BOT_TOKEN = 'tok'; process.env.DISCORD_WEBHOOK = '';
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('{}', { status: 200 });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-')); const cwd = process.cwd(); process.chdir(dir);
const route = async (c, purpose) => ({ ok: true, channelId: purpose === 'match_results' ? 'chan-1' : null });
const run = async (matches, extra = {}) => { const sent = []; await postResults(matches, { config, homeId: '100', route, alert: async (c, p) => (sent.push(p), { ok: true, posted: 1 }), ...extra }); return sent; };

let sent = await run([mk('1', 0, 3)]);
t('a 0–3 defeat asks for the alert once, with opponent and score', sent.length === 1 && sent[0].opponent === 'A2Touch' && sent[0].us === 0 && sent[0].them === 3 && /\d/.test(sent[0].when));
t('the request carries no channel or role', !/channel|role/i.test(JSON.stringify(sent[0])));
sent = await run([mk('2', 1, 3), mk('3', 5, 0), mk('4', 2, 2)]);
t('a narrow defeat, a win and a draw send nothing', sent.length === 0);
sent = await run([mk('5', 0, 4)], { noAlert: ['5'] });
t('a manual repost does not alert again', sent.length === 0);
sent = await run([mk('6', 0, 3)], { route: async () => ({ ok: true, channelId: null }) });
t('a result that was not posted does not alert', sent.length === 0);
sent = await run([mk('7', 0, 3)], { config: { ...config, matchAlert: { loseBy: 4 } } });
t('the configured margin is respected', sent.length === 0);
// a failing alert call never breaks the result post
const warns = []; const w = console.warn; console.warn = (...a) => warns.push(a.join(' '));
const res = await postResults([mk('8', 0, 3)], { config, homeId: '100', route, alert: async () => ({ ok: false, posted: 0, reason: 'HTTP 500' }) });
console.warn = w;
t('an alert that fails is warned about, and the result still counts as posted', res.posted === 1 && warns.some((x) => /Match alert/.test(x)));
process.chdir(cwd);

// ---- the sender signs with the shared key and calls the Worker
let req;
const r1 = await requestMatchAlert({ members: { api: 'https://w.test' } }, { opponent: 'X', us: 0, them: 3 }, { secret: 's', fetchFn: async (u, i) => { req = { u, i }; return new Response(JSON.stringify({ posted: 1 }), { status: 200 }); } });
t('the request goes to /api/org/match-alert with the key', r1.ok && r1.posted === 1 && req.u === 'https://w.test/api/org/match-alert' && req.i.headers['X-Phoenix-Key'] === orgKey('s') && req.i.method === 'POST');
t('without the secret nothing is sent', (await requestMatchAlert({ members: { api: 'https://w.test' } }, {}, { secret: '' })).ok === false);

// ---- the Worker reads the channel and the roles from the Organization config
const rows = { manager: [{ role_id: '333' }], owner: [] };
const db = { prepare: (sql) => { let args = []; const o = { bind: (...a) => { args = a; return o; }, all: async () => ({ results: /discord_roles/.test(sql) ? rows[args[0]] ?? [] : /discord_channels/.test(sql) ? (args[0] === 'match_results' ? [{ channel_id: '999', scope_type: 'org' }] : []) : [] }), first: async () => null, run: async () => ({}) }; return o; } };
const env = { SITE_URL: 'https://x.test/', ORG_NAME: 'Phoenix Fire', ADMIN_IDS: '111', DB: db, DISCORD_CLIENT_SECRET: 'sec', DISCORD_BOT_TOKEN: 'bot' };
const key = await settingsKey('sec');
const posts = [];
globalThis.fetch = async (u, i) => { posts.push({ u: String(u), body: i?.body }); return new Response('{}', { status: 200 }); };
const call = (body, headers = { 'X-Phoenix-Key': key }) => matchAlertRoute(new Request('https://w.test/api/org/match-alert', { method: 'POST', headers, body: JSON.stringify(body) }), env).then(async (r) => ({ s: r.status, d: await r.json() }));
let r = await call({ opponent: 'A2Touch', us: 0, them: 3, when: 'Tue 13 Oct' });
t('the Worker posts the alert into the match_results channel from config', r.d.posted === 1 && posts.length === 1 && posts[0].u.endsWith('/channels/999/messages'));
t('…tagging the manager role from config and the owner from ADMIN_IDS', /<@&333>/.test(posts[0].body) && /<@111>/.test(posts[0].body));
posts.length = 0;
r = await call({ opponent: 'A2Touch', us: 1, them: 2 });
t('the Worker re-checks the rule: a 1–2 defeat posts nothing', r.d.posted === 0 && posts.length === 0);
r = await call({ opponent: 'A2Touch', us: 0, them: 3 }, {});
t('no key, no alert', r.s === 403 && posts.length === 0);
const bare = { ...env, DB: { prepare: (sql) => { const o = { bind: () => o, all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }; return o; } } };
const nochan = await matchAlertRoute(new Request('https://w.test/x', { method: 'POST', headers: { 'X-Phoenix-Key': key }, body: JSON.stringify({ opponent: 'B', us: 0, them: 3 }) }), bare).then((x) => x.json());
t('with no channel set it says so and posts nothing', nochan.posted === 0 && /No match_results channel/.test(nochan.reason) && posts.length === 0);
globalThis.fetch = realFetch;

// ---- wired, and no hardcoded ids
const rp = fs.readFileSync(new URL('../scripts/lib/resultpost.mjs', import.meta.url), 'utf8');
t('resultpost calls the alert from the import step', /requestMatchAlert/.test(rp) && /alertLine\(item\.us/.test(rp));
t('post-results passes the repost ids so a repost never re-alerts', /noAlert: repost/.test(fs.readFileSync(new URL('../scripts/post-results.mjs', import.meta.url), 'utf8')));
t('no channel or role id in the alert code', !/\b\d{17,20}\b/.test(fs.readFileSync(new URL('../bot/matchalert.js', import.meta.url), 'utf8') + rp));
done();
