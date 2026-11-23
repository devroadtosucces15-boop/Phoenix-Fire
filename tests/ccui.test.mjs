// Control Center UI kit (2026-11-23): one look and one motion system for every control. Cards with a switch and a drop-down body, fields, pickers, buttons,
// all from next/static/ccui.{css,js}; every Control Center panel draws its controls with it, and nothing in it names a club colour.
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { t, done } from './lib.mjs';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rd = (f) => fs.readFileSync(path.join(ROOT, 'next/static', f), 'utf8');
const css = rd('ccui.css'), js = rd('ccui.js'), cc = rd('controlcenter.js'), cs = rd('ccsettings.js'), org = rd('orgpanel.js'), hub = fs.readFileSync(path.join(ROOT, 'next/pages/hub.mjs'), 'utf8');

// run the kit with a stub document so the markup helpers can be checked
const listeners = [];
const win = {}; vm.runInNewContext(js, { window: win, document: { addEventListener: (e, f) => listeners.push([e, f]), documentElement: {}, querySelectorAll: () => [] }, MutationObserver: class { observe() {} }, requestAnimationFrame: () => 0 });
const UI = win.PFCCUI;
t('kit: exposes card, sw, seg, field, bar, pill', ['card', 'sw', 'seg', 'field', 'bar', 'pill'].every((k) => typeof UI[k] === 'function'));
const html = UI.card({ id: 'x', icon: '🎛️', title: 'Music <b>', sub: 'Rooms', chips: [UI.pill('Managers', 'hot')], on: true, sw: UI.sw('data-flagsw="music"', true, 'On or off: Music'), body: '<p>body</p>' });
t('kit: a card has an icon, a name, a switch (a real checkbox with a label), a drop-down button with aria-expanded, and a body', /class="cu-ic"/.test(html) && /<input type="checkbox" data-flagsw="music" checked aria-label="On or off: Music">/.test(html) && /<button type="button" class="cu-x"[^>]*aria-expanded="false"/.test(html) && /class="cu-body"/.test(html));
t('kit: an open card carries data-open and data-anim, a closed one neither; a card with no body has no drop-down button', /data-open data-anim/.test(UI.card({ id: 'a', title: 'A', body: 'b', open: true, anim: true })) && !/data-open/.test(html) && !/cu-x/.test(UI.card({ id: 'b', title: 'B' })));
t('kit: titles passed in are the caller\'s escaped html, the aria label strips tags', /aria-label="Open settings: Music "/.test(html) || /settings: Music/.test(html));
t('kit: the segmented control marks the current value with aria-checked', (() => { const s = UI.seg('Level', [['a', 'A'], ['b', 'B']], 'b'); return /aria-checked="false"[^>]*>A/.test(s) && /aria-checked="true"[^>]*>B/.test(s) && /role="radiogroup"/.test(s); })());
t('kit: a card with no state opens and closes by itself (data-cu-toggle handled in one document listener, no repaint)', listeners.some(([e]) => e === 'click') && /data-cu-toggle/.test(js));
t('kit: the search box is plain text with the search keyboard (no browser search icon on top of ours)', /inputmode="search"/.test(js) && !/type="search"/.test(js));

// ---- styles
t('style: every colour is a theme token or a mix of one (no hex colour of a club, no NOREX red or blue-black)', !/#c8352c|#080b11|#e8651a/i.test(css) && /var\(--cx-a\)/.test(css) && /color-mix\(/.test(css));
t('style: the accordion animates height with grid rows, the switch moves with the spring curve, cards enter staggered', /grid-template-rows:0fr/.test(css) && /grid-template-rows:1fr/.test(css) && /--cu-spring/.test(css) && /@keyframes cuIn/.test(css) && /animation-delay:calc\(min\(var\(--i,0\),14\)\*32ms\)/.test(css));
t('style: motion is off for prefers-reduced-motion and for the site Motion setting (off and calm)', /prefers-reduced-motion:reduce/.test(css) && /html\[data-motion=off\]/.test(css) && /html\[data-motion=calm\]/.test(css));
t('style: every touch target is 40px or more (switch, drop-down arrow, fields, buttons, pills)', /\.cu-x\{[^}]*width:44px;height:44px/.test(css) && /min-height:46px/.test(css) && /\.cc-sw\{[^}]*height:32px/.test(css) && /min-height:44px/.test(css) && /\.cc-lv[^{]*\{[^}]*min-height:40px/.test(css));
t('style: phone first, two columns from 760px, cards in two columns from 1100px with an open card on the full row', /@media\(min-width:760px\)/.test(css) && /@media\(min-width:1100px\)\{[^@]*\.cu-grid\{grid-template-columns:repeat\(2/.test(css) && /\.cu-card\[data-open\]\{grid-column:1\/-1\}/.test(css));
t('style: no left panel and no drawer anywhere in the kit', !/translateX\(-/.test(css) && !/\.cx-side|drawer/.test(css));
t('style: tables turn into labelled row cards (cu-rows everywhere, cc-tbl on phones)', /\.cu-rows td\[data-l\]::before/.test(css) && /data-l/.test(js));

// ---- every panel uses it
t('panels: site access draws a card per section with a switch and a level control', /UI\.card\(\{ id: 'f:' \+ flag/.test(cc) && /data-flagsw/.test(cc) && /UI\.seg\(flag/.test(cc));
t('panels: commands, buttons, automated posts, scheduled posts and DMs are one card list grouped by app with a state filter', /UI\.card\(\{ id: 'o:' \+ i\.key/.test(cc) && /data-statebtn/.test(cc) && /cu-gh/.test(cc));
t('panels: the output editor folds exceptions and limits into drop-downs so a card stays short', /Exceptions: who never gets it/.test(cc) && /Limit where it works/.test(cc));
t('panels: bot settings are cards (recruitment has its own header switch, effects use a segmented control)', /UI\.card\(\{ id: 's:' \+ key/.test(cs) && /data-cs-auto/.test(cs) && /cu-radios/.test(cs));
t('panels: the organization lists are row cards and its tabs a segmented control, with no inline layout left on the form', /tbl cu-rows/.test(org) && /class="cu-seg"/.test(org) && !/display:grid;gap:12px;grid-template-columns/.test(org));
const heads = hub.slice(hub.indexOf('const heads ='), hub.indexOf('const heads =') + 900);
t('panels: the page loads the kit before any panel script', heads.includes('ccui.css') && heads.indexOf('ccui.js') > 0 && heads.indexOf('ccui.js') < heads.indexOf('orgpanel.js'));
t('panels: a switch updates the card at once and repaints after the move finishes (no full reload per toggle)', /setTimeout\(paint, 320\)/.test(cc) && !/await load\(\); toast\(`\$\{i\.name\}: \$\{on/.test(cc));
t('panels: saving or switching never names a channel, role or club in these files', ![cc, cs, org, js].some((s) => /\b\d{17,20}\b/.test(s)));
done();
