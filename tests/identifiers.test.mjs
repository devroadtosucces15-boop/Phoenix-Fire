// A2 dual-read migration: every renamed identifier is written under its Phoenix name and still read under the old one,
// so a member signed in before the deploy stays signed in after it.
import fs from 'node:fs'; import vm from 'node:vm';
import { ROOT, W, mockDiscord, SITE, seal } from './mock.mjs';
import { t, tt, done } from './lib.mjs';

// ---------- 1. session key (login hash + localStorage) ----------
// Worker: the login redirect carries the new key and the old one (a page cached before the deploy still reads it).
const roundTrip = async () => {
  const r = await W('/auth/login?return=' + encodeURIComponent(SITE + 'x.html'));
  const st = new URL(r.headers.get('location')).searchParams.get('state');
  const cb = await W(`/auth/callback?code=x&state=${encodeURIComponent(st)}`);
  return new URLSearchParams(cb.headers.get('location').split('#')[1]);
};
Object.assign(mockDiscord, { id: '9001', username: 'u9001', global_name: 'Ash', roles: [], inGuild: true });
await tt('session: login redirect writes phoenix_session and still sends norex_session (same token)', async () => {
  const h = await roundTrip(); return h.get('phoenix_session') && h.get('phoenix_session') === h.get('norex_session');
});
await tt('session: login errors are sent as phoenix_error and norex_error', async () => {
  Object.assign(mockDiscord, { inGuild: false }); const h = await roundTrip(); Object.assign(mockDiscord, { inGuild: true });
  return h.get('phoenix_error') && h.get('phoenix_error') === h.get('norex_error');
});

// Client entry scripts, run in a tiny browser stand-in.
const browser = (store, hash = '') => {
  const ls = new Map(Object.entries(store));
  const storage = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) });
  const el = () => ({ append() {}, addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {}, toggle() {} }, style: {}, dataset: {}, querySelectorAll: () => [], querySelector: () => null });
  const win = { NOREX_API: 'https://api.test', localStorage: storage(ls), sessionStorage: storage(new Map()), location: { hash, pathname: '/x.html', search: '', href: 'https://site.test/x.html' + hash, reload() {} },
    history: { replaceState() {} }, document: { createElement: el, head: el(), body: el(), addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, readyState: 'complete' },
    fetch: () => new Promise(() => {}), TextDecoder, atob, btoa, URLSearchParams, Promise, JSON, Date, Math, Uint8Array, setTimeout() {}, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  win.window = win; return { win, ls };
};
const tok = await seal({ u: '9001', n: 'Ash', role: 'member' });
const sessionJs = fs.readFileSync(ROOT + 'next/static/session.js', 'utf8');
const runSession = (store, hash) => { const b = browser(store, hash); try { vm.runInNewContext(sessionJs, b.win); } catch (e) { b.error = e; } return b; };
{
  const b = runSession({ norex_session: tok });
  t('session: a sign-in stored under norex_session (before the deploy) survives and moves to phoenix_session', !b.error && b.win.NorexAuth?.token === tok && b.ls.get('phoenix_session') === tok);
}
{
  const b = runSession({}, '#phoenix_session=' + tok);
  t('session: a new login hash is written to phoenix_session', b.win.NorexAuth?.token === tok && b.ls.get('phoenix_session') === tok && !b.ls.has('norex_session'));
}
{
  const b = runSession({}, '#norex_session=' + tok);
  t('session: an old-style login hash is still read', b.win.NorexAuth?.token === tok && b.ls.get('phoenix_session') === tok);
}
{
  const b = runSession({ phoenix_session: 'junk', norex_session: 'junk' });
  t('session: an expired or broken token clears both keys', !b.win.NorexAuth?.token && !b.ls.has('phoenix_session') && !b.ls.has('norex_session'));
}
// Classic site and the other page scripts: new key first, old key as fallback, never the old key alone.
const web = fs.readdirSync(ROOT + 'web').filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(ROOT + 'web/' + f, 'utf8')]);
const lone = web.filter(([, s]) => s.replace(/getItem\('phoenix_session'\) \|\| localStorage\.getItem\('norex_session'\)|get\('phoenix_session'\) \|\| ls\.get\('norex_session'\)/g, '').match(/(getItem|ls\.get)\('norex_session'\)/)).map(([f]) => f);
t(`session: web/ readers try phoenix_session before norex_session${lone.length ? ' – lone old reads in ' + lone.join(', ') : ''}`, lone.length === 0);
const app = fs.readFileSync(ROOT + 'web/app.js', 'utf8');
t('session: classic app.js writes phoenix_session and migrates norex_session once', app.includes("const KEY = 'phoenix_session', OLD = 'norex_session'") && app.includes('else if (!ls.get(KEY) && ls.get(OLD)) ls.set(KEY, ls.get(OLD))'));
t('session: claim page reads both keys', /KEY='phoenix_session',OLD='norex_session'/.test(fs.readFileSync(ROOT + 'phoenix/claim.html', 'utf8')));

// ---------- 2. shared-secret header (Worker <-> Actions / scripts) ----------
const { settingsKey } = await import('../bot/settings.js');
const { env } = await import('./mock.mjs');
const skey = await settingsKey(env.DISCORD_CLIENT_SECRET);
const keyed = async (headers) => (await W('/api/bot/settings/public', { headers })).status;
await tt('header: X-Phoenix-Key is accepted', async () => (await keyed({ 'X-Phoenix-Key': skey })) === 200);
await tt('header: X-Norex-Key is still accepted', async () => (await keyed({ 'X-Norex-Key': skey })) === 200);
await tt('header: a wrong X-Phoenix-Key is refused, even next to a right old one', async () => (await keyed({ 'X-Phoenix-Key': 'nope', 'X-Norex-Key': skey })) === 403);
await tt('header: no key is refused', async () => (await keyed({})) === 403);
const src = (f) => fs.readFileSync(ROOT + f, 'utf8');
const senders = ['scripts/lib.mjs', 'scripts/lib/org.mjs', 'scripts/ea-relay.mjs', 'bot/register.mjs', 'scripts/fetch.mjs'];
t('header: scripts, Actions helpers and register.mjs send X-Phoenix-Key only', senders.every((f) => !src(f).includes('X-Norex-Key')) && ['scripts/lib.mjs', 'scripts/lib/org.mjs', 'bot/register.mjs'].every((f) => src(f).includes("'X-Phoenix-Key'")));
const bots = fs.readdirSync(ROOT + 'bot').filter((f) => /\.m?js$/.test(f) && f !== 'sharedkey.js');
t('header: every keyed Worker route reads the header through sharedKey()', bots.every((f) => !src('bot/' + f).includes("headers.get('X-Norex-Key')")));
const wf = fs.existsSync(ROOT + '.github/workflows') ? fs.readdirSync(ROOT + '.github/workflows').map((f) => src('.github/workflows/' + f)) : [];
t('header: no workflow sends the old header', wf.every((s) => !/X-Norex-Key/i.test(s)));

done();
