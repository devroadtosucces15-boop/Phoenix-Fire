// Swap-over step 2: old URL → new page redirect stubs (PLANNING/NEXT-SWAPOVER.md).
// GitHub Pages has no server redirects, so every old page address that the new build does not produce gets a tiny page that sends the visitor
// on (meta refresh + location.replace, query and #fragment kept). Anything without a new equivalent goes to the same page under classic/.
import fs from 'node:fs'; import path from 'node:path';
import { cfg } from './data.mjs';
import { HASH_MAP, HASH_TABLE, PAGE_MAP, KEEP_ID } from './linkmap.mjs';

// Old root pages with a different home in the new design (target is relative to the site root; '#x' fragments are kept).
export const ROOT_MAP = {
  'members.html': 'hub.html',
  ...PAGE_MAP, // dead legacy names → their one current page (linkmap.mjs)
  'probuilds.html': 'builds.html',
  'hub/index.html': 'hub.html',
};
// members.html#fragment → page: see linkmap.mjs (one map for the site, the forwarder and the bot link test)
export { HASH_MAP, HASH_TABLE };

const walk = (dir, base = dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, base, acc) : acc.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return acc;
};
export const listFiles = (dir) => walk(dir);

// Pure planner. oldFiles / newFiles: site-relative paths; players: [{ id, k }] (old page key → new page key); returns { 'old/path.html': 'target.html[#frag]' }.
export function planRedirects({ oldFiles, newFiles, players = [] }) {
  const have = new Set(newFiles);
  const byId = new Map(players.filter((p) => p.id != null).map((p) => [String(p.id), p.k]));
  const plan = {};
  for (const f of oldFiles) {
    if (!f.endsWith('.html') || have.has(f)) continue;
    if (/^(assets|api)\//.test(f)) continue;
    let t = null, m;
    if (ROOT_MAP[f]) t = ROOT_MAP[f];
    else if ((m = f.match(/^players\/(.+)\.html$/))) { const k = byId.get(m[1]); if (k != null && have.has(`player-${k}.html`)) t = `player-${encodeURIComponent(k)}.html`; else if (have.has('scout.html')) t = `scout.html#k=${m[1]}`; }
    else if ((m = f.match(/^matches\/(.+)\.html$/))) { if (have.has(`match-${m[1]}.html`)) t = `match-${m[1]}.html`; }
    else if ((m = f.match(/^clubs\/(\d+)(?:-results)?\.html$/))) { if (have.has(`opp-${m[1]}.html`)) t = `opp-${m[1]}.html`; }
    if (t && !have.has(t.split('#')[0])) t = null; // never point at a page the new build lacks
    plan[f] = t || `classic/${f}`;
  }
  return plan;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function stubHtml(file, target) {
  const up = '../'.repeat(file.split('/').length - 1);
  const [page, frag] = target.split('#');
  const to = up + page + (frag ? '#' + frag : '');
  const hashes = file === 'members.html' ? JSON.stringify(Object.fromEntries(Object.entries(HASH_TABLE).map(([k, v]) => [k, up + v]))) : 'null';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(cfg.siteTitle)}</title><meta http-equiv="refresh" content="0;url=${esc(to)}"><link rel="canonical" href="${esc(to)}">
<script>(function(){var t=${JSON.stringify(to)},m=${hashes},h=location.hash.slice(1).split('?')[0],i=t.indexOf('#'),base=i<0?t:t.slice(0,i),f=i<0?'':t.slice(i);var o=Object.prototype.hasOwnProperty;if(m&&!o.call(m,h)&&h.indexOf('-')>0&&o.call(m,'~'+h.split('-')[0]))h='~'+h.split('-')[0];if(m&&o.call(m,h)){var j=m[h].indexOf('#');base=j<0?m[h]:m[h].slice(0,j);f=j<0?'':m[h].slice(j)}else if(!f||${KEEP_ID.has(file)})f=location.hash||f;location.replace(base+location.search+f)})()</script></head>
<body style="background:${esc(cfg.brand?.ink || '#0a0705')};color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:40px"><p>Taking you to the new page… <a style="color:${esc(cfg.brand?.red || '#e8651a')}" href="${esc(to)}">continue</a></p></body></html>
`;
}

export function emitRedirects({ out, classicDir, players }) {
  const oldFiles = listFiles(classicDir);
  const newFiles = listFiles(out);
  const plan = planRedirects({ oldFiles, newFiles, players });
  // the old preview address: /next/<page> → /<page> (links people shared while the new design lived at /next/)
  for (const f of newFiles) if (f.endsWith('.html') && !/^(api|assets)\//.test(f)) plan[`next/${f}`] = f;
  plan['next/index.html'] = 'index.html';
  for (const [f, t] of Object.entries(plan)) {
    const dest = path.join(out, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, stubHtml(f, t));
  }
  return plan;
}

// PF-018 D1: the Phoenix build has no classic/ copy, so only legacy names with a real new page get a stub (nothing falls back to classic/).
// Covers docs/feed/messages/builder/compare/apply, players/<id>.html, matches/<id>.html and clubs/<id>.html; old Discord messages cannot be edited.
export function emitLegacyStubs({ out, players = [] }) {
  const newFiles = listFiles(out), have = new Set(newFiles), plan = {};
  for (const [f, t] of Object.entries(PAGE_MAP)) if (!have.has(f) && have.has(t.split('#')[0])) plan[f] = t;
  for (const p of players) if (p.id != null && have.has(`player-${p.k}.html`)) plan[`players/${p.id}.html`] = `player-${encodeURIComponent(p.k)}.html`;
  for (const f of newFiles) {
    let m;
    if ((m = f.match(/^match-(.+)\.html$/))) plan[`matches/${m[1]}.html`] = f;
    else if ((m = f.match(/^opp-(\d+)\.html$/))) { plan[`clubs/${m[1]}.html`] = f; plan[`clubs/${m[1]}-results.html`] = f; }
  }
  for (const [f, t] of Object.entries(plan)) {
    if (have.has(f)) continue; // never overwrite a real page
    const dest = path.join(out, f); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, stubHtml(f, t));
  }
  return plan;
}
