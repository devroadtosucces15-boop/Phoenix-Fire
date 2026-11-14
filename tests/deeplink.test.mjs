// R04/R05: one deep-link helper and no stale anchors. Targets that script fills or switches resolve through ids, data-dl aliases or the
// handbook handler; every address the site links to on the pages below must exist in the built html (or be handled by a named script).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-'));
execFileSync(process.execPath, ['next/build.mjs', '--out', out, '--preview'], { cwd: ROOT, stdio: 'pipe' });
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
const js = read('deeplink.js');

t('helper ships, is named PhoenixDeeplink and loads after smooth.js on every page', js.includes('window.PhoenixDeeplink') && ['tactics.html', 'leaders.html', 'hub.html'].every((f) => { const h = read(f); return h.includes('src="deeplink.js"') && h.indexOf('deeplink.js') > h.indexOf('smooth.js'); }));
t('helper resolves id or data-dl, opens details and tab panes, waits for a stable layout, uses Lenis and the sticky token', ['data-dl~=', "n.tagName === 'DETAILS'", 'data-pane', '--pf-sticky-top', 'STABLE_MS = 250', 'NorexLenis', 'fx-busy', 'hashchange'].every((k) => js.includes(k)));
t('a user who scrolls, touches or presses a key first is never pulled back; reduced motion lands without animation', ['wheel', 'touchstart', 'keydown'].every((k) => js.includes(k)) && js.includes('immediate: imm') && js.includes("behavior: imm ? 'auto' : 'smooth'") && js.includes('prefers-reduced-motion'));
t('Lenis no longer scrolls anchors itself (no offset); the helper does', read('smooth.js').includes('anchors: false'));
t('no NOREX name or colour in the helper', !/norex|#c8352c|#080b11/i.test(js.replace(/NorexLenis/g, '')));

const has = (f, sel) => { const h = read(f); return sel.test(h); };
t('leaders.html: goals, assists and rating chips carry a data-dl alias and point at their pane', ['goals', 'assists', 'rating'].every((k) => has('leaders.html', new RegExp(`data-t="${k}" data-dl="${k}" data-dl-to="\\.lp\\[data-p=${k}\\]"`)) && has('leaders.html', new RegExp(`class="lp" id="${k}" data-p="${k}"`))));
t('tactics.html: roles, forms, xi and rush resolve through data-dl to a pane that exists', ['roles', 'forms', 'xi'].every((k) => has('tactics.html', new RegExp(`data-dl="${k}" data-dl-to="\\[data-pane=${k}\\]"`)) && has('tactics.html', new RegExp(`data-pane="${k}"`))) && has('tactics.html', /data-dl="rush" data-dl-to="#rush"/) && has('tactics.html', /id="rush"/));
t('squad.html has id="squad" (join.html links squad.html#squad)', has('squad.html', /<section class="sec" id="squad"/) && has('join.html', /href="squad\.html#squad"/));
t('tactics.html links the two handbook set-piece anchors, and the handbook script creates ids league-setpieces and rush-setpieces', has('tactics.html', /hub-handbook\.html#league-setpieces/) && has('tactics.html', /hub-handbook\.html#rush-setpieces/) && read('handbook.js').includes('id="${mode}-${k}"') && read('handbook.js').includes("['setpieces'"));
t('stats.html links leaders.html#goals, #assists and #rating', ['goals', 'assists', 'rating'].every((k) => has('stats.html', new RegExp(`leaders\\.html#${k}"`))));
// R20: staff tab buttons carry data-dl (the tab key) and data-dl-to (the pane), so staff-<page>.html#<tab> opens the tab and scrolls to it
const STAFF = { 'desk.js': ['claims', 'members', 'requests', 'rush', 'trials', 'notes'], 'tools.js': ['subm', 'reports', 'game', 'bot', 'awards'], 'content.js': ['docs', 'ideas', 'week', 'store'], 'intel.js': ['intel', 'notes', 'burners'], 'schedule.js': ['soon', 'past', 'off'] };
for (const [f, keys] of Object.entries(STAFF)) {
  const src = read(f);
  t(`${f}: tab buttons have data-dl="\${k}" and a data-dl-to pane, and every tab key still exists`, /data-tab="\$\{k\}" data-dl="\$\{k\}" data-dl-to="[^"]+"/.test(src) && keys.every((k) => src.includes(`'${k}'`)));
}
t('a hidden live strip gives up after 1.5 s and stays at the top (R34 replaces the old next-section fallback)', js.includes('LIVE_MS') && js.includes("!(el && el.hasAttribute('data-live-strip'))") && js.includes('data-live-strip'));
// R21: the split locker pages mount one section each; mylocker.js draws only the sections whose mount exists
const ml = read('mylocker.js');
t('mylocker.js guards each mount (no all-or-nothing return) and loads only the sections that exist', ml.includes('has.me') && ml.includes('has.st') && ml.includes('has.md') && !/if \(!meEl \|\| !stEl \|\| !mdEl\) return/.test(ml) && /if \(has\.me\) startMe/.test(ml) && /if \(has\.st\) loadStats/.test(ml) && /if \(has\.md\) loadMedals/.test(ml));
t('each split page mounts its own section: hub-profile lkme, hub-stats lkstats, hub-medals lkmedals', [['hub-profile.html', 'lkme'], ['hub-stats.html', 'lkstats'], ['hub-medals.html', 'lkmedals']].every(([f, id]) => read(f).includes(`id="${id}"`)));
// R31: the hash forwarder runs on every locker page and sends a section to the page that shows it; unknown ids stay at the top
const LKP = ['hub.html', 'hub-profile.html', 'hub-stats.html', 'hub-medals.html', 'hub-cardstudio.html', 'hub-alerts.html'];
t('R31: every locker page carries the forwarder with the full map and no hub.html-only guard', LKP.every((f) => { const h = read(f); return ["'#lk-me':'hub-profile.html'", "'#lk-mystats':'hub-stats.html'", "'#lk-medals':'hub-medals.html'", "'#lk-cards':'hub-cardstudio.html'", "'#lk-unread':'hub-alerts.html'", 'location.search+location.hash'].every((k) => h.includes(k)) && !h.includes('hub\\.html$/.test(location.pathname)'); }));
t('R31: a page never forwards to itself (it compares the file name with the target)', read('hub-alerts.html').includes("location.pathname.split('/').pop()!==t"));
t('R31: a hidden locker target stays at the top (no ancestor jump on lk- pages)', js.includes("/(^|\\s)lk-/.test(D.body.className)"));
// R32: a tap during a running page transition is never swallowed
t('R32: fx.js go() navigates to the link (fragment kept) when a transition is already running, and keeps the 1.4 s guard', /if \(busy\) \{ location\.assign\(a\.href\); return; \}/.test(read('fx.js')) && read('fx.js').includes('setTimeout(() => location.assign(href), 1400)'));
t('R32: deeplink.js still waits while html.fx-busy is set', js.includes("H.classList.contains('fx-busy')"));
// R33: real ids for the aliased targets, each unique on its page, aliases kept
const ids = (f, id) => (read(f).match(new RegExp(`\\sid="${id}"`, 'g')) ?? []).length;
t('R33: leaders.html panes carry id goals, assists, rating, mom, cs, tackles, each exactly once, with data-p and the chip data-dl kept', ['goals', 'assists', 'rating', 'mom', 'cs', 'tackles'].every((k) => ids('leaders.html', k) === 1 && read('leaders.html').includes(`<div class="lp" id="${k}" data-p="${k}"`) && read('leaders.html').includes(`data-t="${k}" data-dl="${k}"`)));
t('R33: tactics.html has id="roles" once on the roles pane and the data-dl chip is kept', ids('tactics.html', 'roles') === 1 && read('tactics.html').includes('data-pane="roles" id="roles"') && read('tactics.html').includes('data-dl="roles"'));
t('R33: the helper opens a hidden .lp pane through its chip, so the id works from the address', js.includes("n.classList.contains('lp') && n.hidden && n.dataset.p"));
// R34: trailing space for short targets, set only by a hash jump
t('R34: deeplink.js sets --pf-tail on #main from the missing scroll distance', js.includes("setProperty('--pf-tail'") && js.includes('H.scrollHeight - innerHeight') && /tail\(y\)/.test(js));
t('R34: layout.css adds #main::after sized by --pf-tail (0 by default, so pages without a hash do not grow)', /#main::after\{content:"";display:block;height:var\(--pf-tail,0\)\}/.test(read('layout.css')));
// R2-verify: one scroll for a script-built handbook target, a page opened on a hash arrives instantly, Lenis limit refreshed, no TDZ in motion.js
const hb = read('handbook.js'), mo = read('motion.js');
t('R2v: handbook openHash hands the scroll to PhoenixDeeplink (no second smooth scrollIntoView racing it) and keeps the details open', /el\.open = true;[\s\S]*window\.PhoenixDeeplink\) \{ window\.PhoenixDeeplink\.go\('#' \+ el\.id\); return; \}/.test(hb) && hb.indexOf('PhoenixDeeplink.go') < hb.lastIndexOf('scrollIntoView'));
t('R2v: a page opened on a #hash lands instantly (arriving), later jumps glide', js.includes('let arriving = !!location.hash') && /imm = reduced\(\) \|\| arriving/.test(js) && js.includes('arriving = false; go(here())'));
t('R2v: Lenis is resized before the jump so the stale scroll limit cannot stop it short (hub-matchnight#mn-rush)', /tail\(y\);[\s\S]{0,260}L\.resize\(\)[\s\S]*L\.scrollTo/.test(js));
t('R2v: motion.js declares counted before show() uses it (no TDZ error when motion is off)', mo.indexOf('const counted = new WeakSet()') < mo.indexOf('const show = '));
done();
