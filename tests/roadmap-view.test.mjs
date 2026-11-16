// Visual roadmap (PF-026): the shared renderer, the snapshot builder and the live routes. Branding, secrets, every step id, links that resolve.
import vm from 'node:vm';
import http from 'node:http';
import { t, done } from './lib.mjs';
import { buildRoadmapData, renderRoadmapPage, slug, pagesOf } from '../tools/brain/roadmap-view.mjs';
import { buildRoadmapSnapshot, SECRETISH } from '../tools/brain/roadmap-page.mjs';
import { createServer } from '../tools/brain/serve.mjs';
import { readRoadmap } from '../tools/library/sync.mjs';

const data = buildRoadmapData({ now: new Date('2026-11-16T12:00:00Z') });
const rm = readRoadmap();
const html = buildRoadmapSnapshot({ now: new Date('2026-11-16T12:00:00Z') });
const live = renderRoadmapPage({ data, mode: 'live' });
const noData = (s) => s.replace(/<script id="rm-data"[\s\S]*?<\/script>/, ''); // roadmap items may talk about NOREX leftovers; the page itself must not show the name
const bare = (s) => s.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, '').replace(/norexunited\.workers\.dev/gi, ''); // the Worker host is a known, owner-decided leftover (PF-006)

t('data carries every roadmap item once', data.items.length === rm.items.length && rm.items.every((i) => data.items.some((x) => x.id === i.id)));
t('every step id appears in the snapshot page', rm.items.every((i) => html.includes(`"${i.id}"`)));
t('every item has outcome and behavior in the page data', data.items.every((i) => i.outcome && i.behavior));
t('snapshot has no NOREX name, colour or crest reference', !/norex/i.test(bare(noData(html))) && !/#c8352c|#080b11/i.test(bare(html)));
t('live page has no NOREX name or colour either', !/norex/i.test(bare(noData(live))) && !/#c8352c|#080b11/i.test(bare(live)));
t('snapshot uses the Phoenix accent and ink', /#e8651a/i.test(html) && /#0a0705/i.test(html));
t('snapshot has no secret-shaped string', !SECRETISH.some((re) => re.test(bare(html))));
t('snapshot is titled Phoenix Roadmap and states its build time', /<title>Phoenix Roadmap<\/title>/.test(html) && html.includes('2026-11-16T12:00:00') && html.includes('changes only when a session republishes'));
t('page contract: no doctype or body of its own, viewport meta, explicit body background', !/<!doctype|<body|<html/i.test(html) && html.includes('claude:viewport-fit-sides') && /body\{margin:0;background:var\(--bg\)/.test(html));
t('both themes are defined from tokens (dark, light by media query, light and dark by attribute)', html.includes('prefers-color-scheme:light') && html.includes('[data-theme="light"]') && html.includes('[data-theme="dark"]'));
t('hash links resolve: every depends-on id and every phase slug exists', data.items.every((i) => i.dependsOn.every((d) => data.items.some((x) => x.id === d))) && data.phases.every((p) => slug(p.phase).length > 0) && new Set(data.phases.map((p) => slug(p.phase))).size === data.phases.length);
t('deep link routes are in the script (#PF-nnn, #phase-slug, #board, #graph, #timeline)', /\^PF-\\d\+\$/.test(html) && html.includes("'phase-'") && html.includes("h==='board'"));
t('all three views and the drawer are rendered by the script', ['function timeline', 'function board', 'function graph', 'function drawer', 'function critical'].every((f) => html.includes(f)));
t('page script parses', (() => { const m = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]); try { m.forEach((s) => new vm.Script(s)); return m.length === 2; } catch { return false; } })());
t('embedded data cannot close its script tag', (() => { const m = html.match(/<script id="rm-data" type="application\/json">([\s\S]*?)<\/script>/); return !!m && !m[1].includes('<') && JSON.parse(m[1]).items.length === rm.items.length; })());
t('page text values are escaped (no raw html from data reaches innerHTML unescaped)', html.includes('var E=function(s)') && !/innerHTML=[^;]*i\.(title|notes|outcome|behavior)\b/.test(html));
t('pagesOf finds library and planning pages in text', pagesOf({ notes: 'See `PLANNING/PF-026-ROADMAP-VISUAL.md` and `LIBRARY/ROADMAP.md`.', doneLog: [] }).join() === 'PLANNING/PF-026-ROADMAP-VISUAL.md,LIBRARY/ROADMAP.md');
t('a secret-shaped value in the data is redacted', (() => { const d = JSON.stringify(data); return !/\b\d{17,20}\b|[0-9a-f]{32,}/.test(d); })());

const srv = createServer();
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const get = (p) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: srv.address().port, path: p }, (r) => { let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => res({ code: r.statusCode, type: r.headers['content-type'], body: b })); }).on('error', rej));
const page = await get('/roadmap');
const api = await get('/api/roadmap-data');
t('GET /roadmap serves the live page', page.code === 200 && /text\/html/.test(page.type) && page.body.includes('Phoenix Roadmap') && page.body.includes('var MODE="live"') && page.body.includes('/api/roadmap-data'));
t('GET /api/roadmap-data serves the same data as JSON', api.code === 200 && JSON.parse(api.body).items.length === rm.items.length);
srv.close();
done();
