// Application emoji belong to one Discord app: the upload goes to every configured app, the Worker picks the set of the
// app handling the request, and falls back to core, then to the unicode glyph.
import { it, ic, resultIcon, setsOf, useEmojiSets, useIconApp } from '../bot/icons.js';
import { ensureAppEmojis } from '../bot/emojiset.mjs';
import { registrationPlan } from '../bot/apps.js';
import { NAMES, GLYPHS } from '../bot/iconset.mjs';
import { t, tt, done } from './lib.mjs';

// ---------- lookup ----------
const sets = { core: { goal: { id: '1', name: 'nx_goal' }, win: { id: '2', name: 'nx_win' } }, fun: { goal: { id: '9', name: 'nx_goal' } } };
useEmojiSets(sets);
t('no app → core set', it('goal') === '<:nx_goal:1>');
t('explicit app name wins', it('goal', 'fun') === '<:nx_goal:9>');
t('env.BOT_APP picks the app', it('goal', { BOT_APP: 'fun' }) === '<:nx_goal:9>');
t('an app missing one icon falls back to core\'s', it('win', 'fun') === '<:nx_win:2>');
t('an app with no set at all uses core\'s', it('goal', 'stats') === '<:nx_goal:1>');
t('missing everywhere → unicode glyph', it('music', 'fun') === GLYPHS.music[1] && ic('music') === GLYPHS.music[1]);
t('ic gives { id, name }', JSON.stringify(ic('goal', 'fun')) === JSON.stringify({ id: '9', name: 'nx_goal' }));
t('resultIcon passes the app through', resultIcon('W', 'fun') === '<:nx_win:2>' && resultIcon('?', 'fun') === '');
useIconApp({ BOT_APP: 'fun' });
t('useIconApp sets the default app', it('goal') === '<:nx_goal:9>');
useIconApp('core');
t('…and back to core', it('goal') === '<:nx_goal:1>');
t('old flat emojis.gen.js shape counts as core', JSON.stringify(setsOf({ goal: { id: '1', name: 'nx_goal' } })) === JSON.stringify({ core: { goal: { id: '1', name: 'nx_goal' } } }));
t('empty gen file is fine', JSON.stringify(setsOf({})) === '{}' && JSON.stringify(setsOf(undefined)) === '{}');
useEmojiSets({});
t('no emoji anywhere → every icon has a unicode fallback', NAMES.every((n) => it(n, 'stats') === GLYPHS[n][1]));

// ---------- upload (fake Discord, no Chrome) ----------
const fake = (existing = {}) => {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', auth: init.headers.Authorization, body: init.body ? JSON.parse(init.body) : null });
    if (!init.method) return { ok: true, status: 200, json: async () => ({ items: Object.entries(existing).map(([n, id]) => ({ id, name: n })) }) };
    const name = JSON.parse(init.body).name;
    return { ok: true, status: 200, json: async () => (name === 'nx_music' ? { message: 'nope' } : { id: `id-${name}`, name }) };
  };
  return { calls, fetchFn };
};
const render = (n) => Buffer.from(`png-${n}`);
const f1 = fake({ nx_goal: '77', other: '5' });
const warns = [];
const map = await ensureAppEmojis({ appId: '200', token: 'tok2', render, fetchFn: f1.fetchFn, warn: (m) => warns.push(m) });
t('upload: lists then posts to that app\'s own emoji endpoint with its own token', f1.calls[0].url.includes('/applications/200/emojis') && f1.calls.every((c) => c.auth === 'Bot tok2'));
t('upload: an emoji the app already has is not uploaded again', map.goal.id === '77' && !f1.calls.some((c) => c.body?.name === 'nx_goal'));
t('upload: only nx_ emoji are tracked', !('other' in map) && !Object.keys(map).some((k) => k.startsWith('nx_')));
t('upload: every missing icon is created', NAMES.filter((n) => n !== 'goal' && n !== 'music').every((n) => map[n]?.id === `id-nx_${n}`));
t('upload: one failed icon is skipped with a warning, not fatal', !map.music && warns.length === 1 && warns[0].includes('music'));
t('upload: image is a base64 png data URL', f1.calls.find((c) => c.body?.name === 'nx_win').body.image === `data:image/png;base64,${Buffer.from('png-win').toString('base64')}`);
await tt('upload: a failed listing throws (the caller keeps the old set)', async () => {
  try { await ensureAppEmojis({ appId: '1', token: 't', render, fetchFn: async () => ({ ok: false, status: 401 }) }); return false; } catch (e) { return /401/.test(e.message); }
});

// ---------- which apps get the set ----------
const env = { DISCORD_APP_ID: '100', DISCORD_PUBLIC_KEY: 'aa', DISCORD_BOT_TOKEN: 'tok', DISCORD_APP_ID_STATS: '200', DISCORD_PUBLIC_KEY_STATS: 'bb', DISCORD_BOT_TOKEN_STATS: 'tok2', DISCORD_APP_ID_FUN: '300', DISCORD_PUBLIC_KEY_FUN: 'cc' };
t('every configured app with a token is targeted; one without a token is not', registrationPlan(env).map((p) => p.app).join() === 'core,stats');
t('each target carries its own id + token', registrationPlan(env).map((p) => `${p.appId}:${p.token}`).join() === '100:tok,200:tok2');

done();
