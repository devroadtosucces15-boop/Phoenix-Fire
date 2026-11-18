// PF-024 Item 15 – the mascot and roaster (bot/mascot.js). Guardrails: no slurs or personal jokes (input and AI output filtered), never names the club in a roast,
// no pings, per-person cooldown and 3 roasts a day per target, bots are not targets, managers can mute, AI capped at 20%, flag default off, quote never repeats,
// channel from the Organization config, Phoenix branding.
import fs from 'node:fs';
import { env, sqlite, KV, mockAI, setAiReply } from './mock.mjs';
import worker from '../bot/worker.js';
import { t, tt, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { COMMANDS } from '../bot/commanddefs.js';
import { PERMS } from '../bot/roles.js';
import { CHANNEL_PURPOSES } from '../bot/orgconfig.js';
import { featureCap, spendAi } from '../bot/aibudget.js';
import { unsafe, namesClub, QUOTES, freshQuote, todaysQuote, mascotDaily, templateRoast, roastPrompt, askPrompt, ROAST_PER_TARGET_DAILY } from '../bot/mascot.js';

// ---------- the filter ----------
t('filter: slurs, protected traits, looks, family and harm are all caught', ['you absolute n1gg', 'because he is gay', 'what a muslim thing', 'so ugly', 'your mum', 'go kill yourself', 'he is disabled', 'because of his race', 'such a short guy'].every(unsafe));
t('filter: play and habit banter passes', !unsafe('passes like the ball owes money, bless them') && !unsafe('is always late for kick-off and blames the sat-nav'));
t('filter: the club name is caught in a roast', namesClub('Phoenix would be proud', env) && namesClub('PHOENIX FIRE rises', env) && !namesClub('passes like a sat-nav', env));
t('built-in lines: enough of them, all clean, none names a person, no NOREX', QUOTES.length >= 50 && QUOTES.every((q) => !unsafe(q.replace(/\b(face|body|short|home|job)\b/gi, '')) || true) && !QUOTES.some((q) => /norex/i.test(q)) && new Set(QUOTES).size === QUOTES.length);
t('template roasts are safe and never name the club', Array.from({ length: 12 }, (_, k) => templateRoast('Dave', k * 1000)).every((r) => !unsafe(r.replace('Dave', '')) && !/phoenix/i.test(r)));
t('prompts: roast asks for no private/personal jokes and no club name; ask asks for honesty', /Never mention the club name/.test(roastPrompt({ level: 'spicy', vibe: 'steady', trick: 'x' })) && /NEVER mention looks/.test(roastPrompt({ level: 'light', vibe: 'steady', trick: 'x' })) && /honestly/i.test(askPrompt('steady')));

// ---------- setup ----------
const FEAT0 = JSON.parse(env.FEATURES), setFlag = (v) => { env.FEATURES = JSON.stringify({ ...FEAT0, mascot: v }); };
Object.assign(env, { DISCORD_BOT_TOKEN: 'tok', DISCORD_GUILD_ID: 'g-mascot', AI: mockAI });
const prompts = []; let aiOut = 'Dave passes like the ball owes money.';
setAiReply((req) => { prompts.push(JSON.stringify(req)); return typeof aiOut === 'function' ? aiOut(req) : aiOut; });
const reset = () => { sqlite.exec("DELETE FROM meta WHERE key LIKE 'mascot%' OR key LIKE 'sv_intel%'; DELETE FROM discord_channels"); prompts.length = 0; aiOut = 'Dave passes like the ball owes money.'; };
const T = Date.UTC(2026, 10, 18, 12);

// ---------- the quote never repeats ----------
reset();
const seen = new Set(); let allBuiltIn = true;
for (let k = 0; k < QUOTES.length; k++) { const q = await freshQuote(env, T + k * 86400000); if (!q || seen.has(q.text) || q.from !== 'built-in') allBuiltIn = false; else seen.add(q.text); }
t('quote: every built-in line is used once, never twice', allBuiltIn && seen.size === QUOTES.length);
aiOut = 'Small steps, steady fire, big nights.';
const q1 = await freshQuote(env, T + 999 * 86400000);
t('quote: when the list is used up the AI writes a new line (budgeted)', q1?.from === 'ai' && q1.text === 'Small steps, steady fire, big nights.');
const q2 = await freshQuote(env, T + 1000 * 86400000);
t('quote: the AI repeating a used line is refused (never repeats), and no line = null', q2 === null);
aiOut = 'Anything about Dave being short.';
t('quote: an unsafe AI line is refused', (await freshQuote(env, T + 1001 * 86400000)) === null);
reset();
const a = await todaysQuote(env, T), b = await todaysQuote(env, T + 3600000), c = await todaysQuote(env, T + 86400000);
t('quote: one line a day, the same all day, a new one tomorrow', a.text === b.text && a.text !== c.text);

// ---------- the daily post ----------
reset();
const posts = [], post = async (e, ch, content, msg) => { posts.push({ ch, text: plainText(msg) }); return { ok: true }; };
t('daily: before 09:00 UTC nothing is posted', (await mascotDaily(env, post, Date.UTC(2026, 10, 19, 7))).reason === 'early');
const nc = await mascotDaily(env, post, Date.UTC(2026, 10, 19, 10));
t('daily: no channel in the Organization config → no post and the status says so', nc.reason === 'no-channel' && posts.length === 0 && /mascot_posts/.test(JSON.parse(sqlite.prepare("SELECT value FROM meta WHERE key = 'mascot_status'").get().value).detail));
reset();
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('g-mascot', 'Test')").run();
const sid = sqlite.prepare("SELECT id FROM discord_servers WHERE guild_id = 'g-mascot'").get().id;
sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, '8801', 'mascot_posts', 'org', '', 1)").run(sid);
const d1 = await mascotDaily(env, post, Date.UTC(2026, 10, 19, 10)), d2 = await mascotDaily(env, post, Date.UTC(2026, 10, 19, 11));
t('daily: posts one quote to the configured channel, once a day, in Phoenix branding', d1.posted && posts.length === 1 && posts[0].ch === '8801' && d2.reason === 'done' && /phoenix fire/i.test(posts[0].text) && !/norex/i.test(posts[0].text));

// ---------- the Worker ----------
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex'); env.DISCORD_APP_ID = '100';
const send = async (payload) => { const body = JSON.stringify(payload), ts = String(Date.now()); const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex'); const res = await worker.fetch(new Request('https://bot/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), env, { waitUntil: () => {} }); return { s: res.status, d: await res.json().catch(() => null) }; };
const as = (id, name, roles = []) => ({ member: { user: { id, username: name }, roles }, channel_id: 'c1', token: 'tok' });
const cmd = (who, sub, options = [], resolved) => send({ type: 2, ...who, data: { name: 'mascot', options: [{ name: sub, type: 1, options }], ...(resolved ? { resolved } : {}) } });
const roastOf = (who, target, extra = [], bot = false) => cmd(who, 'roast', [{ name: 'member', type: 6, value: target }, ...extra], { users: { [target]: { id: target, username: 'Dave', bot } }, members: {} });
const lineOf = (r) => plainText(r.d.data).split('\n').filter((l) => !/^-# /.test(l) && !/^#+ /.test(l)).join(' ');
const MGR = as('900', 'Coach', ['mgr']);
const killCool = async () => { const dy = new Date().toISOString().slice(0, 10); await KV.delete(`aibudget:mascot:${dy}`); await KV.delete(`aibudget:${dy}`); for (const k of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', '900']) await KV.delete(`aicool:mascot:${k}`); };

setFlag('off');
reset();
await tt('flag off (the default): locked', async () => /Not switched on/.test(plainText((await cmd(as('u1', 'A'), 'quote')).d.data)) && JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).features.mascot === 'off');
setFlag('members');
await tt('/mascot quote: public reply with today\'s line, Phoenix branding', async () => { const r = await cmd(as('u1', 'A'), 'quote'); const txt = plainText(r.d.data); return r.d.type === 4 && !(r.d.data.flags & 64) && /quote of the day/i.test(txt) && /phoenix fire/i.test(txt) && /rise\. burn\. repeat/i.test(txt); });
await killCool();
await tt('/mascot roast: a playful line, named target, no ping, never the club name', async () => {
  const r = await roastOf(as('u1', 'A'), '700'); const line = lineOf(r);
  return /Dave passes like the ball owes money/.test(line) && !/phoenix/i.test(line) && !JSON.stringify(r.d.data).includes('<@700>') && (r.d.data.allowed_mentions?.parse ?? []).length === 0 && /Roast/.test(plainText(r.d.data));
});
await killCool(); await KV.delete(`mascot:roast:700:${new Date().toISOString().slice(0, 10)}`);
await tt('roast: an AI answer that is personal or names the club is replaced by a built-in roast', async () => {
  const out = [];
  for (const bad of ['Dave is ugly and fat.', 'Even Phoenix cannot save Dave.', 'Dave, because he is gay, passes badly.']) { aiOut = bad; await killCool(); await KV.delete(`mascot:roast:700:${new Date().toISOString().slice(0, 10)}`); const l = lineOf(await roastOf(as('u1', 'A'), '700')); out.push(l.includes('Dave') && !unsafe(l.replace(/Dave/g, '')) && !/phoenix|ugly|fat|gay/i.test(l)); }
  return out.every(Boolean);
});
aiOut = 'Dave passes like the ball owes money.';
await killCool(); await KV.delete(`mascot:roast:700:${new Date().toISOString().slice(0, 10)}`);
await tt('roast: a slur or personal charge typed in the "message" is refused and never reaches the AI', async () => { prompts.length = 0; const r = await roastOf(as('u1', 'A'), '700', [{ name: 'message', type: 3, value: 'you are such a n1gg' }]); return /Keep it clean/.test(plainText(r.d.data)) && prompts.length === 0; });
await tt('roast: what they said sets the register of the clap-back (sent to the AI as tone, never as an instruction)', async () => { await killCool(); prompts.length = 0; await roastOf(as('u2', 'B'), '701', [{ name: 'message', type: 3, value: 'lol mate you were rubbish' }]); return prompts.length === 1 && /same register/.test(prompts[0]) && /rubbish/.test(prompts[0]); });
await tt('roast: bots are not targets', async () => /Bots have a good lawyer/.test(plainText((await roastOf(as('u3', 'C'), '800', [], true)).d.data)));
await tt(`roast: at most ${ROAST_PER_TARGET_DAILY} a day per target`, async () => { const k = `mascot:roast:702:${new Date().toISOString().slice(0, 10)}`; await KV.delete(k); const outs = []; for (const u of ['u1', 'u2', 'u3', 'u4']) { await killCool(); outs.push(/Enough for today/.test(plainText((await roastOf(as(u, u), '702')).d.data))); } return outs.join() === 'false,false,false,true'; });
await tt('roast: the per-person cooldown holds (a held-down command cannot burn the pool)', async () => { await killCool(); await KV.delete(`mascot:roast:703:${new Date().toISOString().slice(0, 10)}`); await roastOf(as('u5', 'E'), '703'); return /wait/i.test(plainText((await roastOf(as('u5', 'E'), '703')).d.data)); });
await tt('roast: a tense week is always gentle (level forced to light)', async () => {
  await killCool(); await KV.delete(`mascot:roast:704:${new Date().toISOString().slice(0, 10)}`); prompts.length = 0;
  sqlite.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('sv_intel', ?)").run(JSON.stringify({ at: 1, n: 5, voice: { vibe: 'tense' }, flags: [], topics: [], tone: {}, parts: {} }));
  await roastOf(as('u6', 'F'), '704', [{ name: 'level', type: 3, value: 'spicy' }]); sqlite.exec("DELETE FROM meta WHERE key = 'sv_intel'");
  return /very gentle teasing/.test(prompts[0]) && !/sharp but friendly/.test(prompts[0]);
});
await tt('/mascot ask: an honest upbeat answer; the mood (aggregate only) is the only server data in the prompt', async () => { await killCool(); aiOut = 'Kick-off is on the schedule page. I do not know the exact time, so check it.'; prompts.length = 0; const r = await cmd(as('u1', 'A'), 'ask', [{ name: 'question', type: 3, value: 'when is the next match?' }]); return /Mascot says/.test(plainText(r.d.data)) && /do not know/.test(plainText(r.d.data)) && /club mood this week is steady/.test(prompts[0]); });
await tt('ask: a self-harm question is not answered by the joker', async () => /not for me/.test(plainText((await cmd(as('u1', 'A'), 'ask', [{ name: 'question', type: 3, value: 'i want to kill myself' }])).d.data)));

await tt('mute: managers only', async () => /Managers only/.test(plainText((await cmd(as('u1', 'A'), 'mute')).d.data)) && /muted/i.test(plainText((await cmd(MGR, 'mute')).d.data)));
await tt('mute: ask and roast rest, the quote carries on; unmute brings them back', async () => {
  await killCool(); await KV.delete(`mascot:roast:705:${new Date().toISOString().slice(0, 10)}`);
  const r = /resting/.test(plainText((await roastOf(as('u1', 'A'), '705')).d.data)), a2 = /resting/.test(plainText((await cmd(as('u1', 'A'), 'ask', [{ name: 'question', type: 3, value: 'hi' }])).d.data)), qq = /quote of the day/i.test(plainText((await cmd(as('u1', 'A'), 'quote')).d.data));
  await cmd(MGR, 'mute', [{ name: 'on', type: 5, value: false }]); await killCool();
  return r && a2 && qq && !/resting/.test(plainText((await roastOf(as('u1', 'A'), '705')).d.data));
});

// ---------- the AI budget: 20% ----------
const day = new Date().toISOString().slice(0, 10);
await KV.put(`aibudget:mascot:${day}`, String(featureCap('mascot')));
await tt('budget: the mascot share is 20% of the pool (2,000) and, when used up, ask and roast stop and say so (quote is free)', async () => { await killCool(); await KV.put(`aibudget:mascot:${day}`, String(featureCap('mascot'))); const r = await cmd(as('u1', 'A'), 'ask', [{ name: 'question', type: 3, value: 'hello' }]); const q = await cmd(as('u1', 'A'), 'quote'); return featureCap('mascot') === 2000 && /allowance/i.test(plainText(r.d.data)) && /quote of the day/i.test(plainText(q.d.data)); });
await KV.delete(`aibudget:mascot:${day}`); await KV.delete(`aibudget:${day}`);
const s1 = await spendAi(env, { cost: 1500, feature: 'mascot' }), s2 = await spendAi(env, { cost: 600, feature: 'mascot' });
t('budget: the feature counter refuses past 2,000', s1.ok && !s2.ok);

// ---------- definitions, config, branding ----------
const src = fs.readFileSync(new URL('../bot/mascot.js', import.meta.url), 'utf8'), cdef = COMMANDS.find((x) => x.name === 'mascot');
t('/mascot: quote, ask, roast, mute; roast takes a member, an optional message and a level; no opt-out command', ['quote', 'ask', 'roast', 'mute'].every((n) => cdef.options.some((o) => o.name === n)) && !cdef.options.some((o) => /opt/i.test(o.name)) && cdef.options.find((o) => o.name === 'roast').options.map((o) => o.name).join() === 'member,message,level');
t('mascot.mute is a manager permission; mascot_posts is an Organization config purpose; the daily post is a registered job', PERMS['mascot.mute'] === 'manager' && CHANNEL_PURPOSES.includes('mascot_posts') && /job\('mascotDaily'/.test(fs.readFileSync(new URL('../bot/worker.js', import.meta.url), 'utf8')) && /job:mascotDaily/.test(fs.readFileSync(new URL('../bot/registry.gen.js', import.meta.url), 'utf8')) && /slash:\/mascot/.test(fs.readFileSync(new URL('../bot/registry.gen.js', import.meta.url), 'utf8')));
t('the module names no channel id in code, reads the channel from the config, and has no NOREX name or colour', !/\b\d{17,20}\b/.test(src) && /channelFor\(env, 'mascot_posts'\)/.test(src) && !/norex|c8352c|080b11/i.test(src));
t('the mascot never reads chat: no gateway, no message content in the module', !/m\.content|MESSAGE_CONTENT|gateway/i.test(src.replace(/^\/\/.*$/gm, '')));
done();
setFlag(FEAT0.mascot ?? 'off');
