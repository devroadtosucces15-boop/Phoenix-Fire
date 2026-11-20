// PF-034: menu keys (Esc, outside tap, arrows, focus return). Runs next/static/menus.js key maths and checks the wiring (no browser needed).
import fs from 'node:fs';
import vm from 'node:vm';
import { t, done } from './lib.mjs';

const rd = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = rd('next/static/menus.js'), ui = rd('next/lib/ui.mjs'), hdr = rd('next/static/header.js');
t('menus.js is linked on every page head', ui.includes('src="menus.js"'));
t('no look change: menus.js adds no style rules', !/\.style\b|createElement\('style'\)|insertRule/.test(src));
t('no NOREX name or colour in menus.js', !/norex|c8352c/i.test(src));
t('Esc, outside click, arrows and focus return are all handled', ['Escape', 'ArrowDown', 'ArrowUp', "'click'", 'focus('].every((s) => src.includes(s)));
t('closing goes through the opener click (menu state stays in the menu code)', /m\.t\.click\(\)/.test(src));

const ctx = { document: { addEventListener() {}, readyState: 'complete', body: {} }, window: {}, MutationObserver: class { observe() {} }, setTimeout };
ctx.window = ctx;
vm.runInNewContext(src, ctx);
const M = ctx.PhoenixMenus;
t('ArrowDown goes forward and wraps', M.step('ArrowDown', 0, 3) === 1 && M.step('ArrowDown', 2, 3) === 0);
t('ArrowUp goes back and wraps', M.step('ArrowUp', 0, 3) === 2 && M.step('ArrowUp', 2, 3) === 1);
t('first ArrowDown from nothing lands on the first item, ArrowUp on the last', M.step('ArrowDown', -1, 4) === 0 && M.step('ArrowUp', -1, 4) === 3);
t('Home and End', M.step('Home', 2, 4) === 0 && M.step('End', 0, 4) === 3);
t('other keys are left alone', ['Tab', 'Enter', ' ', 'a', 'ArrowLeft', 'ArrowRight'].every((k) => M.step(k, 1, 3) === -1));
t('empty menu handles no keys', M.step('Home', 0, 0) === -1);

// every pop-up trigger in the shared header has a panel mapping
const triggers = ['ac', 'hdr-bell'], navs = ['nv-fab', 'dk-ring', 'ofab-btn'];
t('account and bell triggers are mapped to their panels', triggers.every((c) => M.PANELS[c]) && hdr.includes("'ac'") && hdr.includes('hdr-bellp'));
t('nav, dock and owner-tools triggers are mapped', navs.every((c) => M.PANELS[c]));
t('triggers keep aria-haspopup and aria-expanded', M.TRIGGERS.includes('aria-haspopup') && M.TRIGGERS.includes('aria-expanded'));
done();
