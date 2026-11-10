// Our own icon set (bot/iconset.mjs) at runtime: the bot's uploaded emoji when it has them, a plain unicode one otherwise.
//   it('goal')  → "<:nx_goal:123>" for message text         ic('goal') → { id, name } for a button's `emoji`
//
// Application emoji belong to one Discord app, so emojis.gen.js holds one set per app: { core: {…}, stats: {…}, … }.
// The app is the one handling the request (env.BOT_APP, set by appEnv): call useIconApp(env) once at the top of a
// handler, or pass env / an app name as the second argument for a one-off. An app with no emoji of its own uses
// core's, and anything missing everywhere falls back to the unicode glyph.
import gen from './emojis.gen.js';
import { GLYPHS } from './iconset.mjs';

// Accepts the per-app shape and the old flat { icon: { id, name } } one (that is core's set).
export const setsOf = (g) => (g && Object.values(g).some((v) => v && typeof v.id === 'string') ? { core: g } : g || {});
let sets = setsOf(gen);
export const useEmojiSets = (g) => { sets = setsOf(g); }; // tests

const appName = (x) => (typeof x === 'string' ? x : x?.BOT_APP) || 'core';
let current = 'core';
export const useIconApp = (x) => { current = appName(x); };

const find = (name, x) => {
  const app = x === undefined ? current : appName(x);
  return sets[app]?.[name] ?? sets.core?.[name] ?? null;
};
export const it = (name, x) => { const e = find(name, x); return e ? `<:${e.name}:${e.id}>` : GLYPHS[name]?.[1] ?? ''; };
export const ic = (name, x) => { const e = find(name, x); return e ? { id: e.id, name: e.name } : GLYPHS[name]?.[1]; };
export const resultIcon = (res, x) => it({ W: 'win', D: 'draw', L: 'loss' }[res] ?? '', x);
