// Theme Studio loader (runs on every page, in <head>, before first paint). It reads the owner's saved look and applies it:
//   cached copy (localStorage phoenix.themestudio) first so the page paints right, then GET /api/site/theme refreshes it for the next load.
// A page's look = "*" (everywhere) + "page:<slug>" + "page:<slug>#<sub-menu>", each only overriding what it sets. The look lands as
// CSS variables, data-st-* attributes on <html> and a few fonts; next/static/themestudio.css turns the attributes into the three looks per
// component, the switched-off aspects and the motions. Keep the catalogue in step with bot/themestudio.js (tests/themestudio.test.mjs).
(() => {
  const w = window, H = document.documentElement;
  const COLOR_TOKENS = ['accent', 'accent2', 'glow', 'bg', 'surface', 'surface2', 'text', 'muted', 'line', 'btnfill', 'btntext', 'badgefill', 'badgetext', 'good', 'bad'];
  const FONTS = ['inherit', 'Inter', 'Oswald', 'Poppins', 'Montserrat', 'Space Grotesk', 'DM Sans', 'Sora', 'Rajdhani', 'Bebas Neue', 'Barlow Condensed', 'Playfair Display', 'JetBrains Mono', 'system-ui'];
  const FONT_TOKENS = ['fontDisplay', 'fontBody'];
  const NUM_TOKENS = { radius: [0, 40], blur: [0, 40], border: [0, 4], glowSize: [0, 60], shadow: [0, 100], space: [80, 130], text: [85, 125] };
  const COMPONENTS = ['button', 'card', 'badge', 'chip', 'nav', 'dock', 'input', 'heading', 'table', 'icon', 'divider', 'toggle', 'playercard', 'buttonfx', 'tilefx', 'statusfx', 'dockfx', 'overlayfx', 'vizfx', 'hubfx', 'scrollfx', 'tapfx', 'menufx', 'pagefx'];
  const OFF = ['glow', 'shine', 'shadows', 'gradients', 'blur', 'textglow', 'embers', 'badgepulse', 'hoverlift', 'borders'];
  const MOTION = ['page-fade', 'page-slide', 'page-zoom', 'page-blur', 'page-wipe', 'enter-rise', 'enter-fade', 'enter-scale', 'enter-blur', 'enter-stagger', 'enter-flip',
    'hover-lift', 'hover-scale', 'hover-glow', 'hover-underline', 'hover-tilt', 'press-squish', 'press-sink', 'press-ripple', 'idle-float', 'idle-breathe', 'idle-shimmer', 'idle-ping', 'idle-sway'];
  const CAT = { COLOR_TOKENS, FONTS, FONT_TOKENS, NUM_TOKENS, COMPONENTS, OFF, MOTION, VARIANTS: ['a', 'b', 'c'] };
  const KEY = 'phoenix.themestudio';
  const empty = () => ({ v: 1, scopes: {} });
  const clean = (raw) => (raw && typeof raw === 'object' && raw.scopes && typeof raw.scopes === 'object' ? { v: 1, scopes: raw.scopes } : empty());
  const slug = () => (location.pathname.split('/').pop() || 'index').replace(/\.html?$/i, '') || 'index';
  const sub = () => decodeURIComponent((location.hash || '').replace(/^#/, '').split(/[?&]/)[0]).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60);
  // the scopes that apply to this page, most general first
  const scopeKeys = (page = slug(), s = sub()) => ['*', 'page:' + page, ...(s ? ['page:' + page + '#' + s] : [])];
  // pure: merge the scopes in order. Tokens and variants override; switched-off aspects and motions add up.
  const merge = (cfg, keys) => {
    const out = { tokens: {}, variants: {}, off: [], motion: [] };
    for (const k of keys) {
      const s = cfg?.scopes?.[k]; if (!s) continue;
      Object.assign(out.tokens, s.tokens || {}); Object.assign(out.variants, s.variants || {});
      for (const x of s.off || []) if (!out.off.includes(x)) out.off.push(x);
      for (const x of s.motion || []) if (!out.motion.includes(x)) out.motion.push(x);
    }
    return out;
  };
  const q = (f) => '"' + String(f).replace(/["\\]/g, '') + '"';
  // the variables the site already uses are set directly, so every existing rule picks the colour up; the rest ride on --st-*
  const MAP = { accent: ['--red'], accent2: ['--red2'], glow: ['--redg'], bg: ['--ink'], surface: ['--p1'], surface2: ['--p2'], line: ['--line'], muted: ['--soft'] };
  const ATTR = ['fd', 'fb', 'text', 'space'];
  let cfg = clean(null), look = merge(cfg, ['*']), applied = [], fontLink = null;
  const fontHref = (fs) => 'https://fonts.googleapis.com/css2?' + fs.map((f) => 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;500;600;700').join('&') + '&display=swap';
  const clear = () => {
    for (const v of applied) H.style.removeProperty(v); applied = [];
    for (const a of [...H.attributes]) if (a.name.startsWith('data-st-')) H.removeAttribute(a.name);
  };
  const set = (name, val) => { H.style.setProperty(name, String(val)); applied.push(name); };
  const apply = (config = cfg, keys = scopeKeys()) => {
    clear(); look = merge(config, keys);
    const t = look.tokens;
    for (const k of COLOR_TOKENS) if (t[k]) { set('--st-' + k, t[k]); for (const v of MAP[k] || []) set(v, t[k]); H.setAttribute('data-st-' + k, ''); }
    const fonts = [];
    for (const [k, id, a] of [['fontDisplay', 'fd'], ['fontBody', 'fb']].map(([k, a]) => [k, 0, a])) if (t[k] && t[k] !== 'inherit') { set('--st-' + a, t[k] === 'system-ui' ? 'system-ui,sans-serif' : q(t[k]) + ',system-ui,sans-serif'); H.setAttribute('data-st-' + a, ''); if (t[k] !== 'system-ui') fonts.push(t[k]); }
    if (fonts.length) { const href = fontHref([...new Set(fonts)]); if (!fontLink) { fontLink = document.createElement('link'); fontLink.rel = 'stylesheet'; document.head.appendChild(fontLink); } if (fontLink.href !== href) fontLink.href = href; }
    if (t.radius != null) { set('--st-radius', t.radius + 'px'); set('--r', t.radius + 'px'); H.setAttribute('data-st-radius', ''); }
    if (t.blur != null) { set('--st-blur', t.blur + 'px'); H.setAttribute('data-st-blur', ''); }
    if (t.border != null) { set('--st-border', t.border + 'px'); H.setAttribute('data-st-border', ''); }
    if (t.glowSize != null) { set('--st-glowsize', t.glowSize + 'px'); H.setAttribute('data-st-glowsize', ''); }
    if (t.shadow != null) { set('--st-shadow', t.shadow / 100); H.setAttribute('data-st-shadow', ''); }
    if (t.space != null) { set('--st-space', t.space / 100); H.setAttribute('data-st-space', ''); }
    if (t.text != null) { set('--st-text-scale', t.text / 100); H.setAttribute('data-st-textscale', ''); }
    for (const [c, v] of Object.entries(look.variants)) if (COMPONENTS.includes(c)) H.setAttribute('data-st-' + c, v);
    if (look.off.length) H.setAttribute('data-st-off', look.off.join(' '));
    if (look.motion.length) H.setAttribute('data-st-motion', look.motion.join(' '));
    dispatchEvent(new CustomEvent('phoenix:theme', { detail: { look, keys } }));
  };
  const cached = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const store = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} };
  w.PFTheme = {
    CAT, KEY, clean, slug, sub, scopeKeys, merge, empty,
    get config() { return cfg; }, get look() { return look; },
    set(c, { save = false } = {}) { cfg = clean(c); if (save) store(cfg); apply(cfg); },   // live preview (save:false) or after the owner saved (save:true)
    preview(c) { apply(clean(c)); }, apply: () => apply(cfg), refresh: () => apply(cfg),
  };
  if (/[?&]still\b/.test(location.search) || /[?&]nostudio\b/.test(location.search)) return;
  const first = cached(); if (first) cfg = clean(first);
  apply(cfg);
  addEventListener('hashchange', () => apply(cfg));
  // the saved look from the Worker: one small public read, never blocks the page, a failure keeps what is already there
  const go = () => { if (!w.NOREX_API) return; fetch(String(w.NOREX_API).replace(/\/$/, '') + '/api/site/theme', { credentials: 'omit' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!j || typeof j !== 'object') return; cfg = clean(j); store(cfg); apply(cfg); }).catch(() => {}); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
