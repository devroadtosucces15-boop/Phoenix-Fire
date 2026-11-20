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
// PF-047: the grown area sits above a later sibling, and no control opts out of it (the mosaic clean-sheet dot moved to ::before)
const widgets = fs.readFileSync('next/static/widgets.css', 'utf8');
t('hit area is raised so a later section cannot cover it', /::after\s*\{[^}]*z-index:\s*1/.test(css));
t('no control is excluded from the hit area', !/:not\(\.cs\)/.test(css));
t('result mosaic clean-sheet dot uses ::before, leaving ::after to the hit area', /\.mosaic \.cs:before/.test(widgets) && !/\.mosaic \.cs:after/.test(widgets));
for (const c of ['a.W', 'a.D', 'a.L', 'a.fo', 'a.fd', 'a.srow']) t(`covers ${c}`, css.includes(c));
const re = fs.readFileSync('tools/effects/reaudit.mjs', 'utf8');
t('reaudit measures the real hit area, the box count and covered controls', /hitOk/.test(re) && /return \{ box, covered/.test(re) && /covered/.test(re));
t('mosaic tiles keep their hit area inside half the gap (no stolen taps)', /\.wx \.mosaic a::after\s*\{\s*inset:\s*-2px/.test(css));
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
