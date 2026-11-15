// /avatarcard panel (PF-020 4e): the private member panel runs the real Card Studio pipeline.
import { env, login, r2objects, W } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import { cardOpen, cardInteraction, cardPanel, enc, dec, CARD_ID } from '../bot/cardpanel.js';
import { componentKey } from '../bot/controls.js';

env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), cardStudio: 'members' });
const mgr = await login('600', ['mgr'], 'Coach');
const PNG = (w, h) => { const b = new Uint8Array(2000); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); const v = new DataView(b.buffer); v.setUint32(16, w); v.setUint32(20, h); return b; };
const up = (q, bytes, type = 'image/png') => W(`/api/cards/templates/upload?${q}`, { method: 'POST', headers: { Authorization: 'Bearer ' + mgr, 'Content-Type': type }, body: bytes }).then((r) => r.json());
const bg = await up('kind=bg&name=Smoke', PNG(1024, 1024));
const pose = await up('kind=pose&name=Flex&prompt=flexing', new Uint8Array(100), 'image/jpeg');
await login('700', [], 'Panel Member');
const me = { u: '700', n: 'Panel Member', a: null, role: 'member' };

const wrapped = globalThis.fetch;
globalThis.fetch = async (url, init) => (String(url).startsWith('https://cdn.example/') ? new Response(PNG(300, 300), { status: 200 }) : wrapped(url, init));
const ids = (m) => JSON.stringify(m).match(/pf:card:[^"]+/g) || [];
const texts = (m) => JSON.stringify(m);
const ix = (id, extra = {}, type = 3) => ({ type, data: { custom_id: id, ...extra } });

t('ids round-trip and stay under Discord\'s 100 characters', () => {
  const s = { ph: 'a'.repeat(32) + 'p', o: 3, b: 123456, p: 654321, k: 'f', n: '10' };
  const id = enc('kit-f', s);
  return id.length <= 100 && JSON.stringify(dec(id).s) === JSON.stringify(s) && dec('pf:card:go:bad') === null && CARD_ID.test(id);
});
t('Control Center key ignores the per-panel state', componentKey(enc('go', { ph: 'last', o: 3, b: 5, p: 6, k: 'm', n: '' })) === 'comp:pf:card:go');

await tt('flag off: a plain notice, no panel', async () => {
  env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), cardStudio: 'owner' });
  const r = await cardOpen({}, env, me);
  env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), cardStudio: 'members' });
  return /not switched on/.test(texts(r)) && !ids(r).length;
});
let state;
await tt('no photo yet: panel opens, send is disabled', async () => {
  const r = await cardOpen({}, env, me);
  const go = JSON.stringify(r).match(/"custom_id":"pf:card:go[^}]*/)[0];
  state = dec(ids(r)[0]).s;
  return r.type === 4 && state.ph === '' && /"disabled":true/.test(go) && /Still needed: a photo/.test(texts(r));
});
await tt('an attached photo is stored privately and the panel carries it', async () => {
  const r = await cardOpen({}, env, me, { content_type: 'image/png', size: 1000, url: 'https://cdn.example/a.png' });
  state = dec(ids(r)[0]).s;
  return /^[0-9a-f]{32}p$/.test(state.ph) && r2objects.has(`cardphoto/${state.ph.slice(0, 32)}.png`) && r.data.flags & 64;
});
await tt('bad attachment types and sizes are refused', async () => (
  /PNG, JPG or WEBP/.test(texts(await cardOpen({}, env, me, { content_type: 'image/gif', size: 5, url: 'https://cdn.example/a.gif' })))
  && /too big/.test(texts(await cardOpen({}, env, me, { content_type: 'image/png', size: 9e6, url: 'https://cdn.example/a.png' })))));

let s = { ...state };
const step = async (act, extra, type) => {
  const r = await cardInteraction(ix(enc(act, s), extra, type), env, me, async () => []);
  if (r.type === 7) { const d = dec(ids(r)[0]); if (d) s = d.s; }
  return r;
};
await tt('picking a background, pose and the female kit updates the panel in place', async () => {
  let r = await step('bg', { values: [String(bg.id)] }); const a = s.b === bg.id && r.type === 7;
  r = await step('pose', { values: [String(pose.id)] });
  r = await step('kit-f');
  return a && s.p === pose.id && s.k === 'f' && /Kit number/.test(texts(r));
});
await tt('the number button opens a form, the form sets it, nonsense is refused', async () => {
  const m = await step('num'); const ok = m.type === 9 && m.data.components[0].components[0].max_length === 2;
  const set = await step('num', { components: [{ components: [{ custom_id: 'n', value: '10' }] }] }, 5);
  const good = s.n === '10' && /Kit #10/.test(texts(set));
  const bad = await step('num', { components: [{ components: [{ custom_id: 'n', value: 'abc' }] }] }, 5);
  return ok && good && /0 to 99/.test(texts(bad)) && s.n === '10';
});
await tt('Send makes a real Card Studio request with kit variant and number, then the month is used up', async () => {
  const r = await step('go');
  const row = await env.DB.prepare("SELECT * FROM card_requests WHERE user_id = '700'").first();
  const again = await cardInteraction(ix(enc('go', { ...s, ph: 'last' })), env, me, async () => []);
  return /Sent to a manager/.test(texts(r)) && row.kit_variant === 'female' && row.kit_number === 10 && row.bg_id === bg.id && row.pose_id === pose.id
    && row.status === 'pending' && !r2objects.has(`cardphoto/${state.ph.slice(0, 32)}.png`) && /already sent/.test(texts(again));
});
await tt('the next /avatarcard offers the photo from the last request', async () => {
  const r = await cardOpen({}, env, me);
  return dec(ids(r)[0]).s.ph === 'last';
});
t('no NOREX words, red or crest anywhere in the panel', () => !/norex|c8352c|crest-sm/i.test(JSON.stringify([ids({}), texts(cardPanelSample)])));
const cardPanelSample = await cardPanel(env, me, { ph: 'last', o: 3, b: bg.id, p: pose.id, k: 'm', n: '' });
t('the panel is ephemeral, a v2 message and only uses pf:card: ids', () => (cardPanelSample.flags & 64) && (cardPanelSample.flags & (1 << 15)) && ids(cardPanelSample).every((x) => x.startsWith('pf:card:')));
t('out-of-date ids get a notice, not a crash', async () => /out of date/.test(texts(await cardInteraction(ix('pf:card:go:zzz'), env, me, async () => []))));

done();
