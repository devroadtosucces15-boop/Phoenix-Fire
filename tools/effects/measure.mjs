// PF-032: counts running animations on a page (headless Chromium over CDP, no dependencies).
// Usage: node tools/effects/measure.mjs http://localhost:8765 [index.html stats.html tactics.html]
import { spawn } from 'node:child_process';
const base = process.argv[2] || 'http://localhost:8765';
const pages = process.argv.slice(3).length ? process.argv.slice(3) : ['index.html', 'stats.html', 'tactics.html'];
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(process.env.CHROME || 'chromium', ['--headless=new', '--no-sandbox', `--user-data-dir=${process.env.TMPDIR || '/tmp'}/pf-chrome-${process.pid}`, `--remote-debugging-port=${port}`, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
const COUNT = `(() => { const a = document.getAnimations().filter((x) => x.playState === 'running'); const inf = a.filter((x) => x.effect?.getComputedTiming().iterations === Infinity); const nm = (x) => x.animationName || x.transitionProperty || 'js'; const by = {}; inf.forEach((x) => { by[nm(x)] = (by[nm(x)] || 0) + 1; }); return { running: a.length, endless: inf.length, by, hidden: document.visibilityState }; })()`;
const out = {};
for (const p of pages) {
  await send('Page.navigate', { url: `${base}/${p}` }); await sleep(4500);
  out[p] = await ev(COUNT);
  out[p].runningWhileHidden = await ev(`(async () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); await new Promise((r) => setTimeout(r, 300)); return document.getAnimations().filter((x) => x.playState === 'running').length; })()`);
}
console.log(JSON.stringify(out, null, 1));
ws.close(); chrome.kill();
