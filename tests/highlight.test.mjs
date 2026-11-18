// PF-024 Item 18 – the highlight clip upload (bot/highlight.js): /highlight upload | mine | delete | list.
// Guardrails: type and size validated (declared type AND first bytes, only Discord CDN hosts), limits from config, per-member daily limit, stored privately in R2 under hl/ with a D1 index,
// private receipt, optional channel card only when the purpose `highlights` is configured (never the file), Phoenix branding with no NOREX name/colour/crest, nothing logged.
import fs from 'node:fs';
import { env, sqlite, R2 } from './mock.mjs';
import worker from '../bot/worker.js';
import { t, tt, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { COMMANDS, APP_COMMANDS } from '../bot/commanddefs.js';
import { PERMS } from '../bot/roles.js';
import { CHANNEL_PURPOSES } from '../bot/orgconsts.js';
import { CHANNEL_PURPOSE_INFO } from '../bot/orgconfig.js';
import { limits, typeOf, cdnUrl, receiptMessage, channelCard, highlightCommand, DEFAULTS } from '../bot/highlight.js';

const FEAT0 = JSON.parse(env.FEATURES);
env.FEATURES = JSON.stringify({ ...FEAT0, highlight: 'members' });
Object.assign(env, { DISCORD_BOT_TOKEN: 'tok', DISCORD_GUILD_ID: 'g-hl', DISCORD_APP_ID: '100' });
const T = Date.UTC(2026, 11, 1, 12), SECRET = 'my private note about the clip';
const calls = [], real = globalThis.fetch; let nextId = 100;
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.alloc(200, 1)]);
const NOTMP4 = Buffer.alloc(300, 7);
let served = MP4;
globalThis.fetch = async (u, init = {}) => {
  u = String(u);
  if (u.startsWith('https://discord.com/')) { calls.push({ u, method: init.method, body: init.body ? JSON.parse(init.body) : null }); return Response.json(init.method === 'POST' ? { id: `m${++nextId}` } : {}); }
  if (u.startsWith('https://cdn.discordapp.com/')) return new Response(served, { headers: { 'Content-Length': String(served.length) } });
  return real(u, init);
};
const logs = []; const reallog = console.log; console.log = (...a) => { logs.push(a.join(' ')); reallog(...a); };
const reset = () => { calls.length = 0; served = MP4; sqlite.exec('DELETE FROM highlights; DELETE FROM discord_channels'); };
const MEMBER = { u: '500', role: 'member' }, MGR = { u: '900', role: 'manager' };
const att = (o = {}) => ({ id: 'a1', filename: 'goal.mp4', content_type: 'video/mp4', size: MP4.length, url: 'https://cdn.discordapp.com/attachments/1/2/goal.mp4?ex=1', ...o });
const ia = (id, sub, options = [], attachment) => ({ member: { user: { id, username: `u${id}` }, nick: id === '500' ? 'Ash' : 'Coach' }, token: 'tok', channel_id: 'c1',
  data: { name: 'highlight', options: [{ name: sub, type: 1, options }], resolved: attachment ? { attachments: { a1: attachment } } : {} } });
const o = (obj) => Object.entries(obj).map(([name, value]) => ({ name, value }));
// the upload answers with a deferred reply and patches the receipt in: collect the patch
const upload = async (id, who, attachment, extra = {}, e = env) => {
  calls.length = 0; const waits = [];
  const r = await highlightCommand(ia(id, 'upload', o({ clip: 'a1', ...extra }), attachment), e, who, { waitUntil: (p) => waits.push(p) }, T);
  await Promise.all(waits);
  return { r, patch: calls.find((c) => c.method === 'PATCH')?.body };
};
const txt = (m) => plainText(m?.data ?? m ?? {});

// ---------- pure helpers ----------
t('limits: defaults, config override, clamped to the hard ceiling', limits({}).maxMb === DEFAULTS.maxMb && limits({ HIGHLIGHT: '{"maxMb":20,"perDay":2}' }).maxBytes === 20e6 && limits({ HIGHLIGHT: '{"maxMb":9999}' }).maxMb === DEFAULTS.hardMaxMb && limits({ HIGHLIGHT: 'nope' }).perDay === DEFAULTS.perDay);
t('type: mp4/webm/mov by content type or extension, everything else refused', typeOf({ content_type: 'video/mp4' }) === 'video/mp4' && typeOf({ content_type: 'video/quicktime' }) === 'video/quicktime' && typeOf({ filename: 'a.WEBM' }) === 'video/webm' && typeOf({ content_type: 'image/png' }) === null && typeOf({ content_type: 'application/x-msdownload', filename: 'a.mp4' }) === null && typeOf({ filename: 'virus.exe' }) === null);
t('url: only https Discord CDN hosts', !!cdnUrl('https://cdn.discordapp.com/a/b.mp4') && !!cdnUrl('https://media.discordapp.net/a/b.mp4') && !cdnUrl('https://evil.example/a.mp4') && !cdnUrl('http://cdn.discordapp.com/a.mp4') && !cdnUrl('https://cdn.discordapp.com.evil.io/a.mp4') && !cdnUrl('nonsense'));

// ---------- gates ----------
reset();
const off = await highlightCommand(ia('500', 'mine'), { ...env, FEATURES: JSON.stringify({ ...FEAT0, highlight: 'off' }) }, MEMBER);
t('flag off → not switched on, nothing stored', /Not switched on/.test(txt(off)));
const guest = await highlightCommand(ia('500', 'mine'), env, { u: '500', role: 'guest' });
t('guests cannot use it (flag level or members-only gate)', /Members only|Not switched on/.test(txt(guest)));

// ---------- upload ----------
const ok = await upload('500', MEMBER, att(), { title: 'Top bins', note: SECRET });
const row = sqlite.prepare('SELECT * FROM highlights').get();
t('upload: deferred private reply, then the receipt is patched in', ok.r.type === 5 && (ok.r.data.flags & 64) === 64 && (ok.r.data.flags & (1 << 15)) !== 0 && !!ok.patch);
t('upload: R2 object under hl/ with the right type, D1 row stored with user, title, size, type, created', /^hl\/[0-9a-f]{32}\.mp4$/.test(row.key) && row.status === 'stored' && row.user_id === '500' && row.title === 'Top bins' && row.size === MP4.length && row.type === 'video/mp4' && row.created_at === T && !!(await R2.get(row.key)));
const rc = plainText(ok.patch);
t('receipt: Phoenix name, orange accent, size, status, private, no note echoed, no NOREX name/colour/crest', /phoenix fire/i.test(rc) && /Stored privately/.test(rc) && /Top bins/.test(rc) && !rc.includes(SECRET) && !/norex/i.test(rc) && JSON.stringify(ok.patch).includes(String(0xe8651a)) && !/c8352c|080b11/i.test(JSON.stringify(ok.patch)));
t('no channel configured → no post at all (only the receipt patch)', calls.every((c) => c.method === 'PATCH'));

const bad = await upload('500', MEMBER, att({ content_type: 'image/png', filename: 'a.png' }));
t('a non-video type is refused and nothing is stored', /not allowed/.test(plainText(bad.patch)) && sqlite.prepare('SELECT COUNT(*) n FROM highlights').get().n === 1);
const big = await upload('500', MEMBER, att({ size: 60e6 }));
t('over the size limit is refused before anything is downloaded', /too big/.test(plainText(big.patch)) && sqlite.prepare('SELECT COUNT(*) n FROM highlights').get().n === 1);
const smaller = await upload('500', MEMBER, att({ size: 21e6 }), {}, { ...env, HIGHLIGHT: '{"maxMb":20}' });
t('the size limit comes from config', /limit is 20 MB/.test(plainText(smaller.patch)));
const evil = await upload('500', MEMBER, att({ url: 'https://evil.example/x.mp4' }));
t('a file not on Discord\'s CDN is refused', /need a clip file/.test(plainText(evil.patch)));
served = NOTMP4;
const fake = await upload('500', MEMBER, att({ size: NOTMP4.length }));
const failed = sqlite.prepare("SELECT * FROM highlights WHERE status = 'failed'").get();
t('a file that is not really an MP4 (bad first bytes) is refused, marked failed, and not left in R2', /did not finish|real MP4/.test(plainText(fake.patch)) && !!failed && !(await R2.get(failed.key)));
served = MP4;
const none = await upload('500', MEMBER, undefined);
t('no attachment → asks for one', /need a clip file/.test(plainText(none.patch)));

// ---------- daily limit ----------
reset();
const lim = { ...env, HIGHLIGHT: '{"perDay":2}' };
await upload('500', MEMBER, att(), {}, lim); await upload('500', MEMBER, att(), {}, lim);
const third = await upload('500', MEMBER, att(), {}, lim);
const other = await upload('501', { u: '501', role: 'member' }, att(), {}, lim);
t('per-member daily limit (from config) stops the third clip; another member is unaffected', /today.s limit/.test(plainText(third.patch)) && /Stored privately/.test(plainText(other.patch)) && sqlite.prepare('SELECT COUNT(*) n FROM highlights WHERE user_id = ?').get('500').n === 2);

// ---------- channel card ----------
reset();
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('g-hl', 'Test')").run();
const sid = sqlite.prepare("SELECT id FROM discord_servers WHERE guild_id = 'g-hl'").get().id;
sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '7801', 'highlights', 'org', '', 1)").run(sid);
const withCh = await upload('500', MEMBER, att(), { title: 'Top bins', note: SECRET });
const post = calls.find((c) => c.method === 'POST'), crow = sqlite.prepare('SELECT * FROM highlights').get();
t('a configured highlights channel gets one Phoenix card: title and size, never the file link, the note or a ping', post?.u.endsWith('/channels/7801/messages') && /Top bins/.test(plainText(post.body)) && !JSON.stringify(post.body).includes(crow.key) && !JSON.stringify(post.body).includes('cdn.discordapp') && !plainText(post.body).includes(SECRET) && JSON.stringify(post.body.allowed_mentions) === '{"parse":[]}' && /phoenix fire/i.test(plainText(post.body)) && !/norex/i.test(JSON.stringify(post.body)));

// ---------- mine, delete, list ----------
const mine = await highlightCommand(ia('500', 'mine'), env, MEMBER, null, T);
t('/highlight mine lists the member\'s clips, not the note', txt(mine).includes(`#${crow.id}`) && !txt(mine).includes(SECRET));
const stranger = await highlightCommand(ia('501', 'delete', o({ number: crow.id })), env, { u: '501', role: 'member' }, null, T);
t('another member cannot delete it', /Nothing to delete/.test(txt(stranger)) && sqlite.prepare('SELECT status FROM highlights').get().status === 'stored');
const memList = await highlightCommand(ia('500', 'list'), env, MEMBER, null, T), mgrList = await highlightCommand(ia('900', 'list'), env, MGR, null, T);
t('/highlight list is for managers and never prints the note', /Managers only/.test(txt(memList)) && txt(mgrList).includes('<@500>') && !txt(mgrList).includes(SECRET));
const del = await highlightCommand(ia('900', 'delete', o({ number: crow.id })), env, MGR, null, T);
t('a manager can delete any clip: R2 object gone, row kept as deleted with who and when', /Clip deleted/.test(txt(del)) && !(await R2.get(crow.key)) && sqlite.prepare('SELECT status, deleted_by, deleted_at FROM highlights').get().deleted_by === '900');
await upload('500', MEMBER, att()); const own = sqlite.prepare("SELECT id FROM highlights WHERE status = 'stored'").get();
const del2 = await highlightCommand(ia('500', 'delete'), env, MEMBER, null, T);
t('the uploader deletes their own latest clip', /Clip deleted/.test(txt(del2)) && sqlite.prepare('SELECT status FROM highlights WHERE id = ?').get(own.id).status === 'deleted');
t('nothing logged the title or note', !logs.some((l) => l.includes(SECRET) || l.includes('Top bins')));

// ---------- the storage guard never deletes clips ----------
const media = fs.readFileSync(new URL('../bot/media.js', import.meta.url), 'utf8');
t('the media storage guard skips hl/ (clips are not disposable feed files)', /startsWith\('hl\/'\)/.test(media));

// ---------- wiring ----------
const src = fs.readFileSync(new URL('../bot/highlight.js', import.meta.url), 'utf8');
const hl = COMMANDS.find((c) => c.name === 'highlight');
t('/highlight has upload (required attachment clip), mine, delete, list; lives in the matchday app', ['upload', 'mine', 'delete', 'list'].every((n) => hl.options.some((s) => s.name === n)) && hl.options[0].options[0].type === 11 && hl.options[0].options[0].required && APP_COMMANDS.matchday.includes('highlight'));
t('highlights is a channel purpose with a description; permissions member/manager; the flag ships owner-only', CHANNEL_PURPOSES.includes('highlights') && !!CHANNEL_PURPOSE_INFO.highlights && PERMS['highlight.upload'] === 'member' && PERMS['highlight.manage'] === 'manager' && FEAT0.highlight === 'owner');
t('the module reads its channel from config and names no channel, id or NOREX; limits come from the HIGHLIGHT var, which bot.yml fills from config.json', /channelFor\(env, 'highlights'\)/.test(src) && !/\b\d{17,20}\b/.test(src) && !/norex/i.test(src) && JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).highlight?.maxMb > 0 && /HIGHLIGHT/.test(fs.readFileSync(new URL('../.github/workflows/bot.yml', import.meta.url), 'utf8')));
t('migration 0074 creates the highlights table', /CREATE TABLE IF NOT EXISTS highlights/.test(fs.readFileSync(new URL('../bot/migrations/0074_highlights.sql', import.meta.url), 'utf8')));

// ---------- the Worker ----------
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex');
const waits = [];
const send = async (payload) => { const body = JSON.stringify(payload), ts = String(Date.now()); const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  const res = await worker.fetch(new Request('https://w.test/interactions', { method: 'POST', headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts }, body }), env, { waitUntil: (p) => waits.push(p) }); return { s: res.status, d: await res.json().catch(() => null) }; };
await tt('the Worker routes /highlight upload with a deferred private reply and stores the clip', async () => {
  reset();
  const r = await send({ type: 2, member: { user: { id: '500', username: 'Ash' }, roles: [] }, channel_id: 'c1', token: 'tok', data: { name: 'highlight', options: [{ name: 'upload', type: 1, options: o({ clip: 'a1' }) }], resolved: { attachments: { a1: att() } } } });
  await Promise.all(waits);
  return r.s === 200 && r.d?.type === 5 && sqlite.prepare("SELECT COUNT(*) n FROM highlights WHERE status = 'stored'").get().n === 1;
});
globalThis.fetch = real; console.log = reallog;
done();
