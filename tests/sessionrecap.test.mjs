// Session recap: sessions are found by the configured idle gap, a recap is built only from real match numbers (decoded stats only where event
// counters exist), the channel comes from the Organization config, and one session is posted once (the key is claimed before posting).
import fs from 'node:fs';
import { findSessions, isEnded, isFresh, buildRecap, settingsOf, DEFAULTS } from '../scripts/lib/sessionrecap.mjs';
import { requestSessionRecap, orgKey } from '../scripts/lib/org.mjs';
import { postSessionRecap, sessionRecapRoute, recapMessage, cleanRecap } from '../bot/sessionrecap.js';
import { CHANNEL_PURPOSES, CHANNEL_PURPOSE_INFO } from '../bot/orgconfig.js';
import { settingsKey } from '../bot/settings.js';
import { t, done } from './lib.mjs';

const P = (name, o = {}) => ({ playername: name, pos: 'midfielder', rating: '7.0', goals: '0', assists: '0', mom: '0', shots: '1', passesmade: '10', passattempts: '12', tacklesmade: '2', tackleattempts: '3', ...o });
const m = (id, ts, us, them, players, type = 'leagueMatch', club = '100') => ({ matchId: String(id), timestamp: ts, matchType: type,
  clubs: { [club]: { goals: String(us), goalsAgainst: String(them) }, 200: { goals: String(them), goalsAgainst: String(us), name: `Opp${id}`, details: { name: `Opp${id}` } } },
  players: { [club]: players, 200: { z: P('Opp') } } });
const T0 = 1_800_000_000, MIN = 60;
const EV = '105:1,106:2,107:1,108:2,109:3,110:4,111:30,219:3,6:4,30:5';
const ms = [
  m(1, T0, 2, 0, { a: P('Ann', { goals: '2', mom: '1', rating: '9.0', evraw: EV }), b: P('Bo', { assists: '1', rating: '7.5', evraw: EV }) }),
  m(2, T0 + 30 * MIN, 1, 3, { a: P('Ann', { goals: '1', rating: '6.0', evraw: EV }), b: P('Bo', { rating: '5.0', mom: '1', evraw: EV }) }),
  m(3, T0 + 60 * MIN, 0, 0, { a: P('Ann', { rating: '6.5' }), b: P('Hidden', { rating: '9.9', goals: '5' }) }, 'friendlyMatch'),
  m(4, T0 + 400 * MIN, 3, 1, { a: P('Ann', { goals: '3', rating: '8.0' }) }),            // a later session
  m(5, T0 + 10 * MIN, 5, 5, { a: P('Cy') }, 'leagueMatch', '300'),                       // another club, own session
];

// ---- sessions: the idle gap is a setting, not a constant
t('defaults and config overrides are read, bad values fall back', settingsOf({}).idleGapMinutes === DEFAULTS.idleGapMinutes && settingsOf({ sessionRecap: { idleGapMinutes: 20 } }).idleGapMinutes === 20 && settingsOf({ sessionRecap: { idleGapMinutes: 'x' } }).idleGapMinutes === DEFAULTS.idleGapMinutes && settingsOf({ sessionRecap: { enabled: false } }).enabled === false);
const cfg = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
t('config.json carries the recap settings', cfg.sessionRecap?.idleGapMinutes > 0 && cfg.sessionRecap.minMatches >= 1);
let ss = findSessions(ms, ['100', '300'], 45);
t('a 45 minute gap: matches 1-3 are one session, 4 is another, the other club has its own', ss.length === 3 && ss.find((s) => s.club === '100' && s.matches.length === 3) && ss.filter((s) => s.club === '100').length === 2);
ss = findSessions(ms, ['100', '300'], 20);
t('a 20 minute gap splits the first session (the gap is configurable)', ss.filter((s) => s.club === '100').length === 4);
ss = findSessions(ms, ['100'], 45);
t('only the clubs of the organization are recapped', ss.every((s) => s.club === '100'));
const s1 = ss.find((s) => s.matches.length === 3);
t('the session key is stable and names club and first match', s1.key === 'session-recap:100:1' && findSessions([...ms, m(9, T0 + 90 * MIN, 1, 0, { a: P('Ann') })], ['100'], 45).find((s) => s.matches.length === 4).key === s1.key);
t('a session ends only after the idle gap', !isEnded(s1, s1.end + 44 * MIN, 45) && isEnded(s1, s1.end + 45 * MIN, 45));
t('old sessions are left alone', isFresh(s1, s1.end + 5 * 3600, 6) && !isFresh(s1, s1.end + 7 * 3600, 6));

// ---- the recap itself
const r = buildRecap(s1, { hide: new Set(['hidden']) });
t('record, goals and clean sheets are counted from the matches', r.w === 1 && r.d === 1 && r.l === 1 && r.gf === 3 && r.ga === 3 && r.cs === 2 && r.count === 3);
t('the matches are listed with opponent, score and mode', r.matches.length === 3 && r.matches[0].opp === 'Opp1' && r.matches[0].res === 'W' && r.matches[2].mode === 'Friendly');
t('top performers and MOTMs come from the rows, hidden players left out', r.scorers[0].n === 'Ann' && r.scorers[0].g === 3 && !JSON.stringify(r).includes('Hidden') && r.motms.length === 2);
t('best average needs more than one appearance', r.best.every((p) => p.apps >= 2));
t('standout stats appear because event counters exist, from those matches only', r.standout?.matches === 2 && r.standout.of === 3 && r.standout.lines.some((x) => x.k === 'Interceptions'));
t('what to work on names no person', r.work.length >= 1 && !/Ann|Bo\b/.test(r.work.join(' ')));
const noEv = buildRecap(findSessions([m(1, T0, 1, 0, { a: P('Ann') }), m(2, T0 + 1, 2, 2, { a: P('Ann') })], ['100'], 45)[0]);
t('no event counters → no standout section, nothing invented', noEv.standout === null);
t('no NaN or undefined anywhere in the model', !/NaN|undefined/.test(JSON.stringify([r, noEv])));

// ---- the Worker: channel from config, claim before post, once per session
const meta = new Map(); const channels = []; let discordOk = true; const posts = [];
const db = { prepare: (sql) => { let args = []; const o = {
  bind: (...a) => { args = a; return o; },
  all: async () => ({ results: /discord_channels/.test(sql) ? channels.filter((c) => c.purpose === args[0]).map((c) => ({ channel_id: c.id, scope_type: 'org' })) : [] }),
  first: async () => (/FROM meta/.test(sql) ? null : null),
  run: async () => {
    if (/INSERT INTO meta/.test(sql)) { if (meta.has(args[0])) return { meta: { changes: 0 } }; meta.set(args[0], args[1]); return { meta: { changes: 1 } }; }
    if (/DELETE FROM meta/.test(sql)) { meta.delete(args[0]); return { meta: { changes: 1 } }; }
    return { meta: { changes: 0 } };
  } }; return o; } };
const env = { SITE_URL: 'https://x.test/', ORG_NAME: 'Phoenix Fire', DB: db, DISCORD_CLIENT_SECRET: 'sec', DISCORD_BOT_TOKEN: 'bot' };
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, i) => { posts.push({ u: String(u), body: i?.body }); return new Response('{}', { status: discordOk ? 200 : 403 }); };
const recap = { ...r, tag: { label: 'Phoenix Fire 1' } };
let res = await postSessionRecap(env, recap);
t('no channel configured → says so, posts nothing, claims nothing', res.posted === 0 && /No session_recaps channel/.test(res.reason) && posts.length === 0 && meta.size === 0);
channels.push({ purpose: 'match_results', id: '777' });
res = await postSessionRecap(env, { ...recap, key: 'session-recap:100:2' });
t('the match_results channel is the fallback when no recap channel is set', res.posted === 1 && posts[0].u.endsWith('/channels/777/messages'));
posts.length = 0; meta.clear(); channels.push({ purpose: 'session_recaps', id: '888' });
res = await postSessionRecap(env, recap);
t('the session_recaps channel from config wins', res.posted === 1 && res.claimed && posts.length === 1 && posts[0].u.endsWith('/channels/888/messages'));
res = await postSessionRecap(env, recap);
t('the same session again posts nothing (key already claimed)', res.posted === 0 && /already/.test(res.reason) && posts.length === 1);
discordOk = false; meta.clear(); posts.length = 0;
res = await postSessionRecap(env, recap);
t('a refused post releases the claim, so the next run can retry', res.posted === 0 && meta.size === 0);
discordOk = true;
res = await postSessionRecap(env, recap);
t('…and the retry posts', res.posted === 1 && meta.size === 1);
t('junk is refused', (await postSessionRecap(env, { key: 'nope' })).posted === 0 && cleanRecap({ key: 'session-recap:1:1', count: 0 }) === null);

// the route needs the shared key
const key = await settingsKey('sec');
const call = (body, headers = { 'X-Phoenix-Key': key }) => sessionRecapRoute(new Request('https://w.test/api/org/session-recap', { method: 'POST', headers, body: JSON.stringify(body) }), env).then(async (x) => ({ s: x.status, d: await x.json() }));
meta.clear(); posts.length = 0;
t('no key, no recap', (await call({ recap }, {})).s === 403 && posts.length === 0);
t('with the key it posts once through the route', (await call({ recap })).d.posted === 1 && (await call({ recap })).d.posted === 0 && posts.length === 1);
globalThis.fetch = realFetch;

// ---- the panel: Phoenix embed system, nothing but data in it
const msg = recapMessage(env, cleanRecap(recap));
const flat = JSON.stringify(msg);
t('one Components V2 panel with the Phoenix accent family and no pings', msg.flags & (1 << 15) && msg.components.some((c) => c.type === 17) && JSON.stringify(msg.allowed_mentions) === '{"parse":[]}' && !/@everyone|<@&/.test(flat));
t('header, separators, labels and the -# footer are there', /Session recap/.test(flat) && flat.includes('"type":14') && /-# \*\*MATCHES\*\*/.test(flat) && /-# One recap per session/.test(flat));
t('no other club in the output', !/norex|#c8352c/i.test(flat));
t('a session with no event counters says so', /No event counters in this session/.test(JSON.stringify(recapMessage(env, cleanRecap({ ...recap, standout: null })))));

// ---- sender: signs with the shared key, needs the secret
let req;
const sent = await requestSessionRecap({ members: { api: 'https://w.test' } }, recap, { secret: 's', fetchFn: async (u, i) => { req = { u, i }; return new Response(JSON.stringify({ posted: 1, claimed: true }), { status: 200 }); } });
t('the request goes to /api/org/session-recap with the key', sent.ok && sent.posted === 1 && req.u === 'https://w.test/api/org/session-recap' && req.i.headers['X-Phoenix-Key'] === orgKey('s'));
t('the request carries no channel or role', !/channel|role/i.test(req.i.body));
t('without the secret nothing is sent', (await requestSessionRecap({ members: { api: 'https://w.test' } }, recap, { secret: '' })).ok === false);

// ---- wired: purpose, channel by config only, workflow, registry
const src = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
t('session_recaps is a channel purpose with a description', CHANNEL_PURPOSES.includes('session_recaps') && !!CHANNEL_PURPOSE_INFO.session_recaps);
t('the feature reads its channel from config and names no channel or id', /channelsFor\(env, 'session_recaps'/.test(src('bot/sessionrecap.js')) && !/\b\d{17,20}\b/.test(src('bot/sessionrecap.js') + src('scripts/session-recap.mjs') + src('scripts/lib/sessionrecap.mjs')));
const wf = src('.github/workflows/update.yml');
t('the workflow runs the recap and never posts when the data commit failed', /node scripts\/session-recap\.mjs/.test(wf) && (wf.match(/steps\.commit\.outcome != 'failure'/g) ?? []).length >= 2);
t('the recap is in the Control Center registry', /"session recaps channel|session_recaps/.test(src('bot/registry.gen.js')) && /Session recap/.test(src('bot/registry.gen.js')));
t('the recap files carry no other club name', ['bot/sessionrecap.js', 'scripts/session-recap.mjs', 'scripts/lib/sessionrecap.mjs'].every((f) => !/norex/i.test(src(f))));
done();
