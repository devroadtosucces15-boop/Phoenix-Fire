// PF-044: owner-only effects control. One config (budget 5 or more, default 5; level per effect Full / Balanced / Off) read by
// app.js, motion.js, safe.js and lib/ui.mjs; no more effects run at once than the budget; only the owner can change it.
import fs from 'node:fs';
import vm from 'node:vm';
import { t, done } from './lib.mjs';
import * as bot from '../bot/fxconfig.js';
import { SPLIT, areaLevel, CC_DEFAULTS, AREAS } from '../bot/ccsettings.js';

const rd = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = rd('next/static/fxconfig.js');

// load the browser module in a sandbox
function load({ PHOENIX_FX, search = '', ls = {}, vibrate = true, gyro = true, classes = [] } = {}) {
  const attrs = {}, style = {}, cl = new Set(classes);
  const H = { dataset: attrs, style: { setProperty: (k, v) => (style[k] = v) }, classList: { contains: (c) => cl.has(c) } };
  const win = { PHOENIX_FX, DeviceOrientationEvent: gyro ? function () {} : undefined, dispatchEvent() {}, CustomEvent: class { constructor(n, o) { this.detail = o?.detail; } } };
  const ctx = { window: win, document: { documentElement: H }, location: { search }, localStorage: { getItem: (k) => ls[k] ?? null, setItem: (k, v) => (ls[k] = v) },
    navigator: vibrate ? { vibrate() {} } : {}, dispatchEvent() {}, CustomEvent: win.CustomEvent, MutationObserver: class { observe() {} }, fetch: () => Promise.reject(new Error('off')) };
  ctx.self = ctx; vm.runInNewContext(src, ctx);
  return { fx: win.PhoenixFx, attrs, style };
}

t('defaults: budget 5, every effect Full', (() => { const { fx } = load(); return fx.budget === 5 && fx.EFFECTS.every((k) => fx.configured(k) === 'full'); })());
t('the budget is never below 5 (4, 0, -3, text fall back to 5) and has no upper limit', (() => {
  const b = (v) => load({ PHOENIX_FX: { budget: v } }).fx.budget;
  return b(4) === 5 && b(0) === 5 && b(-3) === 5 && b('x') === 5 && b(7) === 7 && b(500) === 500;
})());
t('levels are Full, Balanced or Off; anything else keeps Full', (() => {
  const { fx } = load({ PHOENIX_FX: { levels: { tilt: 'balanced', glow: 'off', parallax: 'loud' } } });
  return fx.configured('tilt') === 'balanced' && fx.configured('glow') === 'off' && fx.configured('parallax') === 'full';
})());
t('scale: Full 1, Balanced 0.5, Off 0', (() => { const { fx } = load({ PHOENIX_FX: { budget: 20, levels: { tilt: 'balanced', glow: 'off' } } }); return fx.scale('reveals') === 1 && fx.scale('tilt') === 0.5 && fx.scale('glow') === 0; })());

// the budget: never more than the budget run at once, whatever the owner switches on
t('no more effects run at once than the budget (every budget from 5 to 12, all Full)', (() => {
  for (let n = 5; n <= 12; n++) { const { fx } = load({ PHOENIX_FX: { budget: n } }); if (fx.running().length > n || fx.running().length > fx.EFFECTS.length) return false; }
  return true;
})());
t('default budget runs exactly 5 of the 9 effects, in priority order; the rest are off', (() => {
  const { fx } = load(); return fx.running().join() === fx.EFFECTS.slice(0, 5).join() && fx.level(fx.EFFECTS[5]) === 'off' && fx.on(fx.EFFECTS[0]);
})());
t('an effect set to Off frees its place for the next one; Off never counts', (() => {
  const { fx } = load({ PHOENIX_FX: { levels: { reveals: 'off' } } }); return fx.running().length === 5 && !fx.on('reveals') && fx.on('dockbob');
})());
t('raising the budget to cover every effect runs them all', (() => { const { fx } = load({ PHOENIX_FX: { budget: 9 } }); return fx.running().length === 9; })());
t('device extras without a device do not use a place (no sensor, no vibration)', (() => {
  const { fx } = load({ PHOENIX_FX: { budget: 9 }, vibrate: false, gyro: false }); return !fx.on('gyro') && !fx.on('haptics') && fx.running().length === 7;
})());
t('?still and safe mode switch every effect off through the same config', (() => {
  const a = load({ search: '?still' }).fx, b = load({ classes: ['nx-safe'] }).fx; return a.running().length === 0 && b.running().length === 0;
})());
t('the page gets the result: data-fx-* and --fx-* on <html>', (() => { const { attrs, style } = load({ PHOENIX_FX: { levels: { tilt: 'balanced' } } }); return attrs.fxTilt === 'balanced' && attrs.fxBudget === '5' && style['--fx-tilt'] === '0.5' && attrs.fxDockbob === 'off'; })());
t('the owner setting cached by the last visit is used at once', (() => { const { fx } = load({ ls: { 'phoenix.fxcfg': JSON.stringify({ budget: 6, levels: { glow: 'off' } }) } }); return fx.budget === 6 && !fx.on('glow'); })());
t('the dock bring-back arrow (PF-043) is one of the counted effects', load().fx.EFFECTS.includes('dockbob') && /PhoenixFx.on\('dockbob'\)/.test(rd('next/static/dock.js')));

// bot copy stays equal to the browser copy
t('bot/fxconfig.js and next/static/fxconfig.js list the same effects, levels and minimum', (() => { const { fx } = load(); return fx.EFFECTS.join() === bot.EFFECTS.join() && fx.LEVELS.join() === bot.LEVELS.join() && fx.MIN_BUDGET === bot.MIN_BUDGET && fx.DEFAULT_BUDGET === bot.DEFAULT_EFFECTS.budget; })());
t('server clean: budget below 5, a fraction or a bad level is refused with a message', (() => {
  const c = (b) => bot.cleanEffects(b);
  return c({ budget: 4 }).error && c({ budget: 5.5 }).error && c({ levels: { tilt: 'max' } }).error && !c({ budget: 5 }).error && c({ budget: '12', levels: { tilt: 'balanced' } }).budget === 12 && c({ levels: { tilt: 'balanced' } }).levels.glow === 'full';
})());

// owner-only, one setting for everyone
t('effects is an OWNER-level area (managers cannot change it)', areaLevel('effects') === 'owner' && SPLIT.owner.includes('effects') && !SPLIT.manager.includes('effects'));
t('the Control Center has the effects area and its saved default is the built-in one', !!AREAS.effects && CC_DEFAULTS.effects.budget === 5);
const members = rd('bot/members.js'), cc = rd('bot/ccsettings.js');
t('the public read has no write path and holds only budget and levels', /\/api\/site\/effects' && request\.method === 'GET'/.test(members) && /effectsPublicRoute\(env\)/.test(members));
t('no per-user effects choice reaches the budget: the site only reads it (fxconfig.js never POSTs)', !/method:\s*'POST'|method:\s*"POST"/.test(src));

// four readers
const app = rd('next/static/app.js'), mot = rd('next/static/motion.js'), safe = rd('next/static/safe.js'), ui = rd('next/lib/ui.mjs');
t('app.js reads the effects config', /PhoenixFx/.test(app));
t('motion.js reads the effects config (on, tilt and parallax strength)', /PhoenixFx\.on\(k\)/.test(mot) && /fxs\('tilt'\)/.test(mot) && /fxs\('parallax'\)/.test(mot));
t('safe.js reads the effects config', /PhoenixFx\?\.refresh/.test(safe));
t('ui.mjs bakes the config into every page and loads fxconfig.js right after safe.js', /window\.PHOENIX_FX=/.test(ui) && ui.indexOf('src="safe.js"') > 0 && ui.indexOf('src="safe.js"') < ui.indexOf('src="fxconfig.js"') && ui.indexOf('src="fxconfig.js"') < ui.indexOf('src="session.js"'));
// brand: nothing NOREX in the new files
t('no NOREX name or colour in the new effects files', !/norex|c8352c/i.test((src + rd('bot/fxconfig.js')).replace(/NOREX_API/g, '')));
done();
