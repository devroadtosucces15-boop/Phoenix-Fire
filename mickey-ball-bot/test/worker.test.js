// The Worker end to end, locally: signed Discord requests in, D1 stood in for by node:sqlite, Discord/GitHub calls captured.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from '../core/store.js';
import { plainText } from '../core/ui.js';
import worker from '../worker/index.js';

const db = new DatabaseSync(':memory:'); SCHEMA.forEach((s) => db.exec(s));
const D1 = { prepare: (sql) => ({ bind: (...p) => ({ all: async () => ({ results: db.prepare(sql).all(...p) }), first: async () => db.prepare(sql).get(...p) ?? null, run: async () => ({ meta: { changes: db.prepare(sql).run(...p).changes } }) }) }) };
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const env = { DB: D1, DISCORD_APP_ID: 'app', DISCORD_TOKEN: 't', GITHUB_TOKEN: 'g', GITHUB_REPO: 'o/r', PUBLIC_URL: 'https://bot.example', RELAY_KEY: 'k', DISCORD_PUBLIC_KEY: hex(await crypto.subtle.exportKey('raw', publicKey)) };
const calls = [];
globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null }); return String(url).includes('/dispatches') ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ id: 'msg1' }), { status: 200 }); };
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
async function send(i) {
  const body = JSON.stringify(i), ts = String(Date.now());
  const sig = hex(await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(ts + body)));
  const res = await worker.fetch(new Request('https://bot.example/interactions', { method: 'POST', body, headers: { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts } }), env, ctx);
  await Promise.all(waits.splice(0));
  return { status: res.status, json: await res.json() };
}
const base = { guild_id: 'g1', channel_id: 'ch1', token: 'tok', member: { user: { id: 'u1', username: 'ana' }, permissions: '32' } };
const cmd = (name, options = [], member = base.member) => ({ ...base, member, type: 2, data: { name, options } });
const o = (name, value) => ({ name, value });
const txt = (r) => plainText(r.json.data);

test('rejects a request that is not signed by Discord', async () => {
  const res = await worker.fetch(new Request('https://bot.example/interactions', { method: 'POST', body: '{"type":1}', headers: { 'x-signature-ed25519': '00', 'x-signature-timestamp': '1' } }), env, ctx);
  assert.equal(res.status, 401);
});

test('/host: managers only, needs a zone once, posts the sign-up message, remembers the zone', async () => {
  const deny = await send(cmd('host', [o('kind', 'session'), o('when', 'tomorrow 9pm'), o('timezone', 'UTC')], { user: { id: 'u9', username: 'x' }, permissions: '0' }));
  assert.match(txt(deny), /Managers only/);
  assert.match(txt(await send(cmd('host', [o('kind', 'session'), o('when', 'tomorrow 9pm')]))), /Which time zone/);
  assert.match(txt(await send(cmd('host', [o('kind', 'session'), o('when', 'blah'), o('timezone', 'UTC')]))), /couldn’t read that time/);
  calls.length = 0;
  const r = await send(cmd('host', [o('kind', 'friendly'), o('when', 'tomorrow 9pm'), o('timezone', 'America/New_York'), o('opponent', 'Rivals FC'), o('players', 8), o('ping', 'role1')]));
  assert.match(txt(r), /Scheduled for/);
  const post = calls.find((c) => c.url.endsWith('/channels/ch1/messages'));
  assert.ok(post); assert.deepEqual(post.body.allowed_mentions, { roles: ['role1'] }); assert.match(JSON.stringify(post.body.components), /Friendly vs Rivals FC/); assert.match(JSON.stringify(post.body.components), /ml:ev:/);
  assert.equal(db.prepare('SELECT tz FROM user_tz WHERE user_id=?').get('u1').tz, 'America/New_York');
  assert.equal(db.prepare('SELECT message_id m FROM events').get().m, 'msg1');
  // zone saved: the next command needs none, weekly makes four
  const w = await send(cmd('matchday', [{ name: 'create', type: 1, options: [o('kind', 'league'), o('when', 'fri 8pm'), o('weekly', true), o('silent', true)] }]));
  assert.match(txt(w), /Repeats weekly: 4/); assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n, 5);
});

test('answers, position picks and who/next/schedule', async () => {
  const e = db.prepare('SELECT id FROM events ORDER BY start LIMIT 1').get().id;
  const click = (id, extra = {}) => ({ ...base, type: 3, message: { id: 'msg1' }, data: { custom_id: id, ...extra } });
  const yes = await send(click(`ml:ev:${e}:yes`));
  assert.equal(yes.json.type, 7); assert.match(txt(yes), /✅ In \(1\)[\s\S]*ana/);
  const pos = await send(click(`ml:evp:${e}`, { values: ['GK'] }));
  assert.match(txt(pos), /ana `GK`/); assert.doesNotMatch(txt(pos), /goalkeeper/);
  await send({ ...click(`ml:ev:${e}:maybe`), member: { user: { id: 'u2', username: 'ben' }, permissions: '0' } });
  assert.match(txt(await send(cmd('matchday', [{ name: 'who', type: 1 }]))), /Maybe \(1\)[\s\S]*ben/);
  assert.match(txt(await send(cmd('matchday', [{ name: 'schedule', type: 1 }]))), /Upcoming match days/);
  assert.match(txt(await send(cmd('matchday', [{ name: 'next', type: 1 }]))), /Friendly vs Rivals FC/);
  assert.match(txt(await send(click('ml:ev:nope:yes'))), /gone/);
});

test('/matchday checkin opens an hour before; /lineup draws once and answers when the picture is up', async () => {
  const e = db.prepare('SELECT id FROM events ORDER BY start LIMIT 1').get().id;
  assert.match(txt(await send(cmd('matchday', [{ name: 'checkin', type: 1 }]))), /not open yet/);
  db.prepare('UPDATE events SET start=? WHERE id=?').run(Date.now() + 1800_000, e);
  assert.match(txt(await send(cmd('matchday', [{ name: 'checkin', type: 1 }]))), /You are on/);
  assert.equal(db.prepare('SELECT checked_in c FROM rsvps WHERE event_id=? AND user_id=?').get(e, 'u1').c, 1);
  calls.length = 0;
  const l = await send(cmd('lineup'));
  assert.equal(l.json.type, 5);
  const d = calls.find((c) => c.url.includes('/dispatches'));
  assert.equal(d.body.inputs.kind, 'draw'); assert.equal(d.body.inputs.extra, `lineup:${e}`); assert.ok(d.body.inputs.ref);
  // the Actions job asks for the picture's data, uploads it, then says done
  const post = (path, body) => worker.fetch(new Request(`https://bot.example${path}`, { method: 'POST', headers: { 'x-key': 'k' }, body: JSON.stringify(body) }), env, ctx).then((r) => r.json());
  const job = (await post('/draw', { club: '-', extra: `lineup:${e}` })).draw[0];
  assert.equal(job.kind, 'lineup'); assert.match(job.key, new RegExp(`^events/${e}/lineup-`));
  await worker.fetch(new Request(`https://bot.example/card?key=${job.key}`, { method: 'PUT', headers: { 'x-key': 'k' }, body: 'iVBORw0KGgo=' }), env, ctx);
  calls.length = 0;
  await post('/done', { ref: d.body.inputs.ref });
  const edit = calls.find((c) => c.url.includes('/messages/@original'));
  assert.ok(edit); assert.match(JSON.stringify(edit.body.components), new RegExp(job.key.replace(/[/.]/g, '.'))); assert.equal(edit.body.flags, 1 << 15);
  assert.equal((await send(cmd('lineup'))).json.type, 4); // picture already there: answered at once
});

test('/match main and list; cancel removes the next match day', async () => {
  db.prepare("INSERT INTO tracked (guild_id, club_id, name, crest, channel_id, added_at, main) VALUES ('g1','1','Alpha',NULL,'c',1,1),('g1','2','Beta',NULL,'c',2,0)").run();
  const sub = (name, options = []) => cmd('match', [{ name, type: 1, options }]);
  assert.match(txt(await send(sub('main', [o('club', '2')]))), /Beta is now the main club/);
  assert.match(txt(await send(sub('list'))), /Beta[\s\S]*⭐ main/);
  const cancelled = await send(cmd('matchday', [{ name: 'cancel', type: 1 }]));
  assert.match(txt(cancelled), /Cancelled/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n, 4);
});

test('reminder: one hour ahead, mentions only people who did not say no, sent once', async () => {
  db.prepare("INSERT INTO events (id, guild_id, channel_id, kind, title, start, duration, players, created_at) VALUES ('rem1','g1','chR','league','League night',?,120,11,1)").run(Date.now() + 1800_000);
  db.prepare("INSERT INTO rsvps (event_id, user_id, name, status, at) VALUES ('rem1','a','A','yes',1),('rem1','b','B','no',1),('rem1','c','C','maybe',1)").run();
  calls.length = 0;
  const flush = () => worker.fetch(new Request('https://bot.example/flush', { method: 'POST', headers: { 'x-key': 'k' }, body: '{}' }), env, ctx);
  await flush();
  const m = calls.find((c) => c.url.endsWith('/channels/chR/messages'));
  assert.ok(m); assert.match(JSON.stringify(m.body.components), /<@a>/); assert.doesNotMatch(JSON.stringify(m.body.components), /<@b>/); assert.deepEqual(m.body.allowed_mentions.users, ['a', 'c']);
  calls.length = 0; await flush(); assert.ok(!calls.find((c) => c.url.endsWith('/channels/chR/messages')));
});

test('session recap: claimed once when the session ends, drawn, posted once with its picture', async () => {
  const now = Math.floor(Date.now() / 1000);
  const raw = (id, minsAgo, gf, ga) => ({ matchId: id, timestamp: now - minsAgo * 60, clubs: { 77: { goals: String(gf), details: { name: 'Zeta FC', customKit: { crestAssetId: '1' } } }, 88: { goals: String(ga), details: { name: `Opp${id}` } } },
    players: { 77: { a: { playername: 'Ana', pos: 'forward', rating: '8.1', goals: String(gf), assists: '0', shots: '3', passesmade: '10', passattempts: '12', tacklesmade: '1', tackleattempts: '2', mom: '1' } }, 88: { z: { playername: 'Zed', pos: 'goalkeeper', rating: '6.0', goals: String(ga) } } } });
  db.prepare("INSERT INTO tracked (guild_id, club_id, name, crest, channel_id, added_at, last_match_ts, main) VALUES ('g9','77','Zeta FC','1','chZ',1,0,1)").run();
  const post = (path, body) => worker.fetch(new Request(`https://bot.example${path}`, { method: 'POST', headers: { 'x-key': 'k' }, body: JSON.stringify(body) }), env, ctx).then((r) => r.json());
  const running = await post('/ingest', { clubs: [{ id: '77', matches: [raw('x1', 60, 2, 0), raw('x2', 20, 1, 0)] }] });
  assert.ok(!running.draw.some((j) => j.kind === 'recap')); // the last match was 20 minutes ago: the session is still going
  const over = await post('/ingest', { clubs: [{ id: '77', matches: [raw('y1', 200, 2, 0), raw('y2', 170, 3, 1)] }] });
  const job = over.draw.find((j) => j.kind === 'recap');
  assert.ok(job); assert.equal(job.ref, 'recap:77:y1'); assert.match(job.key, /^77\/recap-/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM recaps').get().n, 1);
  assert.ok(!(await post('/ingest', { clubs: [{ id: '77', matches: [raw('y1', 200, 2, 0), raw('y2', 170, 3, 1)] }] })).draw.some((j) => j.kind === 'recap')); // claimed: never twice
  calls.length = 0; await post('/flush', {});
  assert.ok(!calls.find((c) => c.url.endsWith('/channels/chZ/messages') && /Session recap/i.test(JSON.stringify(c.body)))); // picture not up yet: waits
  await worker.fetch(new Request(`https://bot.example/card?key=${job.key}&club=77&kind=recap&ref=${encodeURIComponent(job.ref)}`, { method: 'PUT', headers: { 'x-key': 'k' }, body: 'iVBORw0KGgo=' }), env, ctx);
  calls.length = 0; await post('/flush', {});
  const m = calls.find((c) => c.url.endsWith('/channels/chZ/messages') && /Session recap/i.test(JSON.stringify(c.body)));
  assert.ok(m); assert.match(JSON.stringify(m.body.components), new RegExp(job.key.replace(/[/.]/g, '.'))); assert.equal(m.body.flags, 1 << 15);
  calls.length = 0; await post('/flush', {}); assert.ok(!calls.find((c) => /Session recap/i.test(JSON.stringify(c.body)))); // posted once
});
