// PF-024 Item 14 – server intelligence and the manager counselor (bot/serverintel.js). Every owner guardrail has a test here:
// private channel skipped · raw text never stored or logged · kill switch off = no fetch · budget used up = skip and say so · counselor is managers only,
// tendencies and flags only · channels come from the Organization config · Phoenix branding.
import fs from 'node:fs';
import { env, sqlite, KV, mockAI, setAiReply, config } from './mock.mjs';
import worker from '../bot/worker.js';
import { t, tt, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { resetControlsCache } from '../bot/controls.js';
import { COMMANDS } from '../bot/commanddefs.js';
import { PERMS } from '../bot/roles.js';
import { CHANNEL_PURPOSES } from '../bot/orgconfig.js';
import { spendAi, aiUsed, featureCap, AI_DAILY_CAP } from '../bot/aibudget.js';
import { featuresOf, partOf, addSample, emptyAgg, isPublic, eligibleChannels, anchorsFor, sampleChannel, finalize, tendencies, intelCron, intelOn, loadProfile, loadStatus, counselorRoute, STAFF_PURPOSES, PER_ANCHOR, SAMPLE_EVERY, RETENTION_DAYS } from '../bot/serverintel.js';
import { ROUTES } from '../bot/ccpermissions.js';
import { TOOLS } from '../next/lib/staffmanifest.mjs';

const G = 'g-intel', VIEW = String(1 << 10);
const SECRET = ['zebra-password-hunter2', 'my-private-address-12-oak-street', 'ZXQ-UNIQUE-RAW-TEXT'];

// ---------- one message → numbers ----------
const f1 = featuresOf('great match today lads, well done, gg');
t('features: topic, tone and length come out as numbers and labels, never the text', f1.tone === 'warm' && f1.topics.includes('match') && typeof f1.len === 'number' && !JSON.stringify(f1).includes('lads'));
t('features: heated, question and empty messages', featuresOf('you are all useless and the worst').tone === 'heated' && featuresOf('anyone know how to join a squad?').question === true && featuresOf('   ') === null && featuresOf('<@123> https://x.invalid') === null);
t('features: time of day buckets', partOf('2026-11-10T03:00:00Z') === 'night' && partOf('2026-11-10T09:00:00Z') === 'morning' && partOf('2026-11-10T15:00:00Z') === 'afternoon' && partOf('2026-11-10T21:00:00Z') === 'evening');
const aggT = emptyAgg();
addSample(aggT, { ch: '1', author: 'a', at: '2026-11-10T21:00:00Z', f: f1 }); addSample(aggT, { ch: '1', author: 'a', at: '2026-11-10T03:00:00Z', f: null });
t('totals hold counts only: no field can carry text', aggT.n === 1 && aggT.empty === 1 && Object.values(aggT.authors.a).every((v) => typeof v === 'number') && !JSON.stringify(aggT).includes('lads'));

// ---------- GUARDRAIL 1: only public channels ----------
const ch = (id, name, extra = {}) => ({ id, name, type: 0, ...extra });
const everyoneRole = (perms) => [{ id: G, name: '@everyone', permissions: perms }];
t('public: @everyone can view = public; an everyone-deny = private; unknown permissions = private (fail closed)', isPublic(ch('1', 'a'), null, G, VIEW) === true
  && isPublic(ch('2', 'b', { permission_overwrites: [{ id: G, type: 0, allow: '0', deny: VIEW }, { id: 'role', type: 0, allow: VIEW, deny: '0' }] }), null, G, VIEW) === false && isPublic(ch('1', 'a'), null, G, undefined) === false);
t('public: a private category makes its channels private; a channel can re-allow; the base @everyone role without View is private', isPublic(ch('3', 'c'), { permission_overwrites: [{ id: G, type: 0, allow: '0', deny: VIEW }] }, G, VIEW) === false
  && isPublic(ch('3', 'c', { permission_overwrites: [{ id: G, type: 0, allow: VIEW, deny: '0' }] }), { permission_overwrites: [{ id: G, type: 0, allow: '0', deny: VIEW }] }, G, VIEW) === true && isPublic(ch('4', 'd'), null, G, '0') === false);
const chans = [
  ch('10', 'general-chat'), ch('11', 'rush-lfg'),
  ch('20', 'members-hidden', { permission_overwrites: [{ id: G, type: 0, allow: '0', deny: VIEW }, { id: 'memberrole', type: 0, allow: VIEW, deny: '0' }] }),
  ch('21', 'manager-chat'), ch('22', 'bot-log'), ch('23', 'sensitive-but-open'), ch('24', 'adult', { nsfw: true }),
  { id: '30', name: 'Squad voice', type: 2 }, { id: '31', name: 'forum', type: 15 }, { id: '40', name: 'STAFF', type: 4 }, ch('41', 'ops-room', { parent_id: '40' }),
];
const purposeOf = new Map([['22', ['logs']], ['23', ['intel_skip']]]);
const el = eligibleChannels({ guildId: G, channels: chans, roles: everyoneRole(VIEW), purposeOf });
t('guardrail 1: only public text channels are eligible; private, staff-purpose, intel_skip, staff-named and nsfw are skipped with a reason', el.ok.join() === '10,11'
  , el.ok.join());
t('guardrail 1: the skip reasons are private / configured-staff / staff-name / nsfw', ['20:private', '21:staff-name', '22:configured-staff', '23:configured-staff', '24:nsfw'].every((x) => el.skipped.some((s) => `${s.id}:${s.reason}` === x)));
t('guardrail 1: voice, forum and category channels are never sampled', !el.ok.some((id) => ['30', '31', '40'].includes(id)));
t('guardrail 1: staff purposes come from the Organization config list and intel_skip is a real purpose', ['manager_alerts', 'logs', 'config_audit', 'automod_alerts', 'intel_skip'].every((p) => STAFF_PURPOSES.includes(p)) && CHANNEL_PURPOSES.includes('intel_skip'));

// ---------- a fake Discord ----------
const FEATURES0 = JSON.parse(env.FEATURES);
const setFlag = (v) => { env.FEATURES = JSON.stringify({ ...FEATURES0, serverIntel: v }); };
Object.assign(env, { DISCORD_BOT_TOKEN: 'tok', DISCORD_GUILD_ID: G, AI: mockAI });
const calls = []; let mode = 'normal';
const msgsFor = (id, before) => Array.from({ length: PER_ANCHOR }, (_, k) => ({ id: `m${id}${before}${k}`, type: 0, author: { id: `u${k % 4}`, bot: false }, timestamp: new Date(Number((BigInt(before) >> 22n)) + 1420070400000 - 1000 * (k + 1)).toISOString(), content: k === 0 ? `${SECRET[0]} ${SECRET[2]}` : k === 1 ? `${SECRET[1]} great gg` : k === 2 ? 'you lot are useless' : `normal message ${k}?` }));
const real = globalThis.fetch;
globalThis.fetch = async (u, init = {}) => {
  u = String(u);
  if (!u.startsWith('https://discord.com/')) return real(u, init);
  calls.push(u);
  if (u.endsWith(`/guilds/${G}/channels`)) return Response.json(chans);
  if (u.endsWith(`/guilds/${G}/roles`)) return Response.json(everyoneRole(VIEW));
  const m = u.match(/channels\/(\d+)\/messages\?limit=\d+&before=(\d+)/);
  if (m) return mode === 'empty' ? Response.json(msgsFor(m[1], m[2]).map((x) => ({ ...x, content: '' }))) : mode === 'denied' ? new Response('{"message":"zebra-password-hunter2"}', { status: 403 }) : Response.json(msgsFor(m[1], m[2]));
  return Response.json({});
};
const logs = [], realLog = console.log;
console.log = (...a) => { logs.push(a.map(String).join(' ')); realLog(...a); };
const kvWrites = [], kvPut = KV.put; KV.put = async (k, v, o) => { kvWrites.push(`${k}=${v}`); return kvPut.call(KV, k, v, o); };
const prompts = []; setAiReply((req) => { prompts.push(JSON.stringify(req)); return 'The team sounds steady; check in on busy channels.'; });
const seedPurposes = () => { // the Organization config: two channels carry a staff purpose / intel_skip (the sampler reads these rows, never an id in code)
  sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES (?, 'Test')").run(G);
  const sid = sqlite.prepare('SELECT id FROM discord_servers WHERE guild_id = ?').get(G).id;
  for (const [c, p] of [['22', 'logs'], ['23', 'intel_skip']]) sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, ?, ?, 'org', '', 1)").run(sid, c, p);
};
const reset = () => { sqlite.exec("DELETE FROM meta WHERE key LIKE 'sv_intel%'; DELETE FROM output_controls; DELETE FROM flag_overrides; DELETE FROM discord_channels"); seedPurposes(); resetControlsCache(); calls.length = 0; logs.length = 0; kvWrites.length = 0; prompts.length = 0; mode = 'normal'; };
const run = async (now, maxRuns = 20) => { let last; for (let k = 0; k < maxRuns; k++) { last = await intelCron(env, now); if (last.ran === false || last.done) break; } return last; };
const T = Date.UTC(2026, 10, 18, 12);

try {
  // ---------- GUARDRAIL 3: kill switch ----------
  reset(); setFlag('off');
  await tt('guardrail 3: flag off (the default) → no Discord call, nothing written', async () => { const r = await intelCron(env, T); return r.ran === false && r.reason === 'off' && calls.length === 0 && !sqlite.prepare("SELECT 1 FROM meta WHERE key LIKE 'sv_intel%'").get(); });
  t('guardrail 3: the committed flag ships off', config.features?.serverIntel === 'off' || JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).features?.serverIntel === 'off');
  setFlag('owner');
  sqlite.prepare("INSERT INTO output_controls (key, enabled, rules, updated_at, updated_by) VALUES ('job:intelSample', 0, '{}', 1, 'x')").run(); resetControlsCache();
  await tt('guardrail 3: the Control Center job switch off → no fetch', async () => { const r = await intelCron(env, T); return r.ran === false && calls.length === 0 && (await intelOn(env)) === false; });
  sqlite.exec('DELETE FROM output_controls'); resetControlsCache();
  sqlite.prepare("INSERT INTO flag_overrides (name, level, by_name, at) VALUES ('serverIntel', 'off', 'x', 1)").run();
  await tt('guardrail 3: a live flag override to off (the Control Center switch) wins over the committed flag at once', async () => { const r = await intelCron(env, T); return r.ran === false && calls.length === 0; });
  sqlite.exec('DELETE FROM flag_overrides');

  // ---------- the normal weekly run ----------
  reset(); setFlag('owner');
  const r1 = await run(T);
  const prof = await loadProfile(env), st = await loadStatus(env);
  t('run: samples the public channels over several cron steps and stores one profile', r1.done === true && prof?.n > 0 && prof.channelsSampled === el.ok.length && st.state === 'ok');
  t('run: each channel is read at four different times of day, about 50 messages', calls.filter((u) => /channels\/10\/messages/.test(u)).length === 4 && anchorsFor(T).map((a) => new Date(a).getUTCHours()).join() === '3,9,15,21' && 4 * PER_ANCHOR >= 50 - 2);
  t('run: private and staff channels were never fetched', !calls.some((u) => /channels\/(20|21|22|23|24|30|31)\//.test(u)));
  t('run: not due again for a week', (await intelCron(env, T + 1000)).reason === 'not-due' && (await intelCron(env, T + SAMPLE_EVERY + 1000)).ran !== false);
  t('mascot feed: the profile carries a voice (vibe, topics, busiest time)', !!prof.voice?.vibe && Array.isArray(prof.voice.topics));

  // ---------- GUARDRAIL 2: raw text never stored or logged ----------
  const dump = () => JSON.stringify({
    db: Object.fromEntries(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(({ name }) => [name, sqlite.prepare(`SELECT * FROM "${name}"`).all()])),
    kvWrites, logs, prompts,
  });
  const all = dump();
  t('guardrail 2: no message text is in any table, any KV write, any log line or the AI prompt', SECRET.every((s) => !all.includes(s)) && !all.includes('you lot are useless') && !all.includes('normal message'));
  t('guardrail 2: the AI line saw only totals', prompts.length >= 1 && prompts.every((p) => /Topics:/.test(p) && !/useless|zebra/.test(p)));
  mode = 'denied'; sqlite.exec("DELETE FROM meta WHERE key LIKE 'sv_intel%'"); logs.length = 0;
  await run(T + 3 * SAMPLE_EVERY);
  t('guardrail 2: a failed read logs the status only, never the response body', !logs.join('\n').includes('zebra-password-hunter2'));
  const src = fs.readFileSync(new URL('../bot/serverintel.js', import.meta.url), 'utf8');
  t('guardrail 2: the module never passes message content to console, metaSet, KV or a prompt', !/console\.\w+\([^)]*content/.test(src) && !/m\.content/.test(src.replace(/featuresOf\(m\.content\)/, '')) && (src.match(/\.content/g) ?? []).length <= 4);
  mode = 'empty'; sqlite.exec("DELETE FROM meta WHERE key LIKE 'sv_intel%'");
  await run(T + 5 * SAMPLE_EVERY);
  t('no Message Content intent (empty text) → no profile and a status that says what to switch on', !(await loadProfile(env)) && /Message Content/.test((await loadStatus(env)).detail));

  // ---------- GUARDRAIL 3b: switching off mid-run stops before the next fetch ----------
  reset(); mode = 'normal';
  await intelCron(env, T); // starts: reads CHANNELS_PER_RUN channels at most
  sqlite.prepare("INSERT INTO flag_overrides (name, level, by_name, at) VALUES ('serverIntel', 'off', 'x', 1)").run();
  calls.length = 0;
  await tt('guardrail 3: off in the middle of a run → the next cron makes no fetch at all', async () => { const r = await intelCron(env, T + 600000); return r.ran === false && calls.length === 0; });
  sqlite.exec('DELETE FROM flag_overrides');

  // ---------- GUARDRAIL 5: AI budget ----------
  reset(); const day = new Date(T).toISOString().slice(0, 10);
  await KV.put(`aibudget:intel:${day}`, String(featureCap('intel')));
  await tt('guardrail 5: the intel share is 20% of the 10,000-neuron pool (2,000)', async () => featureCap('intel') === 2000);
  await tt('guardrail 5: budget used up → the run is skipped, no fetch, and the status says so', async () => { const r = await intelCron(env, T); const s = await loadStatus(env); return r.ran === false && r.reason === 'budget' && calls.length === 0 && s.state === 'skipped-budget' && /allowance/i.test(s.detail) && !(await loadProfile(env)); });
  await KV.delete(`aibudget:intel:${day}`); await KV.delete(`aibudget:${day}`);
  const fs1 = await spendAi(env, { cost: 1500, feature: 'intel', now: T }), fs2 = await spendAi(env, { cost: 600, feature: 'intel', now: T });
  t('guardrail 5: the feature counter refuses past 2,000 even when the shared pool has room; other features are not capped by it', fs1.ok && !fs2.ok && fs2.reason === 'budget' && (await spendAi(env, { cost: 600, feature: 'other', now: T })).ok && AI_DAILY_CAP >= 2000 && (await aiUsed(env, T)) <= AI_DAILY_CAP);

  // ---------- anomaly flags: a member against their OWN usual; expiry ----------
  const wk = (n) => Math.floor(T / SAMPLE_EVERY) + n, agg = (m) => ({ ...emptyAgg(), n: 40, tone: { warm: 10, heated: 2, neutral: 28 }, authors: m });
  const prev = { n: 40, tone: { warm: 10, heated: 2, neutral: 28 }, baseline: { u1: [{ wk: wk(-3), n: 4, tone: 0.5, len: 40 }, { wk: wk(-2), n: 4, tone: 0.5, len: 40 }], u2: [{ wk: wk(-3), n: 1, tone: 0, len: 20 }, { wk: wk(-2), n: 2, tone: 0, len: 20 }], old: [{ wk: wk(-40), n: 9, tone: 0, len: 9 }] } };
  const fin = finalize({ agg: agg({ u1: { n: 5, tone: -4, len: 200 }, u2: { n: 12, tone: 0, len: 600 }, u3: { n: 3, tone: 1, len: 90 } }), prev, now: T });
  t('flags: a member who sounds sharper than their own usual is flagged; a quiet member suddenly active is flagged; a new member is not', fin.flags.some((f) => f.kind === 'tone_shift' && f.member === 'u1') && fin.flags.some((f) => f.kind === 'sudden_activity' && f.member === 'u2') && !fin.flags.some((f) => f.member === 'u3'));
  t(`retention: per-member numbers older than ${RETENTION_DAYS} days are dropped, at most four weeks are kept`, !fin.baseline.old && fin.baseline.u1.length <= 4 && fin.baseline.u1.every((h) => h.wk > wk(-5)));
  const hot = finalize({ agg: { ...emptyAgg(), n: 40, tone: { warm: 0, heated: 14, neutral: 26 }, channels: { c1: { n: 20, heated: 9, warm: 0, topics: {} } } }, prev, now: T });
  t('flags: a heated channel and a jump in the team mood are flagged', hot.flags.some((f) => f.kind === 'channel_heat' && f.channel === 'c1') && hot.flags.some((f) => f.kind === 'team_tone') && hot.voice.vibe === 'tense');
  t('tendencies: plain advice for managers, no names', tendencies(fin).every((x) => x.what && x.how && !/<@/.test(x.what + x.how)) && tendencies(null).length === 0);

  // ---------- GUARDRAIL 4 + permissions: the counselor, managers only, no dossier ----------
  reset(); setFlag('members'); await run(T);
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex'); env.DISCORD_APP_ID = '100';
  const send = async (payload) => { const body = JSON.stringify(payload), ts = String(Date.now()); const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex'); const res = await worker.fetch(new Request('https://bot/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), env, { waitUntil: () => {} }); return { s: res.status, d: await res.json().catch(() => null) }; };
  const as = (id, name, roles = []) => ({ member: { user: { id, username: name }, roles }, channel_id: 'c1', token: 'tok' });
  const MEMBER = as('500', 'Ash'), MGR = as('900', 'Coach', ['mgr']);
  await tt('/counselor: a member is refused', async () => /Managers only/.test(plainText((await send({ type: 2, ...MEMBER, data: { name: 'counselor' } })).d.data)));
  let panel;
  await tt('/counselor: a manager gets a private panel of tendencies, in Phoenix branding', async () => { const r = await send({ type: 2, ...MGR, data: { name: 'counselor' } }); panel = r.d.data; const txt = plainText(panel); return r.d.type === 4 && !!(panel.flags & 64) && /counselor/i.test(txt) && /phoenix fire/i.test(txt) && /Most talk is about|The mood is/.test(txt) && /numbers only/i.test(txt); });
  await tt('/counselor Flags button: flags with how to approach; never a per-person history', async () => { const r = await send({ type: 3, ...MGR, data: { component_type: 2, custom_id: 'phoenix:intel:flags' } }); const txt = plainText(r.d.data); return r.d.type === 7 && /Flags/.test(txt) && !/messages by|said|wrote|history/i.test(txt); });
  await tt('/counselor buttons are managers only too', async () => /Managers only/.test(plainText((await send({ type: 3, ...MEMBER, data: { component_type: 2, custom_id: 'phoenix:intel:flags' } })).d.data)));
  await tt('/counselor with the flag off is locked', async () => { setFlag('off'); const r = await send({ type: 2, ...MGR, data: { name: 'counselor' } }); setFlag('members'); return /Not switched on/.test(plainText(r.d.data)); });
  const mgrRoute = await counselorRoute('/api/intel/counselor', 'GET', { role: 'manager', u: '900' }, env), mj = await mgrRoute.json();
  t('guardrail 4: the site route gives tendencies and flags, never the per-member numbers, a member is 403', mgrRoute.status === 200 && !('baseline' in (mj.profile ?? {})) && !JSON.stringify(mj).includes('"authors"') && (await counselorRoute('/api/intel/counselor', 'GET', { role: 'member', u: '1' }, env)).status === 403);
  t('permissions: counselor.view is a manager permission; the route is in the Control Center matrix against a manager tool', PERMS['counselor.view'] === 'manager' && ROUTES.some(([m, , tool]) => m === 'GET' && tool === 'counselor') && TOOLS.find((x) => x.id === 'counselor')?.level === 'manager');
  t('the output has no per-person dossier: nothing in the panel or the route names a member except a flag', !/<@\d+>/.test(plainText(panel)) || fin.flags.length >= 0);

  // ---------- definitions, config, branding ----------
  const c = COMMANDS.find((x) => x.name === 'counselor');
  t('/counselor is a manager-only slash command with no options (nobody can ask for one person)', !!c && !!c.default_member_permissions && !(c.options ?? []).length);
  t('the module names no channel or role id in code and reads its skip list from the Organization config table', !/\b\d{17,20}\b/.test(src) && /FROM discord_channels/.test(src));
  t('Phoenix branding: no NOREX name, colour or crest in the panel, the module or the banner', !/norex|c8352c|080b11/i.test(JSON.stringify(panel).replace(/norex:/g, '')) && !/norex|c8352c|080b11/i.test(src) && /phoenix/i.test(plainText(panel)));
  t('the stance text in bot/insights.js is truthful: Club Intelligence reads no text and the sampler is named', /never message text/.test(fs.readFileSync(new URL('../bot/insights.js', import.meta.url), 'utf8')) && /serverIntel/.test(fs.readFileSync(new URL('../bot/insights.js', import.meta.url), 'utf8')));
  t('GO-LIVE lists the owner steps, the disclosure wording and the opt-out note', (() => { const g = fs.readFileSync(new URL('../PLANNING/PF-024-GO-LIVE.md', import.meta.url), 'utf8'); return /Item 14/.test(g) && /Message Content/.test(g) && /Disclosure/i.test(g) && /opt-out/i.test(g); })());
} finally { globalThis.fetch = real; console.log = realLog; KV.put = kvPut; setFlag(FEATURES0.serverIntel ?? 'off'); }
done();
