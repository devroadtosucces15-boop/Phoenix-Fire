// PF-019: menus show every real page once, no duplicates, no gaps, no dead entries.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';
import { MAP } from '../next/lib/ui.mjs';
import * as MAN from '../next/lib/staffmanifest.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-'));
execFileSync(process.execPath, ['next/build.mjs', '--out', out, '--preview'], { cwd: ROOT, stdio: 'pipe' });
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (h) => fs.existsSync(path.join(out, h.split('#')[0].split('?')[0]));
const dupes = (a) => a.filter((x, i) => a.indexOf(x) !== i);
const js = read('dock.js'), hub = src('next/pages/hub.mjs');

// site menus (Club, Matches, Stats, Tactics)
const subs = MAP.flatMap((g) => g.subs.map((s) => s[0]));
t('site menus: no page listed twice', dupes(subs).length === 0);
t('site menus: every entry is a built page', subs.every(exists));

// staff: the dock lists every staff tile once, and the hub page shows the same tiles
const hubTiles = [...read('staff-controlcenter.html').matchAll(/<a class="cx-nav" href="([^"]+)"/g)].map((m) => m[1]); // the Control Center tool rows are the one staff menu (the old hub page is only a redirect)
const dockStaff = [...js.match(/const STAFF = \[[\s\S]*?\];\n/)[0].matchAll(/'(staff-[a-z]+\.html(?:\?tool=[a-z]+)?)'/g)].map((m) => m[1]);
const dockOwner = [...js.match(/const OWNER = \[[\s\S]*?\];\n/)[0].matchAll(/'(staff-[a-z]+\.html(?:\?tool=[a-z]+)?)'/g)].map((m) => m[1]);
t('Control Center rows: no tool twice (one Boardroom row)', dupes(hubTiles).length === 0 && hubTiles.filter((h) => h === 'staff-controlcenter.html?tool=boardroom').length === 1);
t('dock: no staff or owner entry twice across the Manager and Admin views', dupes([...dockStaff, ...dockOwner]).length === 0);
t('dock and the Control Center tool rows list exactly the same pages (the dock adds the plain Control Center entry)', [...dockStaff, ...dockOwner].filter((h) => h !== 'staff-controlcenter.html').sort().join() === [...hubTiles].sort().join());
t('every staff tile is a built page', hubTiles.every(exists));
t('Artwork is a manager tool in the dock and the Control Center (not owner-only)', dockStaff.includes('staff-controlcenter.html?tool=artwork') && !dockOwner.includes('staff-controlcenter.html?tool=artwork') && (() => { const h = read('staff-controlcenter.html'); return /<a class="cx-nav" href="staff-controlcenter\.html\?tool=artwork" data-tool="artwork"[^>]*>/.test(h) && !/data-tool="artwork"[^>]*data-owner/.test(h); })());
t('the eight one-tab Boardroom tiles are gone from both menus; their pages still build as deep links', ['switches', 'health', 'announce', 'audit', 'halloffame', 'medals', 'backup', 'organization'].every((k) => !hubTiles.includes(`staff-${k}.html`) && !dockOwner.includes(`staff-${k}.html`) && exists(`staff-${k}.html`)));
t('every built staff page is reachable from a menu tile or is a retired page that redirects into the Control Center (PF-022 step 8)', fs.readdirSync(out).filter((f) => /^staff-.*\.html$/.test(f)).every((f) => f === 'staff-controlcenter.html' || hubTiles.includes(f) || hubTiles.some((h) => h.split('?')[0] === f) || f in MAN.LEGACY_PAGES));

// My Locker: Card Studio is in the buttons, the quick dial, the search palette and the member menu
const R = JSON.parse(read('hub.html').match(/PF_ROOMS=(\{.*?\})<\/script>/)[1]);
t('hub rooms and locker buttons: no duplicates, all built', dupes(R.rooms.map((r) => r[0])).length === 0 && dupes(R.lk.map((r) => r[0] + r[2])).length === 0 && [...R.rooms, ...R.lk].every((r) => exists(r[0])));
t('Card Studio is a locker button, in the member menu, in the quick dial, and in search', R.lk.some((r) => r[0] === 'hub-cardstudio.html') && js.includes('R.lk.map(') && /if \(inHub && R\?\.lk\) R\.lk\.forEach/.test(js) && read('header.js').includes("'hub-cardstudio.html#lk-cards'"));

t('every built hub page is reachable from the hub rooms or locker buttons', (() => { const l = new Set([...R.rooms, ...R.lk].map((r) => r[0].split('#')[0])); return fs.readdirSync(out).filter((f) => /^hub.*\.html$/.test(f)).every((f) => l.has(f)); })());

// one round nav button, no dead panel, Preview-as chips never vanish
t('the fx.js orb is hidden when the dock is mounted', /html\.pf-dock #fxnav\{display:none/.test(read('fx.css')) && js.includes("classList.add('pf-dock')"));
t('the dead #artpanel is gone from markup, scripts and styles', !/artpanel/.test(['hub.html', 'hub-cardstudio.html', 'pages.js', 'locker.css', 'style.css'].map(read).join('')) && !/artpanel/.test(hub));
t('Preview-as chips stay for the real owner while previewing as member or guest', js.includes('const canPreview =') && js.includes('if (as && canPreview())') && /canPreview\(\) && !isOwner\(\)/.test(js));
t('the mock fixture shows Card Studio to members (cardStudio flag is members, not owner)', !/"cardStudio":"owner"/.test(src('phoenix/overlay/phoenix-api.json')));
done();
