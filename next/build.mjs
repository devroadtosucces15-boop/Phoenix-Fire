// Shared source, not Phoenix-only: themed to Phoenix at build time by phoenix/build.mjs; the built output must not show NOREX (phoenix/leakcheck.mjs).
// Club redesign preview site (shared source: phoenix/build.mjs themes it). Detached from the live site: reads the repo's data/ folder (read-only), writes only to dist/.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
// usage: node next/build.mjs [--out <dir>] [--preview]   (--preview = public test build: hidden from search engines, labelled PREVIEW)
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const out = path.resolve(arg('--out') || path.join(here, 'dist'));
if (process.argv.includes('--preview')) process.env.NEXT_PREVIEW = '1';
// --public = the swapped-in main site: indexable, no PREVIEW ribbon, Worker API on, plus api/*.json (copied from the classic build, --classic <dir>), sw.js, offline/404, robots, sitemap
const PUBLIC = process.argv.includes('--public'); if (PUBLIC) process.env.NEXT_PREVIEW = process.env.NEXT_PUBLIC = '1';
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const { players, matches, cfg } = await import('./lib/data.mjs');
const CLUB = cfg.siteTitle || 'CLUB'; const INK = (cfg.brand && cfg.brand.ink) || '#080b11';
const W = (f, h) => fs.writeFileSync(path.join(out, f), h);
for (const f of fs.readdirSync(path.join(here, 'static')).filter((f) => !f.startsWith('.'))) fs.copyFileSync(path.join(here, 'static', f), path.join(out, f));
fs.copyFileSync(path.join(here, 'crest.png'), path.join(out, 'crest.png'));
// the live site's shared browser libraries (markdown-lite for docs, the Team up ranking, the player card PNG maker, the owner's 🐞 issue tool), shared rather than copied
for (const f of ['docs-md.js', 'recs.js', 'cardcomposer.js', 'report.js', 'report.css', 'build-math.js']) { const lib = path.join(here, '..', 'web', f); if (fs.existsSync(lib)) fs.copyFileSync(lib, path.join(out, f)); }
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({ id: PUBLIC ? './' : CLUB.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-next', name: CLUB, short_name: CLUB.split(' ')[0], description: 'Results, squad, stats and the members Hub of ' + CLUB + '.', start_url: 'index.html', scope: './', display: 'standalone', orientation: 'portrait', background_color: INK, theme_color: INK, icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }], shortcuts: [{ name: 'Results', url: 'results.html' }, { name: 'Match Night', url: 'hub-matchnight.html' }, { name: 'Stats', url: 'stats.html' }] }));
// the builder's offline seed: the newest game-rules dataset (builds.js asks the Worker's GET /api/game first, which has any version a manager published since)
fs.writeFileSync(path.join(out, 'game.json'), JSON.stringify((await import('./lib/data.mjs')).game));
// Phase E post-pass on every page: one h1 per page (the page's first heading becomes level 1 for assistive tech, no visual change), a small crest for the 22–86 px logo spots instead of the 180 KB original
const finalize = (h) => {
  if (!/<h1[ >]|aria-level="1"/.test(h)) h = h.replace(/(<main id="main">[\s\S]*?)<(h[23])(?![^>]*aria-level)/, '$1<$2 aria-level="1"');
  // R36: no heading skips a level: walking the headings of <main> in order, one that would jump more than one level below the previous reads as the next level (aria-level only, no visual change); a scrolling box can take the keyboard
  { const i = h.indexOf('<main id="main">'); if (i >= 0) { const j = h.indexOf('</main>', i), m = h.slice(i, j < 0 ? undefined : j); let prev = 0;
    const fixed = m.replace(/<(h[1-6])((?:\s[^>]*)?)>|<b((?:\s[^>]*)?role="heading"[^>]*)>/g, (all, tag, attrs, battrs) => { const at = attrs ?? battrs ?? '', lv = /aria-level="(\d)"/.exec(at), cur = lv ? +lv[1] : +tag[1]; if (cur > prev + 1 && !lv) { prev += 1; return tag ? `<${tag}${at} aria-level="${prev}">` : all; } prev = cur; return all; });
    h = h.slice(0, i) + fixed + (j < 0 ? '' : h.slice(j)); } }
  h = h.replace(/<div class="tscroll"(?![^>]*tabindex)>/g, '<div class="tscroll" tabindex="0">').replace(/<div class="panel flat([^"]*)"(?![^>]*tabindex)([^>]*overflow-x:auto[^>]*)>/g, '<div class="panel flat$1" tabindex="0"$2>');
  // three sizes: the 41 KB small crest for logo-sized spots (header logo, width <= 48 or unsized), the sharp 892 px crest for the big hero crests, the regular one up to 118 px
  h = h.replace('<a class="lg" href="index.html"><img src="crest.png"', '<a class="lg" href="index.html"><img src="crest-sm.png"')
    .replace(/(<div class="crestwrap[^>]*>(?:<span class="halo"><\/span>)?<img) src="crest\.png"/g, '$1 src="crest-lg.png"')
    .replace(/<img([^>]*?) src="crest\.png"([^>]*?)>/g, (m, a, b) => { const t = a + b, w = +((/\bwidth="(\d+)"/.exec(t) || /\bwidth:\s*(\d+)px/.exec(t) || [])[1] || 0); return w > 48 ? (w > 118 ? m.replace('crest.png', 'crest-lg.png') : m) : `<img${a} src="crest-sm.png"${b}>`; });
  return h.replace('<link rel="icon" href="crest.png">', '<link rel="icon" href="crest-sm.png">');
};
let n = 0; const built = []; const P = (f, h) => { W(f, finalize(h)); built.push(f); n++; };
const mods = ['club', 'matches', 'rush', 'rushboard', 'seasoncards', 'stats', 'about', 'burners', 'tactics', 'hub', 'swap', 'lookbook', 'canvas'];
for (const m of mods) { const file = path.join(here, 'pages', m + '.mjs'); if (!fs.existsSync(file)) continue; const mod = await import('./pages/' + m + '.mjs'); await mod.default?.(P) ; }
if (PUBLIC) { const { emitSwap } = await import('./lib/swap.mjs'); const api = emitSwap({ out, root: path.join(here, '..'), classic: arg('--classic'), pages: built }); console.log(`public: ${api.length} api files, sw.js, offline/404, robots, sitemap`);
  // old addresses (Discord embeds, bookmarks, installed apps) → new pages, or the same page under classic/
  if (arg('--classic') && fs.existsSync(path.resolve(arg('--classic')))) { const { emitRedirects } = await import('./lib/redirects.mjs'); const plan = emitRedirects({ out, classicDir: path.resolve(arg('--classic')), players }); const toClassic = Object.values(plan).filter((t) => t.startsWith('classic/')).length; console.log(`redirects: ${Object.keys(plan).length} stubs (${toClassic} to classic/)`); } }
console.log(`built ${n} pages · ${players.length} players · ${matches.length} matches`);
