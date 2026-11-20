// PF-046: repeats the Phase 0 measurements on the built site (headless Chromium over CDP, no dependencies).
// Usage: node tools/effects/reaudit.mjs [siteDir] [budget ...]   e.g. node tools/effects/reaudit.mjs site 5 14
// Per page at phone width (390 x 844): tap targets under 44 px, unnamed controls, form fields (unlabelled), native selects,
// endless animations, blocks at opacity 0, frame rate. The effects budget is set through the phoenix.fxcfg cache.
import { spawn } from 'node:child_process';
import path from 'node:path';
const dir = path.resolve(process.argv[2] || 'site');
const budgets = process.argv.slice(3).map(Number).filter(Boolean); if (!budgets.length) budgets.push(5, 14);
const PAGES = (process.env.PAGES || 'index,stats,tactics,join,apply,hub,leaders,fixtures,halloffame,builds,burners,canvas,lookbook,about,compare').split(',');
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(process.env.CHROME || 'chromium', ['--headless=new', '--no-sandbox', '--allow-file-access-from-files', `--user-data-dir=${process.env.TMPDIR || '/tmp'}/pf-re-${process.pid}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
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
const PROBE = `(async () => {
  // let finite entrance animations (reveals, slides) end first, up to 8 s, so a half-moved control is not measured
  await Promise.race([Promise.allSettled(document.getAnimations().filter((x) => x.effect?.getComputedTiming().iterations !== Infinity).map((x) => x.finished)), new Promise((r) => setTimeout(r, 8000))]);
  const fixedUp = (n) => { for (; n && n.nodeType === 1; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true; return false; };
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const name = (e) => (e.getAttribute('aria-label') || '').trim() || (e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby').split(' ')[0])?.textContent.trim()) || (e.textContent || '').trim() || (e.getAttribute('title') || '').trim() || (e.querySelector('img[alt]')?.getAttribute('alt') || '').trim() || (e.value && e.type !== 'password' && /^(button|submit)$/.test(e.type) ? e.value : '') || '';
  const ctl = [...document.querySelectorAll('a[href],button,[role=button],[role=tab],[role=menuitem],input:not([type=hidden]),select,textarea,summary')].filter(vis);
  // a control counts as small only when its real hit area (box plus any invisible ::after) is under 44 px: probe the 44 px square around its centre
  const hitOk = (e) => { const r = e.getBoundingClientRect(); if (r.width >= 44 && r.height >= 44) return true; const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return [[-21, 0], [21, 0], [0, -21], [0, 21]].every(([dx, dy]) => { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true; const t = document.elementFromPoint(x, y); return t && (fixedUp(t) || t === e || e.contains(t) || (ctl.includes(t.closest('a[href],button,[role=button],[role=tab],summary')) && !e.contains(t))); }); };
  const big = new Set(ctl.filter((e) => e.getBoundingClientRect().height >= 44 && e.getAttribute('href')).map((e) => e.getAttribute('href')));
  const equiv = (e) => e.getAttribute('href') && big.has(e.getAttribute('href'));
  const own = (e, t) => t && (t === e || e.contains(t) || t.contains(e));
  const covered = ctl.filter((e) => { const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false; return !own(e, document.elementFromPoint(x, y)); });
  const box = ctl.filter((e) => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length;
  const smallEls = ctl.filter((e) => !hitOk(e) && !equiv(e) && !covered.includes(e));
  const tap = smallEls.length;
  const tapSel = {}; const tapEx = {}; smallEls.forEach((e) => { const r = e.getBoundingClientRect(); const k0 = e.tagName.toLowerCase() + (e.classList[0] ? '.' + e.classList[0] : ''); if (!tapEx[k0]) tapEx[k0] = Math.round(r.width) + 'x' + Math.round(r.height) + ' ' + (e.textContent || '').trim().slice(0, 12) + ' ' + e.className + ' | up: ' + (() => { const t = document.elementFromPoint(r.left + r.width / 2, r.top - 1 + 0 * r.height - 4); return t ? t.tagName + '.' + t.className : ''; })() + ' down: ' + (() => { const t = document.elementFromPoint(r.left + r.width / 2, r.bottom + 4); return t ? t.tagName + '.' + t.className : ''; })(); });
  smallEls.forEach((e) => { const k = e.tagName.toLowerCase() + (e.classList[0] ? '.' + e.classList[0] : ''); tapSel[k] = (tapSel[k] || 0) + 1; });
  const unnamed = ctl.filter((e) => !/^(input|select|textarea)$/i.test(e.tagName) && !name(e)).length;
  const fields = ctl.filter((e) => /^(input|select|textarea)$/i.test(e.tagName) && !/^(button|submit|reset|image|checkbox|radio)$/.test(e.type || ''));
  const lab = (e) => e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.id && document.querySelector('label[for="' + CSS.escape(e.id) + '"]')) || e.closest('label') || e.getAttribute('title');
  const unlabelled = fields.filter((e) => !lab(e)).length;
  const selects = document.querySelectorAll('select').length;
  const a = document.getAnimations().filter((x) => x.playState === 'running');
  const endless = a.filter((x) => x.effect?.getComputedTiming().iterations === Infinity).length;
  const op0 = [...document.body.querySelectorAll('*')].filter((e) => getComputedStyle(e).opacity === '0' && e.getBoundingClientRect().height > 8 && e.getBoundingClientRect().width > 8).length;
  let n = 0, t0 = performance.now(); await new Promise((res) => { const f = (t) => { n++; if (t - t0 < 2000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  return { box, covered: covered.length, tapEx, tapSel, budget: document.documentElement.dataset.fxBudget, fx: (window.PhoenixFx?.running() || []).length, tap, unnamed, fields: fields.length, unlabelled, selects, endless, op0, fps: Math.round(n / ((performance.now() - t0) / 1000)), running: document.getAnimations().filter((x) => x.playState === 'running').length };
})()`;
const out = {};
for (const b of budgets) {
  const { result } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('phoenix.fxcfg', JSON.stringify({budget:${b}}));localStorage.setItem('phoenix.migrated','1')}catch(e){}` }).then((r) => ({ result: r.result }));
  out[b] = {};
  for (const p of PAGES) {
    await send('Page.navigate', { url: `file://${dir}/${p}.html` }); await sleep(4000);
    out[b][p] = await ev(PROBE);
  }
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: result.identifier });
}
console.log(JSON.stringify(out, null, 1));
ws.close(); chrome.kill();
