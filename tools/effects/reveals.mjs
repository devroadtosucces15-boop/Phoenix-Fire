// PF-048: every block hidden for a scroll reveal must show. Headless Chromium over CDP, no dependencies.
// Usage: node tools/effects/reveals.mjs [siteDir]   (PAGES=index,stats limits pages; exits 1 when a block stays at opacity 0)
// Modes: scroll = scroll the page top to bottom in steps, then wait, and nothing may be left hidden;
//        still  = ?still, nothing hidden at load; print = print media, nothing hidden at load (nobody scrolls a printout).
import { spawn } from 'node:child_process';
import path from 'node:path';
const dir = path.resolve(process.argv[2] || 'site');
const PAGES = (process.env.PAGES || 'index,stats,tactics,join,apply,hub,leaders,fixtures,halloffame,builds,burners,canvas,lookbook,about,compare').split(',');
const port = 9800 + Math.floor(Math.random() * 500);
const chrome = spawn(process.env.CHROME || 'chromium', ['--headless=new', '--no-sandbox', '--allow-file-access-from-files', `--user-data-dir=${process.env.TMPDIR || '/tmp'}/pf-rv-${process.pid}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.result?.value;
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
// blocks the page hides for a reveal and that are still invisible: the reveal block, its staged parts, or a dealt grid item
const HIDDEN = `(() => { const out = []; for (const e of document.body.querySelectorAll('.reveal, .rv-c, .rv-g > *')) {
  const r = e.getBoundingClientRect(); if (r.width <= 8 || r.height <= 8 || e.closest('[hidden],template')) continue;
  let s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') continue;
  let o = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
  if (o < 0.05) out.push(e.tagName.toLowerCase() + '.' + [...e.classList].slice(0, 3).join('.') + (e.id ? '#' + e.id : '')); }
  return out; })()`;
// instant steps (smooth scrolling would skip blocks); each step waits for the 140 ms sweep and the observers
const SCROLL = `(async () => { const h = () => document.documentElement.scrollHeight; for (let y = 0; y < h(); y += innerHeight * 0.6) { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 220)); }
  scrollTo({ top: h(), behavior: 'instant' }); await new Promise((r) => setTimeout(r, 400)); await new Promise((r) => setTimeout(r, 3200)); })()`;
const modes = { scroll: { q: '' }, still: { q: '?still' }, print: { q: '', print: true } };
const report = {}; let bad = 0, waiting = {};
for (const [mode, o] of Object.entries(modes)) {
  await send('Emulation.setEmulatedMedia', { media: o.print ? 'print' : '' });
  report[mode] = {};
  for (const p of PAGES) {
    await send('Page.navigate', { url: `file://${dir}/${p}.html${o.q}` }); await sleep(3200);
    if (mode === 'scroll') waiting[p] = (await ev(HIDDEN)).length; // blocks that wait for a scroll at load (informational)
    if (mode === 'scroll') await ev(SCROLL);
    const left = await ev(HIDDEN);
    report[mode][p] = left.length; if (left.length) { bad += left.length; console.error(`FAIL ${mode} ${p}: ${left.length} hidden, e.g. ${[...new Set(left)].slice(0, 5).join(', ')}`); }
  }
}
console.log(JSON.stringify({ waitingAtLoad: waiting, leftHidden: report }, null, 1));
ws.close(); chrome.kill(); process.exit(bad ? 1 : 0);
