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
t('leaders.html: goals, assists and rating chips carry a data-dl alias and point at their pane', ['goals', 'assists', 'rating'].every((k) => has('leaders.html', new RegExp(`data-t="${k}" data-dl="${k}" data-dl-to="\\.lp\\[data-p=${k}\\]"`)) && has('leaders.html', new RegExp(`class="lp" data-p="${k}"`))));
t('tactics.html: roles, forms, xi and rush resolve through data-dl to a pane that exists', ['roles', 'forms', 'xi'].every((k) => has('tactics.html', new RegExp(`data-dl="${k}" data-dl-to="\\[data-pane=${k}\\]"`)) && has('tactics.html', new RegExp(`data-pane="${k}"`))) && has('tactics.html', /data-dl="rush" data-dl-to="#rush"/) && has('tactics.html', /id="rush"/));
t('squad.html has id="squad" (join.html links squad.html#squad)', has('squad.html', /<section class="sec" id="squad"/) && has('join.html', /href="squad\.html#squad"/));
t('tactics.html links the two handbook set-piece anchors, and the handbook script creates ids league-setpieces and rush-setpieces', has('tactics.html', /hub-handbook\.html#league-setpieces/) && has('tactics.html', /hub-handbook\.html#rush-setpieces/) && read('handbook.js').includes('id="${mode}-${k}"') && read('handbook.js').includes("['setpieces'"));
t('stats.html links leaders.html#goals, #assists and #rating', ['goals', 'assists', 'rating'].every((k) => has('stats.html', new RegExp(`leaders\\.html#${k}"`))));
done();
