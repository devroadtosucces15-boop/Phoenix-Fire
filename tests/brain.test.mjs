// The project brain dashboard (tools/brain): model, markdown, credential safety, server routes and live refresh.
import http from 'node:http';
import fs from 'node:fs';
import { t, done } from './lib.mjs';
import { model, md, redact, credentials } from '../tools/brain/lib.mjs';
import { createServer, watch } from '../tools/brain/serve.mjs';

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
t('the page has the four tabs and no external script', ['roadmap', 'libraries', 'references', 'credentials'].every((k) => fs.readFileSync(new URL('../tools/brain/index.html', import.meta.url), 'utf8').includes(`['${k}'`)) && !/<script[^>]+src=/.test(fs.readFileSync(new URL('../tools/brain/index.html', import.meta.url), 'utf8')));
t('the page is Phoenix themed (ink and orange, no NOREX)', (() => { const h = fs.readFileSync(new URL('../tools/brain/index.html', import.meta.url), 'utf8'); return h.includes('#0a0705') && h.includes('#e8651a') && !/norex|c8352c/i.test(h); })());

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
stop(); srv.close();
done();
