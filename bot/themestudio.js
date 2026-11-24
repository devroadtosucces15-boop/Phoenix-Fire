// Theme Studio (owner only): ONE saved look for the whole site. The owner edits it live from the floating button on any page and saves; every
// visitor's browser reads it (GET /api/site/theme, no key, nothing private) and applies it on the next load. The shape:
//   { v: 1, scopes: { "*": S, "page:<slug>": S, "page:<slug>#<sub>": S } }   S = { tokens, variants, off, motion }
//   tokens   { <token id>: "#rrggbb" | "<font id>" | number }       colours, fonts and sizes (the lists below)
//   variants { <component id>: "a" | "b" | "c" }                    one of three looks per component (a = the standard one)
//   off      [ <aspect id> ]                                        aspects switched off here (glow, shine, shadows...)
//   motion   [ <motion id> ]                                        any number of transitions and motions, no limit but the catalogue
// A page's look is "*" then its page scope then its sub-menu scope, each one only overriding what it sets. Pure, no env.
// The browser copy of the catalogue is next/static/themestudio.js (tests/themestudio.test.mjs keeps the ids equal).
export const COLOR_TOKENS = ['accent', 'accent2', 'glow', 'bg', 'surface', 'surface2', 'text', 'muted', 'line', 'btnfill', 'btntext', 'badgefill', 'badgetext', 'good', 'bad'];
export const FONTS = ['inherit', 'Inter', 'Oswald', 'Poppins', 'Montserrat', 'Space Grotesk', 'DM Sans', 'Sora', 'Rajdhani', 'Bebas Neue', 'Barlow Condensed', 'Playfair Display', 'JetBrains Mono', 'system-ui'];
export const FONT_TOKENS = ['fontDisplay', 'fontBody'];
// number tokens: [min, max]
export const NUM_TOKENS = { radius: [0, 40], blur: [0, 40], border: [0, 4], glowSize: [0, 60], shadow: [0, 100], space: [80, 130], text: [85, 125] };
export const COMPONENTS = ['button', 'card', 'badge', 'chip', 'nav', 'dock', 'input', 'heading', 'table', 'icon', 'divider', 'toggle', 'playercard', 'buttonfx', 'tilefx', 'statusfx', 'dockfx', 'overlayfx', 'vizfx', 'hubfx', 'scrollfx', 'tapfx', 'menufx', 'pagefx'];
export const VARIANTS = ['a', 'b', 'c'];
export const OFF = ['glow', 'shine', 'shadows', 'gradients', 'blur', 'textglow', 'embers', 'badgepulse', 'hoverlift', 'borders'];
export const MOTION = [
  'page-fade', 'page-slide', 'page-zoom', 'page-blur', 'page-wipe',
  'enter-rise', 'enter-fade', 'enter-scale', 'enter-blur', 'enter-stagger', 'enter-flip',
  'hover-lift', 'hover-scale', 'hover-glow', 'hover-underline', 'hover-tilt',
  'press-squish', 'press-sink', 'press-ripple',
  'idle-float', 'idle-breathe', 'idle-shimmer', 'idle-ping', 'idle-sway',
];
export const MAX_SCOPES = 300;
export const DEFAULT_THEME = { v: 1, scopes: {} };

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const SCOPE = /^(\*|page:[a-z0-9_-]{1,60}(#[a-z0-9_-]{1,60})?)$/;
const has = (list, v) => list.includes(v);

// one scope, cleaned. Anything unknown is dropped, a bad value is an error (the editor only ever sends good ones).
export function cleanScope(s) {
  const out = { tokens: {}, variants: {}, off: [], motion: [] };
  const t = s?.tokens && typeof s.tokens === 'object' ? s.tokens : {};
  for (const [k, v] of Object.entries(t)) {
    if (v === null || v === '' || v === undefined) continue;
    if (COLOR_TOKENS.includes(k)) { if (!HEX.test(String(v))) return { error: `The colour ${k} must look like #aabbcc.` }; out.tokens[k] = String(v).toLowerCase(); }
    else if (FONT_TOKENS.includes(k)) { if (!has(FONTS, v)) return { error: `The font ${k} is one of the listed fonts.` }; out.tokens[k] = v; }
    else if (k in NUM_TOKENS) { const n = Number(v), [lo, hi] = NUM_TOKENS[k]; if (!Number.isFinite(n) || n < lo || n > hi) return { error: `${k} is a number from ${lo} to ${hi}.` }; out.tokens[k] = Math.round(n * 10) / 10; }
  }
  const vv = s?.variants && typeof s.variants === 'object' ? s.variants : {};
  for (const [k, v] of Object.entries(vv)) { if (!COMPONENTS.includes(k)) continue; if (!has(VARIANTS, v)) return { error: `${k} is look a, b or c.` }; if (v !== 'a') out.variants[k] = v; }
  out.off = [...new Set((Array.isArray(s?.off) ? s.off : []).filter((x) => has(OFF, x)))];
  out.motion = [...new Set((Array.isArray(s?.motion) ? s.motion : []).filter((x) => has(MOTION, x)))];
  return out;
}
const empty = (s) => !Object.keys(s.tokens).length && !Object.keys(s.variants).length && !s.off.length && !s.motion.length;

// b: { scopes } from the editor (the whole saved look, replaced). Empty scopes are dropped. Returns the clean config or { error }.
export function cleanTheme(b) {
  const raw = b?.scopes && typeof b.scopes === 'object' ? b.scopes : null;
  if (!raw) return { error: 'Send { scopes }.' };
  const keys = Object.keys(raw);
  if (keys.length > MAX_SCOPES) return { error: `At most ${MAX_SCOPES} pages and sub-menus can have their own look.` };
  const scopes = {};
  for (const k of keys) {
    if (!SCOPE.test(k)) return { error: `“${k}” is not a page or sub-menu name.` };
    const c = cleanScope(raw[k]);
    if (c.error) return c;
    if (!empty(c)) scopes[k] = c;
  }
  return { v: 1, scopes };
}
