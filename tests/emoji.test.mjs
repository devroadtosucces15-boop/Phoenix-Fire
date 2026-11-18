// PF-024 Item 22 – the emoji and sticker suggester (bot/emoji.js): /emoji suggest | mine | delete | review, the manager card (Approve, Reject) and the Control Center review API.
// Guardrails: Discord's size limits per kind (emoji 256 KiB, sticker 512 KiB) can only be tightened by config; format and pixel size are read from the image's own bytes (no SVG, WebP, JPEG sticker,
// animated PNG emoji, non-square, tiny or huge images); names are cleaned to Discord's characters; per-member pending cap and duplicate names are enforced inside the INSERT; stored privately in R2 under emoji/,
// reviewed by managers only, nothing is imported or shown publicly; Phoenix branding with no NOREX name/colour/crest; the review channel comes from Organization config; nothing is logged.
import fs from 'node:fs';
import { env, sqlite, R2 } from './mock.mjs';
import worker from '../bot/worker.js';
import { t, tt, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { COMMANDS, APP_COMMANDS } from '../bot/commanddefs.js';
import { PERMS } from '../bot/roles.js';
import { CHANNEL_PURPOSES } from '../bot/orgconsts.js';
import { CHANNEL_PURPOSE_INFO } from '../bot/orgconfig.js';
import { ROUTES, routeOf, ccDenied } from '../bot/ccpermissions.js';
import { limits, cleanName, cdnUrl, inspect, validate, receiptMessage, reviewMessage, emojiCommand, emojiButton, emojiRoute, decide, KINDS } from '../bot/emoji.js';

const FEAT0 = JSON.parse(env.FEATURES);
env.FEATURES = JSON.stringify({ ...FEAT0, emoji: 'members' });
Object.assign(env, { DISCORD_BOT_TOKEN: 'tok', DISCORD_GUILD_ID: 'g-em', DISCORD_APP_ID: '100' });
const T = Date.UTC(2026, 11, 1, 12);
const calls = [], real = globalThis.fetch; let nextId = 100;

// ---------- synthetic images ----------
const u32 = (n) => Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const chunk = (type, data) => Buffer.concat([u32(data.length), Buffer.from(type), data, Buffer.alloc(4)]);
const png = (w, h, { apng = false, pad = 0 } = {}) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', Buffer.concat([u32(w), u32(h), Buffer.from([8, 6, 0, 0, 0])])),
  apng ? chunk('acTL', Buffer.concat([u32(2), u32(0)])) : Buffer.alloc(0), chunk('IDAT', Buffer.alloc(pad + 8, 5)), chunk('IEND', Buffer.alloc(0))]);
const gif = (w, h, frames = 1, pad = 0) => Buffer.concat([Buffer.from('GIF89a'), Buffer.from([w & 255, w >> 8, h & 255, h >> 8, 0, 0, 0]),
  ...Array.from({ length: frames }, () => Buffer.concat([Buffer.from([0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0, 2, 4]), Buffer.alloc(4, 1), Buffer.from([0]), Buffer.alloc(pad)])), Buffer.from([0x3b])]);
const jpeg = (w, h) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 0, 0, 0]), Buffer.alloc(40, 3)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>'.padEnd(80, ' '));
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(40)]);

let served = png(128, 128);
globalThis.fetch = async (u, init = {}) => {
  u = String(u);
  if (u.startsWith('https://discord.com/')) { calls.push({ u, method: init.method, body: init.body ? JSON.parse(init.body) : null }); return Response.json(init.method === 'POST' ? { id: `m${++nextId}` } : {}); }
  if (u.startsWith('https://cdn.discordapp.com/')) return new Response(served, { headers: { 'Content-Length': String(served.length) } });
  return real(u, init);
};
const logs = []; const reallog = console.log; console.log = (...a) => { logs.push(a.join(' ')); reallog(...a); };
const reset = () => { calls.length = 0; served = png(128, 128); sqlite.exec('DELETE FROM emoji_suggestions; DELETE FROM discord_channels'); };
const MEMBER = { u: '500', role: 'member' }, MGR = { u: '900', role: 'manager', name: 'Coach' };
const att = (o = {}) => ({ id: 'a1', filename: 'flame.png', content_type: 'image/png', size: served.length, url: 'https://cdn.discordapp.com/attachments/1/2/flame.png?ex=1', ...o });
const ia = (id, sub, options = [], attachment) => ({ member: { user: { id, username: `u${id}` }, nick: id === '500' ? 'Ash' : 'Coach' }, token: 'tok', channel_id: 'c1',
  data: { name: 'emoji', options: [{ name: sub, type: 1, options }], resolved: attachment ? { attachments: { a1: attachment } } : {} } });
const o = (obj) => Object.entries(obj).map(([name, value]) => ({ name, value }));
const submit = async (id, who, attachment, extra = {}, e = env) => {
  calls.length = 0; const waits = [];
  const r = await emojiCommand(ia(id, 'suggest', o({ image: 'a1', type: 'emoji', name: 'phoenix_flame', ...extra }), attachment), e, who, { waitUntil: (p) => waits.push(p) }, T);
  await Promise.all(waits);
  return { r, patch: calls.find((c) => c.method === 'PATCH')?.body };
};
const txt = (m) => plainText(m?.data ?? m ?? {});
const count = () => sqlite.prepare('SELECT COUNT(*) n FROM emoji_suggestions').get().n;

// ---------- pure helpers ----------
t('limits: Discord ceilings (emoji 256 KiB, sticker 512 KiB); config can only go lower', limits({}, 'emoji').maxBytes === 256 * 1024 && limits({}, 'sticker').maxBytes === 512 * 1024 && limits({ EMOJI_SUGGEST: '{"emojiKb":9999,"stickerKb":9999}' }, 'emoji').maxBytes === 256 * 1024
  && limits({ EMOJI_SUGGEST: '{"emojiKb":64}' }, 'emoji').maxBytes === 64 * 1024 && limits({ EMOJI_SUGGEST: 'nope' }, 'sticker').maxBytes === 512 * 1024 && limits({}).maxPending === 3 && limits({ EMOJI_SUGGEST: '{"maxPending":999}' }).maxPending === 20);
t('name: only letters, digits and underscore, 2 to 32 (30 for a sticker); spaces and dashes become underscores; nothing usable = null', cleanName('Phoenix Flame!') === 'Phoenix_Flame' && cleanName('a-b c') === 'a_b_c' && cleanName('<@123> héllo') === '123_hello' && cleanName('x') === null && cleanName('!!') === null && cleanName('') === null && cleanName('a'.repeat(50)).length === 32 && cleanName('a'.repeat(50), 'sticker').length === 30 && !/[^A-Za-z0-9_]/.test(cleanName('@everyone 💥 ok_ok')));
t('url: only https Discord CDN hosts', !!cdnUrl('https://cdn.discordapp.com/a/b.png') && !!cdnUrl('https://media.discordapp.net/a/b.png') && !cdnUrl('https://evil.example/a.png') && !cdnUrl('http://cdn.discordapp.com/a.png') && !cdnUrl('https://cdn.discordapp.com.evil.io/a.png') && !cdnUrl('nonsense'));
t('inspect: PNG, APNG, GIF (frames counted) and JPEG are read from their bytes; SVG, WebP and junk are not images', JSON.stringify(inspect(png(128, 96))) === '{"mime":"image/png","width":128,"height":96,"animated":false}' && inspect(png(64, 64, { apng: true })).animated === true
  && inspect(gif(64, 64, 1)).animated === false && inspect(gif(64, 48, 3)).animated === true && inspect(gif(64, 48, 3)).height === 48 && inspect(jpeg(200, 100)).width === 200 && inspect(jpeg(200, 100)).height === 100 && !inspect(SVG) && !inspect(WEBP) && !inspect(Buffer.alloc(100, 7)) && !inspect(Buffer.alloc(4)));
const bad = (kind, b, re) => { const v = validate(env, kind, b); return !v.ok && re.test(v.why); };
t('validate emoji: PNG, JPEG, GIF pass; animated GIF passes; animated PNG, SVG, WebP refused', !!validate(env, 'emoji', png(128, 128)).ok && !!validate(env, 'emoji', jpeg(128, 128)).ok && !!validate(env, 'emoji', gif(96, 96, 4)).ok && bad('emoji', png(128, 128, { apng: true }), /animated emoji must be a GIF/) && bad('emoji', SVG, /not a real/) && bad('emoji', WEBP, /not a real/));
t('validate sticker: PNG, APNG and GIF pass; JPEG refused', !!validate(env, 'sticker', png(320, 320)).ok && !!validate(env, 'sticker', png(320, 320, { apng: true })).ok && !!validate(env, 'sticker', gif(320, 320, 3)).ok && bad('sticker', jpeg(320, 320), /PNG, APNG or GIF/));
t('validate size: emoji over 256 KiB refused, sticker up to 512 KiB passes, over refused; empty refused', bad('emoji', png(128, 128, { pad: 256 * 1024 }), /at most 256 KB/) && !!validate(env, 'emoji', png(128, 128, { pad: 200 * 1024 })).ok && !!validate(env, 'sticker', png(320, 320, { pad: 300 * 1024 })).ok && bad('sticker', png(320, 320, { pad: 512 * 1024 }), /at most 512 KB/) && bad('emoji', Buffer.alloc(0), /empty/));
t('validate pixels: too small, too big and non-square refused (from the real header, not the file name)', bad('emoji', png(16, 16), /too small/) && bad('emoji', png(4000, 4000), /too big/) && bad('emoji', png(128, 200), /square/) && bad('emoji', gif(40, 200, 1), /square/) && !!validate(env, 'emoji', png(128, 140)).ok);
t('validate: the validate result never trusts the declared kind list (unknown kind refused)', bad('banner', png(128, 128), /emoji or sticker/));

// ---------- gates ----------
reset();
const off = await emojiCommand(ia('500', 'mine'), { ...env, FEATURES: JSON.stringify({ ...FEAT0, emoji: 'off' }) }, MEMBER);
t('flag off → not switched on, nothing stored', /Not switched on/.test(txt(off)) && count() === 0);
const guest = await emojiCommand(ia('500', 'mine'), env, { u: '500', role: 'guest' });
t('guests cannot use it (flag level or members-only gate)', /Members only|Not switched on/.test(txt(guest)));

// ---------- suggest ----------
const ok = await submit('500', MEMBER, att(), { name: 'Phoenix Flame!' });
const row = sqlite.prepare('SELECT * FROM emoji_suggestions').get();
t('suggest: deferred private reply, then the receipt is patched in', ok.r.type === 5 && (ok.r.data.flags & 64) === 64 && (ok.r.data.flags & (1 << 15)) !== 0 && !!ok.patch);
t('suggest: R2 object under emoji/, D1 row pending with user, cleaned name, kind, format, pixel size, size, created', /^emoji\/[0-9a-f]{32}\.png$/.test(row.key) && row.status === 'pending' && row.user_id === '500' && row.name === 'Phoenix_Flame' && row.kind === 'emoji' && row.mime === 'image/png' && row.width === 128 && row.height === 128 && row.size === served.length && row.created_at === T && !!(await R2.get(row.key)));
const rc = plainText(ok.patch);
t('receipt: Phoenix name, orange accent, name, status, private, no NOREX name/colour/crest', /phoenix fire/i.test(rc) && /Phoenix_Flame/.test(rc) && /Waiting for a manager/.test(rc) && !/norex/i.test(rc) && JSON.stringify(ok.patch).includes(String(0xe8651a)) && !/c8352c|080b11/i.test(JSON.stringify(ok.patch)));
t('no review channel configured → no card at all (only the receipt patch)', calls.every((c) => c.method === 'PATCH'));

const wrong = await submit('500', MEMBER, att({ filename: 'a.png' }), { name: 'bad_one' }); // declared png, real bytes are SVG
served = SVG;
const svg = await submit('500', MEMBER, att({ size: SVG.length, content_type: 'image/png' }), { name: 'svg_one' });
t('an SVG renamed to .png is refused from its bytes and nothing is stored', /cannot be used|not a real/.test(plainText(svg.patch)) && count() === 2);
served = png(128, 128, { pad: 300 * 1024 });
const big = await submit('500', MEMBER, att({ size: served.length }), { name: 'big_one' });
t('over the emoji size limit is refused before anything is stored', /too big/.test(plainText(big.patch)) && count() === 2);
served = png(128, 128);
const evil = await submit('500', MEMBER, att({ url: 'https://evil.example/x.png' }), { name: 'evil_one' });
t('a file not on Discord\'s CDN is refused', /need an image/.test(plainText(evil.patch)));
const badName = await submit('500', MEMBER, att(), { name: '!' });
t('a name with nothing usable left is refused', /name does not work/.test(plainText(badName.patch)));
const none = await submit('500', MEMBER, undefined);
t('no attachment → asks for one', /need an image/.test(plainText(none.patch)));
const dup = await submit('501', { u: '501', role: 'member' }, att(), { name: 'phoenix_flame' });
t('a name already waiting (any case) is refused for the same kind, but free for the other kind', /name is taken/.test(plainText(dup.patch)) && count() === 2
  && /Sent to the managers/.test(plainText((await submit('501', { u: '501', role: 'member' }, att(), { name: 'PHOENIX_FLAME', type: 'sticker' }, env)).patch)));
void wrong;

// ---------- pending cap ----------
reset();
const cap = { ...env, EMOJI_SUGGEST: '{"maxPending":2}' };
await submit('500', MEMBER, att(), { name: 'one_a' }, cap); await submit('500', MEMBER, att(), { name: 'two_b' }, cap);
const third = await submit('500', MEMBER, att(), { name: 'three_c' }, cap);
const other = await submit('501', { u: '501', role: 'member' }, att(), { name: 'four_d' }, cap);
t('per-member pending cap (from config) stops the third; another member is unaffected', /Too many are waiting/.test(plainText(third.patch)) && /Sent to the managers/.test(plainText(other.patch)) && sqlite.prepare("SELECT COUNT(*) n FROM emoji_suggestions WHERE user_id = '500'").get().n === 2);

// ---------- the manager card ----------
reset();
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('g-em', 'Test')").run();
const sid = sqlite.prepare("SELECT id FROM discord_servers WHERE guild_id = 'g-em'").get().id;
sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '7901', 'emoji_review', 'org', '', 1)").run(sid);
await submit('500', MEMBER, att(), { name: 'phoenix_flame' });
const post = calls.find((c) => c.method === 'POST'), crow = sqlite.prepare('SELECT * FROM emoji_suggestions').get();
const cardTxt = plainText(post?.body ?? {}), cardJson = JSON.stringify(post?.body ?? {});
t('a configured emoji_review channel gets one Phoenix card: name, type, size, who, Approve and Reject; no ping; no stored key', post?.u.endsWith('/channels/7901/messages') && /phoenix_flame/.test(cardTxt) && /<@500>/.test(cardTxt) && cardJson.includes(`norex:emo:ok:${crow.id}`) && cardJson.includes(`norex:emo:no:${crow.id}`) && !cardJson.includes(crow.key) && /phoenix fire/i.test(cardTxt)
  && !/norex/i.test(cardTxt) && cardJson.includes(String(0xe8651a)) && !/c8352c|080b11/i.test(cardJson) && JSON.stringify(post.body.allowed_mentions) === '{"parse":[]}' && sqlite.prepare('SELECT message_id FROM emoji_suggestions').get().message_id === 'm101');
const btn = (verb, who) => emojiButton({ member: { user: { id: who.u, username: 'c' }, nick: 'Coach' }, data: { custom_id: `norex:emo:${verb}:${crow.id}` } }, env, who, T + 1000);
const memBtn = await btn('ok', MEMBER);
t('a member pressing Approve is refused and nothing changes', /Managers only/.test(txt(memBtn)) && sqlite.prepare('SELECT status FROM emoji_suggestions').get().status === 'pending');
calls.length = 0;
const approved = await btn('ok', MGR);
t('a manager approves: row approved with who and when, the card is edited (buttons gone, picture dropped), the image stays in R2', approved.type === 7 && sqlite.prepare('SELECT status, reviewed_by, reviewed_at FROM emoji_suggestions').get().reviewed_by === '900' && /Approved/.test(plainText(approved.data)) && !JSON.stringify(approved.data).includes('norex:emo:') && calls.some((c) => c.method === 'PATCH' && c.u.includes('/channels/7901/messages/m101')) && !!(await R2.get(crow.key)));
const again = await btn('no', MGR);
t('a decided suggestion cannot be flipped by a second press', /Approved/.test(plainText(again.data)) && sqlite.prepare('SELECT status FROM emoji_suggestions').get().status === 'approved');

// ---------- mine, delete, review ----------
reset();
await submit('500', MEMBER, att(), { name: 'mine_one' }); await submit('500', MEMBER, att(), { name: 'mine_two', type: 'sticker' });
const [a, b] = sqlite.prepare('SELECT * FROM emoji_suggestions ORDER BY id').all();
const mine = await emojiCommand(ia('500', 'mine'), env, MEMBER, null, T);
t('/emoji mine lists the member\'s own with status', txt(mine).includes('mine_one') && txt(mine).includes('mine_two') && /Waiting for a manager/.test(txt(mine)));
const stranger = await emojiCommand(ia('501', 'delete', o({ number: a.id })), env, { u: '501', role: 'member' }, null, T);
t('another member cannot delete it', /Nothing to delete/.test(txt(stranger)) && sqlite.prepare('SELECT status FROM emoji_suggestions WHERE id = ?').get(a.id).status === 'pending');
const memRev = await emojiCommand(ia('500', 'review'), env, MEMBER, null, T), mgrRev = await emojiCommand(ia('900', 'review'), env, MGR, null, T);
t('/emoji review is for managers and lists who is waiting', /Managers only/.test(txt(memRev)) && txt(mgrRev).includes('<@500>') && txt(mgrRev).includes('mine_one'));
const del = await emojiCommand(ia('500', 'delete'), env, MEMBER, null, T);
t('the member withdraws their latest waiting suggestion: R2 object gone, row kept as deleted', /Removed/.test(txt(del)) && sqlite.prepare('SELECT status FROM emoji_suggestions WHERE id = ?').get(b.id).status === 'deleted' && !(await R2.get(b.key)));
await decide(env, a.id, 'approve', '900', 'Coach', T);
const memDelApproved = await emojiCommand(ia('500', 'delete', o({ number: a.id })), env, MEMBER, null, T);
t('a member cannot delete an approved one (kept for the importer); a manager can', /Nothing to delete/.test(txt(memDelApproved)) && /Removed/.test(txt(await emojiCommand(ia('900', 'delete', o({ number: a.id })), env, MGR, null, T))));
t('nothing logged a name or image detail', !logs.some((l) => /mine_one|mine_two|phoenix_flame/.test(l)));

// ---------- the Control Center review API ----------
reset();
await submit('500', MEMBER, att(), { name: 'route_one' });
const rid = sqlite.prepare('SELECT id FROM emoji_suggestions').get().id;
const url = (p) => new URL('https://x.invalid' + p);
const list = await (await emojiRoute('/api/emoji/review', 'GET', null, MGR, env, url('/api/emoji/review'), T)).json();
t('GET /api/emoji/review: managers get the list (waiting first), never the storage key or a link', list.items.length === 1 && list.items[0].name === 'route_one' && list.items[0].status === 'pending' && !JSON.stringify(list).includes('emoji/') && list.limits.emojiKb === 256 && list.limits.stickerKb === 512);
const memRoute = await emojiRoute('/api/emoji/review', 'GET', null, MEMBER, env, url('/api/emoji/review'), T);
t('a member is 403 on every review route', memRoute.status === 403 && (await emojiRoute('/api/emoji/review/decide', 'POST', { id: rid, action: 'approve' }, MEMBER, env, null, T)).status === 403 && (await emojiRoute('/api/emoji/review/file', 'GET', null, MEMBER, env, url(`/api/emoji/review/file?id=${rid}`), T)).status === 403);
t('a path outside /api/emoji/review is not this route', (await emojiRoute('/api/feed', 'GET', null, MGR, env, null, T)) === null);
const file = await (await emojiRoute('/api/emoji/review/file', 'GET', null, MGR, env, url(`/api/emoji/review/file?id=${rid}`), T)).json();
t('GET /api/emoji/review/file: the stored image comes back on request as a data URL', /^data:image\/png;base64,/.test(file.dataUrl) && Buffer.from(file.dataUrl.split(',')[1], 'base64').equals(served));
t('the file route 404s for an unknown number', (await emojiRoute('/api/emoji/review/file', 'GET', null, MGR, env, url('/api/emoji/review/file?id=99999'), T)).status === 404);
const rej = await emojiRoute('/api/emoji/review/decide', 'POST', { id: rid, action: 'reject' }, MGR, env, null, T);
t('POST decide rejects once: row rejected with the reviewer; a second decision is 409; a bad action is 409', rej.status === 200 && sqlite.prepare('SELECT status, reviewed_by FROM emoji_suggestions').get().reviewed_by === '900' && (await emojiRoute('/api/emoji/review/decide', 'POST', { id: rid, action: 'approve' }, MGR, env, null, T)).status === 409 && (await emojiRoute('/api/emoji/review/decide', 'POST', { id: rid, action: 'nope' }, MGR, env, null, T)).status === 409);
t('flag off → the route is 404', (await emojiRoute('/api/emoji/review', 'GET', null, MGR, { ...env, FEATURES: JSON.stringify({ ...FEAT0, emoji: 'off' }) }, url('/api/emoji/review'), T)).status === 404);
const S = { out: null, member: { u: '2', role: 'member' }, manager: { u: '4', role: 'manager' }, owner: { u: '5', role: 'owner' } };
t('Control Center permissions: the three review routes belong to the manager tool `emojis`; signed out 401, member 403, manager and owner pass', ['/api/emoji/review', '/api/emoji/review/file'].every((p) => routeOf('GET', p)?.tool === 'emojis' && routeOf('GET', p).min === 'manager') && routeOf('POST', '/api/emoji/review/decide')?.tool === 'emojis'
  && ccDenied(S.out, 'GET', '/api/emoji/review').status === 401 && ccDenied(S.member, 'POST', '/api/emoji/review/decide').status === 403 && ccDenied(S.manager, 'POST', '/api/emoji/review/decide') === null && ccDenied(S.owner, 'GET', '/api/emoji/review/file') === null && ROUTES.some(([, , id]) => id === 'emojis'));

// ---------- never published, never imported ----------
const src = fs.readFileSync(new URL('../bot/emoji.js', import.meta.url), 'utf8');
t('nothing is imported into the server and nothing is served publicly: no emoji or sticker create call, no public URL for the key', !/\/emojis|\/stickers|guilds\//.test(src) && !/MEDIA_URL|\.publicUrl/.test(src));
const media = fs.readFileSync(new URL('../bot/media.js', import.meta.url), 'utf8');
t('the media storage guard skips emoji/ (the library is not disposable feed files)', /startsWith\('emoji\/'\)/.test(media));

// ---------- wiring ----------
const em = COMMANDS.find((c) => c.name === 'emoji');
t('/emoji has suggest (required attachment image, required type choice, required name), mine, delete, review; lives in the matchday app', ['suggest', 'mine', 'delete', 'review'].every((n) => em.options.some((s) => s.name === n)) && em.options[0].options[0].type === 11 && em.options[0].options[0].required && em.options[0].options[1].choices.map((c) => c.value).join() === 'emoji,sticker' && APP_COMMANDS.matchday.includes('emoji'));
t('emoji_review is a channel purpose with a description; permissions member/manager; the flag ships owner-only', CHANNEL_PURPOSES.includes('emoji_review') && !!CHANNEL_PURPOSE_INFO.emoji_review && PERMS['emoji.suggest'] === 'member' && PERMS['emoji.review'] === 'manager' && FEAT0.emoji === 'owner');
t('the module reads its channel from config and names no channel, id or NOREX; limits come from the EMOJI_SUGGEST var, which bot.yml fills from config.json', /channelFor\(env, 'emoji_review'\)/.test(src) && !/\b\d{17,20}\b/.test(src) && !/norex(?!:emo)/i.test(src.replace(/norex:emo/g, '')) && JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).emojiSuggest.maxPending > 0 && /EMOJI_SUGGEST/.test(fs.readFileSync(new URL('../.github/workflows/bot.yml', import.meta.url), 'utf8')));
t('the Discord limits are the real ones: emoji 256 KiB, sticker 512 KiB, no WebP or SVG accepted', KINDS.emoji.maxBytes === 262144 && KINDS.sticker.maxBytes === 524288 && !KINDS.emoji.mimes.includes('image/webp') && !KINDS.sticker.mimes.includes('image/svg+xml') && !KINDS.sticker.mimes.includes('image/jpeg'));
t('migration 0076 creates the emoji_suggestions table', /CREATE TABLE IF NOT EXISTS emoji_suggestions/.test(fs.readFileSync(new URL('../bot/migrations/0076_emoji_suggestions.sql', import.meta.url), 'utf8')));
const card = JSON.stringify([receiptMessage(env, sqlite.prepare("SELECT * FROM emoji_suggestions").get() ?? { id: 1, name: 'x_y', kind: 'emoji', mime: 'image/png', width: 64, height: 64, size: 1000, animated: 0 }, 2), reviewMessage(env, { id: 1, name: 'x_y', kind: 'emoji', mime: 'image/png', width: 64, height: 64, size: 1000, animated: 0, status: 'pending', user_id: '5', user_name: 'A' })]);
t('every output carries the Phoenix banner and none carries a NOREX name, red or crest', /banner-emoji|emoji/.test(card) && !/norex(?!:emo)/i.test(card.replace(/norex:emo/g, '')) && !/c8352c|080b11/i.test(card) && fs.existsSync(new URL('../tools/bot-audit/out/cards/banner-emoji.png', import.meta.url)) && !!JSON.parse(fs.readFileSync(new URL('../tools/bot-audit/out/cards.json', import.meta.url), 'utf8')).banner?.emoji);

// ---------- the Worker ----------
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex');
const waits = [];
const send = async (payload) => { const body = JSON.stringify(payload), ts = String(Date.now()); const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  const res = await worker.fetch(new Request('https://w.test/interactions', { method: 'POST', headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts }, body }), env, { waitUntil: (p) => waits.push(p) }); return { s: res.status, d: await res.json().catch(() => null) }; };
await tt('the Worker routes /emoji suggest with a deferred private reply and stores the suggestion', async () => {
  reset();
  const r = await send({ type: 2, member: { user: { id: '500', username: 'Ash' }, roles: [] }, channel_id: 'c1', token: 'tok', data: { name: 'emoji', options: [{ name: 'suggest', type: 1, options: o({ image: 'a1', type: 'emoji', name: 'worker_flame' }) }], resolved: { attachments: { a1: att() } } } });
  await Promise.all(waits);
  return r.s === 200 && r.d?.type === 5 && sqlite.prepare("SELECT COUNT(*) n FROM emoji_suggestions WHERE status = 'pending'").get().n === 1;
});
await tt('the Worker routes the Approve button to the manager handler (a plain member is told managers only)', async () => {
  const id = sqlite.prepare('SELECT id FROM emoji_suggestions').get().id;
  const r = await send({ type: 3, member: { user: { id: '500', username: 'Ash' }, roles: [] }, channel_id: 'c1', token: 'tok', message: { id: 'm1' }, data: { custom_id: `norex:emo:ok:${id}`, component_type: 2 } });
  return r.s === 200 && /Managers only/.test(JSON.stringify(r.d)) && sqlite.prepare('SELECT status FROM emoji_suggestions WHERE id = ?').get(id).status === 'pending';
});
globalThis.fetch = real; console.log = reallog;
done();
