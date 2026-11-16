// PF-022 step 7: the staff tool manifest (one list, no duplicates, every entry has a target), the Control Center shell built from it,
// the dashboard's data layer (existing routes only) and the Phoenix branding of everything the shell outputs.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
import { t, done } from './lib.mjs';
import * as MAN from '../next/lib/staffmanifest.mjs';
import { ICON_IDS } from '../next/lib/ccsprite.mjs';

// ---- the manifest itself
t('manifest: no problems (unique ids and hrefs, known sections and groups, every entry has a target)', MAN.problems().length === 0);
t('manifest: every tool has an href or a module, and every module is a known kind', MAN.TOOLS.every((x) => x.href || x.module) && MAN.TOOLS.every((x) => !x.module || /^(home|org|controlcenter:\w+)$/.test(x.module)));
t('manifest: no tool id or href appears twice', new Set(MAN.TOOLS.map((x) => x.id)).size === MAN.TOOLS.length && new Set(MAN.TOOLS.map((x) => x.href)).size === MAN.TOOLS.length);
t('manifest: a duplicate entry is caught (the check fails on a copy)', (() => { MAN.TOOLS.push({ ...MAN.TOOLS[1] }); const bad = MAN.problems().length > 0; MAN.TOOLS.pop(); return bad; })());
t('manifest: an entry without a target is caught', (() => { MAN.TOOLS.push({ id: 'zz', label: 'Z', emoji: 'z', icon: 'i-grid', desc: 'x', section: 'inbox' }); const bad = MAN.problems().some((p) => /no target/.test(p)); MAN.TOOLS.pop(); return bad; })());
t('manifest: every icon names a symbol in the one sprite', MAN.TOOLS.every((x) => ICON_IDS.includes(x.icon)));
t('manifest: the link resolver finds a tool by id, by page and by module address', MAN.resolve('desk')?.id === 'desk' && MAN.resolve('staff-desk.html')?.id === 'desk' && MAN.resolve('staff-controlcenter.html?tool=audit')?.id === 'audit' && MAN.resolve('nope') === null);
t('manifest: owner-only tools are Organization and the Boardroom', MAN.TOOLS.filter((x) => x.owner).map((x) => x.id).sort().join() === 'boardroom,org');
t('manifest: the dock lists and the hub groups come from it (every hub tile href is a manifest tool or the Control Center tile)', MAN.hubGroups(false).concat(MAN.hubGroups(true)).every(([, , , tools]) => tools.every(([h]) => MAN.TOOLS.some((x) => x.href === h) || h === MAN.CC_TILE.href)));
t('anti-duplication: the dock source and the hub source hold no hand-copied tool list', !/staff-(schedule|dugout|desk|content|artwork|tools|insights)\.html/.test(fs.readFileSync(path.join(ROOT, 'next/static/dock.js'), 'utf8')) && !/\['staff-(schedule|dugout|desk)\.html'/.test(fs.readFileSync(path.join(ROOT, 'next/pages/hub.mjs'), 'utf8')));

// ---- the built Phoenix site
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-'));
execFileSync(process.execPath, ['phoenix/build.mjs', '--out', out], { cwd: ROOT, stdio: 'pipe' });
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
const page = read('staff-controlcenter.html'), js = read('ccshell.js'), css = read('ccshell.css'), man = read('staffmanifest.js'), dock = read('dock.js'), staff = read('staff.html');
const main = page.slice(page.indexOf('<main'), page.indexOf('</main>'));
t('shell: the page has the sidebar, the dashboard home and the mounted-tools host, gated by sign-in', /id="cxSide"/.test(page) && /id="cxHome"/.test(page) && /id="ccLive"/.test(page) && /id="ccLocal"/.test(page) && /ccshell\.js/.test(page) && /staffmanifest\.js/.test(page));
t('shell: the sidebar lists every manifest tool exactly once', MAN.TOOLS.every((x) => (page.match(new RegExp(`data-tool="${x.id}"`, 'g')) || []).length === 1) && (page.match(/data-tool="/g) || []).length === MAN.TOOLS.length);
t('shell: owner-only tools are hidden until the session is the owner', MAN.TOOLS.filter((x) => x.owner).every((x) => new RegExp(`<li data-owner hidden><a class="cx-nav" href="[^"]+" data-tool="${x.id}"`).test(page)));
t('shell: one SVG sprite, every <use> points into it, no emoji icon in the sidebar', (() => { const ids = new Set([...page.matchAll(/<symbol id="([\w-]+)"/g)].map((m) => m[1])); const uses = [...(page + js).matchAll(/href="#(i-[\w-]+)"|ic\('(i-[\w-]+)'/g)].map((m) => m[1] || m[2]); return page.match(/<symbol /g).length === ICON_IDS.length && uses.length > 20 && uses.every((u) => ids.has(u)) && ![...page.matchAll(/<a class="cx-nav"[\s\S]*?<\/a>/g)].some((m) => /\p{Extended_Pictographic}/u.test(m[0])); })());
t('shell: the browser manifest equals the build-time manifest', man === MAN.manifestJs());
t('shell: the dock lists are written from the manifest at build time', MAN.dockLists().split('\n')[0].length > 0 && dock.includes(MAN.dockLists()) && !dock.includes('@STAFF_LISTS@'));
t('shell: the staff hub still lists every manifest group and tile', MAN.hubGroups(false).every(([, title, , tools]) => staff.includes(title) && tools.every(([h]) => staff.includes(`href="${h}"`))));
t('dashboard: reads only existing routes (health, insights, queue) plus the audit rows PFCC already loaded', (() => { const paths = [...js.matchAll(/call\(\s*'(\/api\/[^'?]+)/g)].map((m) => m[1]); return paths.length === 3 && paths.every((p) => ['/api/admin/health', '/api/insights', '/api/manager/queue'].includes(p)) && /PFCC\?\.data/.test(js) && !/method:\s*'POST'/.test(js); })());
t('dashboard: one data layer and one filter state (every view reads rows() through apply(); the controls write setF)', /const DL = /.test(js) && /const F = /.test(js) && (js.match(/apply\(/g) || []).length >= 4 && (js.match(/setF\(/g) || []).length >= 8);
t('dashboard: filter state survives in the link (copy link, saved views, Ctrl+K palette)', /data-link/.test(js) && /phoenix\.cx\.views/.test(js) && /ctrlKey/.test(js) && !/localStorage\.setItem\('norex/.test(js));
t('shell: controlcenter.js mounts inside the shell without its own slicer and exposes PFCC', (() => { const c = read('controlcenter.js'); return /closest\('\.cx'\)/.test(c) && /window\.PFCC = /.test(c); })());

// ---- phone first and Phoenix themed
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const c = strip(css), base = c.slice(0, c.indexOf('@media(min-width:640px)'));
t('mobile: base rules are the phone layout (drawer, one column, 44px chips, 48px nav rows); wide layouts live in min-width queries', /\.cx-side\{position:fixed/.test(base) && /\.cx\{[^}]*grid-template-columns:minmax\(0,1fr\)/.test(base) && /\.cx-chip\{[^}]*min-height:44px/.test(base) && /\.cx-nav\{[^}]*min-height:48px/.test(base) && /min-width:900px\)\{[\s\S]*grid-template-columns:264px/.test(c));
t('mobile: tables turn into a grouped list on phones and nothing sets a fixed width over 360px outside min-width queries', /max-width:639px\)\{[^}]*\.cx-t thead/.test(c) && !/[^-]width:(3[6-9]\d|[4-9]\d\d)px/.test(base.replace(/max-width:min\([^)]*\)/g, '')));
t('mobile: sidebar rows, tiles and bars are keyboard buttons or links (no div click targets)', !/<div[^>]*data-(type|day|who)=/.test(js) && /<button type="button" class="cx-tile/.test(js));
const vis = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
t('brand: the Control Center page shows no NOREX name, colour or crest (html, css, scripts, manifest)', !/norex/i.test(vis(page)) && !/c8352c|080b11/i.test(page + css + js + man) && !/norex/i.test(css + man));
t('brand: the sidebar brand is the Phoenix crest and name from config, not a hardcoded club', /<img src="crest-sm\.png"/.test(main) && /PHOENIX FIRE/.test(main) && !/PHOENIX FIRE/.test(js));
t('brand: the shell takes its accents from the theme variables (ember, amber, gold) and holds no club hex of its own', /var\(--red,/.test(css) && /var\(--red2,/.test(css) && /var\(--g2,/.test(css) && !/#e8651a|#c8352c/i.test(css));
t('brand: crest files in the build are the Phoenix crest, not the shared NOREX one', fs.readFileSync(path.join(out, 'crest-sm.png')).equals(fs.readFileSync(path.join(ROOT, 'phoenix/overlay/crest-sm.png'))));
done();
