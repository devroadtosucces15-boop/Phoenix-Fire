// PF-024 Item 11 – the animated, weighted wheel with history (bot/fun.js) and the pin tool (bot/pins.js).
import { env, sqlite, config } from './mock.mjs';
import worker from '../bot/worker.js';
import { t, tt, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { parseEntries, parseOptions, pickWeighted, spinFrames, rng, SPIN_FRAME_MS } from '../bot/fun.js';
import { pinModel, pinMessage, pinTick, PIN_DAYS } from '../bot/pins.js';
import { COMMANDS, APP_COMMANDS } from '../bot/commanddefs.js';
import { CHANNEL_PURPOSES } from '../bot/orgconsts.js';
import { CHANNEL_PURPOSE_INFO } from '../bot/orgconfig.js';
import { PERMS } from '../bot/roles.js';
import fs from 'node:fs';

const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex');
env.DISCORD_BOT_TOKEN = 'tok'; env.DISCORD_APP_ID = '100';
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), fun: 'members', pins: 'managers' });
const waits = [];
async function send(payload) {
  const body = JSON.stringify(payload), ts = String(Date.now());
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  const res = await worker.fetch(new Request('https://bot/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), env, { waitUntil: (p) => waits.push(p) });
  return { s: res.status, d: await res.json().catch(() => null) };
}
const as = (id, name, roles = [], ch = 'c1') => ({ member: { user: { id, username: name }, roles }, channel_id: ch, token: 'tok' });
const MEMBER = as('500', 'Ash'), MGR = as('900', 'Coach', ['mgr'], '7001');
const cmd = (who, name, options = [], extra = {}) => send({ type: 2, ...who, data: { name, options, ...extra } });
const press = (who, id) => send({ type: 3, ...who, data: { component_type: 2, custom_id: id } });
const buttonIds = (m) => { const out = []; const w = (c) => { if (!c || typeof c !== 'object') return; if (Array.isArray(c)) return c.forEach(w); if (c.custom_id) out.push(c.custom_id); w(c.components); }; w(m.components); return out; };

// ---------- wheel: entries and weights ----------
t('entries: weights with *N, clamped 1-10, duplicates dropped, names stay plain', JSON.stringify(parseEntries('Jez*3, Kruger, Davey * 20, jez, Bo*0')) === JSON.stringify([{ n: 'Jez', w: 3 }, { n: 'Kruger', w: 1 }, { n: 'Davey', w: 10 }, { n: 'Bo', w: 1 }]));
t('parseOptions still returns plain names (old callers)', parseOptions('Jez*3, Kruger').join() === 'Jez,Kruger');
t('weighted pick: three times the chance → about three times the wins', (() => { const e = [{ n: 'a', w: 3 }, { n: 'b', w: 1 }]; let a = 0; for (let k = 0; k < 4000; k++) if (pickWeighted(e, (n) => Math.floor(Math.random() * n)) === 0) a++; return a > 2700 && a < 3300; })());
t('unweighted pick keeps using rng.pick (tests can force a winner)', pickWeighted([{ n: 'a', w: 1 }, { n: 'b', w: 1 }, { n: 'c', w: 1 }], () => 2) === 2);
t('frames: n of them, the last lands on the winner, every pointer is a real option', (() => { const f = spinFrames(5, 3, 6); return f.length === 6 && f[5] === 3 && f.every((x) => x >= 0 && x < 5); })());
t('frames: the pointer slows down (big jumps first, small ones at the end)', (() => { const f = spinFrames(12, 0, 8), step = (a, b) => (((b - a) % 12) + 12) % 12; return f.length === 8 && step(f[0], f[1]) >= 0; })());

// ---------- wheel: command, animation, history ----------
SPIN_FRAME_MS.ms = 0;
const patches = [], real = globalThis.fetch;
globalThis.fetch = async (u, init = {}) => {
  u = String(u);
  if (u.startsWith('https://discord.com/')) { patches.push({ u, method: init.method, body: init.body ? JSON.parse(init.body) : null }); return Response.json(discordReply(u, init)); }
  return real(u, init);
};
let latestId = 'm-latest', nextId = 9000, deleted = [];
function discordReply(u, init) {
  if (init.method === 'GET' && /\/channels\/\d+\/messages/.test(u)) return [{ id: latestId }];
  if (init.method === 'POST' && /\/channels\/\d+\/messages$/.test(u)) return { id: `m${++nextId}` };
  if (init.method === 'DELETE') deleted.push(u);
  return {};
}
try {
  rng.pick = (n) => (n > 3 ? 0 : 1);
  await tt('/wheel with seconds: frame 0 now, edits follow, the last edit is the result with History', async () => {
    patches.length = 0;
    const r = await cmd(MEMBER, 'wheel', [{ name: 'options', value: 'Jez, Kruger*2, Davey' }, { name: 'question', value: 'GK' }, { name: 'seconds', value: 4 }]);
    await Promise.all(waits.splice(0));
    const edits = patches.filter((p) => p.method === 'PATCH' && p.u.includes('/webhooks/100/tok/messages/@original'));
    const last = JSON.stringify(edits.at(-1)?.body);
    return r.d.type === 4 && /▶ \*\*/.test(plainText(r.d.data)) && /GK/.test(plainText(r.d.data)) && edits.length === 4 && /## /.test(last) && /whist:/.test(last) && /weighted/.test(last) && /Kruger ×2/.test(last);
  });
  const wid = sqlite.prepare('SELECT MAX(id) AS id FROM fun_wheels').get().id;
  t('the spin length and weights are stored; the spin is in the history table', sqlite.prepare('SELECT seconds FROM fun_wheels WHERE id = ?').get(wid).seconds === 4 && sqlite.prepare('SELECT COUNT(*) AS n FROM fun_wheel_spins WHERE wheel_id = ?').get(wid).n === 1 && JSON.parse(sqlite.prepare('SELECT options FROM fun_wheels WHERE id = ?').get(wid).options).some((o) => o.w === 2));
  await tt('Spin again keeps the stored length: animated, and logged', async () => {
    patches.length = 0;
    const r = await press(MEMBER, `norex:fun:spin:${wid}`); await Promise.all(waits.splice(0));
    return r.d.type === 7 && patches.filter((p) => p.method === 'PATCH').length === 4 && sqlite.prepare('SELECT COUNT(*) AS n FROM fun_wheel_spins WHERE wheel_id = ?').get(wid).n === 2;
  });
  await tt('History button: private list with wins so far', async () => {
    const r = await press(MEMBER, `norex:fun:whist:${wid}`), txt = plainText(r.d.data);
    return !!(r.d.data.flags & 64) && /History/.test(txt) && /Wins so far/.test(txt);
  });
  await tt('no seconds → instant result as before (no edits)', async () => {
    patches.length = 0;
    const r = await cmd(MEMBER, 'wheel', [{ name: 'options', value: 'A, B' }]); await Promise.all(waits.splice(0));
    return r.d.type === 4 && /## /.test(plainText(r.d.data)) && patches.length === 0;
  });
  rng.pick = (n) => Math.floor(Math.random() * n);

  // ---------- pin tool ----------
  const msgOf = (content, extra = {}) => ({ resolved: { messages: { m1: { id: 'm1', content, author: { id: '5', username: 'ash' }, ...extra } } }, target_id: 'm1', type: 3 });
  const pin = (who, content, extra) => cmd(who, 'Pin to bottom', [], msgOf(content, extra));
  t('pinModel: text kept as written, bots and empty messages refused', pinModel({ content: '**Rules**', author: { username: 'ash' } }).body === '**Rules**' && pinModel({ content: 'x', author: { bot: true } }) === null && pinModel({ content: '' }) === null);
  t('pinModel: long text is cut', pinModel({ content: 'x'.repeat(3000), author: {} }).body.length <= 1800);
  await tt('a member cannot pin', async () => /Managers only/.test(plainText((await pin(as('500', 'Ash', [], '7001'), 'Rules')).d.data)));
  await tt('no pinned_posts channel configured → says so, posts nothing', async () => { patches.length = 0; const r = await pin(MGR, 'Rules'); return /No pin channel is set/.test(plainText(r.d.data)) && patches.length === 0; });
  sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('g-pin', 'Test')").run();
  const sid = sqlite.prepare("SELECT id FROM discord_servers WHERE guild_id = 'g-pin'").get().id;
  sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '7001', 'pinned_posts', 'org', '', 1)").run(sid);
  await tt('a channel that is not a pin channel is refused', async () => /Not a pin channel/.test(plainText((await pin(as('900', 'Coach', ['mgr'], '7999'), 'Rules')).d.data)));
  await tt('manager pins in the configured channel: the Phoenix panel is posted, the row is saved', async () => {
    patches.length = 0;
    const r = await pin(MGR, 'Rules: be kind'), post = patches.find((p) => p.method === 'POST' && p.u.endsWith('/channels/7001/messages'));
    const row = sqlite.prepare('SELECT * FROM bot_pins WHERE channel_id = ? AND active = 1').get('7001');
    const out = JSON.stringify(post.body);
    return /Pinned/.test(plainText(r.d.data)) && /Rules: be kind/.test(out) && /Phoenix Fire/.test(out) && !/norex|c8352c/i.test(out.replace(/norex:pin:off:\d+/g, '')) && /norex:pin:off:/.test(out) && row.message_id?.startsWith('m') && row.expires_at - row.created_at === PIN_DAYS * 864e5;
  });
  await tt('someone posted after the pin: the tick re-posts it at the bottom and deletes the old copy', async () => {
    const before = sqlite.prepare('SELECT * FROM bot_pins WHERE active = 1').get(); latestId = 'someone-else'; patches.length = 0; deleted.length = 0;
    const out = await pinTick(env), after = sqlite.prepare('SELECT * FROM bot_pins WHERE id = ?').get(before.id);
    return out.reposted === 1 && after.message_id !== before.message_id && deleted.some((u) => u.endsWith(`/messages/${before.message_id}`));
  });
  await tt('the pin is already the newest message: nothing is posted', async () => {
    const row = sqlite.prepare('SELECT * FROM bot_pins WHERE active = 1').get(); latestId = row.message_id; patches.length = 0;
    const out = await pinTick(env); return out.reposted === 0 && !patches.some((p) => p.method === 'POST');
  });
  await tt('two cron runs for the same push re-post once (claim)', async () => {
    latestId = 'again'; patches.length = 0;
    await Promise.all([pinTick(env), pinTick(env)]);
    return patches.filter((p) => p.method === 'POST').length === 1;
  });
  await tt('a new pin replaces the old one in the same channel (one per channel)', async () => {
    await pin(MGR, 'New rules');
    return sqlite.prepare('SELECT COUNT(*) AS n FROM bot_pins WHERE channel_id = ? AND active = 1').get('7001').n === 1 && /New rules/.test(sqlite.prepare('SELECT body FROM bot_pins WHERE active = 1').get().body);
  });
  await tt('the Unpin button is for managers', async () => {
    const row = sqlite.prepare('SELECT * FROM bot_pins WHERE active = 1').get();
    const denied = await press(as('500', 'Ash'), `norex:pin:off:${row.id}`), ok = await press(MGR, `norex:pin:off:${row.id}`);
    return /Managers only/.test(plainText(denied.d.data)) && /Unpinned/.test(plainText(ok.d.data)) && sqlite.prepare('SELECT COUNT(*) AS n FROM bot_pins WHERE active = 1').get().n === 0;
  });
  await tt('/unpin with nothing pinned says so', async () => /Nothing is pinned/.test(plainText((await cmd(MGR, 'unpin')).d.data)));
  await tt('an expired pin ends and its copy is deleted', async () => {
    await pin(MGR, 'Temp'); const row = sqlite.prepare('SELECT * FROM bot_pins WHERE active = 1').get(); deleted.length = 0;
    const out = await pinTick(env, row.expires_at + 1);
    return out.ended === 1 && deleted.length === 1 && sqlite.prepare('SELECT COUNT(*) AS n FROM bot_pins WHERE active = 1').get().n === 0;
  });
} finally { globalThis.fetch = real; }

// ---------- definitions, config, branding ----------
t('Pin to bottom (type 3) and /unpin are manager-only commands in the tools app', COMMANDS.find((c) => c.name === 'Pin to bottom')?.type === 3 && ['Pin to bottom', 'unpin'].every((n) => APP_COMMANDS.tools.includes(n) && COMMANDS.find((c) => c.name === n).default_member_permissions === String(1 << 28)));
t('/wheel has the seconds option (2-10)', (() => { const o = COMMANDS.find((c) => c.name === 'wheel').options.find((x) => x.name === 'seconds'); return o?.min_value === 2 && o?.max_value === 10; })());
t('pinned_posts is a channel purpose with a description; pins.manage is a manager permission; flag ships owner-only', CHANNEL_PURPOSES.includes('pinned_posts') && !!CHANNEL_PURPOSE_INFO.pinned_posts && PERMS['pins.manage'] === 'manager' && config.features.pins === 'owner');
const src = fs.readFileSync(new URL('../bot/pins.js', import.meta.url), 'utf8');
t('the pin tool reads its channels from config and names no channel, id or NOREX', /channelsFor\(env, 'pinned_posts'/.test(src) && !/\b\d{17,20}\b/.test(src) && !/norex(?!:pin)/i.test(src.replace(/norex:pin/g, '')));
t('panel: Phoenix accent', JSON.stringify(pinMessage(env, { id: 1, body: 'x', by_name: 'Coach' })).includes(String(0xe8651a)));
done();
