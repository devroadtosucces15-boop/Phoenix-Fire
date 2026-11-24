// Theme Studio (2026-11-24): the owner's one saved look for the whole site. The Worker side cleans and stores it, every page loads it,
// and the owner edits it live from a floating button on any page (any number of motions, three looks per component, a look per page and sub-menu).
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { t, done } from './lib.mjs';
import * as B from '../bot/themestudio.js';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const loader = rd('next/static/themestudio.js'), editor = rd('next/static/themeeditor.js'), css = rd('next/static/themestudio.css') + '\n' + rd('next/static/upgrades.css'), ecss = rd('next/static/themeeditor.css');
const ui = rd('next/lib/ui.mjs'), cs = rd('bot/ccsettings.js'), mem = rd('bot/members.js'), ccs = rd('next/static/ccsettings.js');

// ---- the Worker cleaner
t('worker: a good look is kept (colours lower-cased, fonts and numbers in range, a = standard dropped, motions and off lists kept)', (() => {
  const r = B.cleanTheme({ scopes: { '*': { tokens: { accent: '#AABBCC', fontDisplay: 'Oswald', radius: 12 }, variants: { button: 'b', card: 'a' }, off: ['glow'], motion: ['hover-lift'] } } });
  const s = r.scopes['*']; return !r.error && s.tokens.accent === '#aabbcc' && s.tokens.fontDisplay === 'Oswald' && s.tokens.radius === 12 && s.variants.button === 'b' && !('card' in s.variants) && s.off[0] === 'glow' && s.motion[0] === 'hover-lift';
})());
t('worker: a bad colour, font, number or look is refused with a plain message', ['accent', 'fontBody', 'radius', 'button'].every((k) => {
  const bad = { accent: { tokens: { accent: 'red' } }, fontBody: { tokens: { fontBody: 'Comic Sans' } }, radius: { tokens: { radius: 999 } }, button: { variants: { button: 'z' } } }[k];
  return !!B.cleanTheme({ scopes: { '*': bad } }).error;
}));
t('worker: unknown tokens, components, aspects and motions are dropped, not saved', (() => { const s = B.cleanTheme({ scopes: { '*': { tokens: { evil: '#000000', accent: '#112233' }, variants: { nope: 'b' }, off: ['nope', 'glow'], motion: ['x', 'idle-ping'] } } }).scopes['*']; return !('evil' in s.tokens) && s.off.join() === 'glow' && s.motion.join() === 'idle-ping' && !Object.keys(s.variants).length; })());
t('worker: no limit on motions or switched-off aspects (the whole catalogue can be on at once)', (() => { const s = B.cleanTheme({ scopes: { '*': { motion: B.MOTION, off: B.OFF } } }).scopes['*']; return s.motion.length === B.MOTION.length && s.off.length === B.OFF.length && B.MOTION.length >= 20; })());
t('worker: scope names are "*", page:<slug> or page:<slug>#<sub>; anything else is refused; empty scopes are dropped', !B.cleanTheme({ scopes: { 'page:Squad!': { tokens: { accent: '#112233' } } } }).error === false && Object.keys(B.cleanTheme({ scopes: { 'page:squad#stats': { tokens: { accent: '#112233' } }, 'page:hall': {} } }).scopes).join() === 'page:squad#stats');
t('worker: the owner saves it through the settings area "theme" (owner level), and everyone reads GET /api/site/theme without a key', /theme: \(b\) => cleanTheme\(b\)/.test(cs) && /owner: \['bot', 'effects', 'theme'\]/.test(cs) && /themePublicRoute/.test(mem) && /'\/api\/site\/theme'/.test(mem) && /max-age=60/.test(cs));

// ---- the browser catalogue matches the Worker
const win = {}; const attrs = new Map(); const vars = new Map();
const H = { style: { setProperty: (k, v) => vars.set(k, v), removeProperty: (k) => vars.delete(k) }, get attributes() { return [...attrs.keys()].map((name) => ({ name })); }, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) };
const store = new Map();
const ctx = { window: win, document: { documentElement: H, readyState: 'complete', head: { appendChild() {} }, createElement: () => ({}), addEventListener() {}, querySelector: () => null }, location: { pathname: '/squad.html', hash: '#Stats', search: '' }, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, addEventListener() {}, dispatchEvent() {}, CustomEvent: class { constructor(n, o) { Object.assign(this, o); } }, fetch: () => Promise.reject(new Error('x')), URLSearchParams };
vm.createContext(ctx); vm.runInContext(loader, ctx);
const T = win.PFTheme, CAT = T.CAT;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
t('browser: the catalogue equals the Worker one (colours, fonts, numbers, components, aspects, motions)', same(CAT.COLOR_TOKENS, B.COLOR_TOKENS) && same(CAT.FONTS, B.FONTS) && same(CAT.FONT_TOKENS, B.FONT_TOKENS) && same(CAT.NUM_TOKENS, B.NUM_TOKENS) && same(CAT.COMPONENTS, B.COMPONENTS) && same(CAT.OFF, B.OFF) && same(CAT.MOTION, B.MOTION));
t('browser: a page look = everywhere, then the page, then the sub-menu (the hash), each only overriding what it sets', (() => {
  const k = T.scopeKeys(); const m = T.merge({ scopes: { '*': { tokens: { accent: '#111111', radius: 8 }, off: ['glow'], motion: ['hover-lift'] }, 'page:squad': { tokens: { accent: '#222222' }, motion: ['idle-ping'] }, 'page:squad#stats': { variants: { button: 'c' }, off: ['shine'] } } }, k);
  return k.join() === '*,page:squad,page:squad#stats' && m.tokens.accent === '#222222' && m.tokens.radius === 8 && m.variants.button === 'c' && m.off.join() === 'glow,shine' && m.motion.join() === 'hover-lift,idle-ping';
})());
t('browser: applying a look sets the site variables, the data-st attributes, the look per component, and the switched-off and motion lists', (() => {
  T.set({ scopes: { '*': { tokens: { accent: '#123456', glow: '#654321', radius: 14, fontDisplay: 'Oswald' }, variants: { card: 'b', dock: 'c' }, off: ['glow', 'embers'], motion: ['page-fade', 'hover-lift', 'idle-ping'] } } }, { save: true });
  return vars.get('--red') === '#123456' && vars.get('--redg') === '#654321' && vars.get('--r') === '14px' && attrs.get('data-st-card') === 'b' && attrs.get('data-st-dock') === 'c' && attrs.get('data-st-off') === 'glow embers' && attrs.get('data-st-motion') === 'page-fade hover-lift idle-ping' && attrs.has('data-st-fd');
})());
t('browser: clearing the look removes every variable and attribute it set (nothing sticks to the page)', (() => { T.set({ scopes: {} }); return !vars.size && ![...attrs.keys()].some((a) => a.startsWith('data-st-')); })());
t('browser: the saved look is cached for the next paint and read from the public route', /phoenix\.themestudio/.test(loader) && /\/api\/site\/theme/.test(loader) && /credentials: 'omit'/.test(loader) && store.has('phoenix.themestudio'));

// ---- the styles: every component has looks b and c; every switch-off and motion has a rule; nothing applies until something is set
t('style: every component has a look b and a look c', B.COMPONENTS.every((c) => new RegExp(`data-st-${c}=b`).test(css) && new RegExp(`data-st-${c}=c`).test(css)));
t('style: every aspect that can be switched off has a rule', B.OFF.every((o) => new RegExp(`data-st-off~=${o}\\]`).test(css)));
t('style: every motion has a rule, and motion is off for reduced motion and the site Motion setting', B.MOTION.every((m) => new RegExp(`data-st-motion~=${m}\\]`).test(css)) && /prefers-reduced-motion:reduce/.test(css) && /html\[data-motion=off\]\[data-st-motion\]/.test(css));
t('style: with no saved look the site is unchanged (every rule hangs on a data-st attribute)', css.split('\n').filter((l) => /\{/.test(l) && !/^\s*(@|\/\*|\})/.test(l)).every((l) => /data-st-/.test(l)));
t('style: no club colour is written into the studio files (colours come from the owner or the site variables)', ![css, ecss, loader, editor].some((s) => /#c8352c|#080b11|#e8651a/i.test(s)));

// ---- the editor
const ewin = {}; vm.runInNewContext(editor, { window: ewin, document: { querySelector: () => null, createElement: () => ({}), addEventListener() {} }, addEventListener() {} });
const E = ewin.PFThemeEditor;
t('editor: three looks for each of the 12 components, named', B.COMPONENTS.every((c) => E.COMP[c] && E.COMP[c][1].length === 3));
t('editor: every aspect and every motion the Worker knows is offered, grouped (page, entrance, hover, press, idle)', B.OFF.every((o) => o in E.OFF) && B.MOTION.every((m) => Object.values(E.MOT).flat().includes(m)) && Object.keys(E.MOT).join() === 'Page,Entrance,Hover,Press,Idle');
t('editor: button text colour is picked for contrast (dark on light, white on dark)', E.readable('#f5f5f5') === '#101010' && E.readable('#102030') === '#ffffff');
t('editor: owner only (not for managers, members, guests or the owner previewing as someone else)', /A\.role !== 'owner'/.test(editor) && /A\.viewAs/.test(editor) && /!A\.token/.test(editor));
t('editor: saves through the settings area and refreshes the cache; the core effects save through their own area', /settings\/theme/.test(editor) && /settings\/effects/.test(editor) && /T\.set\(S\.draft, \{ save: true \}\)/.test(editor));
t('editor: a bottom sheet from a floating button with its own logo, never a left panel; every control is 40px or more', /\.tse-panel\{[^}]*bottom:0/.test(ecss) && !/translateX\(-/.test(ecss) && /<svg viewBox="0 0 48 48"/.test(editor) && /min-height:38px|min-height:40px|min-height:42px|min-height:44px/.test(ecss));
t('editor: scope choice (everywhere, this page, this sub-menu) and a reset for each', /This page/.test(editor) && /This sub-menu/.test(editor) && /data-resetscope/.test(editor));

// ---- the upgrade pack (animation lab upgrades offered as look b and c)
const up = rd('next/static/upgrades.js'), upc = rd('next/static/upgrades.css');
const uw = {}; const mkEl = () => ({ style: { setProperty() {}, removeProperty() {} }, dataset: {}, classList: { add() {}, remove() {} }, addEventListener() {}, insertAdjacentHTML() {}, querySelectorAll: () => [] });
vm.runInNewContext(up, { window: uw, document: { documentElement: { getAttribute: () => '', dataset: {} }, addEventListener() {}, querySelectorAll: () => [] }, matchMedia: () => ({ matches: false }), MutationObserver: class { observe() {} }, requestAnimationFrame: () => 0, performance: { now: () => 0 }, addEventListener() {}, removeEventListener() {}, innerHeight: 800, navigator: {} });
const U = uw.PFUpgrades;
t('upgrades: the card rig is the lab\'s spring (stiffness 170 / damping 16 lean, 140 / 14 drag) and settles on its target', /170/.test(up) && /\* 140 - /.test(up) && (() => { const s = U.mk(); s.tx = 0.8; s.ty = -0.4; for (let i = 0; i < 240; i++) U.step(s, 1 / 60); return Math.abs(s.x - 0.8) < 0.01 && Math.abs(s.y + 0.4) < 0.01 && Math.abs(s.vx) < 0.01; })());
t('upgrades: the card keeps its crest top-right, its avatar (or silhouette), the tier colours and gets small dim stats with room between them', /\.crestm/.test(upc) && /\.stats\{opacity:\.66/.test(upc) && /gap:calc\(var\(--s\)\*7px\) 0/.test(upc) && /t-silver\{--upg/.test(upc) && /dark\{--upg/.test(upc));
t('upgrades: the layers are the lab\'s (foil, soft highlight, breathing glow, sweeping shine, moving shadow) each reading the one tilt value', ['up-foil', 'up-spec', 'up-glow', 'up-shine', 'up-shadow', 'up-sweep'].every((c) => upc.includes(c)) && /--sx/.test(upc) && /--mag/.test(upc) && /3\.2s/.test(upc) && /4\.2s/.test(upc));
t('upgrades: a card is still a link (a tap follows it, a drag of 6px or more does not) and vertical scrolling still works', /s\.moved >= 6/.test(up) && /touch-action:pan-y/.test(upc) && /preventDefault/.test(up));
t('upgrades: quiet (c) leans less and drops the foil colours; the buttons ripple only in b', /--upk:\.5/.test(upc) && /0\.55 : 1/.test(up) && /=== 'b'/.test(up) && /data-st-buttonfx=c\] \.btn:after/.test(upc));
t('upgrades: loaded after the studio on every page', ui.indexOf('upgrades.css') > ui.indexOf('themestudio.css') && /upgrades\.js/.test(ui));

// ---- wiring
t('pages: every page loads the look in <head> before paint and the editor after the owner button', /themestudio\.css/.test(ui) && /themeeditor\.css/.test(ui) && ui.indexOf('themestudio.js') < ui.indexOf('fxconfig.js') && ui.indexOf('themeeditor.js') > ui.indexOf('ownerfab.js'));
t('control center: the effects card moved into the studio (Control Center no longer draws it)', !/'streams', 'effects', 'points'\]/.test(ccs));
done();
