// PF-035: shared tooltip (next/static/tooltip.js + tooltip.css). Runs the pure helpers in a fake DOM and checks the wiring and the Phoenix look.
import fs from 'node:fs';
import vm from 'node:vm';
import { t, done } from './lib.mjs';

const rd = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = rd('next/static/tooltip.js'), css = rd('next/static/tooltip.css'), ui = rd('next/lib/ui.mjs');
t('tooltip.js and tooltip.css are linked on every page head', ui.includes('src="tooltip.js"') && ui.includes('href="tooltip.css"'));
t('no NOREX name or colour in the tooltip files', !/norex|c8352c|080b11/i.test(src + css));
t('tooltip border uses the Phoenix accent token, not a hard-coded colour', /border:1px solid var\(--red\)/.test(css) && !/#[0-9a-f]{3,6}\b/i.test(css.replace(/var\([^)]*#[0-9a-f]{3,6}\)/gi, '').replace(/rgba?\([^)]*\)/g, '')));
t('hover, keyboard focus and Esc are all handled', ['pointerover', 'focusin', 'Escape'].every((s) => src.includes(s)));
t('touch never shows it (no blocking taps)', /pointerType === 'touch'/.test(src) && /pointer:coarse/.test(css));
t('role=tooltip and aria-describedby while shown', src.includes("'role', 'tooltip'") && src.includes('aria-describedby'));

class El {
  constructor(attrs = {}, text = '') { this.a = { ...attrs }; this.textContent = text; this.nodeType = 1; }
  getAttribute(n) { return n in this.a ? this.a[n] : null; }
  setAttribute(n, v) { this.a[n] = String(v); }
  hasAttribute(n) { return n in this.a; }
  removeAttribute(n) { delete this.a[n]; }
}
const ctx = { document: { addEventListener() {}, readyState: 'complete' }, window: { addEventListener() {} }, setTimeout, clearTimeout };
vm.runInNewContext(src, ctx);
const T = ctx.window.PhoenixTip;

t('textOf reads data-tip, then the adopted title', T.textOf(new El({ 'data-tip': ' Hello  there ' })) === 'Hello there' && T.textOf(new El({ 'data-tip-title': 'Moved' })) === 'Moved' && T.textOf(new El()) === '');
{
  const icon = new El({ title: 'Open menu' }); T.adopt(icon);
  t('adopt moves title off (no native pop-up) and keeps a name for icon-only controls', !icon.hasAttribute('title') && icon.a['data-tip-title'] === 'Open menu' && icon.a['aria-label'] === 'Open menu');
  const withText = new El({ title: 'More' }, 'Save'); T.adopt(withText);
  t('a control with visible text keeps its own name', !withText.hasAttribute('aria-label') && withText.a['data-tip-title'] === 'More');
  const named = new El({ title: 'x', 'aria-label': 'Named' }); T.adopt(named);
  t('an existing aria-label is never replaced', named.a['aria-label'] === 'Named');
}
t('key hint from data-key or aria-keyshortcuts', T.keyOf(new El({ 'data-key': 'g' })) === 'g' && T.keyOf(new El({ 'aria-keyshortcuts': 'Control+K' })) === 'Control + K' && T.keyOf(new El()) === '');
const vp = [1000, 700];
{
  const mid = T.place({ left: 400, top: 300, width: 100, height: 30, bottom: 330 }, 120, 30, ...vp);
  t('placed above and centred by default', mid.above && mid.x === 390 && mid.y === 260);
  const top = T.place({ left: 400, top: 10, width: 100, height: 30, bottom: 40 }, 120, 30, ...vp);
  t('flips below when there is no room above', !top.above && top.y === 50);
  const edge = T.place({ left: 0, top: 300, width: 20, height: 20, bottom: 320 }, 200, 30, ...vp);
  const right = T.place({ left: 990, top: 300, width: 10, height: 20, bottom: 320 }, 200, 30, ...vp);
  t('clamped inside both side edges', edge.x === 8 && right.x === 1000 - 200 - 8);
}
done();
