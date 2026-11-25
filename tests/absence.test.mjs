// PF-024 Item 17 – the absence notice (bot/absence.js): /absence notice | mine | cancel | list, the managers' card with an Acknowledge button, expiry, the manager API.
// Guardrails: channel from the Organization config (purpose absence_notices), the free-text reason is private to managers (never in the member reply, a log line, a
// member view or the public), manager level from the Control Center matrix, Phoenix branding on the card, no NOREX name, colour or crest.
import fs from 'node:fs';
import { env, sqlite } from './mock.mjs';
import worker from '../bot/worker.js';
import { t, tt, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { COMMANDS, APP_COMMANDS } from '../bot/commanddefs.js';
import { PERMS } from '../bot/roles.js';
import { CHANNEL_PURPOSES } from '../bot/orgconsts.js';
import { CHANNEL_PURPOSE_INFO } from '../bot/orgconfig.js';
import { routeOf } from '../bot/ccpermissions.js';
import { parseDay, statusOf, isActive, absenceMessage, absenceCommand, absenceButton, absenceTick, absenceRoute, OPEN_DAYS } from '../bot/absence.js';

const FEAT0 = JSON.parse(env.FEATURES);
env.FEATURES = JSON.stringify({ ...FEAT0, absence: 'members' });
Object.assign(env, { DISCORD_BOT_TOKEN: 'tok', DISCORD_GUILD_ID: 'g-abs' });
const T = Date.UTC(2026, 11, 1, 12), DAY = 864e5, SECRET = 'visiting my sick gran in hospital';
const calls = [], real = globalThis.fetch; let nextId = 100;
globalThis.fetch = async (u, init = {}) => {
  u = String(u);
  if (u.startsWith('https://discord.com/')) { calls.push({ u, method: init.method, body: init.body ? JSON.parse(init.body) : null }); return Response.json(init.method === 'POST' ? { id: `m${++nextId}` } : {}); }
  return real(u, init);
};
const logs = []; const reallog = console.log; console.log = (...a) => { logs.push(a.join(' ')); reallog(...a); };
const reset = () => { calls.length = 0; sqlite.exec('DELETE FROM absences; DELETE FROM discord_channels'); };
const ia = (id, sub, options = []) => ({ member: { user: { id, username: `u${id}` }, nick: id === '500' ? 'Ash' : 'Coach' }, channel_id: 'c1', data: { name: 'absence', options: [{ name: sub, type: 1, options }] } });
const o = (obj) => Object.entries(obj).map(([name, value]) => ({ name, value }));
const MEMBER = { u: '500', role: 'member' }, MGR = { u: '900', role: 'manager' };
const idsOf = (m) => { const out = []; const w = (c) => { if (!c || typeof c !== 'object') return; if (Array.isArray(c)) return c.forEach(w); if (c.custom_id) out.push(c.custom_id); w(c.components); }; w(m.components); return out; };

t('parseDay: ISO, day/month, day/month/year; bad dates are null', parseDay('2026-12-24') === '2026-12-24' && parseDay('24/12', T) === '2026-12-24' && parseDay('2/1/27') === '2027-01-02' && parseDay('31/02/2026') === null && parseDay('soon') === null && parseDay('') === null);
const base = { id: 1, user_id: '500', user_name: 'Ash', kind: 'away', from_day: null, until_day: '2026-12-10', reason: SECRET, status: 'open', created_at: T, expires_at: Date.parse('2026-12-10T23:59:59.999Z') };
t('status: open until the end date, then expired; cancelled stays cancelled; a future start is not active yet', statusOf(base, T) === 'open' && statusOf(base, T + 20 * DAY) === 'expired' && statusOf({ ...base, status: 'cancelled' }, T) === 'cancelled' && isActive(base, T) && !isActive({ ...base, from_day: '2026-12-05' }, T) && isActive({ ...base, from_day: '2026-12-05' }, T + 5 * DAY));

// ---------- the card ----------
const card = absenceMessage(env, base, T), cardText = plainText(card);
t('card: Phoenix name, orange accent, Acknowledge button, the reason in the managers card, no pings, no NOREX name or colour',
  /phoenix fire/i.test(cardText) && !/norex/i.test(cardText) && JSON.stringify(card).includes(String(0xe8651a)) && idsOf(card).includes('norex:abs:ack:1') && cardText.includes(SECRET) && /managers only/i.test(cardText) && !/c8352c|080b11/i.test(JSON.stringify(card)) && JSON.stringify(card.allowed_mentions) === '{"parse":[]}');
t('card: an acknowledged or ended notice has no button', idsOf(absenceMessage(env, { ...base, status: 'acknowledged', ack_name: 'Coach' }, T)).length === 0 && idsOf(absenceMessage(env, base, T + 30 * DAY)).length === 0);

// ---------- the command ----------
reset();
const none = await absenceCommand(ia('500', 'notice', o({ type: 'away', reason: SECRET })), env, MEMBER, T);
t('no absence_notices channel in the Organization config → nothing posted, nothing stored, and it says so', /absence_notices/.test(plainText(none.data)) && calls.length === 0 && sqlite.prepare('SELECT COUNT(*) n FROM absences').get().n === 0);
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('g-abs', 'Test')").run();
const sid = sqlite.prepare("SELECT id FROM discord_servers WHERE guild_id = 'g-abs'").get().id;
sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '7701', 'absence_notices', 'org', '', 1)").run(sid);
const bad = await absenceCommand(ia('500', 'notice', o({ until: 'whenever' })), env, MEMBER, T);
t('a date that cannot be read is refused', /could not read that date/i.test(plainText(bad.data)) && calls.length === 0);
const past = await absenceCommand(ia('500', 'notice', o({ until: '2026-11-01' })), env, MEMBER, T);
t('an end date in the past is refused', /has passed/i.test(plainText(past.data)));
const ok = await absenceCommand(ia('500', 'notice', o({ type: 'less', from: '2026-12-02', until: '02/01/2027', reason: SECRET })), env, MEMBER, T);
const row = sqlite.prepare('SELECT * FROM absences').get(), post = calls.find((c) => c.method === 'POST');
t('a notice posts ONE card to the configured channel and stores the message', calls.length === 1 && post.u.endsWith('/channels/7701/messages') && row.message_id === 'm101' && row.channel_id === '7701' && row.kind === 'less' && row.until_day === '2027-01-02');
t('the card carries the Acknowledge button and the reason; the member reply does not repeat the reason', idsOf(post.body).includes(`norex:abs:ack:${row.id}`) && JSON.stringify(post.body).includes(SECRET) && !plainText(ok.data).includes(SECRET) && /managers only/i.test(plainText(ok.data)));
const mine = await absenceCommand(ia('500', 'mine'), env, MEMBER, T);
t('/absence mine lists the notice without the reason', plainText(mine.data).includes(`#${row.id}`) && !plainText(mine.data).includes(SECRET));
const other = await absenceCommand(ia('501', 'mine'), env, { u: '501', role: 'member' }, T);
t('another member sees none of it', /None filed/.test(plainText(other.data)));
const mgrList = await absenceCommand(ia('900', 'list'), env, MGR, T), memList = await absenceCommand(ia('500', 'list'), env, MEMBER, T);
t('/absence list is for managers and never prints the reason', plainText(mgrList.data).includes('<@500>') && !plainText(mgrList.data).includes(SECRET) && /Managers only/.test(plainText(memList.data)));

// ---------- acknowledge ----------
calls.length = 0;
const denied = await absenceButton({ member: { user: { id: '500' } }, data: { custom_id: `norex:abs:ack:${row.id}` } }, env, MEMBER, T);
t('a member cannot acknowledge', /Managers only/.test(plainText(denied.data)) && sqlite.prepare('SELECT status FROM absences').get().status === 'open');
const acked = await absenceButton({ member: { user: { id: '900' }, nick: 'Coach' }, data: { custom_id: `norex:abs:ack:${row.id}` } }, env, MGR, T);
const r2 = sqlite.prepare('SELECT * FROM absences').get();
t('a manager acknowledges: status, who and when are stored and the card is updated in place without the button', acked.type === 7 && r2.status === 'acknowledged' && r2.ack_by === '900' && /Acknowledged by Coach/.test(plainText(acked.data)) && idsOf(acked.data).length === 0);
const again = await absenceButton({ member: { user: { id: '901' }, nick: 'Other' }, data: { custom_id: `norex:abs:ack:${row.id}` } }, env, { u: '901', role: 'manager' }, T);
t('a second press changes nothing', sqlite.prepare('SELECT ack_by FROM absences').get().ack_by === '900' && again.type === 7);

// ---------- cancel and expiry ----------
const c1 = await absenceCommand(ia('501', 'cancel', o({ number: row.id })), env, { u: '501', role: 'member' }, T);
t('only the owner of a notice can withdraw it', /Nothing to withdraw/.test(plainText(c1.data)) && sqlite.prepare('SELECT status FROM absences').get().status === 'acknowledged');
calls.length = 0;
const c2 = await absenceCommand(ia('500', 'cancel'), env, MEMBER, T);
t('/absence cancel withdraws the latest notice and EDITS the card (no delete, no new post)', /Withdrawn/.test(plainText(c2.data)) && sqlite.prepare('SELECT status FROM absences').get().status === 'cancelled' && calls.length === 1 && calls[0].method === 'PATCH' && /Withdrawn/.test(plainText(calls[0].body)));
reset();
sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '7701', 'absence_notices', 'org', '', 1)").run(sid);
await absenceCommand(ia('500', 'notice', o({ reason: SECRET })), env, MEMBER, T);
const open = sqlite.prepare('SELECT * FROM absences').get();
t('an open-ended notice ends after 30 days', open.expires_at === T + OPEN_DAYS * DAY && statusOf(open, T + 29 * DAY) === 'open' && statusOf(open, T + 31 * DAY) === 'expired');
calls.length = 0;
t('the cron leaves a live notice alone', (await absenceTick(env, T + 10 * DAY)).ended === 0 && calls.length === 0);
const tick = await absenceTick(env, T + 31 * DAY);
t('the cron marks an ended notice expired and edits its card once', tick.ended === 1 && calls.length === 1 && calls[0].method === 'PATCH' && /Ended/.test(plainText(calls[0].body)) && sqlite.prepare('SELECT status FROM absences').get().status === 'expired' && (await absenceTick(env, T + 32 * DAY)).ended === 0);

// ---------- manager API and permissions ----------
const api = await absenceRoute('/api/intel/absences', 'GET', MGR, env, T + DAY), aj = await api.json();
t('the manager API answers a manager with a list (the notice has expired by then)', api.status === 200 && Array.isArray(aj.absences));
await absenceCommand(ia('500', 'notice', o({ reason: SECRET })), env, MEMBER, T);
const api2 = await (await absenceRoute('/api/intel/absences', 'GET', MGR, env, T + DAY)).json(), memApi = await absenceRoute('/api/intel/absences', 'GET', MEMBER, env, T);
t('the API shows the live notice with its reason to a manager and 403 to a member', api2.absences[0]?.reason === SECRET && api2.absences[0].active === true && memApi.status === 403);
t('the route is in the Control Center matrix at manager level, and absence.ack is a manager permission', routeOf('GET', '/api/intel/absences')?.min === 'manager' && routeOf('GET', '/api/intel/absences')?.tool === 'absences' && PERMS['absence.ack'] === 'manager');
t('nothing logged the reason', !logs.some((l) => l.includes(SECRET)));

// ---------- wiring ----------
const src = fs.readFileSync(new URL('../bot/absence.js', import.meta.url), 'utf8');
t('absence_notices is a channel purpose with a description; /absence is a tools-app command; the flag ships owner-only', CHANNEL_PURPOSES.includes('absence_notices') && !!CHANNEL_PURPOSE_INFO.absence_notices && COMMANDS.some((c) => c.name === 'absence') && APP_COMMANDS.tools.includes('absence') && JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).features.absence === 'owner');
t('the module reads its channel from config and names no channel, id or NOREX; a banner key exists', /channelFor\(env, 'absence_notices'\)/.test(src) && !/\b\d{17,20}\b/.test(src) && !/norex(?!:abs)/i.test(src.replace(/norex:abs/g, '')) && !/c8352c|080b11/i.test(src) && fs.existsSync(new URL('../tools/bot-audit/out/cards/banner-absence.png', import.meta.url)));
const mig = fs.readFileSync(new URL('../bot/migrations/0073_absences.sql', import.meta.url), 'utf8');
t('migration 0073 creates the absences table', /CREATE TABLE IF NOT EXISTS absences/.test(mig) && /reason/.test(mig));

// ---------- the Worker ----------
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex'); env.DISCORD_APP_ID = '100';
const waits = [];
const send = async (payload) => { const body = JSON.stringify(payload), ts = String(Date.now()); const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex'); const res = await worker.fetch(new Request('https://bot/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), env, { waitUntil: (p) => waits.push(p) }); return { s: res.status, d: await res.json().catch(() => null) }; };
await tt('the Worker routes /absence and the Acknowledge button', async () => {
  reset();
  sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '7701', 'absence_notices', 'org', '', 1)").run(sid);
  const r = await send({ type: 2, member: { user: { id: '500', username: 'Ash' }, roles: [] }, channel_id: 'c1', token: 'tok', data: { name: 'absence', options: [{ name: 'notice', type: 1, options: o({ type: 'away', until: '2099-01-01' }) }] } });
  const id = sqlite.prepare('SELECT id FROM absences').get()?.id;
  const b = await send({ type: 3, member: { user: { id: '900', username: 'Coach' }, roles: ['mgr'] }, channel_id: '7701', token: 'tok', data: { component_type: 2, custom_id: `norex:abs:ack:${id}` } });
  return r.s === 200 && !!id && b.d?.type === 7 && sqlite.prepare('SELECT status FROM absences').get().status === 'acknowledged';
});
globalThis.fetch = real; console.log = reallog;
done();
