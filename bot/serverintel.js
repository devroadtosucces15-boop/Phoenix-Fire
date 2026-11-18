// PF-024 Item 14 – server intelligence and the manager counselor.
// The Worker samples about 50 recent messages per PUBLIC text channel once a week over Discord REST (no gateway), turns each one into a few
// numbers straight away (topic, tone, length, time of day) and keeps only the totals: the team's topics, tone, activity by time of day, a small
// per-member baseline of numbers, and anomaly flags. /counselor (managers) shows tendencies and flags; the mascot (Item 15) can read `voice`.
//
// GUARDRAILS (each one has a test in tests/serverintel.test.mjs):
//   1. Only public channels. A channel is skipped when @everyone cannot view it, when its Organization config purpose is a staff one
//      (STAFF_PURPOSES) or `intel_skip`, or when it looks like staff/private by name. When we cannot tell, it is skipped.
//   2. RAW MESSAGE TEXT IS NEVER STORED OR LOGGED. `featuresOf` turns a message into numbers inside the fetch loop; the text never leaves that
//      function, is never put in a log line, an error, the database, KV or an AI prompt. Only aggregates are written (see `aggregate`).
//   3. Kill switch: the flag `serverIntel` (ships `off`) and the Control Center switch `job:intelSample`. Both are read again from D1 before every
//      channel, so switching it off stops the next fetch. Off means no Discord call at all.
//   4. The counselor shows tendencies and anomaly flags only: no per-person dossier, no history of what anyone said. A member appears only as a
//      flag ("sounds sharper than their own usual"), built from numbers that expire after RETENTION_DAYS.
//   5. AI budget: at most 20% of the daily Workers AI pool (bot/aibudget.js, feature `intel`). Over budget the run is skipped and says so.
// Needs (owner step): the Message Content intent in the Discord Developer Portal. Without it Discord returns empty text and the run reports "no content".
// D1 meta: `sv_intel` (the latest profile), `sv_intel_job` (a run in progress: queue + running totals), `sv_intel_status` (why the last run did not finish).
import { can, flagOn, loadFlagOverrides, withFlagOverrides } from './roles.js';
import { disabledOutputs } from './controls.js';
import { message, notice, reply, header, text, sep, footer, buttons, cards, bannerUrl } from './ui.js';
import { orgName } from './orgconfig.js';
import { spendAi, AI_COST, aiRefusal } from './aibudget.js';

export const INTEL_COMMANDS = new Set(['counselor']);
export const INTEL_ID = /^phoenix:intel:/;
export const INTEL_FLAG = 'serverIntel';
export const INTEL_JOB = 'job:intelSample'; // the Control Center switch (registry id)
export const SAMPLE_EVERY = 7 * 86400e3; // weekly
export const PER_ANCHOR = 13; // 4 anchors x 13 = about 50 messages per channel
export const CHANNELS_PER_RUN = 4; // channel reads per 10-minute cron (4 fetches each: free Workers allow 50 outgoing calls per request)
export const RETENTION_DAYS = 28; // per-member numbers older than this are dropped
export const AUTHORS_KEEP = 300;
const API = 'https://discord.com/api/v10';
const VIEW = 1n << 10n, DISCORD_EPOCH = 1420070400000;
// Channels with these Organization config purposes are staff or private by definition and are never sampled.
export const STAFF_PURPOSES = ['manager_alerts', 'logs', 'config_audit', 'system_alerts', 'member_log', 'automod_alerts', 'claims', 'rush_queue_reports', 'recruitment', 'intel_skip'];
const STAFF_NAME = /staff|manager|admin|\bmods?\b|moderator|private|secret|logs?$|audit|ticket|appeal|trial|recruit|confidential|dm-/i;
const KEY = 'sv_intel', JOB = 'sv_intel_job', STATUS = 'sv_intel_status';

const metaGet = async (env, key) => { try { return JSON.parse(await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first('value')); } catch { return null; } };
const metaSet = (env, key, v) => env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(v)).run();
export const loadProfile = (env) => (env.DB ? metaGet(env, KEY) : null);
export const loadStatus = (env) => (env.DB ? metaGet(env, STATUS) : null);
const snowflake = (ms) => String((BigInt(Math.max(0, Math.floor(ms) - DISCORD_EPOCH)) << 22n));

// ---------- one message → numbers (the ONLY place message text is read) ----------
export const TOPICS = [
  ['match', 'Matches and results', /\b(match|game|result|score|won|win|lost|loss|draw|gg|clean sheet|goal|goals|final|kickoff|kick-off)\b/],
  ['tactics', 'Tactics and builds', /\b(tactic|tactics|formation|build|builds|press|pressing|strategy|position|positions|role|setup)\b/],
  ['rush', 'Rush and squads', /\b(rush|squad|queue|lfg|lobby|need a|looking for)\b/],
  ['schedule', 'Times and sessions', /\b(tonight|tomorrow|session|schedule|available|availability|rsvp|kick off|time|training|practice)\b/],
  ['recruit', 'Recruiting and newcomers', /\b(trial|recruit|join|welcome|new here|apply|application|invite)\b/],
  ['banter', 'Banter and fun', /\b(lol|lmao|haha|funny|joke|meme|banter|bro|mate|dead)\b/],
  ['help', 'Questions and help', /\b(how do|how to|anyone know|can someone|help|issue|problem|bug|why is|where do)\b/],
  ['media', 'Clips and media', /\b(clip|clips|video|stream|highlight|screenshot|twitch|youtube)\b/],
];
const HEAT = /\b(trash|garbage|useless|stupid|idiot|shut up|hate|worst|terrible|pathetic|ridiculous|wtf|bs|rubbish|clown|joke of|sick of|fed up|quit|leave the|toxic|dogshit)\b/;
const WARM = /\b(gg|nice|well done|thanks|thank you|great|love|legend|proud|congrats|good job|appreciate|brilliant|class|mint|respect|welcome)\b/;
/** text → { topics, tone: 'warm'|'heated'|'neutral', score, question, len } or null for an empty message. Pure: nothing is kept. */
export function featuresOf(raw) {
  const s = String(raw ?? '').replace(/https?:\/\/\S+|<[@#:a-z0-9!&_]+>/gi, ' ').trim();
  if (s.length < 2) return null;
  const low = s.toLowerCase(), letters = s.replace(/[^A-Za-z]/g, '');
  const shout = letters.length >= 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6;
  const heat = (HEAT.test(low) ? 1 : 0) + (shout ? 1 : 0) + (/!{3,}|\?!|!\?/.test(s) ? 0.5 : 0), warm = WARM.test(low) ? 1 : 0;
  const score = Math.max(-1, Math.min(1, warm - heat));
  return { topics: TOPICS.filter(([, , re]) => re.test(low)).map(([k]) => k), tone: score > 0 ? 'warm' : score < 0 ? 'heated' : 'neutral', score, question: /\?\s*$/.test(s), len: Math.min(s.length, 500) };
}
export const partOf = (iso) => { const h = new Date(iso).getUTCHours(); return h < 6 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; };

// ---------- the running totals (aggregates only) ----------
export const emptyAgg = () => ({ n: 0, empty: 0, parts: { night: 0, morning: 0, afternoon: 0, evening: 0 }, topics: {}, tone: { warm: 0, heated: 0, neutral: 0 }, questions: 0, len: 0, channels: {}, authors: {} });
/** add one sample ({ ch, author, at, f }) to the totals */
export function addSample(a, { ch, author, at, f }) {
  if (!f) { a.empty++; return a; }
  a.n++; a.parts[partOf(at)]++; a.tone[f.tone]++; a.len += f.len; if (f.question) a.questions++;
  for (const t of f.topics) a.topics[t] = (a.topics[t] ?? 0) + 1;
  const c = (a.channels[ch] ??= { n: 0, heated: 0, warm: 0, topics: {} });
  c.n++; if (f.tone === 'heated') c.heated++; if (f.tone === 'warm') c.warm++; for (const t of f.topics) c.topics[t] = (c.topics[t] ?? 0) + 1;
  if (author && (a.authors[author] || Object.keys(a.authors).length < AUTHORS_KEEP * 2)) { const m = (a.authors[author] ??= { n: 0, tone: 0, len: 0 }); m.n++; m.tone += f.score; m.len += f.len; }
  return a;
}

// ---------- which channels may be sampled ----------
/** @everyone's view of a channel: the category's overwrites, then the channel's own, on top of the @everyone role. Unknown = not public. */
export function isPublic(ch, parent, guildId, everyonePerms) {
  if (everyonePerms == null) return false;
  let can_ = (BigInt(everyonePerms) & VIEW) !== 0n;
  for (const o of [...(parent?.permission_overwrites ?? []), ...(ch.permission_overwrites ?? [])].filter((x) => x.id === guildId)) {
    if (BigInt(o.deny ?? 0) & VIEW) can_ = false;
    if (BigInt(o.allow ?? 0) & VIEW) can_ = true;
  }
  return can_;
}
/** → { ok: [channel ids], skipped: [{ id, reason }] }. `purposeOf`: Map channelId → [purposes] from the Organization config. */
export function eligibleChannels({ guildId, channels, roles = [], purposeOf = new Map() }) {
  const byId = new Map(channels.map((c) => [c.id, c])), every = roles.find((r) => r.id === guildId), ok = [], skipped = [];
  for (const c of channels) {
    if (c.type !== 0 && c.type !== 5) continue; // text and announcement channels only (no voice, forum, thread, category)
    const parent = byId.get(c.parent_id), why = c.nsfw ? 'nsfw'
      : !isPublic(c, parent, guildId, every?.permissions) ? 'private'
        : (purposeOf.get(c.id) ?? []).some((p) => STAFF_PURPOSES.includes(p)) ? 'configured-staff'
          : STAFF_NAME.test(`${c.name ?? ''} ${parent?.name ?? ''}`) ? 'staff-name' : null;
    if (why) skipped.push({ id: c.id, reason: why }); else ok.push(c.id);
  }
  return { ok, skipped };
}

// ---------- sampling: about 50 messages across the day ----------
const PARTS_HOURS = [3, 9, 15, 21], DAY_BACK = [1, 3, 5, 6]; // four anchors on four different days at four different times of day
export const anchorsFor = (now) => { const d = new Date(now); return PARTS_HOURS.map((h, k) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - DAY_BACK[k], h, 30)); };

// Reads one channel and returns ONLY derived samples. The message array is local to this function and is gone when it returns.
export async function sampleChannel(env, channelId, now = Date.now()) {
  const out = [];
  for (const at of anchorsFor(now)) {
    const r = await fetch(`${API}/channels/${channelId}/messages?limit=${PER_ANCHOR}&before=${snowflake(at)}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    if (r.status === 403 || r.status === 404) return { samples: out, error: 'no-access' }; // status only: nothing from the body is logged
    if (!r.ok) return { samples: out, error: `discord-${r.status}` };
    for (const m of (await r.json().catch(() => [])) ?? []) {
      if (m.author?.bot || (m.type !== 0 && m.type !== 19)) continue;
      out.push({ ch: channelId, author: m.author?.id ?? null, at: m.timestamp, f: featuresOf(m.content) });
    }
  }
  return { samples: out, error: null };
}

// ---------- the kill switch ----------
/** true only when the flag is on (live D1 value) AND the Control Center job switch is not off. Read again before every channel. */
export async function intelOn(env) {
  try {
    const e = withFlagOverrides(env, await loadFlagOverrides(env));
    if (!flagOn(e, { role: 'owner' }, INTEL_FLAG)) return false;
    return !(await disabledOutputs(env, 'job:')).has(INTEL_JOB);
  } catch { return false; } // when in doubt, off
}

// ---------- finishing a week: baseline, flags, profile ----------
const wk = (now) => Math.floor(now / SAMPLE_EVERY);
const share = (n, d) => (d ? n / d : 0);
export function finalize({ agg, prev, now = Date.now(), skippedChannels = 0 }) {
  const week = wk(now), baseline = { ...(prev?.baseline ?? {}) }, flags = [];
  const cutoff = week - Math.ceil(RETENTION_DAYS / 7);
  // member baselines: compare this week with the member's OWN earlier weeks, then add this week
  for (const [id, m] of Object.entries(agg.authors)) {
    const hist = (baseline[id] ?? []).filter((h) => h.wk > cutoff && h.wk !== week);
    const hn = hist.reduce((s, h) => s + h.n, 0), tone = m.n ? m.tone / m.n : 0;
    if (hist.length >= 2 && hn >= 6 && m.n >= 3) {
      const bt = hist.reduce((s, h) => s + h.tone * h.n, 0) / hn;
      if (Math.abs(tone - bt) >= 0.6) flags.push({ kind: 'tone_shift', member: id, detail: tone < bt ? 'sounds sharper than their own usual' : 'sounds warmer than their own usual' });
    }
    if (hist.length >= 2 && hn / hist.length <= 3 && m.n >= 10) flags.push({ kind: 'sudden_activity', member: id, detail: 'a normally quiet member is suddenly very active' });
    baseline[id] = [...hist, { wk: week, n: m.n, tone: m.n ? m.tone / m.n : 0, len: m.n ? m.len / m.n : 0 }].slice(-4);
  }
  for (const id of Object.keys(baseline)) { baseline[id] = baseline[id].filter((h) => h.wk > cutoff); if (!baseline[id].length) delete baseline[id]; }
  const keep = Object.entries(baseline).sort((a, b) => b[1].reduce((s, h) => s + h.n, 0) - a[1].reduce((s, h) => s + h.n, 0)).slice(0, AUTHORS_KEEP);
  const heat = share(agg.tone.heated, agg.n), prevHeat = prev?.tone ? share(prev.tone.heated, prev.n) : null;
  const channels = Object.entries(agg.channels).map(([id, c]) => ({ id, n: c.n, heated: c.heated, warm: c.warm, top: Object.entries(c.topics).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }));
  for (const c of channels) if (c.n >= 10 && share(c.heated, c.n) >= 0.3) flags.push({ kind: 'channel_heat', channel: c.id, detail: 'a lot of heated messages in the sample' });
  if (prevHeat != null && agg.n >= 30 && heat - prevHeat >= 0.15) flags.push({ kind: 'team_tone', detail: `heated share is up ${Math.round((heat - prevHeat) * 100)} points on last week` });
  const topics = Object.entries(agg.topics).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));
  return {
    at: now, week, n: agg.n, empty: agg.empty, channelsSampled: channels.length, channelsSkipped: skippedChannels,
    parts: agg.parts, tone: agg.tone, questions: agg.questions, avgLen: agg.n ? Math.round(agg.len / agg.n) : 0, topics, channels: channels.sort((a, b) => b.heated - a.heated).slice(0, 12),
    flags: flags.slice(0, 12), baseline: Object.fromEntries(keep), narrative: null,
    voice: { vibe: heat >= 0.2 ? 'tense' : share(agg.tone.warm, agg.n) >= 0.25 ? 'warm' : 'steady', topics: topics.slice(0, 3).map((t) => t.k), busiest: Object.entries(agg.parts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }, // for the mascot (Item 15)
  };
}

// ---------- tendencies → plain advice for a manager (rule based; the AI line only polishes it) ----------
const TOPIC_NAME = Object.fromEntries(TOPICS.map(([k, l]) => [k, l]));
export function tendencies(p) {
  if (!p || !p.n) return [];
  const out = [], heat = share(p.tone.heated, p.n), warm = share(p.tone.warm, p.n), top = p.topics[0];
  if (top) out.push({ what: `Most talk is about ${TOPIC_NAME[top.k]?.toLowerCase() ?? top.k}`, how: top.k === 'help' ? 'Answer questions fast and in public: it shows new members it is safe to ask.' : 'Lead with this topic when you want people to join in.' });
  const part = Object.entries(p.parts).sort((a, b) => b[1] - a[1])[0];
  if (part && part[1]) out.push({ what: `Busiest in the ${part[0]} (UTC)`, how: 'Post announcements and ask for RSVPs then; quiet hours get missed.' });
  out.push(heat >= 0.2 ? { what: 'The mood is tense', how: 'Step in early and calmly in the heated channels; move arguments to a private word with the people involved.' }
    : warm >= 0.25 ? { what: 'The mood is warm', how: 'Name and thank people publicly; it keeps the tone up.' }
      : { what: 'The mood is steady', how: 'Nothing to fix. Keep praise visible so it stays that way.' });
  if (share(p.questions, p.n) >= 0.25) out.push({ what: 'Many messages are questions', how: 'Pin the answers to the common ones or point people to /wiki and /navigator.' });
  return out;
}
export const flagText = (f) => (f.kind === 'channel_heat' ? `<#${f.channel}> – ${f.detail}` : f.member ? `<@${f.member}> – ${f.detail}` : `Team – ${f.detail}`);
export const approach = (f) => ({ tone_shift: 'Check in privately and kindly. Ask how things are; do not quote or confront.', sudden_activity: 'Say hello and ask what changed; it may be good news.', channel_heat: 'Read the channel yourself and set a calm tone; remind people of the rules.', team_tone: 'Look at recent results or news that could explain it, and address it with the whole team.' }[f.kind]);

// ---------- the AI line (aggregates only, 20% of the pool) ----------
export async function narrate(env, profile, now = Date.now()) {
  if (!env.AI) return null;
  const spent = await spendAi(env, { cost: AI_COST.text, feature: 'intel', now });
  if (!spent.ok) return null;
  try {
    const facts = `Topics: ${profile.topics.slice(0, 4).map((t) => `${TOPIC_NAME[t.k]} ${t.n}`).join(', ')}. Mood: ${profile.tone.warm} warm, ${profile.tone.heated} heated, ${profile.tone.neutral} neutral of ${profile.n}. Busiest: ${profile.voice.busiest}. Flags: ${profile.flags.length}.`;
    const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'system', content: 'You advise the managers of a football gaming club. In two short sentences say how the team feels and how to approach it. Use only the numbers given. No names.' }, { role: 'user', content: facts }], max_tokens: 120 });
    return typeof out?.response === 'string' ? out.response.trim().slice(0, 400) : null;
  } catch { return null; }
}

// ---------- the weekly job, run in small steps by the 10-minute cron ----------
const note_ = async (env, s, now) => { await metaSet(env, STATUS, { at: now, ...s }).catch(() => {}); return s; };
export async function intelCron(env, now = Date.now()) {
  if (!env.DB || !env.DISCORD_GUILD_ID || !env.DISCORD_BOT_TOKEN) return { ran: false, reason: 'not-set-up' };
  if (!(await intelOn(env))) return { ran: false, reason: 'off' }; // no Discord call, no write
  let job = await metaGet(env, JOB);
  if (!job) {
    const prev = await loadProfile(env);
    if (prev && now - prev.at < SAMPLE_EVERY) return { ran: false, reason: 'not-due' };
    const spent = await spendAi(env, { cost: AI_COST.text, feature: 'intel', now }); // reserve the run's AI line up front: no budget = no run
    if (!spent.ok) { await note_(env, { state: 'skipped-budget', detail: aiRefusal(spent) }, now); return { ran: false, reason: 'budget' }; }
    const g = env.DISCORD_GUILD_ID, h = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };
    const [cr, rr] = await Promise.all([fetch(`${API}/guilds/${g}/channels`, { headers: h }), fetch(`${API}/guilds/${g}/roles`, { headers: h })]);
    if (!cr.ok || !rr.ok) { await note_(env, { state: 'no-access', detail: 'The bot cannot read the channel list.' }, now); return { ran: false, reason: 'no-access' }; }
    const el = eligibleChannels({ guildId: g, channels: await cr.json(), roles: await rr.json(), purposeOf: await purposeMap(env) });
    job = { started: now, queue: el.ok, skipped: el.skipped.length, agg: emptyAgg(), reads: 0, errors: 0 };
  }
  for (let k = 0; k < CHANNELS_PER_RUN && job.queue.length; k++) {
    if (!(await intelOn(env))) { await metaSet(env, JOB, job); return { ran: true, stopped: 'off' }; } // switched off mid-run: stop before the next fetch
    const id = job.queue.shift(), r = await sampleChannel(env, id, job.started);
    job.reads++; if (r.error) job.errors++;
    for (const s of r.samples) addSample(job.agg, s);
  }
  if (job.queue.length) { await metaSet(env, JOB, job); return { ran: true, done: false, left: job.queue.length }; }
  await env.DB.prepare('DELETE FROM meta WHERE key = ?').bind(JOB).run();
  if (!job.agg.n) {
    await note_(env, { state: 'no-content', detail: job.agg.empty ? 'Discord sent messages with no text: switch on the Message Content intent in the Developer Portal.' : 'No messages were found in the public channels.' }, now);
    return { ran: true, done: true, n: 0 };
  }
  const profile = finalize({ agg: job.agg, prev: await loadProfile(env), now: job.started, skippedChannels: job.skipped });
  profile.narrative = await narrate(env, profile, now);
  await metaSet(env, KEY, profile);
  await note_(env, { state: 'ok', detail: `${profile.n} messages summarised from ${profile.channelsSampled} public channels` }, now);
  return { ran: true, done: true, n: profile.n };
}
async function purposeMap(env) {
  const rows = (await env.DB.prepare('SELECT c.channel_id, c.purpose FROM discord_channels c JOIN discord_servers s ON s.id = c.server_id WHERE c.active = 1 AND s.active = 1').all().catch(() => ({ results: [] }))).results ?? [];
  const m = new Map();
  for (const r of rows) m.set(String(r.channel_id), [...(m.get(String(r.channel_id)) ?? []), r.purpose]);
  return m;
}

// ---------- /counselor (managers): tendencies and flags, never a dossier ----------
const pct = (n, d) => `${Math.round(share(n, d) * 100)}%`;
export function counselorPanel(env, profile, status, view = 'home') {
  const shell = (title, sub, body) => message({ accent: 'red', ephemeral: true, blocks: [
    cards(bannerUrl(env, 'counselor')),
    header({ eyebrow: `${orgName(env)} · Counselor`, title, sub, size: 3 }),
    ...body, sep(),
    footer(profile ? `Sampled <t:${Math.floor(profile.at / 1000)}:R> · ${profile.n} public-channel messages, numbers only: no message text is stored` : 'Numbers only: no message text is stored'),
    buttons([{ label: 'Tendencies', id: 'phoenix:intel:home', emoji: '🧭' }, { label: 'Flags', id: 'phoenix:intel:flags', emoji: '🚩' }]),
  ] });
  if (!profile) return shell('Nothing sampled yet', 'The first weekly sample has not finished', [text(status?.detail ? `Last run: ${status.detail}` : 'When the weekly sample has run, the team tendencies and flags show here.')]);
  if (view === 'flags') {
    const lines = profile.flags.map((f) => `• ${flagText(f)}\n-# ${approach(f)}`);
    return shell('Flags', `${profile.flags.length} to look at`, [text(lines.join('\n') || 'No anomalies this week.'), text('-# A flag compares someone with their own usual numbers. It is a prompt to check in, not a verdict.')]);
  }
  const body = tendencies(profile).map((t) => `**${t.what}**\n-# ${t.how}`);
  return shell('How the team is doing', `${profile.n} messages · mood ${pct(profile.tone.warm, profile.n)} warm, ${pct(profile.tone.heated, profile.n)} heated`, [
    text(body.join('\n\n') || 'Not enough messages to say yet.'),
    profile.narrative ? text(`-# ${profile.narrative}`) : null,
    status && status.state !== 'ok' ? text(`-# Last run: ${status.detail}`) : null,
  ]);
}
const note = (title, body = '') => reply(notice(title, body));
export async function counselorCommand(i, env, who) {
  if (!flagOn(env, who, INTEL_FLAG)) return note('Not switched on', 'Server intelligence is off. The owner switches it on in the Control Center.');
  if (!can(who, 'counselor.view')) return note('Managers only');
  if (!env.DB) return note('The member database is not connected');
  return reply(counselorPanel(env, await loadProfile(env), await loadStatus(env)));
}
export async function counselorButton(i, env, who) {
  if (!flagOn(env, who, INTEL_FLAG)) return note('Not switched on');
  if (!can(who, 'counselor.view')) return note('Managers only');
  const view = String(i.data?.custom_id ?? '').split(':')[2];
  return { type: 7, data: counselorPanel(env, await loadProfile(env), await loadStatus(env), view === 'flags' ? 'flags' : 'home') };
}

// ---------- GET /api/intel/counselor (the Control Center tool; managers, listed in bot/ccpermissions.js) ----------
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
export async function counselorRoute(p, method, me, env) {
  if (p !== '/api/intel/counselor') return null;
  if (method !== 'GET') return json({ error: 'Not found' }, 404);
  if (!flagOn(env, me, INTEL_FLAG)) return json({ error: 'Not available yet.' }, 404);
  if (!can(me, 'counselor.view')) return json({ error: 'Managers only.' }, 403);
  const prof = await loadProfile(env), status = await loadStatus(env);
  const { baseline, ...pub } = prof ?? {}; // the per-member numbers never leave the Worker
  return json({ profile: prof ? { ...pub, tendencies: tendencies(prof), flags: prof.flags.map((f) => ({ ...f, text: flagText(f), approach: approach(f) })) } : null, status });
}
