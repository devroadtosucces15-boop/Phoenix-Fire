// PF-024 Item 12 – the server navigator. Scans the Discord server (channels, categories, who can see what), works out what each
// channel is FOR, and shows it as a private, button-driven panel with a Q&A wiki for new and existing members: /navigator [question].
// Only the bot token is needed (GET /guilds/<id>/channels and /roles): no gateway, no message reading.
//   how a channel's purpose is decided, strongest first:
//     1. the Organization config (purposes set on the site or by /setup): "configured", always right
//     2. its name and topic against the keyword table below (the intent catalogue): "guess"
//   who sees what: the permission overwrites (@everyone, then roles) decide whether a channel is public, for some roles, or staff only; the
//   panel only lists a channel to someone who can see it (managers see all, marked).
//   rescans: the 10-minute cron rebuilds the map when the last scan is older than SCAN_EVERY; the new map is compared with the old one and the
//   differences (new, removed, renamed, moved, purpose changed) are kept for managers ("What changed").
import { can, flagOn } from './roles.js';
import { message, notice, reply, header, text, footer, sep, buttons, cards, bannerUrl } from './ui.js';
import { orgName, CHANNEL_PURPOSE_INFO } from './orgconfig.js';
import { discord } from './servertools.js';
import { COMMANDS, APP_COMMANDS } from './commanddefs.js';

export const NAV_COMMANDS = new Set(['navigator']);
export const NAV_ID = /^norex:nav:/;
export const SCAN_EVERY = 55 * 60e3; // the cron scans once an hour
const MAP_KEY = 'nav:map', CHG_KEY = 'nav:changes';
const VIEW = 1n << 10n;
const KINDS = { 0: 'text', 2: 'voice', 5: 'announcement', 13: 'stage', 15: 'forum', 16: 'media' };
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

// ---------- the intent catalogue: what a channel is for, guessed from its name and topic ----------
// [key, label, what it is for, name pattern, link on the site]
export const INTENTS = [
  ['rules', 'Rules', 'The club rules. Read them first.', /rule|code-of-conduct|read-me|readme/, 'hub-handbook.html'],
  ['welcome', 'Welcome', 'Say hello and find your way around.', /welcome|introduc|start-here|new-here|hello/, null],
  ['announcements', 'Announcements', 'News and notices from the managers.', /announce|news|updates?$|notice/, null],
  ['results', 'Match results', 'Final scores and match reports.', /result|score|match-report|fixtures?/, 'results.html'],
  ['matchnight', 'Match night', 'Sessions, line-ups and who is playing.', /match-?night|lineup|line-up|session|rsvp|schedule|events?$/, 'hub-matchnight.html'],
  ['rush', 'Rush', 'Find a Rush squad, the queue and Rush results.', /rush|lfg|queue|looking-for/, 'rush.html'],
  ['recruitment', 'Recruitment and trials', 'Join the club, trials and scouting.', /recruit|trial|join-us|apply|scout/, null],
  ['tactics', 'Tactics and builds', 'Formations, tactics, player builds.', /tactic|formation|build|strategy|playbook/, 'tactics.html'],
  ['media', 'Clips and media', 'Goals, clips and screenshots.', /clip|highlight|media|screenshot|goals?$|video/, null],
  ['chat', 'General chat', 'Talk about anything.', /general|chat|lounge|banter|hangout|off-?topic|memes?/, null],
  ['voice', 'Voice', 'Talk while you play.', /voice|lobby|squad-?\d|party|talk|vc/, null],
  ['music', 'Music', 'The music bots.', /music|dj|radio|songs?/, null],
  ['help', 'Help and support', 'Ask questions, report a problem.', /help|support|question|faq|ask|feedback/, null],
  ['ideas', 'Suggestions', 'Ideas to make the club better.', /suggest|idea/, null],
  ['bots', 'Bot commands', 'Use the bots here.', /bot|command|cmd/, null],
  ['staff', 'Staff', 'Managers only.', /staff|manager|admin|mod(s|erator)?|logs?$|audit|alerts?$/, null],
];
// Config purposes that mean the same as a catalogue intent (so a configured channel shows the friendly label).
const PURPOSE_TO_INTENT = {
  announcements: 'announcements', match_results: 'results', match_notifications: 'matchnight', session_recaps: 'results', recruitment: 'recruitment',
  welcome: 'welcome', rush_queue: 'rush', rush_need: 'rush', rush_lfg: 'rush', rush_board: 'rush', season_stats: 'rush', manager_alerts: 'staff', logs: 'staff',
  config_audit: 'staff', system_alerts: 'staff', member_log: 'staff', automod_alerts: 'staff', claims: 'staff', rush_queue_reports: 'staff',
};
const intentByKey = Object.fromEntries(INTENTS.map((i) => [i[0], { key: i[0], label: i[1], blurb: i[2], link: i[4] }]));
const humanize = (p) => p.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

// What one channel is for. purposes = the config purposes set on it. → { key, label, blurb, link, source: 'configured' | 'guess' | 'none' }
export function intentOf(ch, purposes = []) {
  for (const p of purposes) {
    const k = PURPOSE_TO_INTENT[p];
    if (k) return { ...intentByKey[k], source: 'configured', purpose: p };
  }
  if (purposes.length) { const p = purposes[0]; return { key: p, label: humanize(p), blurb: String(CHANNEL_PURPOSE_INFO[p] ?? '').split(':').slice(1).join(':').trim() || String(CHANNEL_PURPOSE_INFO[p] ?? ''), link: null, source: 'configured', purpose: p }; }
  const hay = `${ch.name ?? ''} ${ch.topic ?? ''}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-');
  const nameOnly = String(ch.name ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-');
  const hit = INTENTS.find((i) => i[3].test(nameOnly)) ?? INTENTS.find((i) => i[3].test(hay));
  return hit ? { ...intentByKey[hit[0]], source: 'guess' } : { key: 'other', label: 'Other', blurb: ch.topic ? clip(ch.topic, 90) : '', link: null, source: 'none' };
}

// ---------- who can see a channel ----------
// overwrites: [{ id, type: 0 role | 1 member, allow, deny }]. Returns { audience: 'public' | 'roles' | 'staff', roleIds: [] } for VIEW_CHANNEL.
export function audienceOf(ch, parent, guildId, staffRoleIds = []) {
  const ow = (ch.permission_overwrites?.length ? ch.permission_overwrites : parent?.permission_overwrites) ?? [];
  const every = ow.find((o) => o.id === guildId);
  if (!every || !(BigInt(every.deny ?? 0) & VIEW)) return { audience: 'public', roleIds: [] };
  const allowed = ow.filter((o) => o.type === 0 && o.id !== guildId && (BigInt(o.allow ?? 0) & VIEW)).map((o) => o.id);
  const staff = new Set(staffRoleIds);
  return allowed.length && allowed.every((r) => staff.has(r)) || !allowed.length ? { audience: 'staff', roleIds: allowed } : { audience: 'roles', roleIds: allowed };
}

// ---------- building the map from a guild's channels and roles ----------
export function buildMap({ guildId, channels, roles = [], purposeOf = new Map(), staffRoleIds = [], now = Date.now() }) {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const sections = channels.filter((c) => c.type === 4).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((c) => ({ id: c.id, name: c.name }));
  const list = channels.filter((c) => KINDS[c.type]).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((c) => {
    const parent = byId.get(c.parent_id), aud = audienceOf(c, parent, guildId, staffRoleIds), intent = intentOf(c, purposeOf.get(c.id) ?? []);
    return { id: c.id, name: c.name, kind: KINDS[c.type], section: parent?.id ?? null, topic: c.topic ? clip(c.topic, 120) : '', intent: intent.key, label: intent.label, blurb: intent.blurb, link: intent.link, source: intent.source,
      audience: aud.audience, roles: aud.roleIds.map((r) => roleName.get(r)).filter(Boolean).slice(0, 3), roleIds: aud.roleIds.slice(0, 8) };
  });
  return { at: now, guildId, sections: [...sections, ...(list.some((c) => !c.section) ? [{ id: null, name: 'Other channels' }] : [])], channels: list };
}

// What changed between two maps: new, removed, renamed, moved to another section, purpose or visibility changed.
export function diffMaps(oldMap, newMap) {
  if (!oldMap) return [];
  const o = new Map(oldMap.channels.map((c) => [c.id, c])), n = new Map(newMap.channels.map((c) => [c.id, c])), secName = (m, id) => m.sections.find((s) => s.id === id)?.name ?? 'Other channels';
  const out = [];
  for (const c of newMap.channels) {
    const p = o.get(c.id);
    if (!p) { out.push({ kind: 'new', id: c.id, name: c.name, detail: `${c.label} · ${secName(newMap, c.section)}` }); continue; }
    if (p.name !== c.name) out.push({ kind: 'renamed', id: c.id, name: c.name, detail: `was #${p.name}` });
    if (p.section !== c.section) out.push({ kind: 'moved', id: c.id, name: c.name, detail: `${secName(oldMap, p.section)} → ${secName(newMap, c.section)}` });
    if (p.intent !== c.intent) out.push({ kind: 'purpose', id: c.id, name: c.name, detail: `${p.label} → ${c.label}` });
    if (p.audience !== c.audience) out.push({ kind: 'access', id: c.id, name: c.name, detail: `${p.audience} → ${c.audience}` });
  }
  for (const c of oldMap.channels) if (!n.has(c.id)) out.push({ kind: 'removed', id: c.id, name: c.name, detail: c.label });
  return out;
}

// ---------- scan, store, rescan ----------
const metaGet = async (env, key) => { try { return JSON.parse(await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first('value')); } catch { return null; } };
const metaSet = (env, key, v) => env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(v)).run();
export const loadMap = (env) => (env.DB ? metaGet(env, MAP_KEY) : null);
export const loadChanges = async (env) => (env.DB ? (await metaGet(env, CHG_KEY)) ?? [] : []);

async function purposeMap(env) {
  const rows = (await env.DB.prepare('SELECT c.channel_id, c.purpose FROM discord_channels c JOIN discord_servers s ON s.id = c.server_id WHERE c.active = 1 AND s.active = 1').all().catch(() => ({ results: [] }))).results ?? [];
  const m = new Map();
  for (const r of rows) m.set(String(r.channel_id), [...(m.get(String(r.channel_id)) ?? []), r.purpose]);
  return m;
}
// → { map, changes }. Throws 'no-access' / 'not-set-up' for the caller to explain.
export async function scanServer(env, now = Date.now()) {
  const g = env.DISCORD_GUILD_ID;
  if (!g || !env.DISCORD_BOT_TOKEN) throw new Error('not-set-up');
  const [channels, roles] = await Promise.all([discord(env, 'GET', `/guilds/${g}/channels`), discord(env, 'GET', `/guilds/${g}/roles`)]);
  const staffRoleIds = [env.ADMIN_ROLE_ID, env.OWNER_ROLE_ID, ...(env.ORG_ROLES?.owner ?? []), ...(env.ORG_ROLES?.manager ?? [])].filter(Boolean);
  const map = buildMap({ guildId: g, channels, roles, purposeOf: await purposeMap(env), staffRoleIds, now });
  const old = await loadMap(env), changes = diffMaps(old, map);
  await metaSet(env, MAP_KEY, map);
  if (changes.length) await metaSet(env, CHG_KEY, [{ at: now, changes: changes.slice(0, 30), more: Math.max(0, changes.length - 30) }, ...(await loadChanges(env))].slice(0, 5));
  return { map, changes };
}
// The 10-minute cron: rescan when the stored map is old enough. → { scanned, changes }
export async function navCron(env, now = Date.now()) {
  if (!env.DB || !env.DISCORD_GUILD_ID || !env.DISCORD_BOT_TOKEN) return { scanned: false, changes: 0 };
  const old = await loadMap(env);
  if (old && now - old.at < SCAN_EVERY) return { scanned: false, changes: 0 };
  const r = await scanServer(env, now);
  return { scanned: true, changes: r.changes.length };
}

// ---------- the wiki: questions and answers built from the map and the command list ----------
// Public commands (no staff permission, not a context-menu one, not a help menu) with their short description.
const publicCommands = () => COMMANDS.filter((c) => !c.default_member_permissions && c.type !== 3 && !/help$/.test(c.name));
export function wikiEntries(map, viewer = { staff: false, roleIds: [] }) {
  const see = (c) => c.audience === 'public' || viewer.staff || (c.audience === 'roles' && viewer.roleIds.some((r) => c.roleIds?.includes(r)));
  const out = [];
  const byIntent = new Map();
  for (const c of map?.channels ?? []) if (see(c) && c.intent !== 'other') byIntent.set(c.intent, [...(byIntent.get(c.intent) ?? []), c]);
  for (const [key, chans] of byIntent) {
    const i = intentByKey[key] ?? { label: chans[0].label, blurb: chans[0].blurb, link: null };
    out.push({ q: `Where do I find ${i.label.toLowerCase()}?`, a: `${chans.slice(0, 3).map((c) => `<#${c.id}>`).join(', ')} – ${i.blurb}${i.link ? ` (site: ${i.link})` : ''}`, k: `${i.label} ${i.blurb} ${key}` });
  }
  for (const c of publicCommands()) {
    const app = Object.entries(APP_COMMANDS).find(([, l]) => l.includes(c.name))?.[0];
    out.push({ q: `What does /${c.name} do?`, a: `${c.description}${app && app !== 'core' ? ` (the Phoenix ${app[0].toUpperCase()}${app.slice(1)} bot)` : ''}`, k: `${c.name} ${c.description}` });
  }
  return out;
}
const words = (s) => new Set(String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
export function askWiki(entries, question, n = 3) {
  const qs = words(question);
  if (!qs.size) return [];
  return entries.map((e) => { const h = words(`${e.q} ${e.k}`); let s = 0; for (const w of qs) if (h.has(w)) s++; return { e, s }; }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.e);
}

// ---------- the panel ----------
const viewerOf = (i, who, env) => ({ staff: can(who, 'navigator.manage'), roleIds: i.member?.roles ?? [] });
const visible = (c, v) => c.audience === 'public' || v.staff || (c.audience === 'roles' && v.roleIds.length && c.roleIds?.some((r) => v.roleIds.includes(r)));
const tag = (c, v) => (v.staff && c.audience !== 'public' ? ` 🔒${c.audience === 'staff' ? ' staff' : ''}` : '');
const KIND_ICON = { text: '#', announcement: '📢', voice: '🔊', stage: '🎙️', forum: '💬', media: '🖼️' };
const select = (id, placeholder, options) => ({ type: 1, components: [{ type: 3, custom_id: id, placeholder, options: options.slice(0, 25) }] });
const NAV_BUTTONS = (v, view) => buttons([{ label: 'Home', id: 'norex:nav:home', emoji: '🧭' }, { label: 'Q&A', id: 'norex:nav:qa', emoji: '❓' }, v.staff && { label: 'What changed', id: 'norex:nav:chg', emoji: '🔄' }, v.staff && { label: 'Rescan now', id: 'norex:nav:scan', emoji: '📡' }].filter(Boolean));

function shell(env, map, v, { title, sub, body, rows = [] }) {
  return message({ accent: 'red', ephemeral: true, blocks: [
    cards(bannerUrl(env, 'navigator')),
    header({ eyebrow: `${orgName(env)} · Server navigator`, title, sub, size: 3 }),
    ...body, sep(), footer(map ? `Scanned <t:${Math.floor(map.at / 1000)}:R> · intent is configured or a guess from names; managers can set channels in the Organization config` : null),
    ...rows, NAV_BUTTONS(v),
  ] });
}
const secList = (map, v) => map.sections.map((s, k) => ({ s, k, chans: map.channels.filter((c) => c.section === s.id && visible(c, v)) })).filter((x) => x.chans.length);

export function homePanel(env, map, v) {
  const secs = secList(map, v), shown = map.channels.filter((c) => visible(c, v)).length;
  return shell(env, map, v, {
    title: 'Find your way around', sub: `${shown} channels in ${secs.length} sections`,
    body: [text(secs.map(({ s, chans }) => `**${clip(s.name, 40)}** · ${chans.length} channel${chans.length === 1 ? '' : 's'}`).join('\n') || 'No channels found.'), text('Pick a section to see what each channel is for, or ask a question under **Q&A** (or `/navigator question:`).')],
    rows: secs.length ? [select('norex:nav:sec', 'Open a section…', secs.map(({ s, k, chans }) => ({ label: clip(s.name, 90), value: String(k), description: `${chans.length} channel${chans.length === 1 ? '' : 's'}` })))] : [],
  });
}
export function sectionPanel(env, map, v, k) {
  const sec = map.sections[k], chans = sec ? map.channels.filter((c) => c.section === sec.id && visible(c, v)) : [];
  if (!sec || !chans.length) return homePanel(env, map, v);
  const lines = chans.slice(0, 18).map((c) => `${KIND_ICON[c.kind] ?? '#'} <#${c.id}> · **${c.label}**${c.source === 'guess' ? ' ~' : ''}${tag(c, v)}${c.blurb ? `\n-# ${clip(c.blurb, 90)}` : ''}`);
  return shell(env, map, v, {
    title: sec.name, sub: `${chans.length} channel${chans.length === 1 ? '' : 's'}${chans.some((c) => c.source === 'guess') ? ' · ~ = a guess from the name' : ''}`,
    body: [text(lines.join('\n') + (chans.length > 18 ? `\n+${chans.length - 18} more` : ''))],
    rows: [select('norex:nav:sec', 'Another section…', secList(map, v).map(({ s, k: kk, chans: cc }) => ({ label: clip(s.name, 90), value: String(kk), description: `${cc.length} channels`, default: kk === k })))],
  });
}
export function qaPanel(env, map, v, entries, { question = null, offset = 0 } = {}) {
  const hits = question ? askWiki(entries, question) : [];
  const page = entries.slice(offset, offset + 25);
  return shell(env, map, v, {
    title: question ? 'Your question' : 'Questions and answers', sub: question ? clip(question, 80) : `${entries.length} answers`,
    body: [text(question ? (hits.length ? hits.map((e) => `**${e.q}**\n${e.a}`).join('\n\n') : "I couldn't find that. Pick a question below, or ask a manager.") : 'Pick a question.')],
    rows: page.length ? [select('norex:nav:q', 'Pick a question…', page.map((e, k) => ({ label: clip(e.q, 90), value: String(offset + k) })))] : [],
  });
}
export const answerPanel = (env, map, v, entries, idx) => {
  const e = entries[idx];
  return e ? shell(env, map, v, { title: e.q, body: [text(e.a)], rows: [select('norex:nav:q', 'Another question…', entries.slice(0, 25).map((x, k) => ({ label: clip(x.q, 90), value: String(k), default: k === idx })))] }) : qaPanel(env, map, v, entries);
};
export function changesPanel(env, map, v, log) {
  const lines = log.flatMap((e) => [`**<t:${Math.floor(e.at / 1000)}:f>**`, ...e.changes.map((c) => `• ${c.kind} <#${c.id}> ${c.detail ? `– ${c.detail}` : ''}`.trim()), e.more ? `+${e.more} more` : null].filter(Boolean));
  return shell(env, map, v, { title: 'What changed', sub: 'Compared on each rescan', body: [text(lines.join('\n') || 'Nothing has changed since the first scan.')] });
}

// ---------- entry points ----------
const note = (title, body = '') => reply(notice(title, body));
const problem = (e) => (e.message === 'not-set-up' ? note('Not set up', 'The server (guild) or the bot token is missing on the Worker.') : e.message === 'no-access' ? note('I cannot see the server', 'Check the bot is in the server with View Channels.') : note('Scan failed', e.message));

async function ensureMap(env) {
  const map = await loadMap(env);
  if (map) return map;
  return (await scanServer(env)).map;
}
export async function navCommand(i, env, who) {
  if (!flagOn(env, who, 'navigator')) return note('Not switched on yet', 'The server navigator is being tested.');
  if (!env.DB) return note('The member database is not connected');
  try {
    const map = await ensureMap(env), v = viewerOf(i, who, env), q = (i.data?.options ?? []).find((o) => o.name === 'question')?.value;
    return reply(q ? qaPanel(env, map, v, wikiEntries(map, v), { question: String(q).slice(0, 200) }) : homePanel(env, map, v));
  } catch (e) { return problem(e); }
}
export async function navButton(i, env, who) {
  if (!flagOn(env, who, 'navigator')) return note('Not switched on yet');
  const [, , view] = String(i.data?.custom_id ?? '').split(':'), val = i.data?.values?.[0];
  try {
    let map = await ensureMap(env); const v = viewerOf(i, who, env);
    if (view === 'scan') {
      if (!v.staff) return note('Managers only');
      map = (await scanServer(env)).map;
      return { type: 7, data: homePanel(env, map, v) };
    }
    const entries = wikiEntries(map, v);
    const m = view === 'sec' ? sectionPanel(env, map, v, Number(val)) : view === 'qa' ? qaPanel(env, map, v, entries) : view === 'q' ? answerPanel(env, map, v, entries, Number(val)) : view === 'chg' ? (v.staff ? changesPanel(env, map, v, await loadChanges(env)) : homePanel(env, map, v)) : homePanel(env, map, v);
    return { type: 7, data: m };
  } catch (e) { return problem(e); }
}
