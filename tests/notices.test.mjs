// PF-039: notices (next/static/notices.js + notices.css). One queue, stacked up to 3, errors stay, Undo, progress line, Phoenix look.
import fs from 'node:fs';
import vm from 'node:vm';
import { t, done } from './lib.mjs';

const rd = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = rd('next/static/notices.js'), css = rd('next/static/notices.css'), ui = rd('next/lib/ui.mjs'), motion = rd('next/static/motion.js'), mcss = rd('next/static/motion.css');
t('notices.js and notices.css are linked on every page head', ui.includes('src="notices.js"') && ui.includes('href="notices.css"'));
t('no NOREX name or colour in the notices files', !/norex|c8352c|080b11/i.test(src + css));
t('notices use the Phoenix accent and 12 px corners', css.includes('#e8651a') && /\.ph-notice\{[^}]*border-radius:12px/.test(css));
t('a progress line and an Undo button are styled', css.includes('.ph-n-bar') && css.includes('phNoticeBar') && css.includes('.ph-n-undo'));
t('tap areas are 44 px', /\.ph-n-undo,\.ph-n-x\{[^}]*min-width:44px;min-height:44px/.test(css));
t('NorexMotion.toast delegates to the one queue', /M\.toast = .*PhoenixNotices\.show/.test(motion) && !/mx-toasts/.test(motion + mcss));
const wrappers = fs.readdirSync(new URL('../next/static/', import.meta.url)).filter((f) => f.endsWith('.js')).filter((f) => /const toast = \(m, err\) => M\?\.toast \?/.test(rd('next/static/' + f)));
t('the identical toast wrappers are gone', wrappers.length === 0, wrappers.join());

class El {
  constructor(tag) { this.tagName = tag; this.kids = []; this.a = {}; this.style = {}; this.ls = {}; this.className = ''; this.isConnected = true; this.parent = null; this.classList = { add: (c) => { this.className += ' ' + c; }, contains: (c) => this.className.split(/\s+/).includes(c) }; }
  appendChild(c) { c.parent = this; this.kids.push(c); return c; }
  setAttribute(n, v) { this.a[n] = v; } addEventListener(n, f) { this.ls[n] = f; }
  remove() { if (this.parent) this.parent.kids = this.parent.kids.filter((k) => k !== this); }
  get offsetWidth() { return 1; }
}
const body = new El('body'), doc = { body, createElement: (x) => new El(x) };
let now = 0; const timers = [];
const ctx = { document: doc, window: {}, setTimeout: (f, ms) => { timers.push({ f, at: now + ms }); return timers.length; }, clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].f = null; }, Date: { now: () => now }, Object, String, Math, Array };
vm.runInNewContext(src, ctx);
const N = ctx.window.PhoenixNotices, box = () => body.kids[0];
const tick = (ms) => { now += ms; timers.filter((x) => x.f && x.at <= now).forEach((x) => { const f = x.f; x.f = null; f(); }); };
const shown = () => box().kids.filter((k) => !k.classList.contains('ph-out')).length;
N.ok('one'); N.ok('two'); N.ok('three'); N.ok('four');
t('at most 3 notices show at once, the 4th waits', shown() === 3 && N.count() === 3);
tick(4100); tick(300);
t('a waiting notice appears when one leaves', N.count() === 1 && shown() === 1 && box().kids.some((k) => k.kids[1].textContent === 'four'));
tick(5000); tick(300);
t('notices leave on their own after about 4 s', shown() === 0);
N.err('Save failed');
tick(60000);
t('an error stays until dismissed', shown() === 1 && !box().kids[0].kids.some((k) => k.className === 'ph-n-bar'));
t('an error is announced as an alert', box().kids[0].a.role === 'alert');
const x = box().kids[0].kids.find((k) => k.className === 'ph-n-x'); x.ls.click ? 0 : 0; x.onclick({ stopPropagation() {} }); tick(300);
t('the close button dismisses it', shown() === 0);
let undone = 0; N.ok('Removed', { undo: () => undone++ });
const u = box().kids[0].kids.find((k) => k.className === 'ph-n-undo');
t('an Undo button shows and a progress line counts down', !!u && box().kids[0].kids.some((k) => k.className === 'ph-n-bar'));
u.onclick({ stopPropagation() {} }); tick(300);
t('Undo runs the callback and closes the notice', undone === 1 && shown() === 0);
N.ok('Same'); N.ok('Same');
t('an identical notice is not stacked twice', shown() === 1);
t('messages are set as text, never as html', !/innerHTML/.test(src));
done();
