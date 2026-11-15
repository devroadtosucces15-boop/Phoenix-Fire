// The project brain dashboard (tools/brain): model, markdown, credential safety, server routes and live refresh.
import http from 'node:http';
import fs from 'node:fs';
import { t, done } from './lib.mjs';
import { model, md, redact, credentials } from '../tools/brain/lib.mjs';
import { createServer, watch } from '../tools/brain/serve.mjs';
import * as inbox from '../tools/brain/inbox.mjs';
import { reminderText } from '../tools/brain/reminders.mjs';

const m = model();
t('model has the roadmap with metrics and one NEXT', m.roadmap.items.length > 0 && m.roadmap.metrics.project >= 0 && !!m.roadmap.next);
t('every roadmap item carries blockedBy', m.roadmap.items.every((i) => Array.isArray(i.blockedBy)));
t('libraries tab covers assets, design, bot, site map and resources', ['ASSETS.md', 'DESIGN.md', 'BOT.md', 'SITEMAP.md', 'RESOURCES.md'].every((f) => m.libraries.some((l) => l.file === f && l.html.length > 50)));
t('references tab lists saved links and library groups', m.references.groups.some((g) => g.links.length) && m.references.table.length > 0);
t('credentials tab lists the discord apps and secret rows by name', m.credentials.apps.length >= 6 && m.credentials.secrets.some((s) => s.names.includes('DISCORD_BOT_TOKEN_CORE')));
const blob = JSON.stringify(m.credentials);
t('credentials output holds no token-shaped value or long hex id', !/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/.test(blob) && !/\b[0-9a-f]{32,}\b/.test(blob) && !/\b\d{17,20}\b/.test(blob));
t('redact hides a token, a hex id and a snowflake', ['abcdefghijklmnopqrstuvwx.abcdef.abcdefghijklmnopqrstuvwxyz1', 'c84cd49d2e12a5dca30af9abbb35ce9e', '1569450321057550537'].every((v) => redact(v) === '[hidden]'));
t('md renders tables, lists and escapes html', /<table>/.test(md('| a | b |\n|---|---|\n| 1 | 2 |')) && /<li>x<\/li>/.test(md('- x')) && !/<script>/.test(md('<script>')));
t('maps: every site page row has a source and a build trail, and the index pages are all there', m.maps.pages.length >= 50 && m.maps.pages.every((p) => p.source && p.builtBy.includes('phoenix/build.mjs')) && m.maps.pages.some((p) => p.page === 'squad.html' && p.reads.accessors.includes('players')));
t('maps: bot commands come from BOT-COMMANDS.md with a source module that exists', m.maps.commands.length >= 40 && m.maps.commands.every((c) => /^bot\/.*\.js$/.test(c.source) && fs.existsSync(new URL('../' + c.source, import.meta.url))) && m.maps.commands.some((c) => c.command === 'announce'));
t('maps: a command that posts to a channel names a purpose from config, never an ID', m.maps.commands.filter((c) => c.posts.channels.length).every((c) => c.posts.channels.every((p) => /^[a-z_]+$/.test(p))) && m.maps.commands.some((c) => c.posts.channels.length));
t('io: one folder per feature, site and bot, each with in and out', m.io.some((f) => f.key === 'site:club') && m.io.some((f) => f.key === 'bot:core') && m.io.every((f) => f.in && f.out && f.items.length));
t('maps and io hold no token-shaped value (secret names only)', !/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/.test(JSON.stringify([m.maps, m.io])) && !/\b\d{17,20}\b/.test(JSON.stringify([m.maps, m.io])));
t('the page has the seven tabs and no external script', ['roadmap', 'maps', 'io', 'brainstorm', 'libraries', 'references', 'credentials'].every((k) => fs.readFileSync(new URL('../tools/brain/index.html', import.meta.url), 'utf8').includes(`['${k}'`)) && !/<script[^>]+src=/.test(fs.readFileSync(new URL('../tools/brain/index.html', import.meta.url), 'utf8')));
t('the page is Phoenix themed (ink and orange, no NOREX)', (() => { const h = fs.readFileSync(new URL('../tools/brain/index.html', import.meta.url), 'utf8'); return h.includes('#0a0705') && h.includes('#e8651a') && !/norex|c8352c/i.test(h); })());

// Brainstorm store: test notes are removed again so the repo inbox stays as it was.
const made = [];
const a = inbox.addNote('Idea: try a smaller crest on the dock', 'dictated'); made.push(a.note?.id);
t('inbox: a note is stored as a file with date, source, open status and the text', a.ok && a.note.status === 'open' && a.note.source === 'dictated' && fs.existsSync(inbox.INBOX + a.note.id + '.md') && /status: open/.test(fs.readFileSync(inbox.INBOX + a.note.id + '.md', 'utf8')));
t('inbox: the stored date reads back whole (time included)', inbox.listNotes().find((n) => n.id === a.note.id).date === a.note.date && !isNaN(new Date(a.note.date)));
t('inbox: listed newest first', (() => { const b = inbox.addNote('second'); made.push(b.note.id); const l = inbox.listNotes().map((n) => n.id); return l.indexOf(b.note.id) < l.indexOf(a.note.id); })());
t('inbox: rejects empty, oversize and non-string text', !inbox.addNote('   ').ok && !inbox.addNote('x'.repeat(inbox.MAX_TEXT + 1)).ok && !inbox.addNote({ a: 1 }).ok);
const sec = ['token = abcdefghijklmnopqrstuvwx1234', 'ghp_' + 'a'.repeat(30), 'abcdefghijklmnopqrstuvwx.abcdef.abcdefghijklmnopqrstuvwxyz1', 'c84cd49d2e12a5dca30af9abbb35ce9e'];
t('inbox: secret-shaped text is refused and never written', sec.every((v) => !inbox.addNote('note ' + v).ok) && !inbox.listNotes().some((n) => sec.some((v) => n.text.includes(v))));
t('inbox: tackle and drop change the status; bad id and bad status are refused', inbox.setStatus(a.note.id, 'tackled').ok && inbox.listNotes().find((n) => n.id === a.note.id).status === 'tackled' && inbox.setStatus(a.note.id, 'dropped').ok && !inbox.setStatus('../../etc/passwd', 'open').ok && !inbox.setStatus(a.note.id, 'x').ok);
t('reminders: lists open ideas with the tackle-or-drop question, drops finished ones', (() => { const r = reminderText(inbox.openNotes().filter((n) => made.includes(n.id))); return /tackle it/.test(r) && /second/.test(r) && !/smaller crest/.test(r); })());
t('reminders: says so when nothing is open', /no open ideas/.test(reminderText([])));
t('the model carries the inbox', Array.isArray(model().inbox) && model().inbox.some((n) => n.id === a.note.id));

const srv = createServer();
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const get = (p) => new Promise((res, rej) => http.get({ port, path: p }, (r) => { let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', rej));
const home = await get('/');
t('GET / serves the dashboard', home.status === 200 && home.body.includes('Phoenix Fire'));
const api = await get('/api/model');
t('GET /api/model returns the model json', api.status === 200 && JSON.parse(api.body).roadmap.items.length === m.roadmap.items.length);
t('unknown paths are 404', (await get('/etc/passwd')).status === 404);
const stop = watch();
const got = await new Promise((resolve) => {
  const req = http.get({ port, path: '/events' }, (r) => {
    let b = '';
    r.on('data', (d) => { b += d; if (b.includes('event: change')) { req.destroy(); resolve(true); } });
    setTimeout(() => { fs.utimesSync(new URL('../LIBRARY/CLAIMS.md', import.meta.url), new Date(), new Date()); }, 200);
  });
  setTimeout(() => { req.destroy(); resolve(false); }, 4000);
  req.on('error', () => {});
});
t('a library file change pushes a live "change" event', got);
stop();
// POST routes: local JSON only, size-capped, text only.
const post = (p, body, headers = {}, raw) => new Promise((res, rej) => { const d = raw ?? JSON.stringify(body); const r = http.request({ port, path: p, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(d), ...headers } }, (x) => { let b = ''; x.on('data', (c) => (b += c)); x.on('end', () => res({ status: x.statusCode, body: b })); }); r.on('error', () => res({ status: 0, body: '' })); r.end(d); });
const p1 = await post('/api/inbox', { text: 'Via the route', source: 'typed' }); const id1 = JSON.parse(p1.body).note?.id; made.push(id1);
t('POST /api/inbox stores a note', p1.status === 200 && inbox.listNotes().some((n) => n.id === id1 && n.text === 'Via the route'));
t('POST /api/inbox/<id> marks it tackled', (await post('/api/inbox/' + id1, { status: 'tackled' })).status === 200 && inbox.listNotes().find((n) => n.id === id1).status === 'tackled');
t('POST rejects a non-local Host header', (await post('/api/inbox', { text: 'x' }, { host: 'evil.example.com' })).status === 403);
t('POST rejects a foreign Origin', (await post('/api/inbox', { text: 'x' }, { origin: 'https://evil.example.com' })).status === 403);
t('POST rejects an oversize body', [413, 0].includes((await post('/api/inbox', null, {}, JSON.stringify({ text: 'x'.repeat(9000) }))).status));
t('POST rejects non-JSON content, bad JSON and secret text', (await post('/api/inbox', null, { 'content-type': 'text/plain' }, 'hi')).status === 415 && (await post('/api/inbox', null, {}, '{bad')).status === 400 && (await post('/api/inbox', { text: 'ghp_' + 'b'.repeat(30) })).status === 400);
t('PUT and DELETE are refused', await Promise.all(['PUT', 'DELETE'].map((m) => new Promise((res) => { const r = http.request({ port, path: '/api/inbox', method: m }, (x) => { x.resume(); res(x.statusCode === 405); }); r.on('error', () => res(false)); r.end(); }))).then((a) => a.every(Boolean)));
t('the page reads and writes the inbox through those routes only', /\/api\/inbox/.test(fs.readFileSync(new URL('../tools/brain/index.html', import.meta.url), 'utf8')) && /webkitSpeechRecognition/.test(fs.readFileSync(new URL('../tools/brain/index.html', import.meta.url), 'utf8')));
for (const id of made.filter(Boolean)) fs.rmSync(inbox.INBOX + id + '.md', { force: true });
srv.close();
done();
