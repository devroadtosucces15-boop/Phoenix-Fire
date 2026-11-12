// Regression: opening the search palette (html.hdr-lock) froze the page. smooth.js asked "is the page locked?" from the computed
// overflow of <html>, but Lenis's own .lenis-stopped turns that into overflow:clip (smooth.css), so stop() made the page look
// unlocked, start() made it look locked, and the two calls fed each other forever. This runs the real smooth.js against a small
// fake DOM that applies the same CSS rules and fails if the observer keeps calling Lenis instead of settling.
import fs from 'node:fs'; import vm from 'node:vm';
import { ROOT } from './mock.mjs';
import { t, tt, done } from './lib.mjs';

const SRC = fs.readFileSync(process.env.SMOOTH_SRC || ROOT + 'next/static/smooth.js', 'utf8');
const CSS = fs.readFileSync(ROOT + 'next/static/smooth.css', 'utf8');

const rig = () => {
  const observers = [], calls = { stop: 0, start: 0 }; let pending = 0, ticks = 0;
  const el = (name) => {
    const cls = new Set();
    const e = {
      name, style: {}, dataset: {},
      classList: { add: (c) => { if (!cls.has(c)) { cls.add(c); touch(e); } }, remove: (c) => { if (cls.delete(c)) touch(e); }, contains: (c) => cls.has(c), [Symbol.iterator]: () => cls[Symbol.iterator]() },
      hasAttribute: () => false, appendChild: (x) => x,
    };
    Object.defineProperty(e.classList, 'length', { get: () => cls.size });
    e.classList.forEach = (f) => cls.forEach(f);
    Object.defineProperty(e, 'className', { get: () => [...cls].join(' '), set: (v) => { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); touch(e); } });
    return e;
  };
  const touch = (e) => { observers.filter((o) => o.target === e).forEach((o) => { pending++; queueMicrotask(() => { if (++ticks > 500) throw new Error('observer loop'); pending--; o.cb([]); }); }); };
  const H = el('html'), body = el('body');
  // the two CSS rules that collide: html.hdr-lock{overflow:hidden} (header.css) and .lenis.lenis-stopped{overflow:clip} (smooth.css)
  const clipRule = /\.lenis\.lenis-stopped\{overflow:clip\}/.test(CSS);
  const getComputedStyle = (e) => ({ overflowY: e === H ? (clipRule && H.classList.contains('lenis') && H.classList.contains('lenis-stopped') ? 'clip' : H.classList.contains('hdr-lock') ? 'hidden' : 'visible') : 'visible' });
  class Lenis {
    constructor() { this.isStopped = false; H.classList.add('lenis'); }
    stop() { calls.stop++; if (this.isStopped) return; this.isStopped = true; H.classList.add('lenis-stopped'); }
    start() { calls.start++; if (!this.isStopped) return; this.isStopped = false; H.classList.remove('lenis-stopped'); }
    on() {} raf() {}
  }
  class MutationObserver { constructor(cb) { this.cb = cb; } observe(target) { this.target = target; observers.push(this); } }
  const win = {
    Lenis, MutationObserver, getComputedStyle, addEventListener() {}, matchMedia: () => ({ matches: false }), location: { search: '' },
    document: { documentElement: H, body: Object.assign(body, { appendChild: (x) => x }), createElement: () => ({ style: {} }) },
  };
  win.window = win;
  const ctx = vm.createContext({ ...win, setTimeout, console });
  vm.runInContext(SRC, ctx);
  return { H, body, calls, ctx, settle: () => new Promise((r) => setTimeout(r, 20)), lenis: win.window.NorexLenis ?? ctx.window.NorexLenis };
};

await tt('smooth.css still stops Lenis with overflow:clip (the collision this test guards)', () => /\.lenis\.lenis-stopped\{overflow:clip\}/.test(CSS));

await tt('opening the search palette (html.hdr-lock) stops Lenis once and does not loop', async () => {
  const r = rig(); r.calls.stop = r.calls.start = 0;
  r.H.classList.add('hdr-lock'); await r.settle();
  return r.calls.stop + r.calls.start <= 6 && r.lenis.isStopped === true;
});

await tt('closing the palette starts Lenis again and does not loop', async () => {
  const r = rig(); r.H.classList.add('hdr-lock'); await r.settle();
  r.calls.stop = r.calls.start = 0;
  r.H.classList.remove('hdr-lock'); await r.settle();
  return r.calls.stop + r.calls.start <= 6 && r.lenis.isStopped === false;
});

await tt('a lock class on <body> also stops it, without looping', async () => {
  const r = rig(); r.calls.stop = r.calls.start = 0;
  r.body.classList.add('menu-lock'); await r.settle();
  const stopped = r.lenis.isStopped === true && r.calls.stop + r.calls.start <= 6;
  r.body.classList.remove('menu-lock'); await r.settle();
  return stopped && r.lenis.isStopped === false;
});

await tt('smooth.js no longer trusts the computed overflow of <html> while Lenis is stopped', () => /lenis-stopped/.test(SRC) && /want !== !!lenis\.isStopped/.test(SRC));

done();
