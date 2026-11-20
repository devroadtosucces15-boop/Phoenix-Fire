// PF-044: the ONE effects config. The owner sets how many effects may run at once (budget, 5 or more, default 5) and a level for
// each effect (Full, Balanced, Off). It is one setting for everyone: visitors have no effects options of their own. app.js, motion.js,
// safe.js and lib/ui.mjs all read it through window.PhoenixFx; nothing else decides what runs.
// Source order: built-in defaults < window.PHOENIX_FX (baked into every page by lib/ui.mjs from config.json) < the owner's saved
// setting from the Worker (GET /api/site/effects, cached in phoenix.fxcfg so the next page paints with it).
// Keep EFFECTS, LEVELS and MIN_BUDGET in step with bot/fxconfig.js (tests/fxconfig.test.mjs checks it).
(() => {
  const w = window, H = document.documentElement;
  // Priority order: when the budget is smaller than the number of effects switched on, the first ones in this list run.
  // Always-visible motion first, device extras (phone tilt, haptics) and the Insights notes last.
  const EFFECTS = ['reveals', 'glow', 'tilt', 'parallax', 'bursts', 'dockbob', 'gyro', 'haptics', 'insights'];
  const LEVELS = ['full', 'balanced', 'off'];
  const MIN_BUDGET = 5, DEFAULT_BUDGET = 5;
  const SCALE = { full: 1, balanced: 0.5, off: 0 };
  const defaults = () => ({ budget: DEFAULT_BUDGET, levels: Object.fromEntries(EFFECTS.map((k) => [k, 'full'])) });
  const clean = (raw) => {
    const c = defaults(), r = raw && typeof raw === 'object' ? raw : {};
    const n = Math.floor(Number(r.budget)); if (Number.isFinite(n)) c.budget = Math.max(MIN_BUDGET, n);
    for (const k of EFFECTS) if (LEVELS.includes(r.levels?.[k])) c.levels[k] = r.levels[k];
    return c;
  };
  let cfg = clean(w.PHOENIX_FX), granted = new Set();
  const cached = () => { try { return JSON.parse(localStorage.getItem('phoenix.fxcfg') || 'null'); } catch { return null; } };
  const still = /[?&]still\b/.test(location.search);
  const avail = { gyro: () => !!w.DeviceOrientationEvent, haptics: () => 'vibrate' in navigator };
  // The effects that run: switched on (not Off), usable on this device, and within the budget. Never more than the budget.
  const compute = () => { const g = new Set(); if (!still && !H.classList.contains('nx-safe')) for (const k of EFFECTS) { if (g.size >= cfg.budget) break; if (cfg.levels[k] !== 'off' && (!avail[k] || avail[k]())) g.add(k); } granted = g; };
  const apply = () => {
    compute();
    for (const k of EFFECTS) { H.dataset['fx' + k[0].toUpperCase() + k.slice(1)] = granted.has(k) ? cfg.levels[k] : 'off'; H.style.setProperty('--fx-' + k, String(granted.has(k) ? SCALE[cfg.levels[k]] : 0)); }
    H.dataset.fxBudget = String(cfg.budget);
    dispatchEvent(new CustomEvent('phoenix:fx', { detail: api.snapshot() }));
  };
  const api = w.PhoenixFx = {
    EFFECTS, LEVELS, MIN_BUDGET, DEFAULT_BUDGET, clean,
    get budget() { return cfg.budget; },
    level: (k) => (granted.has(k) ? cfg.levels[k] : 'off'),           // what runs: full, balanced or off (off also when over budget)
    configured: (k) => cfg.levels[k] || 'off',                         // what the owner chose, before the budget is applied
    on: (k) => granted.has(k),
    scale: (k) => (granted.has(k) ? SCALE[cfg.levels[k]] : 0),         // 1 for Full, 0.5 for Balanced, 0 for Off: multiply a distance, angle or opacity by it
    running: () => [...granted],
    snapshot: () => ({ budget: cfg.budget, levels: { ...cfg.levels }, running: [...granted] }),
    set(raw) { cfg = clean(raw); apply(); },                           // used by the loader and by the owner's live preview, never saved here
    refresh: () => apply(),
  };
  const first = cached(); if (first) cfg = clean({ ...cfg, ...first, levels: { ...cfg.levels, ...first.levels } });
  apply();
  // the owner's saved setting: one small public read, never blocks the page, failure keeps what is already there
  if (w.NOREX_API && !still) fetch(String(w.NOREX_API).replace(/\/$/, '') + '/api/site/effects', { credentials: 'omit' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j || typeof j !== 'object') return; const next = clean(j); try { localStorage.setItem('phoenix.fxcfg', JSON.stringify(next)); } catch {} cfg = next; apply();
  }).catch(() => {});
  new MutationObserver(() => { if (H.classList.contains('nx-safe') && granted.size) apply(); }).observe(H, { attributes: true, attributeFilter: ['class'] });
})();
