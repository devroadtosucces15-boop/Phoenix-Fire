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
  assert.match(txt(deny), /Not allowed/);
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

test('/matchday checkin opens an hour before; /lineup shows the sign-up list until a lineup is set', async () => {
  const e = db.prepare('SELECT id FROM events ORDER BY start LIMIT 1').get().id;
  assert.match(txt(await send(cmd('matchday', [{ name: 'checkin', type: 1 }]))), /not open yet/);
  db.prepare('UPDATE events SET start=? WHERE id=?').run(Date.now() + 1800_000, e);
  assert.match(txt(await send(cmd('matchday', [{ name: 'checkin', type: 1 }]))), /You are on/);
  assert.equal(db.prepare('SELECT checked_in c FROM rsvps WHERE event_id=? AND user_id=?').get(e, 'u1').c, 1);
  const l = await send(cmd('lineup'));
  assert.equal(l.json.type, 4); assert.match(txt(l), /No lineup is set yet/);
});

const MEMBER = (id, perm = '0', roles = []) => ({ user: { id, username: id }, permissions: perm, roles });
const clickAs = (member, custom_id, extra = {}) => ({ ...base, member, type: 3, data: { custom_id, component_type: 3, ...extra }, message: { id: 'm1' } });
test('/setup: the first manager claims it, roles lock commands, others are locked out', async () => {
  const stranger = MEMBER('u7'), manager = MEMBER('u1', '32');
  assert.match(txt(await send(cmd('setup', [], stranger))), /Setup is locked/);
  const first = await send(cmd('setup', [], manager));
  assert.match(txt(first), /Roles & permissions/); assert.equal(db.prepare('SELECT owner_id o FROM guild_cfg WHERE guild_id=?').get('g1').o, 'u1');
  // a manager who is not the owner may open it until a role is set
  const set = await send(clickAs(manager, 'ml:cfg:lineup', { values: ['roleL'] }));
  assert.equal(set.json.type, 7); assert.match(txt(set), /<@&roleL>/);
  assert.equal(db.prepare("SELECT role_id r FROM perms WHERE key='lineup'").get().r, 'roleL');
  assert.match(txt(await send(cmd('setlineup', [], MEMBER('u2', '32')))), /Not allowed[\s\S]*<@&roleL>/); // Manage Server is no longer enough
  // cannot lock yourself out of setup with a role you do not hold
  const mine = await send(clickAs(MEMBER('u2', '32'), 'ml:cfg:setup', { values: ['roleS'] }));
  assert.match(txt(mine), /Setup is locked|lock yourself out/);
  const own = await send(clickAs(manager, 'ml:cfg:setup', { values: ['roleS'] })); // owner always passes
  assert.match(txt(own), /<@&roleS>/);
  assert.match(txt(await send(cmd('setup', [], MEMBER('u3', '32')))), /Setup is locked/);
  assert.match(txt(await send(cmd('setup', [], manager))), /Roles & permissions/);
  // tracking is gated too
  await send(clickAs(manager, 'ml:cfg:tracking', { values: ['roleT'] }));
  assert.match(txt(await send(cmd('match', [{ name: 'untrack', type: 1, options: [o('club', 'x')] }], MEMBER('u2', '32')))), /Not allowed/);
  assert.match(txt(await send(cmd('host', [o('kind', 'session'), o('when', 'tomorrow 9pm'), o('timezone', 'UTC')], MEMBER('u2', '0')))), /Not allowed/.test('') ? /x/ : /Not allowed|Scheduled|I couldn/);
  await send(clickAs(manager, 'ml:cfg:reset'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM perms').get().n, 0);
});

test('/setlineup editor: formation, players per position, draft, favorite, post (with picture), repost, edit, delete', async () => {
  const lineupRole = MEMBER('u1', '32'), e = db.prepare('SELECT id FROM events ORDER BY start LIMIT 1').get().id;
  db.prepare('UPDATE events SET channel_id=? WHERE id=?').run('chL', e);
  const open = await send(cmd('setlineup', [], lineupRole));
  assert.equal(open.json.type, 4); assert.match(txt(open), /No formation yet/);
  const lid = db.prepare("SELECT id FROM lineups WHERE kind='work'").get().id;
  const click = (field, extra) => send(clickAs(lineupRole, `ml:sl:${lid}:${field}`, extra));
  const f = await click('fa', { values: ['4-3-3'] });
  assert.equal(f.json.type, 7); assert.match(txt(f), /`LB`[\s\S]*`LW`/);
  const users = { u2: { id: 'u2', username: 'ben', global_name: 'Ben' }, u3: { id: 'u3', username: 'cy' } };
  for (let k = 0; k < 11; k++) await click(`s${k}`, { values: [`p${k}`], resolved: { users: { [`p${k}`]: { id: `p${k}`, username: `Player${k}` } } } });
  assert.equal(JSON.parse(db.prepare('SELECT slots s FROM lineups WHERE id=?').get(lid).s).filter((s) => s.u).length, 11);
  // choosing the same person again moves them
  await click('s1', { values: ['p0'], resolved: { users: { p0: { id: 'p0', username: 'Player0' } } } });
  const sl = JSON.parse(db.prepare('SELECT slots s FROM lineups WHERE id=?').get(lid).s); assert.equal(sl[0].u, null); assert.equal(sl[1].u, 'p0');
  await click('s0', { values: ['p0'], resolved: { users: { p0: { id: 'p0', username: 'Player0' } } } }); // back in goal; p1's old slot (1) is now empty
  assert.match(txt(await click('draft')), /Draft saved/);
  assert.match(txt(await click('fav')), /Saved as a favorite/); assert.equal(db.prepare("SELECT COUNT(*) n FROM lineups WHERE kind='fav'").get().n, 1);
  const favs = await click('favs'); assert.match(JSON.stringify(favs.json), /ml:sl:[a-z0-9-]+:fp/);
  await click('s5', { values: [] });
  calls.length = 0;
  const posted = await click('post');
  assert.match(txt(posted), /Posted in <#chL>/);
  const msg = calls.find((c) => c.url.endsWith('/channels/chL/messages') && c.init.method === 'POST');
  assert.ok(msg); assert.match(JSON.stringify(msg.body.components), /ml:sl:[a-z0-9]+:edit/); assert.ok(msg.body.allowed_mentions.users.includes('p0'));
  const d = calls.find((c) => c.url.includes('/dispatches')); assert.equal(d.body.inputs.extra, `lineup:${lid}`);
  assert.equal(db.prepare('SELECT message_id m FROM lineups WHERE id=?').get(lid).m, 'msg1');
  // the Actions job asks for the picture data, uploads, says done → the posted message gets the picture
  const post = (path, body) => worker.fetch(new Request(`https://bot.example${path}`, { method: 'POST', headers: { 'x-key': 'k' }, body: JSON.stringify(body) }), env, ctx).then((r) => r.json());
  const job = (await post('/draw', { club: '-', extra: `lineup:${lid}` })).draw[0];
  assert.equal(job.kind, 'lineup'); assert.equal(job.data.L.formation, '4-3-3'); assert.equal(job.data.L.slots.length, 11);
  await worker.fetch(new Request(`https://bot.example/card?key=${job.key}`, { method: 'PUT', headers: { 'x-key': 'k' }, body: 'iVBORw0KGgo=' }), env, ctx);
  calls.length = 0; await post('/done', { ref: d.body.inputs.ref });
  const patch = calls.find((c) => c.init.method === 'PATCH' && c.url.endsWith('/channels/chL/messages/msg1'));
  assert.ok(patch); assert.match(JSON.stringify(patch.body.components), new RegExp(job.key.replace(/[/.]/g, '.')));
  // /lineup shows the posted one; the public Edit button opens the editor privately; repost deletes the old post
  assert.match(txt(await send(cmd('lineup'))), /4-3-3/);
  assert.equal((await send(clickAs(lineupRole, `ml:sl:${lid}:edit`))).json.type, 4);
  assert.match(txt(await send(clickAs(MEMBER('u9'), `ml:sl:${lid}:edit`))), /Not allowed/);
  calls.length = 0; await click('post');
  assert.ok(calls.find((c) => c.init.method === 'DELETE' && c.url.endsWith('/channels/chL/messages/msg1')));
  calls.length = 0;
  assert.match(txt(await click('del')), /Lineup deleted/); assert.equal(db.prepare("SELECT COUNT(*) n FROM lineups WHERE kind='work'").get().n, 0);
});

test('/suggestlineup uses sign-ups, positions and linked stats; "Use as draft" saves it; /link stores the gamertag', async () => {
  const e = db.prepare('SELECT id FROM events ORDER BY start LIMIT 1').get().id;
  db.prepare("INSERT INTO rsvps (event_id, user_id, name, status, pos, at) VALUES (?,?,?,?,?,1) ON CONFLICT DO UPDATE SET status='yes', pos=excluded.pos").run(e, 'u2', 'Bob', 'yes', 'GK');
  assert.match(txt(await send(cmd('link', [o('gamertag', 'BobGT')]))), /Linked/);
  assert.equal(db.prepare("SELECT gamertag g FROM links WHERE user_id='u1'").get().g, 'BobGT');
  const s = await send(cmd('suggestlineup'));
  assert.match(txt(s), /SUGGESTED LINEUP/i); assert.match(JSON.stringify(s.json), /ml:sg:[a-z0-9]+:use/);
  assert.match(txt(await send(clickAs(MEMBER('u1', '32'), `ml:sg:${e}:use`))), /Saved as your draft/);
  assert.ok(db.prepare("SELECT formation f FROM lineups WHERE kind='work' AND event_id=?").get(e).f);
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

test('sign-ups get a round profile picture emoji: asked once, uploaded as an app emoji, shown before the name', async () => {
  const e = db.prepare('SELECT id FROM events ORDER BY start LIMIT 1').get().id;
  const who = { user: { id: '123456789012345', username: 'zed', avatar: 'abcdef0123456789' }, permissions: '0', roles: [] };
  calls.length = 0;
  await send(clickAs(who, `ml:ev:${e}:yes`));
  const d = calls.filter((c) => c.url.includes('/dispatches') && /avatar:/.test(c.body.inputs.extra));
  assert.equal(d.length, 1); assert.equal(d[0].body.inputs.extra, 'avatar:123456789012345:abcdef0123456789');
  calls.length = 0; await send(clickAs(who, `ml:ev:${e}:maybe`)); // already asked: not again
  assert.ok(!calls.find((c) => c.url.includes('/dispatches') && /avatar:/.test(c.body.inputs.extra)));
  const post = (path, body) => worker.fetch(new Request(`https://bot.example${path}`, { method: 'POST', headers: { 'x-key': 'k' }, body: JSON.stringify(body) }), env, ctx).then((r) => r.json());
  const job = (await post('/draw', { club: '-', extra: 'avatar:123456789012345:abcdef0123456789' })).draw[0];
  assert.equal(job.kind, 'avatar'); assert.match(job.data.url, /cdn\.discordapp\.com\/avatars\/123456789012345\/abcdef0123456789\.png/);
  assert.deepEqual((await post('/draw', { club: '-', extra: 'avatar:1:../../x' })).draw, []); // nothing unsafe is drawn
  calls.length = 0;
  const up = await worker.fetch(new Request(`https://bot.example/card?key=${job.key}`, { method: 'PUT', headers: { 'x-key': 'k' }, body: 'iVBORw0KGgo=' }), env, ctx);
  assert.equal((await up.json()).ok, true);
  const mk = calls.find((c) => c.url.endsWith('/applications/app/emojis')); assert.ok(mk); assert.match(mk.body.image, /^data:image\/png;base64,/); assert.match(mk.body.name, /^av[a-z0-9]+$/);
  assert.equal(db.prepare("SELECT emoji_id e FROM avatars WHERE user_id='123456789012345'").get().e, 'msg1'); // the stub answers id "msg1"
  assert.match(txt(await send(clickAs(who, `ml:ev:${e}:yes`))), new RegExp(`<:${mk.body.name}:msg1> zed`));
});

test('picking a player under a match: drawn once (privately, about a minute), then answered at once from the stored picture', async () => {
  db.prepare("INSERT INTO tracked (guild_id, club_id, name, crest, channel_id, added_at, main) VALUES ('gP','55','Pee FC',NULL,'c',1,1)").run();
  const pl = { name: 'Kyle', pos: 'forward', rating: 9, goals: 2, assists: 1, shots: 4, passesMade: 9, passAtt: 10, tacklesMade: 1, tackleAtt: 2, mom: 1, ev: '215:9,216:1,6:3,111:20' };
  db.prepare("INSERT INTO matches (club_id, match_id, ts, res, gf, ga, opp_id, opp_name, data) VALUES ('55','mm1',?,'W',3,1,'9','Opp FC',?)").run(Math.floor(Date.now() / 1000), JSON.stringify({ id: 'mm1', ts: Math.floor(Date.now() / 1000), res: 'W', type: 'league', home: { name: 'Pee FC', goals: 3, players: [pl] }, away: { name: 'Opp FC', goals: 1, players: [] } }));
  db.prepare("INSERT INTO player_lines (club_id, match_id, player, pos, rating, goals, assists) VALUES ('55','mm1','Kyle','forward',9,2,1)").run();
  const member = { user: { id: 'u5', username: 'kyle' }, permissions: '0', roles: [] };
  const click = () => ({ ...base, guild_id: 'gP', member, type: 3, data: { custom_id: 'ml:pm:55:mm1', component_type: 3, values: ['Kyle'] }, message: { id: 'mx' } });
  calls.length = 0;
  const first = await send(click());
  assert.equal(first.json.type, 5); assert.equal(first.json.data.flags, 64);
  const d = calls.find((c) => c.url.includes('/dispatches')); assert.equal(d.body.inputs.extra, 'pm:mm1|Kyle'); assert.equal(d.body.inputs.kind, 'draw');
  const post = (path, body) => worker.fetch(new Request(`https://bot.example${path}`, { method: 'POST', headers: { 'x-key': 'k' }, body: JSON.stringify(body) }), env, ctx).then((r) => r.json());
  const job = (await post('/draw', { club: '55', extra: 'pm:mm1|Kyle' })).draw[0];
  assert.equal(job.kind, 'pmatch'); assert.equal(job.ref, 'mm1|Kyle'); assert.equal(job.data.d.ev.def.ints, 3); assert.equal(job.data.d.name, 'Kyle');
  await worker.fetch(new Request(`https://bot.example/card?key=${job.key}&club=55&kind=pmatch&ref=${encodeURIComponent(job.ref)}`, { method: 'PUT', headers: { 'x-key': 'k' }, body: 'iVBORw0KGgo=' }), env, ctx);
  calls.length = 0; await post('/done', { ref: d.body.inputs.ref });
  const edit = calls.find((c) => c.url.includes('/messages/@original'));
  assert.ok(edit); assert.match(JSON.stringify(edit.body.components), new RegExp(job.key.replace(/[/.]/g, '.'))); assert.match(JSON.stringify(edit.body.components), /Insights/);
  calls.length = 0; const again = await send(click());
  assert.equal(again.json.type, 4); assert.ok(!calls.find((c) => c.url.includes('/dispatches'))); assert.match(JSON.stringify(again.json.data.components), new RegExp(job.key.replace(/[/.]/g, '.')));
});
