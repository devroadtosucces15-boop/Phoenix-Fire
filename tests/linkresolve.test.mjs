// PF-018: every link the bot writes and every link the site resolves lands on a page the Phoenix build makes (and on an id that exists).
import { t, done } from './lib.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import vm from 'node:vm'; import { execFileSync } from 'node:child_process';
import { HASH_MAP, HASH_PREFIX, PAGE_MAP, HASH_TABLE, KEEP_ID, resolveLink } from '../next/lib/linkmap.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-'));
execFileSync('node', [path.join(root, 'phoenix/build.mjs'), '--out', out], { cwd: root, stdio: 'pipe' });
const page = (p) => { try { return fs.readFileSync(path.join(out, p), 'utf8'); } catch { return null; } };
const lands = (target) => { // target = 'page.html#id' → the page is built and the id is on it (a bare '#' or none needs only the page)
  const [p, frag] = target.split('#'); const h = page(p); if (h == null) return false;
  if (!frag || frag === 'bell') return true; // #bell opens the header notifications dropdown (header.js)
  return [...h.matchAll(/data-dl="([^"]*)"/g)].some((m) => m[1].split(' ').includes(frag)) || h.includes(`id="${frag}"`) || h.includes(`id='${frag}'`) || /^(p|c|play)\d+$/.test(frag) || /^compare=/.test(frag); // runtime-made ids: feed post, chat, play, compare deep link
};

// 1. every map target exists
for (const [k, v] of Object.entries(HASH_TABLE)) t(`members.html#${k} → ${v} lands`, lands(v));
for (const [k, v] of Object.entries(PAGE_MAP)) t(`${k} → ${v} lands`, lands(v));

// 2. the keys the side roadmap named
for (const k of ['cards', 'stats', 'discoveries', 'trials', 'vote', 'suggestions', 'points', 'portal', 'portal-reports']) t(`HASH_MAP has ${k}`, !!HASH_MAP[k]);
t('schedule-<id> matches by prefix', resolveLink('members.html#schedule-12') === HASH_PREFIX.schedule);
t('cards go to the Card Studio locker page, not the claim page', resolveLink('members.html#cards') === 'hub-cardstudio.html#lk-cards');
t('feed post / chat permalink keep their id', resolveLink('feed.html#p12') === 'hub-clubhouse.html#p12' && resolveLink('messages.html#c3') === 'hub-clubhouse.html#c3');
t('no ../ fallback: unknown legacy link never gets ../ prepended', !resolveLink('../members.html#cards').startsWith('../') && !resolveLink('/staff-artwork.html').startsWith('../'));
t('a link the build has stays as written', resolveLink('staff-artwork.html') === 'staff-artwork.html');

// 3. every link literal the bot writes resolves to a built page
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []));
const seen = new Map();
for (const f of walk(path.join(root, 'bot'))) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (/^\s*(\/\/|\*)/.test(line)) continue; // comments name old paths on purpose
    for (const m of line.matchAll(/(?<![\w./-])([a-z][a-z0-9-]*\.html)(?![\w])(#[\w${}.=,-]*)?/g)) seen.set(m[0].replace(/\$\{[^}]*\}/g, '1'), path.relative(root, f));
  }
}
t('found bot link literals', seen.size > 20);
for (const [lit, file] of seen) {
  const to = resolveLink(lit);
  t(`bot link ${lit} (${file}) lands on a built page`, lands(to));
  if (!lit.startsWith('members.html')) t(`bot link ${lit} is a current page, not a legacy name`, !PAGE_MAP[lit.split('#')[0]] || lit.startsWith('tactics.html'));
}
const cs = fs.readFileSync(path.join(root, 'bot/cardstudio.js'), 'utf8');
t('Card Studio never links to members.html#cards', !/members\.html#cards/.test(cs));
t('managers get the approval queue, members the Card Studio', /notifyManagers\([^\n]*link: 'staff-controlcenter\.html#artwork'/.test(cs) && /notify\(env, \[[^\n]*link: 'hub-cardstudio\.html#lk-cards'/.test(cs));

// 4. the site's script gives the same answers as the shared resolver
const ctx = { window: { NOREX_LINKS: { map: HASH_TABLE, pages: PAGE_MAP, keep: [...KEEP_ID] } } };
vm.runInNewContext(fs.readFileSync(path.join(root, 'next/static/links.js'), 'utf8'), ctx);
for (const l of ['members.html#cards', 'members.html#schedule-7', 'members.html#nope', 'members.html', 'feed.html#p9', 'messages.html', 'docs.html#d-4', 'builder.html?x=1', 'tactics.html#play5', 'about.html#requests', '/hub-alerts.html#lk-alerts', '../members.html#stats', 'https://example.org/x', ''])
  t(`site resolver = shared resolver for "${l}"`, ctx.window.PhoenixLinks.resolve(l) === resolveLink(l));
for (const f of ['alerts.js', 'header.js', 'pages.js']) {
  const src = fs.readFileSync(path.join(root, 'next/static', f), 'utf8');
  t(`${f} resolves links through PhoenixLinks`, src.includes('PhoenixLinks'));
  t(`${f} has no ../ link fallback`, !/'\.\.\/' \+ (s|a\.link|l)\b/.test(src));
}

// 5. built output: every page has the resolver; members.html and the legacy stubs forward the new keys
const hub = page('hub-alerts.html') ?? '';
t('page shell loads links.js before header.js', hub.includes('<script src="links.js">') && hub.indexOf('links.js') < hub.indexOf('header.js'));
const claim = page('members.html') ?? '';
t('members.html forwarder carries cards and the schedule prefix', claim.includes('"cards":"hub-cardstudio.html#lk-cards"') && claim.includes('"~schedule"'));
for (const f of ['feed.html', 'messages.html', 'docs.html', 'builder.html', 'compare.html', 'apply.html']) t(`legacy ${f} stub exists and forwards`, /location\.replace/.test(page(f) ?? ''));
t('feed.html stub keeps a #p<id> permalink', /!f\|\|true\)f=location\.hash\|\|f/.test(page('feed.html') ?? ''));
t('docs.html stub does not force the visitor hash', /!f\|\|false\)/.test(page('docs.html') ?? ''));
const pf = fs.readdirSync(out).find((f) => /^match-/.test(f));
t('matches/<id>.html and players/<id>.html forward', pf && fs.existsSync(path.join(out, 'matches', pf.replace('match-', ''))) && fs.readdirSync(path.join(out, 'players')).length > 0);
t('stubs carry no NOREX red or blue-black', !/c8352c|080b11|0b0f16/i.test(page('feed.html') ?? ''));

// 6. D5: sign-in keeps the #section
const sess = fs.readFileSync(path.join(root, 'next/static/session.js'), 'utf8');
t('sign-in saves the hash before leaving and restores it on return', /keepHash/.test(sess) && /nx\.after/.test(sess) && /location\.search \+ back/.test(sess));

fs.rmSync(out, { recursive: true, force: true });
done();
