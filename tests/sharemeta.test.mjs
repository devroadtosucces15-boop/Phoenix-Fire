// Launch prep (PLANNING/LAUNCH.md items 1, 2, 6): no invented founding year, share/SEO meta on every public page, Phoenix-only head.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { t, done } from './lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const site = cfg.siteUrl.replace(/\/?$/, '/');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sharemeta-'));
const HIDDEN = /^(hub|staff|lookbook|canvas|playstyle|offline|404|squad|members)/;
const read = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');

try {
  const out = path.join(tmp, 'mock');
  execFileSync(process.execPath, [path.join(ROOT, 'phoenix/build.mjs'), '--out', out], { cwd: ROOT, stdio: 'ignore' });
  const pages = fs.readdirSync(out).filter((f) => f.endsWith('.html'));

  // 1. founded is never invented
  const founded = String(cfg.brand?.founded || '').trim();
  const est = pages.filter((f) => /\bEst\.\s/.test(read(out, f)));
  t('no built page says "Est." while config brand.founded is blank', founded !== '' || est.length === 0);
  if (founded === '' && est.length) console.log('  Est. found in: ' + est.join(', '));
  t('the mock config in gen-data.mjs does not seed a founded year', !/founded\s*:\s*['"]\d/.test(fs.readFileSync(path.join(ROOT, 'phoenix/gen-data.mjs'), 'utf8')));

  // 2. share + SEO meta on every public page, URLs from config.json, Phoenix only
  const pub = pages.filter((f) => !HIDDEN.test(f));
  t('there are public pages to check', pub.length > 20);
  const head = (f) => read(out, f).split('</head>')[0];
  const meta = (h, re) => (h.match(re) || [])[1];
  let bad = [];
  for (const f of pub) {
    const h = head(f), url = site + (f === 'index.html' ? '' : f);
    const title = meta(h, /<title>([^<]*)<\/title>/);
    const ok = title && meta(h, /<meta property="og:title" content="([^"]*)"/) === title.replace(/"/g, '&quot;')
      && meta(h, /<meta name="twitter:title" content="([^"]*)"/) === title.replace(/"/g, '&quot;')
      && meta(h, /<meta property="og:url" content="([^"]*)"/) === url && meta(h, /<link rel="canonical" href="([^"]*)"/) === url
      && meta(h, /<meta property="og:image" content="([^"]*)"/) === site + 'share.png' && meta(h, /<meta name="twitter:image" content="([^"]*)"/) === site + 'share.png'
      && meta(h, /<meta name="twitter:card" content="([^"]*)"/) === 'summary_large_image'
      && (meta(h, /<meta name="description" content="([^"]*)"/) || '').length > 20 && (h.match(/name="description"/g) || []).length === 1
      && (meta(h, /<meta property="og:description" content="([^"]*)"/) || '').length > 20;
    if (!ok) bad.push(f);
  }
  t('every public page has title, description, canonical, og:* and twitter:* meta from config siteUrl' + (bad.length ? ' (bad: ' + bad.slice(0, 5).join(', ') + ')' : ''), bad.length === 0);
  t('hub, staff and design pages carry no share meta', pages.filter((f) => HIDDEN.test(f) && !/^(squad|members)/.test(f)).every((f) => !/og:title/.test(head(f))));
  t('no share meta points at the staged placeholder host', pub.every((f) => !/example\.invalid/.test(head(f))));

  // 3. the head and the share image stay Phoenix
  const heads = pub.map(head).join('\n'); // inline script identifiers (norex_session, NorexMotion) stay on purpose; visible head markup must be clean
  const markup = heads.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  t('built head shows no NOREX name', !/norex/i.test(markup));
  t('built head shows no NOREX colour', !/c8352c|080b11/i.test(heads));
  t('share image is a shipped 1200x630 png', fs.existsSync(path.join(out, 'share.png')) && (() => { const b = fs.readFileSync(path.join(out, 'share.png')); return b.readUInt32BE(16) === 1200 && b.readUInt32BE(20) === 630; })());
  // colour check on the image itself: dominant dark is Phoenix ink, no NOREX red pixel
  const png = fs.readFileSync(path.join(ROOT, 'phoenix/overlay/share.png'));
  t('share image source is a PNG', png.subarray(1, 4).toString() === 'PNG');
  const art = fs.readFileSync(path.join(ROOT, 'phoenix/overlay/share-animated.svg'), 'utf8') + fs.readFileSync(path.join(ROOT, 'phoenix/share-art/share.svg'), 'utf8');
  t('share art is Phoenix only: no NOREX name, red or blue-black, ember accent present', !/norex|c8352c|080b11/i.test(art) && /e8651a/i.test(art) && /Rise\. Burn\. Repeat|RISE\. BURN\. REPEAT/.test(art));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
done();
