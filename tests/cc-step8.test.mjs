// PF-022 step 8: one staff manifest, old staff pages redirect into the Control Center, the retired Boardroom and Tools tabs are mounted once.
//   1. anti-duplication: a tool in two lists fails, an entry without a target fails, no floating tool or dock keeps its own list of pages
//   2. every old URL (and anchor) lands on the right Control Center view, with the hash the shell understands (and the shell resolves it)
//   3. the before/after checklist (PLANNING/PF-022-STEP8-CHECKLIST.md): every function of the old Boardroom and Tools tabs, ticked against its new home
//   4. Phoenix branding of everything step 8 outputs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { t, done } from './lib.mjs';
import * as MAN from '../next/lib/staffmanifest.mjs';
import { ICON_IDS } from '../next/lib/ccsprite.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cc8-'));
execFileSync(process.execPath, ['phoenix/build.mjs', '--out', out], { cwd: ROOT, stdio: 'pipe' });
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8'), src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const dupes = (a) => a.filter((x, i) => a.indexOf(x) !== i);
const clone = () => MAN.TOOLS.map((x) => ({ ...x }));
const withTools = (mut) => { const keep = MAN.TOOLS.splice(0, MAN.TOOLS.length, ...mut(clone())); const r = MAN.problems(); MAN.TOOLS.splice(0, MAN.TOOLS.length, ...keep); return r; };

// ---------- 1. anti-duplication ----------
t('anti-dup: the manifest has no problems', MAN.problems().length === 0, JSON.stringify(MAN.problems()));
t('anti-dup: a tool listed twice fails (same id, same address, same label)', withTools((x) => [...x, { ...x[2] }]).some((p) => /duplicate id/.test(p)) && withTools((x) => [...x, { ...x[2], id: 'zz1', label: 'Zz' }]).some((p) => /duplicate href/.test(p)) && withTools((x) => [...x, { ...x[2], id: 'zz2', href: 'staff-zz.html' }]).some((p) => /listed twice/.test(p)));
t('anti-dup: an entry without a target fails', withTools((x) => [...x, { id: 'zz3', label: 'Zz3', emoji: 'z', icon: 'i-grid', desc: 'x', section: 'inbox' }]).some((p) => /no target/.test(p)));
t('anti-dup: a module of an unknown kind fails, an unknown section or group fails', withTools((x) => [...x, { id: 'zz4', label: 'Zz4', emoji: 'z', icon: 'i-grid', desc: 'x', section: 'inbox', module: 'nope:x' }]).some((p) => /unknown module/.test(p)) && withTools((x) => [...x, { id: 'zz5', label: 'Zz5', emoji: 'z', icon: 'i-grid', desc: 'x', section: 'zz', href: 'a.html' }]).some((p) => /unknown section/.test(p)) && withTools((x) => [...x, { id: 'zz6', label: 'Zz6', emoji: 'z', icon: 'i-grid', desc: 'x', section: 'inbox', group: 'zz', href: 'b.html' }]).some((p) => /unknown group/.test(p)));
t('anti-dup: a retired page that is also a tool address fails (it would be listed and redirected)', withTools((x) => [...x, { id: 'zz7', label: 'Zz7', emoji: 'z', icon: 'i-grid', desc: 'x', section: 'inbox', href: 'staff-switches.html' }]).some((p) => /legacy page/.test(p)));
t('anti-dup: every icon of every tool is in the one sprite', MAN.TOOLS.every((x) => ICON_IDS.includes(x.icon)));
t('anti-dup: the hub tiles and the dock lists are the same tools, each once', (() => { const hub = MAN.hubGroups(false).concat(MAN.hubGroups(true)).flatMap(([, , , x]) => x.map((r) => r[0])), dock = MAN.dockGroups(false).concat(MAN.dockGroups(true)).flatMap(([, x]) => x.map((r) => r[0])); return dupes(hub).length === 0 && dupes(dock).length === 0 && hub.sort().join() === dock.sort().join(); })());
t('anti-dup: no floating tool, dock or Boardroom script keeps a hand-copied list of staff pages (they read the manifest)', ['next/static/ownerfab.js', 'next/static/navigator.js', 'next/static/gear.js', 'next/static/boardroom.js', 'next/static/dock.js', 'next/static/tools.js'].every((f) => !/['"`]staff-(desk|tools|content|schedule|dugout|boardroom|artwork|insights|switches|health|announce|audit|halloffame|medals|backup|organization)\.html/.test(src(f).replace(/\/\/.*$/gm, ''))));
t('anti-dup: hub.mjs builds its staff tiles from the manifest and holds no tile list of its own', /hubGroups\(false\)/.test(src('next/pages/hub.mjs')) && !/BR_TABS/.test(src('next/pages/hub.mjs')));
t('anti-dup: the staff pages the shell knows are one list (navigator, gear and the owner button read staffnav.js, a slice of the same manifest)', ['ownerfab.js', 'navigator.js', 'gear.js'].every((f) => read(f).includes('PFStaffNav')) && read('staffnav.js') === MAN.navJs() && JSON.parse(read('staffnav.js').replace(/^window\.PFStaffNav=|;\s*$/g, '')).tools.length === MAN.TOOLS.length);
t('anti-dup: one Control Center tile in the dock (Manager list), one Boardroom tile (owner list)', (() => { const d = read('dock.js'), staff = d.match(/const STAFF = [\s\S]*?\];\n/)[0], owner = d.match(/const OWNER = [\s\S]*?\];\n/)[0]; return (staff.match(/'staff-controlcenter\.html', '🎛️'/g) || []).length === 1 && !/'staff-controlcenter\.html', '🎛️'/.test(owner) && (owner.match(/Boardroom/g) || []).length === 1; })());
t('anti-dup: the sidebar lists every manifest tool once; owner-only tools stay hidden until the session says owner', MAN.TOOLS.every((x) => (read('staff-controlcenter.html').match(new RegExp(`data-tool="${x.id}"`, 'g')) || []).length === 1) && MAN.TOOLS.filter((x) => x.owner).every((x) => new RegExp(`<li data-owner hidden><a class="cx-nav" href="[^"]*" data-tool="${x.id}"`).test(read('staff-controlcenter.html'))));

// ---------- 2. every old URL lands on the right Control Center view ----------
const OLD = [
  ['staff-switches.html', '', 'access'], ['staff-organization.html', '', 'org'], ['staff-audit.html', '', 'audit'], ['staff-health.html', '', 'health'], ['staff-announce.html', '', 'announce'],
  ['staff-halloffame.html', '', 'halloffame'], ['staff-medals.html', '', 'medals'], ['staff-backup.html', '', 'backup'],
  ['staff-boardroom.html', '', 'boardroom'], ['staff-boardroom.html', 'tools', 'boardroom'], ['staff-boardroom.html', 'switches', 'access'], ['staff-boardroom.html', 'health', 'health'], ['staff-boardroom.html', 'audit', 'audit'],
  ['staff-boardroom.html', 'announce', 'announce'], ['staff-boardroom.html', 'hof', 'halloffame'], ['staff-boardroom.html', 'medals', 'medals'], ['staff-boardroom.html', 'backup', 'backup'], ['staff-boardroom.html', 'org', 'org'],
  ['staff-tools.html', '', 'submissions'], ['staff-tools.html', 'subm', 'submissions'], ['staff-tools.html', 'reports', 'reports'], ['staff-tools.html', 'game', 'gamedata'], ['staff-tools.html', 'bot', 'settings'], ['staff-tools.html', 'awards', 'awards'],
];
const landed = (file, hash) => { // run the page's own redirect script with a fake location, return where it sends the visitor
  const h = read(file), code = h.match(/<script>(\(function\(\)\{var m=[\s\S]*?\}\)\(\))<\/script>/)?.[1]; if (!code) return null;
  let to = null; vm.runInNewContext(code, { location: { hash: hash ? '#' + hash : '', replace: (u) => { to = u; } } }); return to;
};
for (const [file, hash, id] of OLD) {
  const tool = MAN.TOOLS.find((x) => x.id === id);
  t(`old URL ${file}${hash ? '#' + hash : ''} lands on the ${id} view`, !!tool && !!tool.module && landed(file, hash) === `staff-controlcenter.html#${id}` && MAN.legacyTarget(file, hash) === `staff-controlcenter.html#${id}` && MAN.resolve(file + (hash ? '#' + hash : ''))?.id === id);
}
t('old URL: every retired page is a built page with a meta refresh, a canonical link, a visible link and no scripts needed to read it', Object.keys(MAN.LEGACY_PAGES).every((f) => { const h = read(f); return /http-equiv="refresh" content="0;url=staff-controlcenter\.html#[a-z]+"/.test(h) && /rel="canonical"/.test(h) && /<a href="staff-controlcenter\.html#[a-z]+">/.test(h) && /<main/.test(h); }));
t('old URL: an unknown anchor on a retired page lands on that page’s own default view (never a dead end)', landed('staff-boardroom.html', 'zzz') === 'staff-controlcenter.html#boardroom' && landed('staff-tools.html', 'zzz') === 'staff-controlcenter.html#submissions' && landed('staff-health.html', 'zzz') === 'staff-controlcenter.html#health');
t('old URL: the page itself the shell opens: #<old anchor> inside the Control Center resolves through the alias map to a module tool', (() => { const alias = Object.assign({}, ...Object.values(MAN.LEGACY_HASH).map((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k)))); return Object.values(alias).every((id) => MAN.TOOLS.find((x) => x.id === id)?.module) && read('ccshell.js').includes('const ALIAS = Object.assign') && read('staffmanifest.js').includes('"legacyHash"'); })());
t('deep link: PhoenixDeeplink finds the view for every tool id and old anchor (the main column carries them as data-dl aliases)', (() => { const m = read('staff-controlcenter.html').match(/<main class="cx-main" id="cxMain" data-dl="([^"]*)"/); if (!m) return false; const al = new Set(m[1].split(' ')); return MAN.TOOLS.every((x) => al.has(x.id)) && Object.values(MAN.LEGACY_HASH).every((mm) => Object.keys(mm).filter(Boolean).every((k) => al.has(k))); })());
t('link resolver: the staff resolver finds tools by id, by address, by old page and old anchor, and returns null for a page it does not know', MAN.resolve('audit')?.id === 'audit' && MAN.resolve('staff-controlcenter.html#medals')?.id === 'medals' && MAN.resolve('staff-controlcenter.html?tool=reports')?.id === 'reports' && MAN.resolve('staff-nope.html') === null);
t('flag locations: every switch location points at a built page or a Control Center tool, never at a retired page', Object.entries(MAN_WHERE()).every(([k, v]) => (v[2] ? MAN.TOOLS.some((x) => x.id === v[2]) : true) && !MAN.LEGACY_PAGES[v[0]] && fs.existsSync(path.join(out, v[0]))));
function MAN_WHERE() { return JSON.parse(read('staffmanifest.js').replace(/^window\.PFStaffManifest=|;\s*$/g, '')).where; }

// ---------- 3. before/after checklist ----------
// Each row: the function the OLD page had, where it lives NOW, the file, and what must be in that file. Written from the old boardroom.js and tools.js at HEAD before this step.
const files = { cc: read('controlcenter.js'), cs: read('ccsettings.js'), br: read('boardroom.js'), tl: read('tools.js'), shell: read('ccshell.js'), page: read('staff-controlcenter.html'), man: read('staffmanifest.js'), css: read('ccshell.css') };
const CHECK = [
  // Boardroom › Switches  ->  Control Center › Site access
  ['Switches: set a level per feature (off, owner, managers, members, public)', 'cc', "'/api/admin/flags', { name: flag, level }"],
  ['Switches: ask before a change, say who will see it', 'cc', 'will see it from the next page load'],
  ['Switches: undo the last change', 'cc', 'data-undo'],
  ['Switches: show a live override and go back to the committed level', 'cc', "'/api/admin/flags/reset'"],
  ['Switches: count the live overrides', 'cc', 'live override'],
  ['Switches: find a feature by name', 'cc', 'data-flagq'],
  ['Switches: grouped, collapsible, with counts', 'cc', 'class="br-grp"'],
  ['Switches: Go to where the feature lives', 'cc', '↗ Go to'],
  ['Switches: Show me as owner, member or guest (display only)', 'cc', 'data-show='],
  ['Switches: only the owner changes, managers see', 'cc', 'Only the owner changes these'],
  ['Switches: the group list is the same one in the manifest', 'man', '"flagGroups"'],
  // Boardroom › Organization  ->  Control Center › Organization (the one shared panel)
  ['Organization: the shared panel (clubs, divisions, servers, channels, roles)', 'cc', "S.panel === 'org'"],
  // Boardroom › Audit  ->  Control Center › Audit log, Submissions, Reports
  ['Audit: activity log, newest first', 'cs', '/api/controlcenter/audit'],
  ['Audit: search the log', 'cs', 'data-au-form'],
  ['Audit: filter by kind (settings, activity, roles)', 'cs', 'data-au-src'],
  ['Audit: show more', 'cs', 'data-au-more'],
  ['Audit: icons per kind of entry', 'cs', "'hof-induct'"],
  ['Audit › Submissions: the Submissions tool (type + search + CSV)', 'tl', '/api/admin/submissions'],
  ['Audit › Reports: the Reports tool (clear or remove)', 'tl', '/api/admin/reports'],
  // Boardroom › Tools tab (the finder) and the other Boardroom tabs that stay as Control Center views
  ['Boardroom Tools: finder over every staff tool, built from the manifest', 'br', 'MAN.tools.filter'],
  ['Boardroom Tools: links outside the site (Discord, Cloudflare, YouTube, Twitch)', 'br', 'Outside the site'],
  ['Boardroom Tools: jump to a feature by name', 'br', 'Go to where it lives'],
  ['Boardroom Health', 'br', "'/api/admin/health'"],
  ['Boardroom Announce: preview then confirm', 'br', '/api/notify/announce'],
  ['Boardroom Announce: post a club doc to Discord', 'br', '/api/docs/discord'],
  ['Boardroom Hall of Fame: induct and remove', 'br', "'/api/hof/remove'"],
  ['Boardroom Medals: save, hide, reset, delete, award, revoke', 'br', "'/api/admin/medals'"],
  ['Boardroom Backup: download and restore medals', 'br', 'norex-boardroom-backup'],
  // Tools tabs that stay as Control Center tools
  ['Tools Submissions: type, search, CSV export', 'tl', 'data-subm-form'],
  ['Tools Reports: clear or remove a reported post, message or feedback', 'tl', '/api/chats/reports/'],
  ['Tools Game data: publish, dismiss, download', 'tl', '/api/game/publish'],
  ['Tools Awards: categories, close the week, results channel', 'tl', '/api/awards/close'],
  // Tools › Bot  ->  Bot settings + Bot commands
  ['Tools Bot: embed colour, emoji, auto-posts, result and reminder channel, ping role', 'cs', 'data-cs-form="bot"'],
  ['Tools Bot: notification routing table (add, remove, save, role and channel pickers)', 'cs', 'data-cs-rtsave'],
  ['Tools Bot: command rules (on, lowest level, reply, only in, post to)', 'cc', 'data-min'],
  ['Tools Bot: Sync to Discord', 'cc', '/api/bot/commands/sync'],
  ['Bot settings (new): Rush queue, welcome and leave, ping roles, profanity alerts, stream sources, recruitment, match alert, stream links, fold in the old settings', 'cs', 'data-cs-fold'],
  // the shell
  ['Shell: every retired tool is a sidebar entry that mounts in place', 'shell', 'kindOf(t)'],
  ['Shell: the page hosts the three mount points', 'page', 'id="brLive"'],
];
for (const [what, key, needle] of CHECK) t(`checklist: ${what}`, files[key].includes(needle), `${key} lacks ${needle}`);
t('checklist: the old tabs are really gone from their old homes (no Switches, Audit or Organization tab in boardroom.js, no Bot tab in tools.js)', !/\['switches'|\['audit'|\['org'/.test(files.br) && !files.tl.includes("['bot'") && !files.tl.includes('/api/bot/settings') && !files.br.includes("'/api/admin/flags'"));
t('checklist: the markdown checklist lists every row of this test (so the plan and the test cannot drift)', (() => { const md = src('PLANNING/PF-022-STEP8-CHECKLIST.md'); return CHECK.every(([what]) => md.includes(what)); })());
t('checklist: every Boardroom and Tools tab of the old pages has a manifest tool (nothing is only reachable by an old URL)', ['access', 'org', 'audit', 'health', 'announce', 'halloffame', 'medals', 'backup', 'boardroom', 'submissions', 'reports', 'gamedata', 'awards', 'settings', 'command'].every((id) => MAN.TOOLS.some((x) => x.id === id && x.module)));

// ---------- 3b. the mounted scripts really render every tab (a smoke run of boardroom.js and tools.js against a fake page) ----------
async function smoke(file, hostId, api, tabs) {
  const root = { innerHTML: '', isConnected: true, hidden: true, dataset: {}, closest: () => ({}), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], insertAdjacentHTML() {} };
  const A = { role: 'owner', token: 't', ready: Promise.resolve(), call: async () => new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : []) }) }, errors = [];
  const win = { NorexAuth: A, NOREX_API: 'x', PFStaffManifest: JSON.parse(read('staffmanifest.js').replace(/^window\.PFStaffManifest=|;\s*$/g, '')), NOREX: { links: {}, players: [] }, NorexMotion: { toast() {} } };
  const doc = { getElementById: (id) => (id === hostId ? root : null), querySelector: () => null, querySelectorAll: () => [], activeElement: null, createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }), addEventListener() {}, body: { appendChild() {} } };
  Object.assign(win, { performance: { now: () => Date.now() }, confirm: () => true, setTimeout, clearTimeout, Date, JSON, Math, URL, FormData: class { get() { return ''; } has() { return false; } }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { hash: '' }, navigator: {}, fetch: async () => ({ ok: true, json: async () => ({}) }) }); win.window = win; win.document = doc; win.console = { log() {}, error: (...a) => errors.push(a.join(' ')) };
  vm.runInNewContext(read(file), win); await new Promise((r) => setTimeout(r, 30));
  const api2 = win[api]; const res = {};
  for (const tab of tabs) { try { res[tab] = api2.open(tab) === true && root.innerHTML.length > 20; } catch (e) { res[tab] = String(e); } await new Promise((r) => setTimeout(r, 5)); }
  return { res, errors, ok: tabs.every((k) => res[k] === true), api2 };
}
{ const b = await smoke('boardroom.js', 'brLive', 'PFBoardroom', ['tools', 'health', 'announce', 'hof', 'medals', 'backup']);
  t('smoke: boardroom.js renders every tab it still has, without an error (tools, health, announce, hof, medals, backup)', b.ok, JSON.stringify(b.res) + b.errors.join('|'));
  t('smoke: boardroom.js refuses a retired tab (switches, audit, org) and a non-owner', b.api2.open('switches') === false && b.api2.open('audit') === false && b.api2.open('org') === false);
  const l = await smoke('tools.js', 'tlLive', 'PFTools', ['subm', 'reports', 'game', 'awards']);
  t('smoke: tools.js renders every tab it still has, without an error (subm, reports, game, awards)', l.ok, JSON.stringify(l.res) + l.errors.join('|'));
  t('smoke: tools.js refuses the retired Bot tab', l.api2.open('bot') === false); }

// ---------- 4. Phoenix branding ----------
const NOREX = /norex/i, RED = /c8352c|080b11/i;
const mine = ['staff-controlcenter.html', 'ccsettings.js', 'ccshell.css', 'staffnav.js', 'staffmanifest.js', ...Object.keys(MAN.LEGACY_PAGES)];
t('brand: the pages and scripts step 8 outputs show no NOREX name or colour (identifiers inside scripts are ignored by the build guard; these files hold none)', mine.every((f) => { const s = read(f).replace(/<script[\s\S]*?<\/script>/g, (m) => (m.includes('src=') ? '' : '')); return !RED.test(read(f)) && !NOREX.test(f.endsWith('.html') ? s.replace(/<[^>]*>/g, '') : s); }));
t('brand: the retired pages and the new panel take their colour from the theme (config brand), never a literal club hex', !/#c8352c/i.test(read('ccshell.css')) && !/#c8352c|#080b11/i.test(read('ccsettings.js')) && Object.keys(MAN.LEGACY_PAGES).every((f) => !/#c8352c|#080b11/i.test(read(f))));
t('brand: channels and roles in Bot settings come from the Discord list and the Organization config, never a name or id in code', !/\b\d{17,19}\b/.test(src('next/static/ccsettings.js')) && src('next/static/ccsettings.js').includes('/api/controlcenter/discord'));
done();
