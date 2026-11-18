// THE staff tool manifest (PF-022 step 7). One list of every staff tool; the staff hub tiles, the dock Manager/Admin lists, the Control Center
// sidebar, its search (Ctrl+K) and the link resolver all read it, so a tool is declared once (anti-duplication rule, PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md, Item 5).
// Build time: hub.mjs and next/build.mjs import this file. Browser: next/build.mjs emits it as staffmanifest.js (window.PFStaffManifest) for ccshell.js.
//
// Tool fields
//   id       unique key (also the Control Center route: staff-controlcenter.html?tool=<id> for a module, the sidebar highlights it)
//   label    name shown everywhere        emoji  legacy glyph (dock, hub tiles)        icon  id of the symbol in the Control Center SVG sprite
//   desc     one line (hub tile, search)  section  sidebar section                      owner  true = owner only (managers never see it)
//   href     the page that opens the tool today. A module's href is staff-controlcenter.html?tool=<id> (the shell turns it into #<id>).
//   module   (optional) the Control Center mounts this tool in place: 'home' | 'controlcenter:<panel>' (next/static/controlcenter.js) | 'org' (PFOrgPanel)
//   group    (optional) the legacy hub/dock group id; tools without one are reached from the sidebar and search only (the hub tile for the whole Control Center covers them)
//   keys     extra search words
//   legacy   (optional) old page addresses that now redirect to this tool (PF-022 step 8): see LEGACY_PAGES / legacyTarget below
// Step 8 (done): the old staff-*.html pages redirect here, and ownerfab.js, navigator.js, gear.js, boardroom.js, dock.js read this file instead of keeping their own lists.
//   module kinds: 'home' | 'org' | 'controlcenter:<panel>' (controlcenter.js) | 'br:<tab>' (boardroom.js, owner) | 'tl:<tab>' (tools.js)

import { WHERE, FLAG_GROUPS } from './flagwhere.mjs';

export const SECTIONS = [
  ['inbox', 'Inbox'], ['match', 'Match nights'], ['people', 'People and moderation'], ['content', 'Club content'], ['bot', 'Bot'],
  ['music', 'Music and DJ'], ['site', 'Site'], ['org', 'Organization'], ['system', 'System'],
];

// the legacy hub/dock groups: [id, emoji, title, sub]
export const GROUPS = [
  ['match', '🌙', 'Match night', 'Plan the squad and the pitch'],
  ['people', '👥', 'People', 'Everyone who needs a decision'],
  ['content', '📄', 'Club content', 'What members read'],
  ['tools', '🛡️', 'Moderation and tools', 'Keep the club tidy'],
  ['health', '🩺', 'Club health', 'How the club is doing'],
  ['cc', '🎛️', 'Control Center', 'Switch, aim and restrict every output'],
  ['owner', '👑', 'Owner controls', 'Only the owner changes these. The Boardroom holds every owner tab.'],
];

const CC = 'staff-controlcenter.html';
export const TOOLS = [
  { id: 'home', label: 'Dashboard', emoji: '🎛️', icon: 'i-grid', section: 'inbox', level: 'manager', href: CC, module: 'home', keys: 'home health insights overview queue',
    desc: 'Club health, insights, the approvals queue and recent changes in one view' },
  { id: 'schedule', label: 'Schedule', emoji: '🗓️', icon: 'i-cal', section: 'match', level: 'manager', group: 'match', href: 'staff-schedule.html', keys: 'match night fixtures check in session report',
    desc: 'Create, edit and cancel match nights, check in, send session reports' },
  { id: 'dugout', label: 'Dugout', emoji: '🧢', icon: 'i-pitch', section: 'match', level: 'manager', group: 'match', href: 'staff-dugout.html', keys: 'lineup formation pitch xi',
    desc: 'Build the line-up on the real pitch and post it' },
  { id: 'desk', label: 'Desk', emoji: '🗂️', icon: 'i-people', section: 'people', level: 'manager', group: 'people', href: 'staff-desk.html', keys: 'claims members requests rush trials notes',
    desc: 'Claims, members, requests, Rush results, trials and private notes' },
  { id: 'submissions', label: 'Submissions', emoji: '📥', icon: 'i-inbox', section: 'people', level: 'manager', group: 'tools', href: CC + '?tool=submissions', module: 'tl:subm', legacy: ['staff-tools.html'], keys: 'feedback ratings award votes predictions suggestions builds csv',
    desc: 'Feedback, ratings, award votes, predictions, suggestions and builds, searchable, with CSV export' },
  { id: 'reports', label: 'Reports', emoji: '🚩', icon: 'i-flag', section: 'people', level: 'manager', group: 'tools', href: CC + '?tool=reports', module: 'tl:reports', keys: 'reported content moderation posts messages feedback remove clear',
    desc: 'Reported posts, feedback and chat messages: clear or remove' },
  { id: 'content', label: 'Content', emoji: '📄', icon: 'i-doc', section: 'content', level: 'manager', group: 'content', href: 'staff-content.html', keys: 'docs rules ideas squad week media',
    desc: 'Club docs and rules, ideas board, squad week, media storage' },
  { id: 'artwork', label: 'Artwork', emoji: '🎨', icon: 'i-image', section: 'content', level: 'manager', group: 'content', href: 'staff-artwork.html', keys: 'cards player art approve revoke',
    desc: 'Approve, inspect or revoke player card artwork' },
  { id: 'settings', label: 'Bot settings', emoji: '⚙️', icon: 'i-gear', section: 'bot', level: 'manager', href: CC + '?tool=settings', module: 'controlcenter:settings', keys: 'personalisation colour emoji routing routes rush queue welcome leave ping roles profanity streams recruitment match alert',
    desc: 'Bot look, notification routing, Rush queue, welcome and leave, ping roles, profanity alerts, stream sources, recruitment, match alert' },
  { id: 'command', label: 'Bot commands', emoji: '🤖', icon: 'i-bot', section: 'bot', level: 'manager', href: CC + '?tool=command', module: 'controlcenter:command', keys: 'slash commands who can use',
    desc: 'Every slash command: on or off, who can use it, where' },
  { id: 'component', label: 'Buttons and menus', emoji: '🔘', icon: 'i-button', section: 'bot', level: 'manager', href: CC + '?tool=component', module: 'controlcenter:component', keys: 'components select',
    desc: 'Every button and menu the bots show' },
  { id: 'automated', label: 'Automated posts', emoji: '📣', icon: 'i-post', section: 'bot', level: 'manager', href: CC + '?tool=automated', module: 'controlcenter:automated', keys: 'announcements channels cron',
    desc: 'Every post the bots make on their own, and which channels get it' },
  { id: 'scheduled', label: 'Scheduled jobs', emoji: '⏱️', icon: 'i-clock', section: 'bot', level: 'manager', href: CC + '?tool=scheduled', module: 'controlcenter:scheduled', keys: 'cron timers',
    desc: 'Timed jobs: on or off' },
  { id: 'dm', label: 'DMs and notifications', emoji: '🔔', icon: 'i-bell', section: 'bot', level: 'manager', href: CC + '?tool=dm', module: 'controlcenter:dm', keys: 'push direct messages methods windows',
    desc: 'Direct messages and notifications: who gets them, by which method, when' },
  { id: 'music', label: 'Music and DJ', emoji: '🎧', icon: 'i-music', section: 'music', level: 'manager', href: 'hub-music.html', keys: 'dj lavalink queue rooms',
    desc: 'The club DJ: rooms, the queue and the player' },
  { id: 'access', label: 'Site access', emoji: '🎛️', icon: 'i-lock', section: 'site', level: 'manager', href: CC + '?tool=access', module: 'controlcenter:access', legacy: ['staff-switches.html'], keys: 'flags features levels who sees',
    desc: 'Who can see each section of the site, per level' },
  { id: 'gamedata', label: 'Game data', emoji: '🎮', icon: 'i-pad', section: 'site', level: 'manager', group: 'tools', href: CC + '?tool=gamedata', module: 'tl:game', keys: 'level cap patch notes publish',
    desc: 'The game rules the site shows (level cap): publish a new version or dismiss a found change' },
  { id: 'awards', label: 'Awards', emoji: '🏆', icon: 'i-trophy', section: 'content', level: 'manager', group: 'tools', href: CC + '?tool=awards', module: 'tl:awards', keys: 'weekly awards categories close week channel',
    desc: 'Award categories, closing the week, where results post' },
  { id: 'insights', label: 'Insights', emoji: '🧭', icon: 'i-chart', section: 'site', level: 'manager', group: 'health', href: 'staff-insights.html', keys: 'club intelligence notes burner tracker',
    desc: 'Club Intelligence, written club notes, burner-club tracker' },
  { id: 'counselor', label: 'Counselor', emoji: '🧑‍⚕️', icon: 'i-chart', section: 'site', level: 'manager', href: 'staff-insights.html?tool=counselor', keys: 'server intelligence team mood tendencies anomaly flags',
    desc: 'How the team is doing and who to check in on: tendencies and flags from a weekly public-channel sample, numbers only' },
  { id: 'org', label: 'Organization', emoji: '🏢', icon: 'i-org', section: 'org', level: 'owner', owner: true, href: CC + '?tool=org', module: 'org', legacy: ['staff-organization.html'], keys: 'discord servers channels roles clubs',
    desc: 'Discord servers, channels, roles and clubs' },
  { id: 'audit', label: 'Audit log', emoji: '🛡️', icon: 'i-shield', section: 'system', level: 'manager', href: CC + '?tool=audit', module: 'controlcenter:audit', legacy: ['staff-audit.html'], keys: 'who changed what history',
    desc: 'Who changed what, newest first' },
  { id: 'health', label: 'Health', emoji: '🩺', icon: 'i-pulse', section: 'system', level: 'owner', owner: true, href: CC + '?tool=health', module: 'br:health', legacy: ['staff-health.html'], keys: 'site bot builds cloudflare analytics github actions recruitment',
    desc: 'Site, bot and build health, Cloudflare analytics, recruitment' },
  { id: 'announce', label: 'Announce', emoji: '📣', icon: 'i-megaphone', section: 'content', level: 'owner', owner: true, href: CC + '?tool=announce', module: 'br:announce', legacy: ['staff-announce.html'], keys: 'notify members managers acknowledge discord post doc',
    desc: 'Send a club-wide announcement, post a club doc to Discord' },
  { id: 'halloffame', label: 'Hall of Fame', emoji: '🏛️', icon: 'i-trophy', section: 'content', level: 'owner', owner: true, href: CC + '?tool=halloffame', module: 'br:hof', legacy: ['staff-halloffame.html'], keys: 'legends moments trophies induct',
    desc: 'Induct legends, add club moments, remove entries' },
  { id: 'medals', label: 'Medals', emoji: '🏅', icon: 'i-medal', section: 'content', level: 'owner', owner: true, href: CC + '?tool=medals', module: 'br:medals', legacy: ['staff-medals.html'], keys: 'badges award revoke collector',
    desc: 'Edit and award medals' },
  { id: 'backup', label: 'Backup', emoji: '💾', icon: 'i-save', section: 'system', level: 'owner', owner: true, href: CC + '?tool=backup', module: 'br:backup', legacy: ['staff-backup.html'], keys: 'export restore download json',
    desc: 'Export and restore switches, medal definitions and the Hall of Fame' },
  { id: 'boardroom', label: 'Boardroom', emoji: '👑', icon: 'i-crown', section: 'system', level: 'owner', group: 'owner', owner: true, href: CC + '?tool=boardroom', module: 'br:tools', legacy: ['staff-boardroom.html'], keys: 'owner tools finder outside links discord cloudflare youtube twitch',
    desc: 'The owner room: find any tool or feature, links outside the site' },
];
// the whole Control Center is one hub tile (it opens the dashboard); its module tools are reached from the sidebar and search
export const CC_TILE = { id: 'controlcenter', label: 'Control Center', emoji: '🎛️', group: 'cc', href: CC,
  desc: 'Every command, button, automated post, scheduled job, DM and site section: on or off, who gets it, which channels' };

// ---------- the permission matrix (PF-022 step 9) ----------
// One place decides who may use what. Roles for the Control Center are three: owner, manager, member (members and guests are "member": they use none of it).
// Choices made where the plan left them open (owner could not be asked): the owner sees every tool, a manager sees the tools whose level is 'manager', a member sees none.
// The site reads this through window.PFStaffManifest.matrix; the Worker (bot/ccpermissions.js) reads the same TOOLS, so hiding a tab is never the only protection.
export const CC_ROLES = ['owner', 'manager', 'member'];
export const LEVELS = ['manager', 'owner'];
/** the Control Center role for a site role ('guest'|'member'|'claimed' -> 'member'; anything unknown -> 'member'; signed out is null) */
export const ccRoleOf = (role) => (role == null ? null : role === 'owner' ? 'owner' : role === 'manager' ? 'manager' : 'member');
/** may this role use this tool (id or tool)? */
export function mayUse(role, tool) {
  const t = typeof tool === 'string' ? TOOLS.find((x) => x.id === tool) : tool, r = ccRoleOf(role);
  if (!t || !r) return false;
  return r === 'owner' || (r === 'manager' && t.level === 'manager');
}
/** the matrix: role -> the tool ids it may use */
export const matrix = () => Object.fromEntries(CC_ROLES.map((r) => [r, TOOLS.filter((t) => mayUse(r, t)).map((t) => t.id)]));

const legacy = (g) => (g === 'cc' ? [CC_TILE] : TOOLS.filter((t) => t.group === g));
/** [emoji, title, sub, [[href, emoji, label, desc]]] groups for the staff hub (managers) */
export const hubGroups = (ownerOnly = false) => GROUPS.filter(([id]) => (id === 'owner') === ownerOnly)
  .map(([id, e, t, sub]) => [e, t, sub, legacy(id).map((x) => [x.href, x.emoji, x.label, x.desc])]);
/** dock lists: [title, [[href, emoji, label]]] */
export const dockGroups = (ownerOnly = false) => hubGroups(ownerOnly).map(([, t, , tools]) => [t, tools.map(([h, e, l]) => [h, e, l])]);

/** source text for dock.js: the two lists as literals in the dock's own format, so the dock reads the manifest and holds no copy */
export function dockLists() {
  const lit = (g) => '[' + g.map(([t, items]) => `[${JSON.stringify(t).replace(/^"|"$/g, "'")}, [${items.map(([h, e, l]) => `['${h}', '${e}', '${l}']`).join(', ')}]]`).join(',\n    ') + ']';
  return `const STAFF = ${lit(dockGroups(false))};\n  // One Boardroom tile: its tools (health, announce, hall of fame, medals, backup) are Control Center views; Switches, Audit and Organization are the Control Center's own panels.\n  const OWNER = ${lit(dockGroups(true))};`;
}

/** the browser copy: window.PFStaffManifest = { sections, tools } (ccshell.js: sidebar, search, link resolver) */
export const manifestJs = () => `window.PFStaffManifest=${JSON.stringify({ sections: SECTIONS, tools: TOOLS, where: WHERE, flagGroups: FLAG_GROUPS, matrix: matrix(), legacy: LEGACY_PAGES, legacyHash: LEGACY_HASH })};\n`;

// ---------- old pages (PF-022 step 8) ----------
/** old page file -> the tool it became: derived from each tool's `legacy` list, so a redirect cannot exist without a tool */
export const LEGACY_PAGES = Object.fromEntries(TOOLS.flatMap((t) => (t.legacy || []).map((f) => [f, t.id])));
/** old in-page anchors: file -> { oldHash: toolId }. The Boardroom tabs and the Tools tabs were anchors of one page each ('' = no anchor). Every value is a tool id. */
export const LEGACY_HASH = {
  'staff-boardroom.html': { '': 'boardroom', tools: 'boardroom', switches: 'access', health: 'health', audit: 'audit', announce: 'announce', hof: 'halloffame', halloffame: 'halloffame', medals: 'medals', backup: 'backup', org: 'org', organization: 'org' },
  'staff-tools.html': { '': 'submissions', subm: 'submissions', submissions: 'submissions', reports: 'reports', game: 'gamedata', bot: 'settings', awards: 'awards' },
};
/** the Control Center address for an old page and anchor ('staff-boardroom.html', 'switches' -> 'staff-controlcenter.html#access'), or null when that page was not retired */
export function legacyTarget(file, hash = '') {
  const f = String(file || '').replace(/^\//, ''), h = String(hash || '').replace(/^#/, '').split('?')[0];
  const id = (LEGACY_HASH[f] && LEGACY_HASH[f][h]) || LEGACY_PAGES[f] || (LEGACY_HASH[f] && LEGACY_HASH[f]['']);
  return id ? `${CC}#${id}` : null;
}
/** what a retired staff page needs in its head: a refresh to the Control Center view for the anchor the visitor came with (query and unknown anchors kept). The page itself
 *  is an ordinary site page (hub.mjs) saying where the tool moved, so it still reads right without scripts. */
export function redirectHead(file) {
  const to = legacyTarget(file, ''); if (!to) throw new Error(`${file} is not a retired staff page`);
  const map = Object.fromEntries(Object.entries(LEGACY_HASH[file] || {}).map(([k, id]) => [k, `${CC}#${id}`]));
  return `<meta http-equiv="refresh" content="0;url=${to}"><link rel="canonical" href="${to}"><meta name="robots" content="noindex">
<script>(function(){var m=${JSON.stringify(map)},d=${JSON.stringify(to)},h=location.hash.slice(1).split('?')[0],o=Object.prototype.hasOwnProperty;location.replace(o.call(m,h)?m[h]:d)})()</script>`;
}

/** the slim browser copy every page loads for the staff floating tools (owner button, navigator, edit gear): just enough to name and link each tool.
 *  The full copy above (descriptions, keywords, modules, where, legacy) is only the Control Center's. */
export const navJs = () => `window.PFStaffNav=${JSON.stringify({ tools: TOOLS.map((t) => ({ id: t.id, label: t.label, emoji: t.emoji, href: t.href, ...(t.group ? { group: t.group } : {}) })) })};\n`;

/** the link resolver: 'desk' | 'staff-desk.html' | 'staff-controlcenter.html#audit' -> the tool, or null */
export const resolve = (ref) => {
  const r = String(ref || '').replace(/^\//, ''), [file, hash = ''] = r.split('#');
  const direct = TOOLS.find((t) => t.id === r || t.href === r) || (r === CC ? TOOLS[0] : null);
  if (direct) return direct;
  if (file === CC && hash) return TOOLS.find((t) => t.id === hash.split('?')[0]) || null; // staff-controlcenter.html#audit
  const lt = legacyTarget(file, hash); return lt ? TOOLS.find((t) => t.id === lt.split('#')[1]) : null; // an old page or anchor
};

/** problems with the manifest (empty = fine): duplicates and entries with no target; tests call this */
export function problems() {
  const out = [], ids = new Set(), hrefs = new Set(), labels = new Set(), secs = new Set(SECTIONS.map(([k]) => k)), groups = new Set(GROUPS.map(([k]) => k));
  for (const t of TOOLS) {
    for (const k of ['id', 'label', 'emoji', 'icon', 'desc', 'section']) if (!t[k]) out.push(`${t.id || '?'}: missing ${k}`);
    if (!t.href && !t.module) out.push(`${t.id}: no target (href or module)`);
    if (t.module && !/^(home|org|controlcenter:\w+|br:\w+|tl:\w+)$/.test(t.module)) out.push(`${t.id}: unknown module ${t.module}`);
    if (ids.has(t.id)) out.push(`${t.id}: duplicate id`); ids.add(t.id);
    if (t.href) { if (hrefs.has(t.href)) out.push(`${t.href}: duplicate href`); hrefs.add(t.href); }
    if (!secs.has(t.section)) out.push(`${t.id}: unknown section ${t.section}`);
    const nm = String(t.label || '').toLowerCase(); if (nm) { if (labels.has(nm)) out.push(`${t.label}: the same tool is listed twice (duplicate label)`); labels.add(nm); }
    if (!LEVELS.includes(t.level)) out.push(`${t.id}: missing or unknown permission level`);
    if ((t.level === 'owner') !== !!t.owner) out.push(`${t.id}: level and owner flag disagree`);
    if (t.group && !groups.has(t.group)) out.push(`${t.id}: unknown group ${t.group}`);
  }
  for (const [f, id] of Object.entries(LEGACY_PAGES)) if (!ids.has(id) || TOOLS.some((t) => t.href === f)) out.push(`${f}: legacy page must point at a tool and no longer be a tool address`);
  for (const [f, m] of Object.entries(LEGACY_HASH)) for (const [h, id] of Object.entries(m)) if (!ids.has(id)) out.push(`${f}#${h}: unknown tool ${id}`);
  for (const [k, v] of Object.entries(WHERE)) if (!Array.isArray(v) || !v[0] || (v[2] && !ids.has(v[2]))) out.push(`where ${k}: bad entry`);
  if (hrefs.has(CC_TILE.href) === false) out.push('home has no Control Center href');
  return out;
}
