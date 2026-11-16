// Control Center settings (PF-022a, PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md section 5, steps 1, 2, 4, 6).
// One place for every bot setting that used to have its own page, command or config file edit:
//   GET  /api/controlcenter/settings                 managers+: every area below (owner-only ones say so), plus the owner/manager split
//   POST /api/controlcenter/settings/<area>          the level of that area (SPLIT): saves through the same validators as the old route
//   POST /api/controlcenter/settings/fold-legacy     managers+: copy the old channel / ping-role homes into the Organization config
//   GET  /api/controlcenter/audit                    managers+: ONE feed across config_audit, activity and role history
// Every write is recorded in config_audit (entity cc:<area>) with before/after. Channels and roles written here also land in the Organization
// config (purposes and ping_* groups), so the website and Discord commands read the same rows. Nothing here hardcodes a channel or role.
import { getBotSettings, applyBotSettings, settingsKey } from './settings.js';
import { loadRules, cleanRules, saveRules, ACTIONS, GROUPS, METHODS as ROUTE_METHODS } from './routing.js';
import { getSettings as getRushSettings, settingsOf as rushSettingsOf, saveSettings as saveRushSettings } from './rushqueue.js';
import { getToolSettings, saveToolSettings } from './servertools.js';
import { parseLink, MAX_SOURCES } from './streamalerts.js';
import { mirrorChannel, setPingRole, foldLegacy, channelFor, PING_GROUPS, CHANNEL_PURPOSE_INFO } from './orgconfig.js';
import { can } from './roles.js';
import { sharedKey } from './sharedkey.js';

const all = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).all().then((r) => r.results);
const one = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();
const ID = /^\d{5,25}$/;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

// The owner/manager split (settled here, one place). Owner keeps what changes the club's identity and the people who run it; managers run everything else.
//   owner:   `bot` (embed colour, emoji, which auto-posts run), feature flags and the Organization structure (clubs, servers, role mapping: bot/orgconfig.js, flags in controlcenter.js)
//   manager: notification routes, Rush queue timers, welcome / leave / ping roles, profanity alert channel, stream sources, recruitment, match alert, stream links, legacy fold-in
export const SPLIT = {
  owner: ['bot'],
  manager: ['routes', 'rush', 'tools', 'profanity', 'stream_sources', 'recruitment', 'matchAlert', 'streams'],
};
// The slash commands that change the same thing (shown beside the setting; both write the same rows).
export const VIA = {
  bot: [], routes: [], rush: ['/queue settings'], tools: ['/setup leavelog', '/setup welcome', '/setup pingroles'], profanity: ['/profanitysetup'],
  stream_sources: ['/streamalerts'], recruitment: [], matchAlert: [], streams: [],
};
export const areaLevel = (area) => (SPLIT.owner.includes(area) ? 'owner' : SPLIT.manager.includes(area) ? 'manager' : null);
const mayWrite = (me, area) => (areaLevel(area) === 'owner' ? can(me, 'settings.bot') : areaLevel(area) === 'manager' ? can(me, 'controlcenter.manage') : false);

// ---------- config-only items (step 4): D1 rows, config.json values are the first-run defaults ----------
export const CC_DEFAULTS = {
  recruitment: { open: true, headline: 'Trials are by application only', requirements: ['Active on PS5 / Xbox Series / PC (new gen)', 'Available for regular league nights', 'Mic and Discord for match comms', 'Competitive attitude – we play to win'], positions: ['GK', 'CB', 'CDM', 'CM', 'CAM', 'ST'] },
  matchAlert: { loseBy: 3 },
  streams: { youtube: '', twitch: 'https://m.twitch.tv/phoenixfirefc/home' },
};
// The saved row only (null when the owner has not applied migration 0065 or nothing was saved): lets a caller fall back to its own source (config.json) before the default.
export async function ccStored(env, key) {
  const row = env?.DB ? await one(env, 'SELECT value FROM cc_config WHERE key = ?', key).catch(() => null) : null;
  return parse(row?.value);
}
export async function ccConfig(env, key) { return { ...CC_DEFAULTS[key], ...((await ccStored(env, key)) ?? {}) }; }

// Keyed like /api/org/match-alert (X-Phoenix-Key): the site build and the result import run in GitHub Actions without D1 and ask the Worker.
//   GET /api/org/cc-config  →  { recruitment, matchAlert, streams }
export async function ccConfigPublicRoute(request, env) {
  const reply = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  if (!env.DISCORD_CLIENT_SECRET || sharedKey(request) !== await settingsKey(env.DISCORD_CLIENT_SECRET)) return reply({ error: 'Forbidden' }, 403);
  return reply(Object.fromEntries(await Promise.all(Object.keys(CC_DEFAULTS).map(async (k) => [k, await ccConfig(env, k)]))));
}
const list = (v, n, len, re) => (Array.isArray(v) ? v : []).map((x) => clean(x, len)).filter((x) => x && (!re || re.test(x))).slice(0, n);
const CLEAN = {
  recruitment: (b, cur) => ({ open: b.open === undefined ? cur.open : !!b.open, headline: clean(b.headline ?? cur.headline, 120), requirements: b.requirements === undefined ? cur.requirements : list(b.requirements, 10, 120), positions: b.positions === undefined ? cur.positions : list(b.positions, 12, 4, /^[A-Z]{1,4}$/) }),
  matchAlert: (b, cur) => {
    const n = b.loseBy === undefined ? cur.loseBy : b.loseBy === null || b.loseBy === '' ? 0 : Number(b.loseBy);
    if (!Number.isInteger(n) || n < 0 || n > 20) return { error: 'The margin is a whole number of goals from 0 (never) to 20.' };
    return { loseBy: n };
  },
  streams: (b, cur) => {
    const tw = b.twitch === undefined ? cur.twitch : clean(b.twitch, 200), yt = b.youtube === undefined ? cur.youtube : clean(b.youtube, 200);
    if (tw && !/^https:\/\/(www\.|m\.)?twitch\.tv\/[A-Za-z0-9_]{3,25}(\/.*)?$/.test(tw)) return { error: 'The Twitch link must look like https://www.twitch.tv/yourchannel.' };
    if (yt && !/^https:\/\/(www\.|m\.)?youtube\.com\/(@[A-Za-z0-9._-]{3,30}|channel\/UC[A-Za-z0-9_-]{22})/.test(yt)) return { error: 'The YouTube link must be a channel link (@handle or /channel/UC…).' };
    return { twitch: tw, youtube: yt };
  },
};

// ---------- audit ----------
export async function auditSetting(env, me, area, before, after, action = 'update') {
  await run(env, 'INSERT INTO config_audit (at, user_id, name, entity, entity_id, action, before, after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    Date.now(), String(me?.u ?? ''), me?.n ?? '', `cc:${area}`, null, action, JSON.stringify(before ?? null), JSON.stringify(after ?? null));
}

// ---------- areas ----------
const toolsView = (st) => ({ welcomeText: st.welcomeText ?? '', leaveChannel: st.leaveChannel ?? '', welcomeChannel: st.welcomeChannel ?? '', pingRoles: st.pingRoles ?? {} });
export const AREAS = {
  bot: {
    label: 'Bot personalisation', summary: 'Embed colour, emoji, which auto-posts run, the legacy result/reminder channel and ping role',
    get: (env) => getBotSettings(env),
    async save(env, b) {
      const r = await applyBotSettings(env, b);
      if (r.error) return r;
      // keep the Organization config in step (explicit: the manager just chose it)
      if (b.resultChannel !== undefined) await mirrorChannel(env, 'match_results', r.saved.resultChannel, { explicit: true });
      if (b.reminderChannel !== undefined) await mirrorChannel(env, 'reminders', r.saved.reminderChannel, { explicit: true });
      if (b.pingRole !== undefined) { await setPingRole(env, 'ping_results', r.saved.pingRole); await setPingRole(env, 'ping_events', r.saved.pingRole); }
      return { before: r.before, after: r.saved };
    },
  },
  routes: {
    label: 'Notification routes', summary: 'When X happens, tell Y this way (the one routing table)',
    get: async (env) => ({ rules: await loadRules(env), actions: ACTIONS, groups: GROUPS, methods: ROUTE_METHODS }),
    async save(env, b) {
      const c = cleanRules(b.rules);
      if (c.error) return c;
      const before = await loadRules(env);
      await saveRules(env, c.rules);
      return { before, after: c.rules };
    },
  },
  rush: {
    label: 'Rush queue settings', summary: 'Queue timers, failed-match policy, idle close, join limit',
    get: (env) => getRushSettings(env),
    async save(env, b) {
      const before = await getRushSettings(env), after = rushSettingsOf({ ...before, ...b });
      await saveRushSettings(env, after);
      return { before, after };
    },
  },
  tools: {
    label: 'Server tools', summary: 'Welcome text, welcome and leave channels, opt-in ping roles',
    get: async (env) => ({ ...toolsView(await getToolSettings(env)), pingGroups: PING_GROUPS }),
    async save(env, b) {
      const cur = await getToolSettings(env), before = toolsView(cur), next = { ...cur };
      for (const k of ['leaveChannel', 'welcomeChannel']) if (b[k] !== undefined) { const v = String(b[k] ?? '').trim(); if (v && !ID.test(v)) return { error: 'Channel IDs are plain Discord IDs.' }; next[k] = v; }
      if (b.welcomeText !== undefined) next.welcomeText = String(b.welcomeText ?? '').slice(0, 1000);
      if (b.pingRoles && typeof b.pingRoles === 'object') {
        next.pingRoles = { ...cur.pingRoles };
        for (const [k, v] of Object.entries(b.pingRoles)) { const r = String(v ?? '').trim(); if (r && !ID.test(r)) return { error: 'Role IDs are plain Discord IDs.' }; if (/^\w{1,20}$/.test(k)) next.pingRoles[k] = r; }
      }
      await saveToolSettings(env, next);
      if (b.leaveChannel !== undefined) await mirrorChannel(env, 'member_log', next.leaveChannel, { explicit: true });
      if (b.welcomeChannel !== undefined) await mirrorChannel(env, 'welcome', next.welcomeChannel, { explicit: true });
      for (const [k, g] of [['rush', 'ping_rush'], ['match', 'ping_match']]) if (b.pingRoles && k in b.pingRoles) await setPingRole(env, g, next.pingRoles[k]);
      return { before, after: toolsView(next) };
    },
  },
  profanity: {
    label: 'Profanity alerts', summary: 'Where AutoMod alerts go (the AutoMod rule itself is created by /profanitysetup)',
    get: async (env) => { const cfg = parse((await one(env, "SELECT value FROM meta WHERE key = 'profanity_config'").catch(() => null))?.value) ?? {}; return { channelId: (await channelFor(env, 'automod_alerts')) || cfg.channelId || '', ruleId: cfg.ruleId ?? null }; },
    async save(env, b) {
      const channelId = String(b.channelId ?? '').trim();
      if (channelId && !ID.test(channelId)) return { error: 'Channel IDs are plain Discord IDs.' };
      const cfg = parse((await one(env, "SELECT value FROM meta WHERE key = 'profanity_config'").catch(() => null))?.value) ?? {};
      await run(env, "INSERT INTO meta (key, value) VALUES ('profanity_config', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", JSON.stringify({ ...cfg, channelId, ...(channelId !== cfg.channelId ? { lastMessageId: null } : {}) }));
      await mirrorChannel(env, 'automod_alerts', channelId, { explicit: true });
      return { before: { channelId: cfg.channelId ?? '' }, after: { channelId } };
    },
  },
  stream_sources: {
    label: 'Stream alert sources', summary: 'Twitch, YouTube and Kick channels the bot announces (same rows as /streamalerts)',
    get: (env) => all(env, 'SELECT id, scope, platform, handle, url, label, user_id, channel_id, want_live, want_posts, live, active FROM stream_sources WHERE active = 1 ORDER BY scope, label').catch(() => []),
    async save(env, b, me) {
      if (b.action === 'remove') {
        const row = await one(env, 'SELECT id, label FROM stream_sources WHERE id = ? AND active = 1', Number(b.id) || 0);
        if (!row) return { error: 'No such source.', status: 404 };
        await run(env, 'UPDATE stream_sources SET active = 0 WHERE id = ?', row.id);
        return { before: row, after: { removed: row.id } };
      }
      const link = parseLink(b.link);
      if (!link) return { error: 'Paste a Twitch, YouTube (@handle or /channel/UC…) or Kick channel link.' };
      const channel = ID.test(String(b.channel ?? '')) ? String(b.channel) : await channelFor(env, 'live_alerts');
      if (!ID.test(String(channel))) return { error: `No channel is set for live alerts. ${CHANNEL_PURPOSE_INFO.live_alerts}: add one in the Organization config, or pick a channel here.` };
      if ((await one(env, 'SELECT COUNT(*) AS n FROM stream_sources WHERE active = 1'))?.n >= MAX_SOURCES) return { error: `That is ${MAX_SOURCES} sources. Remove one first.` };
      const what = ['live', 'posts'].includes(b.what) ? b.what : 'both';
      const wantLive = what !== 'posts' ? 1 : 0, wantPosts = what !== 'live' && link.platform === 'youtube' ? 1 : 0;
      if (!wantLive && !wantPosts) return { error: 'Posts are YouTube only for now. Pick Live, or a YouTube link.' };
      const label = clean(b.name, 40) || link.handle.replace(/^@|^channel\//, '');
      await run(env, `INSERT INTO stream_sources (scope, platform, handle, url, label, user_id, channel_id, want_live, want_posts, added_by, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (platform, handle, channel_id) DO UPDATE SET scope = excluded.scope, label = excluded.label, want_live = excluded.want_live, want_posts = excluded.want_posts, active = 1`,
        b.source === 'contributor' ? 'contributor' : 'main', link.platform, link.handle, link.url, label, ID.test(String(b.member ?? '')) ? String(b.member) : null, channel, wantLive, wantPosts, String(me?.u ?? ''), Date.now());
      return { before: null, after: { platform: link.platform, handle: link.handle, label, channel, live: !!wantLive, posts: !!wantPosts } };
    },
  },
  ...Object.fromEntries(['recruitment', 'matchAlert', 'streams'].map((key) => [key, {
    label: { recruitment: 'Recruitment', matchAlert: 'Match alert trigger', streams: 'Club stream links' }[key],
    summary: { recruitment: 'Trials open or closed, headline, requirements, positions', matchAlert: 'Heavy-defeat margin that triggers the match alert (0 = never)', streams: 'The club Twitch and YouTube links shown on the site' }[key],
    get: (env) => ccConfig(env, key),
    async save(env, b, me) {
      const cur = await ccConfig(env, key), next = CLEAN[key](b, cur);
      if (next.error) return next;
      try {
        await run(env, `INSERT INTO cc_config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`, key, JSON.stringify(next), Date.now(), String(me?.u ?? ''));
      } catch { return { error: 'The cc_config table is not there yet: the owner has to apply migration 0065 first.', status: 503 }; }
      return { before: cur, after: next };
    },
  }])),
};

export async function settingsOverview(env, me) {
  const out = { split: SPLIT, areas: {} };
  for (const [area, a] of Object.entries(AREAS)) out.areas[area] = { label: a.label, summary: a.summary, level: areaLevel(area), canWrite: mayWrite(me, area), value: await a.get(env).catch(() => null) };
  return out;
}

// → { status, body }. `fold-legacy` is the step-2 one-shot.
export async function saveArea(env, me, area, body = {}) {
  if (area === 'fold-legacy') {
    if (!can(me, 'controlcenter.manage')) return { status: 403, body: { error: 'Managers and the owner only.' } };
    const report = await foldLegacy(env, me);
    await auditSetting(env, me, 'fold-legacy', null, report, 'fold');
    return { status: 200, body: report };
  }
  const a = AREAS[area];
  if (!a) return { status: 404, body: { error: 'Not found' } };
  if (!mayWrite(me, area)) return { status: 403, body: { error: areaLevel(area) === 'owner' ? 'Owner only.' : 'Managers and the owner only.' } };
  const r = await a.save(env, body ?? {}, me);
  if (r.error) return { status: r.status ?? 400, body: { error: r.error } };
  if (!same(r.before, r.after)) await auditSetting(env, me, area, r.before, r.after);
  return { status: 200, body: { area, value: await a.get(env), unchanged: same(r.before, r.after) } };
}

// ---------- step 6: one audit read ----------
// Merges config_audit (Control Center, Organization, settings), activity (what members and staff did) and role history into one newest-first feed.
// opts: { limit (default 100, max 300), before (an `at` timestamp: page back), source: config|activity|roles|all, q (text) }.
export async function auditFeed(env, { limit = 100, before = null, source = 'all', q = '' } = {}) {
  limit = Math.min(300, Math.max(1, Number(limit) || 100));
  const b = Number(before) > 0 ? Number(before) : Number.MAX_SAFE_INTEGER, want = (s) => source === 'all' || source === s;
  const rows = [];
  if (want('config')) for (const r of await all(env, 'SELECT id, at, user_id, name, entity, action, before, after FROM config_audit WHERE at < ? ORDER BY at DESC, id DESC LIMIT ?', b, limit).catch(() => []))
    rows.push({ source: 'config', id: `c${r.id}`, at: r.at, who: r.name || r.user_id, whoId: r.user_id, what: `${r.entity} · ${r.action}`, entity: r.entity, before: parse(r.before), after: parse(r.after) });
  if (want('activity')) for (const r of await all(env, 'SELECT id, at, user_id, name, type, detail FROM activity WHERE at < ? ORDER BY at DESC, id DESC LIMIT ?', b, limit).catch(() => []))
    rows.push({ source: 'activity', id: `a${r.id}`, at: r.at, who: r.name || r.user_id || '', whoId: r.user_id ?? '', what: r.type, entity: r.type, detail: r.detail ?? '' });
  if (want('roles')) for (const r of await all(env, 'SELECT h.id, h.at, h.user_id, h.from_role, h.to_role, u.name FROM role_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.at < ? ORDER BY h.at DESC, h.id DESC LIMIT ?', b, limit).catch(() => []))
    rows.push({ source: 'roles', id: `r${r.id}`, at: r.at, who: r.name || r.user_id, whoId: r.user_id, what: `role ${r.from_role || 'none'} → ${r.to_role}`, entity: 'role_history' });
  const needle = String(q ?? '').toLowerCase().trim();
  const hit = needle ? rows.filter((r) => `${r.who} ${r.what} ${r.detail ?? ''} ${JSON.stringify(r.after ?? '')}`.toLowerCase().includes(needle)) : rows;
  hit.sort((x, y) => y.at - x.at);
  const page = hit.slice(0, limit);
  return { items: page, next: page.length === limit ? page[page.length - 1].at : null, sources: ['config', 'activity', 'roles'] };
}
