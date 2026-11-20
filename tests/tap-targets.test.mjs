// PF-029: tap areas reach 44 px without changing the look, and a double press is ignored.
import fs from 'node:fs';
import vm from 'node:vm';
let fail = 0;
const t = (n, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; };
const css = fs.readFileSync('next/static/tap.css', 'utf8');
const js = fs.readFileSync('next/static/tap.js', 'utf8');
const ui = fs.readFileSync('next/lib/ui.mjs', 'utf8');
t('tap.css is linked on every page head', ui.includes('href="tap.css"'));
t('tap.js is linked on every page head', ui.includes('src="tap.js"'));
t('hit area is an invisible ::after, only grown when the control is under 44 px', /::after/.test(css) && /min\(0px, calc\(\(44px - 100%\) \/ -2\)\)/.test(css) && /transparent/.test(css));
for (const c of ['button.chip', 'button.rchip', 'button.ftb', 'button.hdr-s', 'button.hdr-i', 'a.srow', 'button.pc-marker', 'a.on', 'nav.sub a'])
  t(`covers ${c}`, css.includes(c));
t('scoped to phones and touch', /@media \(max-width: 820px\), \(pointer: coarse\)/.test(css));
t('no NOREX name or red in tap files', !/norex|c8352c/i.test(css + js));
// double-press guard, run in a tiny fake DOM
const mk = (cls, attrs = {}) => ({ nodeType: 1, tagName: 'BUTTON', className: cls, _a: { ...attrs },
  hasAttribute(k) { return k in this._a; }, getAttribute(k) { return this._a[k]; },
  setAttribute(k, v) { this._a[k] = v; }, removeAttribute(k) { delete this._a[k]; }, closest() { return this; } });
let handler; const timers = [];
const ctx = { document: { addEventListener: (_, f) => { handler = f; } }, window: {}, setTimeout: (f) => timers.push(f) };
vm.runInNewContext(js, ctx);
const press = (b) => { let stopped = false; handler({ target: b, stopImmediatePropagation() { stopped = true; }, preventDefault() {} }); return stopped; };
const save = mk('btn');
t('first press goes through and marks the button busy', !press(save) && save.getAttribute('aria-busy') === 'true');
t('second press inside the window is ignored', press(save) === true);
timers.forEach((f) => f());
t('button is free again after the window', !press(save));
t('toggles (chips, tabs, pressed) are never blocked', !press(mk('chip')) && !press(mk('chip')) && !press(mk('x', { 'aria-pressed': 'false' })) && !press(mk('x', { 'aria-pressed': 'false' })));
process.exit(fail ? 1 : 0);
