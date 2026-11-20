// PF-033: chips and tabs keyboard. Runs next/static/roving.js against a tiny fake DOM (no browser needed) and checks the page wiring.
import fs from 'node:fs';
import vm from 'node:vm';
import { t, done } from './lib.mjs';

const rd = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = rd('next/static/roving.js'), ui = rd('next/lib/ui.mjs');
t('roving.js is linked on every page head', ui.includes('src="roving.js"'));
t('no look change: roving.js adds no style rules', !/\.style\b|createElement\('style'\)|insertRule/.test(src));
t('no NOREX name or colour in roving.js', !/norex|c8352c/i.test(src));

// ---- fake DOM: just enough surface for roving.js ----
class El {
  constructor(tag, attrs = {}, cls = '') { this.tag = tag; this.attrs = { ...attrs }; this.cls = cls.split(/\s+/).filter(Boolean); this.kids = []; this.parent = null; this.clicks = 0; this.isGroup = false; this.hidden = false; this.disabled = false; }
  add(k) { k.parent = this; this.kids.push(k); return k; }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  hasAttribute(n) { return n in this.attrs; }
  removeAttribute(n) { delete this.attrs[n]; }
  get textContent() { return this.text || ''; }
  get isConnected() { return true; }
  matches(s) { return s === '.on' ? this.cls.includes('on') : this.attrs['aria-selected'] === 'true'; }
  closest(s) {
    if (s.includes('button.chip')) { return this.tag === 'button' ? this : null; }
    for (let e = this; e; e = e.parent) if (e.isGroup) return e;
    return null;
  }
  contains(o) { for (let e = o; e; e = e.parent) if (e === this) return true; return false; }
  querySelectorAll() { const out = []; const w = (e) => e.kids.forEach((k) => { if (k.tag === 'button') out.push(k); w(k); }); w(this); return out; }
  focus() { doc.activeElement = this; }
  click() { this.clicks++; if (this.group?.tabs) { this.parent.kids.forEach((k) => k.cls = k.cls.filter((c) => c !== 'on')); this.cls.push('on'); } for (const h of doc.listeners.click || []) h({ target: this }); }
  get group() { return this.parent; }
}
const doc = { listeners: {}, activeElement: null, readyState: 'complete', body: new El('body'),
  addEventListener(n, f) { (this.listeners[n] ||= []).push(f); }, querySelectorAll: () => [], getElementById: () => null };
const store = {};
const ctx = { document: doc, window: {}, location: { pathname: '/matches.html', hash: '' }, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
  MutationObserver: class { observe() {} }, setTimeout: (f) => f() };
ctx.window = ctx;
vm.runInNewContext(src, ctx);
const R = ctx.PhoenixRoving;

// ---- key maths ----
t('ArrowRight and ArrowDown go forward and wrap', R.nextIndex('ArrowRight', 0, 3) === 1 && R.nextIndex('ArrowDown', 2, 3) === 0);
t('ArrowLeft and ArrowUp go back and wrap', R.nextIndex('ArrowLeft', 0, 3) === 2 && R.nextIndex('ArrowUp', 2, 3) === 1);
t('Home goes first, End goes last', R.nextIndex('Home', 2, 4) === 0 && R.nextIndex('End', 0, 4) === 3);
t('other keys are left alone (Tab, Enter, letters)', ['Tab', 'Enter', ' ', 'a', 'Escape'].every((k) => R.nextIndex(k, 1, 3) === -1));
t('empty group handles no keys', R.nextIndex('Home', 0, 0) === -1);

const make = (tabs, ids = ['a', 'b', 'c']) => {
  const g = new El('div', tabs ? { role: 'tablist', 'aria-label': 'View' } : {}, 'chips'); g.isGroup = true; g.tabs = tabs;
  const btn = ids.map((id, n) => { const b = g.add(new El('button', { 'data-v': id }, n ? 'chip' : 'chip on')); b.text = id; return b; });
  return { g, btn };
};
const key = (el, k, extra = {}) => { let prevented = false; for (const h of doc.listeners.keydown || []) h({ target: el, key: k, preventDefault() { prevented = true; }, ...extra }); return prevented; };

// ---- tab set ----
{
  const { g, btn } = make(true);
  R.scan({ querySelectorAll: () => [g] });
  t('tab buttons get role="tab"', btn.every((b) => b.attrs.role === 'tab'));
  t('only the highlighted tab is selected and a Tab stop', btn[0].attrs['aria-selected'] === 'true' && btn[1].attrs['aria-selected'] === 'false' && btn[0].attrs.tabindex === '0' && btn[1].attrs.tabindex === '-1');
  t('ArrowRight on a tab focuses and selects the next', key(btn[0], 'ArrowRight') && doc.activeElement === btn[1] && btn[1].clicks === 1);
  R.scan({ querySelectorAll: () => [g] });
  t('after the move the new tab is the Tab stop', btn[1].attrs.tabindex === '0' && btn[0].attrs.tabindex === '-1');
  key(btn[1], 'End'); t('End selects the last tab', doc.activeElement === btn[2] && btn[2].clicks === 1);
  key(btn[2], 'Home'); t('Home selects the first tab', doc.activeElement === btn[0]);
  t('a key with Ctrl or Shift is ignored', key(btn[0], 'ArrowRight', { ctrlKey: true }) === false);
  t('last tab is remembered per page', store['phoenix.tab.matches.html|View'] === 'data-v=a' || Object.values(store).some((v) => /^data-v=/.test(v)));
}

// ---- filter chips ----
{
  const { g, btn } = make(false);
  R.scan({ querySelectorAll: () => [g] });
  t('a chip row becomes a named group', g.attrs.role === 'group' && !!g.attrs['aria-label']);
  t('chips report pressed state', btn[0].attrs['aria-pressed'] === 'true' && btn[1].attrs['aria-pressed'] === 'false');
  t('every chip stays a Tab stop', btn.every((b) => !('tabindex' in b.attrs)));
  key(btn[0], 'ArrowRight'); t('arrows only move focus on filter chips (no press)', doc.activeElement === btn[1] && btn[1].clicks === 0);
}
done();
