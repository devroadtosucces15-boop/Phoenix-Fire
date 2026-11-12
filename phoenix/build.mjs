// Phoenix Fire – a made-up second club, built from the live redesign (next/) into a sub-address of the site (e.g. /phoenix/).
// usage: node phoenix/build.mjs [--out site/phoenix]
// Nothing in next/, web/, bot/ or data/ is modified: everything is staged in a temp folder, re-skinned there, built, and removed.
//   1. stage copy of next/ + web/ + bot/*.js   2. mock club data (phoenix/gen-data.mjs)   3. colours + names swapped
//   4. overlay (badge crest, 3D crest, theme layer, small design touches)   5. build the preview flavour (toolbar, noindex)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertNoLeaks } from './leakcheck.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const out = path.resolve(arg('--out') || path.join(repo, 'site', 'phoenix'));
const LIVE = process.argv.includes('--live');
const LAUNCH = process.argv.includes('--launch') || JSON.parse(fs.readFileSync(path.join(repo, 'config.json'), 'utf8')).launch?.public === true; // go-live switch (PLANNING/LAUNCH.md): false keeps the site hidden from search engines
const liveCfg = LIVE ? JSON.parse(fs.readFileSync(path.join(here, 'live.json'), 'utf8')) : null;
const API = arg('--api') || (LIVE ? liveCfg.api : '') || 'https://phoenix.mock', MOCK = API === 'https://phoenix.mock';
if (LIVE && MOCK) { console.error('phoenix: --live needs the Worker URL: set "api" in phoenix/live.json or pass --api <url>'); process.exit(1); } // recording builds point at a local Worker; the published build points at the in-page mock (phoenix-mock.js)
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-'));
const warn = (m) => console.warn('phoenix: ' + m);
try {
  // 1. stage
  fs.cpSync(path.join(repo, 'next'), path.join(stage, 'next'), { recursive: true, filter: (s) => !/[\\/](dist|node_modules)([\\/]|$)/.test(s) });
  fs.cpSync(path.join(repo, 'web'), path.join(stage, 'web'), { recursive: true });
  fs.cpSync(path.join(repo, 'scripts'), path.join(stage, 'scripts'), { recursive: true, filter: (f) => !/__pycache__/.test(f) });
  fs.mkdirSync(path.join(stage, 'bot'));
  for (const f of fs.readdirSync(path.join(repo, 'bot'))) if (/\.m?js$/.test(f)) fs.copyFileSync(path.join(repo, 'bot', f), path.join(stage, 'bot', f));
  // 2. mock data (config.json + data/ in the stage root, which is where the build looks for them)
  if (LIVE) {
    const rc = JSON.parse(fs.readFileSync(path.join(repo, 'config.json'), 'utf8'));
    fs.writeFileSync(path.join(stage, 'config.json'), JSON.stringify({ ...rc, siteTitle: 'PHOENIX FIRE', members: { ...(rc.members || {}), api: API } }));
    fs.cpSync(path.join(repo, 'data'), path.join(stage, 'data'), { recursive: true });
    if (!fs.existsSync(path.join(stage, 'data', 'clubs', String(liveCfg.club) + '.json'))) { console.error('phoenix: no data for club ' + liveCfg.club + ' in data/clubs – run node scripts/fetch.mjs first'); process.exit(1); }
  } else execFileSync('node', [path.join(here, 'gen-data.mjs'), stage], { stdio: 'inherit', env: { ...process.env, PF_API: API } });
  // 3. colours (shell sed) and names (below)
  execFileSync('sh', [path.join(here, 'recolor.sh'), path.join(stage, 'next')], { stdio: 'inherit' });
  execFileSync('sh', [path.join(here, 'recolor.sh'), path.join(stage, 'web')], { stdio: 'inherit' }); // the classic member hub (squad.html) is built from web/ and must not keep the NOREX red
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'dist' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  const names = [
    [/<b>NOREX<\/b> UNITED/g, '<b>PHOENIX</b> FIRE'], [/NOREX <b>UNITED<\/b>/g, 'PHOENIX <b>FIRE</b>'], [/NOREX UNITED FC/g, 'PHOENIX FIRE'], [/NOREX UNITED/g, 'PHOENIX FIRE'], [/Norex United FC/g, 'Phoenix Fire'], [/Norex United/g, 'Phoenix Fire'],
    [/\bNorex DJ\b/g, 'Phoenix DJ'], [/\bNOREX\b/g, 'PHOENIX'], [/\bNorex\b(?![-\w])/g, 'Phoenix'],
    [/https:\/\/discord\.(?:gg|com\/invite)\/[A-Za-z0-9_-]+/g, '#join-discord'], [/https:\/\/discord\.com\/channels\/\d+(?:\/\d+)*/g, '#join-discord'],
  ];
  for (const f of walk(path.join(stage, 'next')).concat(walk(path.join(stage, 'web')))) {
    if (!/\.(m?js|css|html)$/.test(f) || /vendor-/.test(f)) continue;
    let s = fs.readFileSync(f, 'utf8'); const o = s; for (const [re, to] of names) s = s.replace(re, to);
    if (s !== o) fs.writeFileSync(f, s);
  }
  // Phoenix uses the preview build pipeline for live data, but the PREVIEW ribbon is not part of the product UI.
  // Remove only the ribbon from the staged Phoenix shell; keep preview/noindex and live API behaviour intact.
  const uiShell = path.join(stage, 'next/lib/ui.mjs');
  let ui = fs.readFileSync(uiShell, 'utf8');
  const previewRibbon = "${PREVIEW ? '<div class=\"prevrib\" role=\"note\">PREVIEW · new design · live club data</div>' : ''}";
  if (ui.includes(previewRibbon)) fs.writeFileSync(uiShell, ui.replace(previewRibbon, ''));
  else warn('Preview ribbon markup changed upstream – inspect the Phoenix shell');
  // 4. overlay: badge crest, icons, 3D crest, theme layer
  for (const f of fs.readdirSync(path.join(here, 'overlay'))) fs.copyFileSync(path.join(here, 'overlay', f), path.join(stage, 'next', f === 'crest.png' ? f : path.join('static', f)));
  // The recorded API answers (phoenix-api.json) come from the Norex worker; give their text the same club names.
  const mock = path.join(stage, 'next/static/phoenix-api.json');
  if (fs.existsSync(mock)) { let s = fs.readFileSync(mock, 'utf8'); const o = s; for (const [re, to] of names) s = s.replace(re, to); if (s !== o) fs.writeFileSync(mock, s); }
  const appjs = path.join(stage, 'next/static/app.js'), as = fs.readFileSync(appjs, 'utf8');
  if (as.includes('if (!window.NOREX_API) {')) fs.writeFileSync(appjs, as.replace('if (!window.NOREX_API) {', 'if (!window.NOREX_API || window.PF_MOCK) {'));
  else warn('app.js preview toolbar condition changed upstream – toolbar may be missing');
  // 3D crest in the About-page toggle: swap the stacked flat layers for the Blender relief model
  const c3 = path.join(stage, 'next/static/crest3d.js');
  if (fs.existsSync(c3)) {
    let s = fs.readFileSync(c3, 'utf8');
    const re = /const tex = new T\.TextureLoader\(\)[\s\S]*?p\.position\.z = -i \* 0\.018; group\.add\(p\);\s*\}/;
    if (re.test(s)) fs.writeFileSync(c3, s.replace(re, 'const group = new T.Group(); scene.add(group); const built = await window.PhoenixCrest3D.build(T, 2.5); group.add(built.group); cam.position.z = 6.4;'));
    else warn('About-page 3D block changed upstream – the flat crest is used there');
  }
  // 5. build (preview flavour: preview toolbar, noindex), then a post-pass over the html
  execFileSync('node', [path.join(stage, 'next/build.mjs'), '--out', out, '--preview'], { stdio: 'inherit', cwd: stage });
  // The pages read api/*.json, the service worker and the manifest from their own folder – never from the real site next door.
  // api/*.json comes from the classic build of the mock data; sw.js/offline.html/404.html from the same emitter the real site uses.
  const classic = path.join(stage, 'classic-build');
  execFileSync('node', [path.join(stage, 'scripts/build.mjs')], { stdio: 'inherit', cwd: stage, env: { ...process.env, NOREX_OUT: classic } });
  const htmls = fs.readdirSync(out).filter((f) => f.endsWith('.html'));
  const swap = await import(pathToFileURL(path.join(stage, 'next/lib/swap.mjs')).href); const { emitSwap } = swap;
  const api = emitSwap({ out, root: stage, classic, pages: htmls });
  fs.writeFileSync(path.join(out, 'sw.js'), fs.readFileSync(path.join(out, 'sw.js'), 'utf8').replace(/nx-v2/g, 'pf-v2')); // pf-v2: new cache name so installed browsers drop the old smooth.js (search-palette freeze fix)
  fs.rmSync(path.join(out, 'sitemap.xml'), { force: true });
  const mf = path.join(out, 'manifest.webmanifest'); fs.writeFileSync(mf, fs.readFileSync(mf, 'utf8').replace('"phoenix-fire-next"', '"phoenix-fire"').replace('"short_name":"PHOENIX"', '"short_name":"PHOENIX"'));
  console.log(`phoenix: ${api.length} api files, sw.js, offline/404`);
  // first visit defaults for the preview toolbar: Owner, full entrance, gold orb menu, transitions on, full motion (tilt, parallax…). Later changes stick.
  const init = '<script>window.PHOENIX_SAFE_HUB=true;try{var L=localStorage;if(!L.getItem("pf.init")){L.setItem("pf.init","1");L.setItem("phoenix.as","owner");L.setItem("phoenix.entrance","full");L.setItem("phoenix.nav","orb");L.setItem("phoenix.fx","on");L.setItem("phoenix.mx","full");L.removeItem("phoenix.motion");L.removeItem("phoenix.viewas")}}catch(e){}</script>';
  let pages = 0;
  const SITE_URL = String(JSON.parse(fs.readFileSync(path.join(repo, 'config.json'), 'utf8')).siteUrl || '').replace(/\/?$/, '/');
  const DESC = 'PHOENIX FIRE: Pro Clubs stats, results, squad and rankings. Rise. Burn. Repeat.';
  for (const f of htmls) {
    const p = path.join(out, f); let h = fs.readFileSync(p, 'utf8');
    h = h.replace("window.NOREX_ROOT='../'", "window.NOREX_ROOT=''").replace("window.NOREX_SW='../sw.js'", "window.NOREX_SW='sw.js'");
    if (MOCK && !h.includes('phoenix-mock.js')) h = h.replace('<head>', '<head><script src="phoenix-mock.js"></script>');
    if (!h.includes('pf.init')) h = h.replace('<head>', '<head>' + init);
    if (!h.includes('phoenix.css')) h = h.replace('</head>', '<link rel="stylesheet" href="phoenix.css"></head>');
    if (!h.includes('phoenix3d.js')) h = h.replace('</body>', '<script src="phoenix3d.js" defer></script><script src="phoenix-fx.js" defer></script></body>');
    if (f === 'index.html') { // home hero: the club's own line and the six stars of the badge (skipped silently if the upstream copy changes)
      h = h.replace(/(<div class="eyebrow reveal">)(EA SPORTS)/, '$1<span class="pf-stars" aria-hidden="true">★★★★★★</span> $2').replace(/<h1 class="reveal" style="--i:1">[\s\S]*?<\/h1>/, '<h1 class="reveal" style="--i:1">Rise. Burn.<br><em>Repeat.</em></h1>');
    }
    if (LAUNCH) { // launched: public pages are indexable (the layout's own noindex is dropped); member, staff and design pages stay hidden
      if (swap.indexable(f)) h = h.replace(/<meta name="robots" content="[^"]*">/g, '');
      else if (!/name="robots"/.test(h)) h = h.replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>');
    }
    else if (!/name="robots"/.test(h)) h = h.replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>');
    if (swap.indexable(f) && !/property="og:title"/.test(h)) { // link previews (Discord, X, WhatsApp) and search snippets; URLs come from the repo config, never the staged mock
      const title = (h.match(/<title>([^<]*)<\/title>/) || [, 'PHOENIX FIRE'])[1].trim().replace(/"/g, '&quot;');
      const url = SITE_URL + (f === 'index.html' ? '' : f), img = SITE_URL + 'share.png';
      h = h.replace('</head>', [
        `<meta name="description" content="${DESC}">`, `<link rel="canonical" href="${url}">`,
        '<meta property="og:type" content="website">', '<meta property="og:site_name" content="PHOENIX FIRE">', `<meta property="og:title" content="${title}">`, `<meta property="og:description" content="${DESC}">`,
        `<meta property="og:url" content="${url}">`, `<meta property="og:image" content="${img}">`, '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">', '<meta property="og:image:alt" content="PHOENIX FIRE crest on a dark ember background">',
        '<meta name="twitter:card" content="summary_large_image">', `<meta name="twitter:title" content="${title}">`, `<meta name="twitter:description" content="${DESC}">`, `<meta name="twitter:image" content="${img}">`,
      ].join('') + '</head>');
    }
    fs.writeFileSync(p, h); pages++;
  }
  // squad.html is the redesigned Squad page and hub.html the redesigned Hub; the classic member portal is NOT
  // published. members.html is a Phoenix-native player-claim experience. The claim page talks to the same Phoenix
  // Worker; no authentication, claim, or manager-approval endpoints are reimplemented here.
  const legacyAssets = path.join(classic, 'assets');
  if (fs.existsSync(legacyAssets)) {
    fs.cpSync(legacyAssets, path.join(out, 'assets'), { recursive: true });
    // the classic assets carry another club's crest and favicon: replace them with Phoenix art (bot embeds read assets/crest.png)
    fs.cpSync(path.join(here, 'legacy-assets'), path.join(out, 'assets'), { recursive: true });
  } else warn('classic assets were not generated; assets/ will not be published');
  const claimTemplate = path.join(here, 'claim.html');
  if (fs.existsSync(claimTemplate)) {
    let claim = fs.readFileSync(claimTemplate, 'utf8').replace('__PHOENIX_API__', API);
    if (MOCK) claim = claim.replace('<head>', '<head><script src="phoenix-mock.js"></script>');
    fs.writeFileSync(path.join(out, 'members.html'), claim);
  } else warn('Phoenix claim page template missing; members.html will not be published');
  if (LAUNCH) { // allow robots.txt plus a sitemap of the built public pages. The staged config carries a placeholder siteUrl, so the real one comes from the repo config.
    const site = String(JSON.parse(fs.readFileSync(path.join(repo, 'config.json'), 'utf8')).siteUrl || '').replace(/\/?$/, '/');
    const day = new Date().toISOString().slice(0, 10), esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const listed = fs.readdirSync(out).filter((f) => swap.indexable(f) && !/name="robots" content="[^"]*noindex/.test(fs.readFileSync(path.join(out, f), 'utf8'))).sort();
    fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed.map((f) => `<url><loc>${esc(site + (f === 'index.html' ? '' : f))}</loc><lastmod>${day}</lastmod></url>`).join('\n')}\n</urlset>\n`);
    fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /hub\nDisallow: /staff\n\nSitemap: ${site}sitemap.xml\n`);
  } else fs.writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  console.log(`phoenix: ${pages} pages -> ${path.relative(repo, out)}`);
  // 6. guard: next/ and web/ are shared sources themed here; the output must not show another club's name or palette
  assertNoLeaks(out, (m) => { console.error(m); process.exitCode = 1; });
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
