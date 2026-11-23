// THE staff tool manifest (PF-022 step 7, reshaped by the deck layout 2026-11-23). One list of every staff tool; the Control Center decks and tool cards, its search (Ctrl+K),
// the dock Manager and Admin lists and the link resolver all read it, so a tool is declared once (anti-duplication rule, PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md, Item 5).
// Build time: hub.mjs and next/build.mjs import this file. Browser: next/build.mjs emits it as staffmanifest.js (window.PFStaffManifest) for ccshell.js.
//
// The Control Center has NO sidebar (it did not fit the dock layout). Its top bar is a row of DECKS (SECTIONS) and, under it, the tools of the open deck; the Overview deck shows
// every deck as a card. Every manager control lives in a tool below and only there: the old staff-*.html pages are redirect stubs (legacy), and the manager parts of public pages
// (Rush leaderboard photos, season cards) moved into the Requests and uploads deck.
//
// Tool fields
//   id       unique key (also the Control Center route: staff-controlcenter.html?tool=<id>, the shell turns it into #<id>)
//   label    name shown everywhere        emoji  glyph (dock, cards)        icon  id of the symbol in the Control Center SVG sprite
//   desc     one line (tool card, search) section  the deck it sits in        level 'manager' | 'owner' (owner = managers never see it)
//   href     the address that opens the tool: always staff-controlcenter.html or staff-controlcenter.html?tool=<id>
//   module   how the shell mounts the tool in place (every tool has one):
//              'home' | 'org' (PFOrgPanel) | 'controlcenter:<panel>' (controlcenter.js) | 'br:<tab>' (boardroom.js, owner) | 'tl:<tab>' (tools.js)
//              'pg:<name>' (a moved page whose own script mounts itself: schedule, dugout, desk, content, insights, artwork; ccshell.js lazy-loads it)
//              'rq:<tab>' (ccrequests.js: emojis, media, board, season) | 'pp:<tab>' (ccpeople.js: absences, counselor, dj)
//   group    (optional) set on the quick-access tools the page navigator and edit gear list
//   keys     extra search words
//   legacy   (optional) old page addresses that now redirect to this tool: see LEGACY_PAGES / legacyTarget below

import { WHERE, FLAG_GROUPS } from './flagwhere.mjs';

/** the decks: [id, title, emoji, one line] (the Control Center top bar and the Overview cards; index 0 and 1 are what older code reads) */
export const SECTIONS = [
  ['overview', 'Overview', '🎛️', 'Club health, what is waiting for you and the latest changes'],
  ['match', 'Match nights', '🌙', 'Plan the squad and the pitch'],
  ['people', 'People', '👥', 'Everyone who needs a decision'],
  ['requests', 'Requests and uploads', '📥', 'Emoji, GIFs, highlights, Rush photos, season cards and card artwork'],
  ['content', 'Club content', '📄', 'What members read'],
  ['bot', 'Bot and Discord', '🤖', 'Commands, buttons, posts, jobs, DMs and the DJ'],
  ['site', 'Site', '🌐', 'Who sees what, the game rules and club insights'],
  ['org', 'Organization', '🏢', 'Discord servers, channels, roles and clubs'],
  ['system', 'System', '🛠️', 'Audit log, health, backup and the owner room'],
];
// the groups the page navigator and the edit gear list from (a tool with a `group` is a quick-access tool)
export const GROUPS = SECTIONS.map(([id, t, e, sub]) => [id, e, t, sub]);

const CC = 'staff-controlcenter.html';
export const TOOLS = [
  // ---- Overview
  { id: 'home', label: 'Dashboard', emoji: '🎛️', icon: 'i-grid', section: 'overview', level: 'manager', href: CC, module: 'home', legacy: ['staff.html'], keys: 'home health insights overview queue waiting',
    desc: 'Club health, insights, the approvals queue and recent changes in one view' },
  // ---- Match nights
  { id: 'schedule', label: 'Schedule', emoji: '🗓️', icon: 'i-cal', section: 'match', level: 'manager', group: 'match', href: CC + '?tool=schedule', module: 'pg:schedule', legacy: ['staff-schedule.html'], keys: 'match night fixtures check in session report',
    desc: 'Create, edit and cancel match nights, check in, send session reports' },
  { id: 'dugout', label: 'Dugout', emoji: '🧢', icon: 'i-pitch', section: 'match', level: 'manager', group: 'match', href: CC + '?tool=dugout', module: 'pg:dugout', legacy: ['staff-dugout.html'], keys: 'lineup formation pitch xi ready check',
    desc: 'Build the line-up on the real pitch and post it' },
  // ---- People
  { id: 'desk', label: 'Desk', emoji: '🗂️', icon: 'i-people', section: 'people', level: 'manager', group: 'people', href: CC + '?tool=desk', module: 'pg:desk', legacy: ['staff-desk.html'], keys: 'claims members requests rush trials notes warn mute',
    desc: 'Claims, members, requests, Rush results, trials and private notes' },
  { id: 'submissions', label: 'Submissions', emoji: '📥', icon: 'i-inbox', section: 'people', level: 'manager', group: 'people', href: CC + '?tool=submissions', module: 'tl:subm', legacy: ['staff-tools.html'], keys: 'feedback ratings award votes predictions suggestions builds csv',
    desc: 'Feedback, ratings, award votes, predictions, suggestions and builds, searchable, with CSV export' },
  { id: 'reports', label: 'Reports', emoji: '🚩', icon: 'i-flag', section: 'people', level: 'manager', group: 'people', href: CC + '?tool=reports', module: 'tl:reports', keys: 'reported content moderation posts messages feedback remove clear',
    desc: 'Reported posts, feedback and chat messages: clear or remove' },
  { id: 'absences', label: 'Absences', emoji: '🌴', icon: 'i-people', section: 'people', level: 'manager', href: CC + '?tool=absences', module: 'pp:absences', keys: 'absence away vacation play less notice acknowledge lineup reason',
    desc: 'Who is away or playing less, with the private reason; acknowledged on the Discord card' },
  { id: 'counselor', label: 'Counselor', emoji: '🧑‍⚕️', icon: 'i-chart', section: 'people', level: 'manager', href: CC + '?tool=counselor', module: 'pp:counselor', keys: 'server intelligence team mood tendencies anomaly flags check in',
    desc: 'How the team is doing and who to check in on: tendencies and flags from a weekly public-channel sample, numbers only' },
  // ---- Requests and uploads
  { id: 'emojis', label: 'Emoji and stickers', emoji: '😀', icon: 'i-image', section: 'requests', level: 'manager', group: 'requests', href: CC + '?tool=emojis', module: 'rq:emojis', keys: 'emoji sticker suggest approve reject review importer creator',
    desc: 'Emoji and sticker suggestions from members: look at each image, approve or reject; approved ones are kept for the server importer' },
  { id: 'media', label: 'GIFs and highlights', emoji: '🎞️', icon: 'i-image', section: 'requests', level: 'manager', group: 'requests', href: CC + '?tool=media', module: 'rq:media', keys: 'gif highlight clip video upload convert storage delete creator',
    desc: 'Every GIF and highlight clip members made with the bot: who, how big, how long, with removal' },
  { id: 'rushboard', label: 'Rush leaderboard', emoji: '🏁', icon: 'i-chart', section: 'requests', level: 'manager', group: 'requests', href: CC + '?tool=rushboard', module: 'rq:board', keys: 'rush leaderboard photo scan upload season clock vp ladder',
    desc: 'Photograph the global Rush leaderboard, check what was read, post it, take a photo down and set the season clock' },
  { id: 'seasoncards', label: 'Season stat cards', emoji: '🗃️', icon: 'i-doc', section: 'requests', level: 'manager', group: 'requests', href: CC + '?tool=seasoncards', module: 'rq:season', keys: 'season stats cards upload members vp grades flags missing',
    desc: 'The season stat photos members upload: who sent one, who has not, grades and flags, and taking one down' },
  { id: 'artwork', label: 'Card artwork', emoji: '🎨', icon: 'i-image', section: 'requests', level: 'manager', group: 'requests', href: CC + '?tool=artwork', module: 'pg:artwork', legacy: ['staff-artwork.html'], keys: 'cards player art approve revoke card studio photos',
    desc: 'Approve, inspect or revoke player card artwork and the Card Studio photo requests' },
  // ---- Club content
  { id: 'content', label: 'Content', emoji: '📄', icon: 'i-doc', section: 'content', level: 'manager', group: 'content', href: CC + '?tool=content', module: 'pg:content', legacy: ['staff-content.html'], keys: 'docs rules ideas squad week media storage',
    desc: 'Club docs and rules, ideas board, squad week, media storage' },
  { id: 'awards', label: 'Awards', emoji: '🏆', icon: 'i-trophy', section: 'content', level: 'manager', group: 'content', href: CC + '?tool=awards', module: 'tl:awards', keys: 'weekly awards categories close week channel',
    desc: 'Award categories, closing the week, where results post' },
  { id: 'announce', label: 'Announce', emoji: '📣', icon: 'i-megaphone', section: 'content', level: 'owner', owner: true, href: CC + '?tool=announce', module: 'br:announce', legacy: ['staff-announce.html'], keys: 'notify members managers acknowledge discord post doc',
    desc: 'Send a club-wide announcement, post a club doc to Discord' },
  { id: 'halloffame', label: 'Hall of Fame', emoji: '🏛️', icon: 'i-trophy', section: 'content', level: 'owner', owner: true, href: CC + '?tool=halloffame', module: 'br:hof', legacy: ['staff-halloffame.html'], keys: 'legends moments trophies induct',
    desc: 'Induct legends, add club moments, remove entries' },
  { id: 'medals', label: 'Medals', emoji: '🏅', icon: 'i-medal', section: 'content', level: 'owner', owner: true, href: CC + '?tool=medals', module: 'br:medals', legacy: ['staff-medals.html'], keys: 'badges award revoke collector',
    desc: 'Edit and award medals' },
  // ---- Bot and Discord
  { id: 'settings', label: 'Bot settings', emoji: '⚙️', icon: 'i-gear', section: 'bot', level: 'manager', href: CC + '?tool=settings', module: 'controlcenter:settings', keys: 'personalisation colour emoji routing routes rush queue welcome leave ping roles profanity streams recruitment match alert effects points',
    desc: 'Bot look, notification routing, Rush queue, welcome and leave, ping roles, profanity alerts, stream sources, recruitment, match alert, site effects, points' },
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
  { id: 'music', label: 'Music and DJ', emoji: '🎧', icon: 'i-music', section: 'bot', level: 'manager', href: CC + '?tool=music', module: 'pp:dj', keys: 'dj lavalink queue rooms bridge status',
    desc: 'The club DJ bots: online or offline, last push, open commands and the recent command log' },
  // ---- Site
  { id: 'access', label: 'Site access', emoji: '🎛️', icon: 'i-lock', section: 'site', level: 'manager', href: CC + '?tool=access', module: 'controlcenter:access', legacy: ['staff-switches.html'], keys: 'flags features levels who sees switches',
    desc: 'Who can see each section of the site, per level' },
  { id: 'gamedata', label: 'Game data', emoji: '🎮', icon: 'i-pad', section: 'site', level: 'manager', group: 'site', href: CC + '?tool=gamedata', module: 'tl:game', keys: 'level cap patch notes publish',
    desc: 'The game rules the site shows (level cap): publish a new version or dismiss a found change' },
  { id: 'insights', label: 'Insights', emoji: '🧭', icon: 'i-chart', section: 'site', level: 'manager', group: 'site', href: CC + '?tool=insights', module: 'pg:insights', legacy: ['staff-insights.html'], keys: 'club intelligence notes burner tracker',
    desc: 'Club Intelligence, written club notes, burner-club tracker' },
  // ---- Organization
  { id: 'org', label: 'Organization', emoji: '🏢', icon: 'i-org', section: 'org', level: 'owner', owner: true, href: CC + '?tool=org', module: 'org', legacy: ['staff-organization.html'], keys: 'discord servers channels roles clubs ids',
    desc: 'Discord servers, channels, roles and clubs' },
  // ---- System
  { id: 'audit', label: 'Audit log', emoji: '🛡️', icon: 'i-shield', section: 'system', level: 'manager', href: CC + '?tool=audit', module: 'controlcenter:audit', legacy: ['staff-audit.html'], keys: 'who changed what history',
    desc: 'Who changed what, newest first' },
  { id: 'health', label: 'Health', emoji: '🩺', icon: 'i-pulse', section: 'system', level: 'owner', owner: true, href: CC + '?tool=health', module: 'br:health', legacy: ['staff-health.html'], keys: 'site bot builds cloudflare analytics github actions recruitment',
    desc: 'Site, bot and build health, Cloudflare analytics, recruitment' },
  { id: 'backup', label: 'Backup', emoji: '💾', icon: 'i-save', section: 'system', level: 'owner', owner: true, href: CC + '?tool=backup', module: 'br:backup', legacy: ['staff-backup.html'], keys: 'export restore download json',
    desc: 'Export and restore switches, medal definitions and the Hall of Fame' },
  { id: 'boardroom', label: 'Boardroom', emoji: '👑', icon: 'i-crown', section: 'system', level: 'owner', group: 'system', owner: true, href: CC + '?tool=boardroom', module: 'br:tools', legacy: ['staff-boardroom.html'], keys: 'owner tools finder outside links discord cloudflare youtube twitch',
    desc: 'The owner room: find any tool or feature, links outside the site' },
];
// the Control Center itself (it opens the Overview); every tool is reached from its deck, the Overview cards and search
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

/** [emoji, title, sub, [[href, emoji, label, desc]]] groups for the dock Manager view and the Admin view: the Control Center itself, then one group per deck (manager tools only);
 *  ownerOnly = the owner's tools in one group, the Boardroom first */
export const hubGroups = (ownerOnly = false) => {
  const row = (x) => [x.href, x.emoji, x.label, x.desc];
  if (ownerOnly) { const own = TOOLS.filter((t) => t.owner).sort((a, b) => (b.id === 'boardroom') - (a.id === 'boardroom')); return [['👑', 'Owner controls', 'Only the owner changes these. The Boardroom holds the finder and the links outside the site.', own.map(row)]]; }
  return [['🎛️', CC_TILE.label, CC_TILE.desc, [row(CC_TILE)]], ...SECTIONS.filter(([id]) => id !== 'overview').map(([id, title, emoji, sub]) => [emoji, title, sub, TOOLS.filter((t) => t.section === id && !t.owner).map(row)]).filter((g) => g[3].length)];
};
/** dock lists: [title, [[href, emoji, label]]] */
export const dockGroups = (ownerOnly = false) => hubGroups(ownerOnly).map(([, t, , tools]) => [t, tools.map(([h, e, l]) => [h, e, l])]);

/** source text for dock.js: the two lists as literals in the dock's own format, so the dock reads the manifest and holds no copy */
export function dockLists() {
  const lit = (g) => '[' + g.map(([t, items]) => `[${JSON.stringify(t).replace(/^"|"$/g, "'")}, [${items.map(([h, e, l]) => `['${h}', '${e}', '${l}']`).join(', ')}]]`).join(',\n    ') + ']';
  return `const STAFF = ${lit(dockGroups(false))};\n  // The owner's group: the Boardroom first, then the owner-only tools; every one opens inside the Control Center.\n  const OWNER = ${lit(dockGroups(true))};`;
}

/** the browser copy: window.PFStaffManifest = { sections, tools } (ccshell.js: decks, tool cards, search, link resolver) */
export const manifestJs = () => `window.PFStaffManifest=${JSON.stringify({ sections: SECTIONS, tools: TOOLS, where: WHERE, flagGroups: FLAG_GROUPS, matrix: matrix(), legacy: LEGACY_PAGES, legacyHash: LEGACY_HASH })};\n`;

// ---------- old pages (PF-022 step 8) ----------
/** old page file -> the tool it became: derived from each tool's `legacy` list, so a redirect cannot exist without a tool */
export const LEGACY_PAGES = Object.fromEntries(TOOLS.flatMap((t) => (t.legacy || []).map((f) => [f, t.id])));
/** old in-page anchors: file -> { oldHash: toolId }. The Boardroom tabs and the Tools tabs were anchors of one page each ('' = no anchor). Every value is a tool id. */
export const LEGACY_HASH = {
  'staff-boardroom.html': { '': 'boardroom', tools: 'boardroom', switches: 'access', health: 'health', audit: 'audit', announce: 'announce', hof: 'halloffame', halloffame: 'halloffame', medals: 'medals', backup: 'backup', org: 'org', organization: 'org' },
  'staff-tools.html': { '': 'submissions', subm: 'submissions', submissions: 'submissions', reports: 'reports', game: 'gamedata', bot: 'settings', awards: 'awards' },
  // the old Insights page held three tools behind ?tool=: counselor, absences and emojis were links nobody drew (PF-024), the Control Center draws them now
  'staff-insights.html': { '': 'insights', counselor: 'counselor', absences: 'absences', emojis: 'emojis' },
};
/** the Control Center address for an old page and anchor ('staff-boardroom.html', 'switches' -> 'staff-controlcenter.html#access'), or null when that page was not retired */
export function legacyTarget(file, hash = '') {
  const f = String(file || '').replace(/^\//, ''), h = String(hash || '').replace(/^#/, '').split('?')[0];
  const id = (LEGACY_HASH[f] && LEGACY_HASH[f][h]) || LEGACY_PAGES[f] || (LEGACY_HASH[f] && LEGACY_HASH[f]['']);
  return id ? `${CC}#${id}` : null;
}
/** what a retired staff page needs in its head: a refresh to the Control Center view for the anchor (or ?tool=) the visitor came with (unknown anchors go to the page's own tool). The page itself
 *  is an ordinary site page (hub.mjs) saying where the tool moved, so it still reads right without scripts. */
export function redirectHead(file) {
  const to = legacyTarget(file, ''); if (!to) throw new Error(`${file} is not a retired staff page`);
  const map = Object.fromEntries(Object.entries(LEGACY_HASH[file] || {}).map(([k, id]) => [k, `${CC}#${id}`]));
  return `<meta http-equiv="refresh" content="0;url=${to}"><link rel="canonical" href="${to}"><meta name="robots" content="noindex">
<script>(function(){var m=${JSON.stringify(map)},d=${JSON.stringify(to)},h=location.hash.slice(1).split('?')[0],o=Object.prototype.hasOwnProperty;var q=new URLSearchParams(location.search).get('tool'),t=o.call(m,h)?m[h]:q&&o.call(m,q)?m[q]:d;location.replace(t)})()</script>`;
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
    if (t.module && !/^(home|org|controlcenter:\w+|br:\w+|tl:\w+|pg:\w+|rq:\w+|pp:\w+)$/.test(t.module)) out.push(`${t.id}: unknown module ${t.module}`);
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
