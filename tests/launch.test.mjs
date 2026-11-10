// The go-live switch (config.json launch.public, PLANNING/LAUNCH.md): off = hidden from search engines exactly as before,
// on = indexable public pages, allow robots.txt with a sitemap, member/staff pages still hidden.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { t, done } from './lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
t('config.json has launch.public and it is false until the owner opens the site', cfg.launch && cfg.launch.public === false);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-'));
const build = (name, extra = []) => {
  const out = path.join(tmp, name);
  execFileSync(process.execPath, [path.join(ROOT, 'phoenix/build.mjs'), '--out', out, ...extra], { cwd: ROOT, stdio: 'ignore' });
  return out;
};
const pages = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.html'));
const noindex = (d, f) => /<meta name="robots" content="[^"]*noindex/.test(fs.readFileSync(path.join(d, f), 'utf8'));
const HIDDEN = /^(hub|staff|lookbook|canvas|playstyle|offline|404|squad|members)/; // squad = member portal, members = player-claim page

try {
  // ---------- closed (the config as committed) ----------
  const closed = build('closed');
  // squad.html (the legacy member portal, copied in after the page pass) has never carried the meta; robots.txt covers it while closed.
  t('closed: every built page is noindex (squad.html keeps its old behaviour: robots.txt only)', pages(closed).every((f) => f === 'squad.html' || noindex(closed, f)));
  t('closed: robots.txt blocks everything, exactly as before', fs.readFileSync(path.join(closed, 'robots.txt'), 'utf8') === 'User-agent: *\nDisallow: /\n');
  t('closed: no sitemap.xml', !fs.existsSync(path.join(closed, 'sitemap.xml')));
  t('closed: the home page carries the same noindex,nofollow meta as before', /<meta name="robots" content="noindex,nofollow">/.test(fs.readFileSync(path.join(closed, 'index.html'), 'utf8')));

  // ---------- open (--launch forces the flag on without touching config.json) ----------
  const open = build('open', ['--launch']);
  const all = pages(open), pub = all.filter((f) => !HIDDEN.test(f)), hid = all.filter((f) => HIDDEN.test(f));
  t('open: public pages are not noindex', pub.length > 20 && pub.every((f) => !noindex(open, f)));
  t('open: hub, staff and design pages, offline and 404 stay noindex', hid.length > 0 && hid.every((f) => noindex(open, f)));
  const robots = fs.readFileSync(path.join(open, 'robots.txt'), 'utf8');
  const site = cfg.siteUrl.replace(/\/?$/, '/');
  t('open: robots.txt allows crawling and lists the sitemap', /Allow: \//.test(robots) && !/^Disallow: \/\s*$/m.test(robots) && robots.includes(`Sitemap: ${site}sitemap.xml`));
  const map = fs.existsSync(path.join(open, 'sitemap.xml')) ? fs.readFileSync(path.join(open, 'sitemap.xml'), 'utf8') : '';
  const locs = [...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  t('open: sitemap.xml lists every public page and the home page', locs.length === pub.length && locs.includes(site) && pub.every((f) => f === 'index.html' || locs.includes(site + f)));
  t('open: sitemap.xml lists no hidden page', locs.every((u) => !HIDDEN.test(u.replace(site, ''))));
  t('open: the built output still passes the brand guard (no NOREX name)', !/NOREX UNITED/.test(fs.readFileSync(path.join(open, 'index.html'), 'utf8')));
  t('config.json was not changed by the open build', JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).launch.public === false);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
done();
