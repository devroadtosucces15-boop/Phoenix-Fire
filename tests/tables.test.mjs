// PF-038: tables and charts (next/static/tables.js + tables.css). Centred columns except the first, captions, keyboard sort, Compare pill, number and unit on one line.
import fs from 'node:fs';
import vm from 'node:vm';
import { t, done } from './lib.mjs';

const rd = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = rd('next/static/tables.js'), css = rd('next/static/tables.css'), ui = rd('next/lib/ui.mjs');
t('tables.js and tables.css are linked on every page head', ui.includes('src="tables.js"') && ui.includes('href="tables.css"'));
t('no NOREX name or colour in the tables files', !/norex|c8352c|080b11/i.test(src + css));
t('every column except the first is centred, the first stays left', /table:not\(\.ph-left\)\)\s*:is\(th,td\):not\(:first-child\)\{text-align:center\}/.test(css) && /:is\(th,td\):first-child\{text-align:left\}/.test(css));
t('numbers and units never wrap apart', /white-space:nowrap/.test(css) && css.includes('.ph-num') && css.includes('tabular-nums'));
t('sort buttons show the state, have a visible focus ring and a 44 px tap area', css.includes('aria-sort=ascending') && css.includes('aria-sort=descending') && /\.ph-sort:focus-visible/.test(css) && /\.ph-sort\{[^}]*min-height:44px/.test(css));
t('the Compare button is a labelled pill with a 44 px tap area, no orange focus ring', css.includes('content:"Compare"') && css.includes('inset:-5px') && !/:focus[^{]*\{[^}]*(e8651a|232,101,26)/i.test(css));
t('column headers become buttons that say what they sort', src.includes("'Sort by '") && src.includes("'aria-sort'") && src.includes("'ph-sort'"));
t('every table gets a caption and scope', src.includes("createElement('caption')") && src.includes("'scope'"));

class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.nodeType = 1; this.a = {}; this.kids = []; this.parentNode = null; this.className = ''; this._t = ''; }
  setAttribute(n, v) { this.a[n] = String(v); }
  getAttribute(n) { return n in this.a ? this.a[n] : null; }
  removeAttribute(n) { delete this.a[n]; }
  hasAttribute(n) { return n in this.a; }
  appendChild(c) { if (c.parentNode) c.parentNode.kids = c.parentNode.kids.filter((k) => k !== c); c.parentNode = this; this.kids.push(c); return c; }
  insertBefore(c, ref) { c.parentNode = this; this.kids.unshift(c); return c; }
  get textContent() { return this.kids.length ? this.kids.map((k) => k.textContent).join('') : this._t; }
  set textContent(v) { this.kids = []; this._t = v; }
  get cells() { return this.kids; }
  get rows() { return this.kids; }
  get cellIndex() { return this.parentNode.kids.indexOf(this); }
  querySelector() { return null; }
  closest(sel) { let n = this; while (n) { if (sel.startsWith('.') ? n.className === sel.slice(1) : n.tagName === sel.toUpperCase()) return n; n = n.parentNode; } return null; }
}
const cell = (tag, text, attrs = {}) => { const c = new El(tag); c._t = text; Object.assign(c.a, attrs); return c; };
const row = (cells) => { const r = new El('tr'); cells.forEach((c) => r.appendChild(c)); return r; };
const make = (heads, rows) => {
  const table = new El('table'), thead = new El('thead'), tbody = new El('tbody');
  const hr = row(heads.map((h) => cell('th', h))); thead.appendChild(hr); rows.forEach((r) => tbody.appendChild(row(r.map((v) => cell('td', v)))));
  table.tHead = thead; table.tBodies = [tbody]; table.kids = [thead, tbody]; thead.parentNode = table; tbody.parentNode = table;
  table.querySelector = (s) => (s === 'caption' ? table.kids.find((k) => k.tagName === 'CAPTION') || null : null);
  table.previousElementSibling = null;
  return { table, hr, tbody };
};
const document = { readyState: 'complete', createElement: (x) => new El(x), addEventListener() {}, querySelectorAll: () => [], body: null };
const ctx = { document, window: {}, MutationObserver: undefined };
ctx.window = ctx;
vm.runInNewContext(src, ctx);
const T = ctx.PhoenixTables;

{
  const { table, hr, tbody } = make(['Player', 'Win', 'Goals'], [['Cy', '54%', '9'], ['Al', '8%', '12'], ['Bo', '—', '3']]);
  T.enhance(table);
  t('a table with no caption gets one for screen readers', table.kids[0].tagName === 'CAPTION' && table.kids[0].className === 'sr');
  t('header cells get scope=col', hr.cells.every((c) => c.a.scope === 'col'));
  t('each header holds a Sort by button', hr.cells.every((c, i) => c.kids[0] && c.kids[0].className === 'ph-sort' && c.kids[0].a['aria-label'] === 'Sort by ' + ['Player', 'Win', 'Goals'][i]));
  const th = hr.cells[2];
  T.toggle(th);
  t('a number column sorts high to low first and says descending', th.a['aria-sort'] === 'descending' && tbody.rows.map((r) => r.cells[2].textContent).join() === '12,9,3');
  T.toggle(th);
  t('a second press reverses it', th.a['aria-sort'] === 'ascending' && tbody.rows.map((r) => r.cells[2].textContent).join() === '3,9,12');
  T.toggle(hr.cells[1]);
  t('percentages sort as numbers, dashes last, and only one header has aria-sort', tbody.rows.map((r) => r.cells[1].textContent).join() === '54%,8%,—' && !th.hasAttribute('aria-sort') && hr.cells[1].a['aria-sort'] === 'descending');
  T.toggle(hr.cells[0]);
  t('a text column sorts A to Z first', hr.cells[0].a['aria-sort'] === 'ascending' && tbody.rows.map((r) => r.cells[0].textContent).join() === 'Al,Bo,Cy');
}
{
  const { table, hr } = make(['A', 'B'], [['x', '1'], ['y', '2']]); table.a['data-no-sort'] = '';
  T.enhance(table);
  t('data-no-sort leaves a table alone but still captions it', hr.cells[0].kids.length === 0 && table.kids[0].tagName === 'CAPTION');
}
{
  const { table } = make(['A'], [['x']]); T.enhance(table);
  t('a one-row table is captioned but not sortable', table.tHead.rows[0].cells[0].kids.length === 0);
}
t('num() keeps the number and its % together', T.num(54, '%') === '<span class="ph-num">54<small class="u">%</small></span>' && T.num('<b>', '') === '<span class="ph-num">&lt;b&gt;</span>');
done();
