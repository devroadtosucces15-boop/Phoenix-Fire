// PF-036: loading and empty states (next/static/states.js + states.css). Placeholders keep the content's shape, busy regions say aria-busy, empty states give a reason and one action.
import fs from 'node:fs';
import vm from 'node:vm';
import { t, done } from './lib.mjs';

const rd = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = rd('next/static/states.js'), css = rd('next/static/states.css'), ui = rd('next/lib/ui.mjs'), mo = rd('next/static/motion.js');
t('states.js and states.css are linked on every page head', ui.includes('src="states.js"') && ui.includes('href="states.css"'));
t('no NOREX name or colour in the states files', !/norex|c8352c|080b11/i.test(src + css));
t('shimmer and empty ring use the Phoenix orange, not NOREX red', /232,101,26/.test(css) && !/200,53,44/.test(css));
t('shimmer stops for reduced motion and the calm/off settings', /prefers-reduced-motion:reduce\)\{\.sk\{animation:none/.test(css) && /data-motion=off\] \.sk/.test(css));
t('M.skeleton takes a shape and writes aria-busy plus a caption', /M\.skeleton = \(el, rows = 3, shape = 'line'\)/.test(mo) && mo.includes("setAttribute('aria-busy', 'true')") && mo.includes('sk-cap'));
t('empty icon is bigger than the old 28px', /width:64px;height:64px;font-size:36px/.test(css));
{
  const bare = [];
  for (const f of fs.readdirSync(new URL('../next/static', import.meta.url)).filter((n) => n.endsWith('.js') && !n.includes('vendor'))) {
    if (/sq-empty"><span>⏳<\/span><div><b>Loading/.test(rd('next/static/' + f))) bare.push(f);
  }
  t('no page shows "Loading…" as an empty-state panel (use a skeleton)', bare.length === 0, bare.join(', '));
}

class El {
  constructor(tag = 'div', attrs = {}) { this.tag = tag; this.a = { ...attrs }; this.kids = []; this.className = ''; this.textContent = ''; this.href = ''; this.nodeType = 1; }
  getAttribute(n) { return n in this.a ? this.a[n] : null; }
  setAttribute(n, v) { this.a[n] = String(v); }
  hasAttribute(n) { return n in this.a; }
  appendChild(c) { this.kids.push(c); return c; }
  insertBefore(c) { this.kids.unshift(c); return c; }
  all() { return this.kids.flatMap((k) => [k, ...k.all()]); }
  querySelector(sel) {
    const list = this.all();
    if (sel === ':scope>div') return this.kids.find((k) => k.tag === 'div') || null;
    if (sel === 'p') return list.find((k) => k.tag === 'p') || null;
    if (sel === 'a[href],button') return list.find((k) => k.tag === 'button' || (k.tag === 'a' && k.href)) || null;
    if (sel === '.sk-cap') return list.find((k) => k.className === 'sk-cap') || null;
    if (sel.includes('.sk-wrap')) return list.find((k) => /sk-wrap|dg-skel|cx-skel|\bsk\b/.test(k.className)) || null;
    return null;
  }
}
const ctx = { document: { readyState: 'complete', createElement: (t) => new El(t), addEventListener() {} }, window: {}, setTimeout };
ctx.window = ctx;
vm.runInNewContext(src, ctx);
const S = ctx.PhoenixStates;

const html = S.skeletonHtml(3, 'card', 'Loading squads');
t('skeletonHtml: shape class, status role, caption, one bar per row', html.includes('sk-wrap card') && html.includes('role="status"') && html.includes('Loading squads') && (html.match(/class="sk"/g) || []).length === 3);
t('unknown shape falls back to text lines', S.shapeOf('zzz') === 'line' && S.shapeOf('row') === 'row' && S.shapeOf('table') === 'table');
{
  const e = S.emptyHtml({ icon: '🗓️', title: 'Nothing scheduled', why: 'No fixtures yet.', action: { label: 'See results', href: 'results.html' } });
  t('emptyHtml: icon, title, reason, one link action', e.includes('🗓️') && e.includes('Nothing scheduled') && e.includes('No fixtures yet.') && e.includes('href="results.html"') && (e.match(/class="btn/g) || []).length === 1);
  const e2 = S.emptyHtml({ title: '<x>' });
  t('emptyHtml escapes text and fills a default reason', e2.includes('&lt;x&gt;') && e2.includes(S.DEFAULT_WHY));
}
{
  const box = new El('div', {}); const inner = new El('div'); box.appendChild(inner); const b = new El('b'); inner.appendChild(b);
  S.fixEmpty(box);
  t('a bare empty state gets a role, a reason and one action', box.a.role === 'status' && !!inner.querySelector('p') && inner.querySelector('a[href],button')?.href === S.DEFAULT_ACTION.href && box.a['data-state-auto'] === '1');
  const n = inner.kids.length; S.fixEmpty(box);
  t('fixing twice changes nothing', inner.kids.length === n);
  const own = new El('div'); const oi = new El('div'); own.appendChild(oi); const p = new El('p'); oi.appendChild(p); const btn = new El('button'); oi.appendChild(btn);
  S.fixEmpty(own);
  t('the page’s own reason and action are kept', oi.kids.length === 2 && !own.hasAttribute('data-state-auto'));
}
{
  const r = new El('div', { 'aria-busy': 'true' }); const w = new El('div'); w.className = 'sk-wrap'; r.appendChild(w);
  t('a busy region gets a screen-reader caption', S.fixBusy(r) && r.querySelector('.sk-cap') && !S.fixBusy(r));
  t('a region that is not busy is left alone', !S.fixBusy(new El('div', { 'aria-busy': 'false' })));
}
done();
