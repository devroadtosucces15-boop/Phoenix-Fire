// PF-040: dialogs (next/static/dialogs.js + dialogs.css). One behaviour for every pop-up: focus trap, Esc, Back closes, focus returns,
// bottom sheet with a grab handle on phones, and one Phoenix-themed dialog + confirm for new code.
import fs from 'node:fs';
import vm from 'node:vm';
import { t, done } from './lib.mjs';

const rd = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = rd('next/static/dialogs.js'), css = rd('next/static/dialogs.css'), ui = rd('next/lib/ui.mjs');
t('dialogs.js and dialogs.css are linked on every page head', ui.includes('src="dialogs.js"') && ui.includes('href="dialogs.css"'));
t('no NOREX name or colour in the dialogs files', !/norex|c8352c|080b11/i.test(src + css));
t('dialogs use the Phoenix accent', css.includes('#e8651a'));
t('a grab handle shows at phone width and a bottom sheet is styled', /@media\(max-width:820px\)\{\s*\.ph-grab\{display:block\}/.test(css) && css.includes('phSheetIn') && css.includes('.br-modal{align-items:end'));
t('tap areas are 44 px', /\.ph-dialog-x\{[^}]*min-width:44px;min-height:44px/.test(css) && /\.ph-dialog-btn\{min-height:44px/.test(css));
t('Back is wired (pushState and popstate) and Esc and Tab are handled', src.includes('pushState') && src.includes("'popstate'") && src.includes("'Escape'") && src.includes("'Tab'"));
t('text is set as text, never as html, in confirm', !/msg\s*\)?\s*;?\s*[^;]*innerHTML/.test(src.split('function confirm')[1] || ''));

const body = { isConnected: true, nodeType: 1 };
const ctx = { document: { body, addEventListener() {}, createElement: () => ({}) }, window: { addEventListener() {} }, history: {}, MutationObserver: class { observe() {} }, setTimeout, Promise, Array };
ctx.window.document = ctx.document; vm.runInNewContext(src, ctx);
const D = ctx.window.PhoenixDialog;
t('Tab wraps forward from the last item to the first', D.trapIndex(2, 3, false) === 0);
t('Shift+Tab wraps backward from the first item to the last', D.trapIndex(0, 3, true) === 2);
t('Tab steps normally in the middle', D.trapIndex(0, 3, false) === 1 && D.trapIndex(2, 3, true) === 1);
t('focus from outside lands on the first (or last with Shift)', D.trapIndex(-1, 3, false) === 0 && D.trapIndex(-1, 3, true) === 2);
t('a dialog with nothing focusable returns -1', D.trapIndex(-1, 0, false) === -1);
t('a long or fast drag down closes a sheet, a tap or small nudge does not', D.dragCloses(120, 600) && D.dragCloses(50, 60) && !D.dragCloses(10, 50) && !D.dragCloses(40, 800));

// existing dialog code is adopted, not rewritten: every known dialog class is in the adopt list
const sel = /var SEL = '([^']+)'/.exec(src)[1];
for (const c of ['.mx-sheet', '.br-modal', '.wtp-modal', '#awardfx', '.cx-drawer', '[role=dialog][aria-modal=true]']) t('adopts ' + c, sel.includes(c));
done();
