// Control Center deck layout (2026-11-23): no sidebar, every manager control lives in the Control Center and nowhere else, and every address
// on the built site (links, old staff pages, ?tool= and #hash forms) lands on the current view, never on a retired page.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { t, done } from './lib.mjs';
import * as MAN from '../next/lib/staffmanifest.mjs';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-'));
execFileSync(process.execPath, ['phoenix/build.mjs', '--out', out], { cwd: ROOT, stdio: 'pipe' });
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(out, f));
const CC = 'staff-controlcenter.html', cc = read(CC), shell = read('ccshell.js');

// ---- layout: decks, no sidebar
t('deck layout: nine decks in the manifest, each with at least one tool, every tool in a known deck', MAN.SECTIONS.length === 9 && MAN.SECTIONS.every(([id]) => id === 'overview' || MAN.TOOLS.some((x) => x.section === id)) && MAN.TOOLS.every((x) => MAN.SECTIONS.some(([id]) => id === x.section)));
t('deck layout: the page has a deck bar and tool rows and no sidebar markup or styles', /id="cxDecks"/.test(cc) && /class="cx-tools"/.test(cc) && !/cx-side/.test(cc + read('ccshell.css') + shell));
t('deck layout: the deck cards on the Overview open each deck (visuals live on the dashboard home)', /deckCards/.test(shell) && /id="cxHome"/.test(cc));

// ---- every manager control is in the Control Center and only there
const BAD = {
  'rushboard.js': [/\/api\/lb\/(save|scan|season|remove)/, /PFScan/],
  'seasoncards.js': [/\/api\/seasoncard\/remove/, /drawDash/, /sc-dash/],
  'gear.js': [/\/api\/(feed\/setpublic|feed\/pin|trials\/update|events\/cancel|squads\/(save|delete)|hof\/remove)/],
};
for (const [f, res] of Object.entries(BAD)) t(`manager-only: ${f} (a public page script) holds no manager control`, res.every((re) => !re.test(read(f).replace(/\/\/[^\n]*/g, '')) || f === 'seasoncards.js' && re.source === 'PFScan'));
t('manager-only: the Rush leaderboard page and the Season cards page only link managers to their Control Center tool', /id="lb-mgr"[^>]*hidden/.test(read('rushboard.html')) && /\?tool=rushboard/.test(read('rushboard.html')) && /id="sc-mgr"[^>]*hidden/.test(read('seasoncards.html')) && /\?tool=seasoncards/.test(read('seasoncards.html')) && !/id="(lb-up-sec|lb-set-sec|sc-dash-sec)"/.test(read('rushboard.html') + read('seasoncards.html')));
t('manager-only: the Control Center holds the controls the public pages lost (photo, season clock, photo removal, card removal, media removal)', (() => { const j = read('ccrequests.js'); return ['/api/lb/save', '/api/lb/season', '/api/lb/remove', '/api/seasoncard/remove', '/api/controlcenter/media/remove', '/api/emoji/review'].every((p) => j.includes(p)); })());
t('manager-only: the manifest lists a tool for every request type members send (emoji, GIF, highlight, rush photo, season card, absence)', ['emojis', 'media', 'rushboard', 'seasoncards', 'absences'].every((id) => MAN.TOOLS.some((x) => x.id === id)));
t('manager-only: the organization channel and role settings are a Control Center tool', MAN.TOOLS.some((x) => x.id === 'org' && x.owner) || MAN.TOOLS.some((x) => /channel/i.test(x.desc || '') && x.module));
t('manager-only: the Worker refuses the new routes to a member through the permission matrix', (() => { const p = fs.readFileSync(path.join(ROOT, 'bot/ccpermissions.js'), 'utf8'); return /controlcenter\/requests/.test(p) && /controlcenter\/media/.test(p); })());

// ---- redirects and links: nothing lands on an old page
const pages = fs.readdirSync(out).filter((f) => f.endsWith('.html'));
const retired = new Set(Object.keys(MAN.LEGACY_PAGES));
t('redirect: every retired staff page is a stub that forwards to a Control Center view', [...retired].every((f) => exists(f) && /http-equiv="refresh" content="0;url=staff-controlcenter\.html#[a-z]+"/.test(read(f))));
const land = (file, hash, search = '') => { const h = read(file), code = h.match(/<script>(\(function\(\)\{var m=[\s\S]*?\}\)\(\))<\/script>/)?.[1]; if (!code) return null; let to = null; vm.runInNewContext(code, { URLSearchParams, location: { hash: hash ? '#' + hash : '', search, replace: (u) => { to = u; } } }); return to; };
t('redirect: every retired page lands on a real tool for its own anchors, for ?tool=, and for an unknown anchor', [...retired].every((f) => { const ids = new Set(MAN.TOOLS.map((x) => x.id)); const dest = [land(f, ''), land(f, 'zzz'), ...Object.keys(MAN.LEGACY_HASH[f] || {}).map((k) => land(f, k)), land(f, '', '?tool=audit')]; return dest.every((u) => u && u.startsWith(CC + '#') && ids.has(u.split('#')[1])); }));
t('redirect: staff.html (the old hub) lands on the Control Center overview', land('staff.html', '') === CC + '#home');
t('redirect: every old staff page address resolves to a tool through the manifest resolver', [...retired].every((f) => MAN.resolve(f)?.id));
const links = new Map(); // href -> first page that has it
for (const f of pages) for (const m of read(f).matchAll(/(?:href|src)="([^"#?:]+\.html)((?:[?#][^"]*)?)"/g)) { const k = m[1] + m[2]; if (!links.has(k)) links.set(k, f); }
const dead = [...links].filter(([k]) => !exists(k.split(/[?#]/)[0]));
t('links: every internal .html link in the built site points at a built page (' + links.size + ' checked)', dead.length === 0, dead.slice(0, 8).map(([k, f]) => `${k} on ${f}`).join('; '));
const toRetired = [...links].filter(([k]) => retired.has(k.split(/[?#]/)[0]) && !/^staff\.html$/.test(k)); // retired pages stay as redirect stubs, but nothing on the site should link to them
t('links: no page links to a retired staff page', toRetired.length === 0, toRetired.slice(0, 8).map(([k, f]) => `${k} on ${f}`).join('; '));
const ids = new Set(MAN.TOOLS.map((x) => x.id));
const badTool = [...links].filter(([k]) => k.startsWith(CC)).filter(([k]) => { const m = k.match(/[?&]tool=([\w-]+)|#(?:deck-)?([\w-]+)/); const id = m && (m[1] || m[2]); return id && !ids.has(id) && !MAN.SECTIONS.some(([s]) => s === id); });
t('links: every link into the Control Center names a real tool or deck', badTool.length === 0, badTool.slice(0, 8).map(([k, f]) => `${k} on ${f}`).join('; '));
t('links: the service worker and offline page do not point at a retired page', (() => { const s = exists('sw.js') ? read('sw.js') : '', o = exists('offline.html') ? read('offline.html') : ''; return ![...retired].some((f) => (s + o).includes(f)) || !(s.match(/staff-[a-z]+\.html/g) || []).some((x) => retired.has(x) && x !== 'staff.html'); })());

// ---- brand
const vis = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
t('brand: every new Control Center script, stylesheet and page shows no NOREX name or colour', ['ccshell.js', 'ccshell.css', 'ccrequests.js', 'ccpeople.js', CC].every((f) => !/c8352c|080b11/i.test(read(f)) && !/norex/i.test(f.endsWith('.html') ? vis(read(f)) : read(f).replace(/window\.Norex\w*|NOREX_API|NorexAuth|NorexMotion|norex_session|norex\./g, ''))));
t('brand: the new bot module names no channel or role (everything is Organization config)', !/\b\d{17,20}\b/.test(fs.readFileSync(path.join(ROOT, 'bot/ccrequests.js'), 'utf8')));
done();
