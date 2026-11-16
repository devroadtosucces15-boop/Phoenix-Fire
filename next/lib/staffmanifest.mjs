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
// Step 8 redirects the old staff-*.html pages to the Control Center and drops the remaining hand copies (ownerfab.js, navigator.js, gear.js, boardroom.js).

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
  { id: 'home', label: 'Dashboard', emoji: '🎛️', icon: 'i-grid', section: 'inbox', href: CC, module: 'home', keys: 'home health insights overview queue',
    desc: 'Club health, insights, the approvals queue and recent changes in one view' },
  { id: 'schedule', label: 'Schedule', emoji: '🗓️', icon: 'i-cal', section: 'match', group: 'match', href: 'staff-schedule.html', keys: 'match night fixtures check in session report',
    desc: 'Create, edit and cancel match nights, check in, send session reports' },
  { id: 'dugout', label: 'Dugout', emoji: '🧢', icon: 'i-pitch', section: 'match', group: 'match', href: 'staff-dugout.html', keys: 'lineup formation pitch xi',
    desc: 'Build the line-up on the real pitch and post it' },
  { id: 'desk', label: 'Desk', emoji: '🗂️', icon: 'i-people', section: 'people', group: 'people', href: 'staff-desk.html', keys: 'claims members requests rush trials notes',
    desc: 'Claims, members, requests, Rush results, trials and private notes' },
  { id: 'tools', label: 'Tools', emoji: '🛠️', icon: 'i-wrench', section: 'people', group: 'tools', href: 'staff-tools.html', keys: 'submissions reports moderation awards game data',
    desc: 'Submissions, reported content, game data, bot settings, awards' },
  { id: 'content', label: 'Content', emoji: '📄', icon: 'i-doc', section: 'content', group: 'content', href: 'staff-content.html', keys: 'docs rules ideas squad week media',
    desc: 'Club docs and rules, ideas board, squad week, media storage' },
  { id: 'artwork', label: 'Artwork', emoji: '🎨', icon: 'i-image', section: 'content', group: 'content', href: 'staff-artwork.html', keys: 'cards player art approve revoke',
    desc: 'Approve, inspect or revoke player card artwork' },
  { id: 'command', label: 'Bot commands', emoji: '🤖', icon: 'i-bot', section: 'bot', href: CC + '?tool=command', module: 'controlcenter:command', keys: 'slash commands who can use',
    desc: 'Every slash command: on or off, who can use it, where' },
  { id: 'component', label: 'Buttons and menus', emoji: '🔘', icon: 'i-button', section: 'bot', href: CC + '?tool=component', module: 'controlcenter:component', keys: 'components select',
    desc: 'Every button and menu the bots show' },
  { id: 'automated', label: 'Automated posts', emoji: '📣', icon: 'i-post', section: 'bot', href: CC + '?tool=automated', module: 'controlcenter:automated', keys: 'announcements channels cron',
    desc: 'Every post the bots make on their own, and which channels get it' },
  { id: 'scheduled', label: 'Scheduled jobs', emoji: '⏱️', icon: 'i-clock', section: 'bot', href: CC + '?tool=scheduled', module: 'controlcenter:scheduled', keys: 'cron timers',
    desc: 'Timed jobs: on or off' },
  { id: 'dm', label: 'DMs and notifications', emoji: '🔔', icon: 'i-bell', section: 'bot', href: CC + '?tool=dm', module: 'controlcenter:dm', keys: 'push direct messages methods windows',
    desc: 'Direct messages and notifications: who gets them, by which method, when' },
  { id: 'music', label: 'Music and DJ', emoji: '🎧', icon: 'i-music', section: 'music', href: 'hub-music.html', keys: 'dj lavalink queue rooms',
    desc: 'The club DJ: rooms, the queue and the player' },
  { id: 'access', label: 'Site access', emoji: '🎛️', icon: 'i-lock', section: 'site', href: CC + '?tool=access', module: 'controlcenter:access', keys: 'flags features levels who sees',
    desc: 'Who can see each section of the site, per level' },
  { id: 'insights', label: 'Insights', emoji: '🧭', icon: 'i-chart', section: 'site', group: 'health', href: 'staff-insights.html', keys: 'club intelligence notes burner tracker',
    desc: 'Club Intelligence, written club notes, burner-club tracker' },
  { id: 'org', label: 'Organization', emoji: '🏢', icon: 'i-org', section: 'org', owner: true, href: CC + '?tool=org', module: 'org', keys: 'discord servers channels roles clubs',
    desc: 'Discord servers, channels, roles and clubs' },
  { id: 'audit', label: 'Audit log', emoji: '🛡️', icon: 'i-shield', section: 'system', href: CC + '?tool=audit', module: 'controlcenter:audit', keys: 'who changed what history',
    desc: 'Who changed what, newest first' },
  { id: 'boardroom', label: 'Boardroom', emoji: '👑', icon: 'i-crown', section: 'system', group: 'owner', owner: true, href: 'staff-boardroom.html', keys: 'owner health announce hall of fame medals backup',
    desc: 'Switches, health, announcements, audit log, Hall of Fame, medals, backup and organization, one page' },
];
// the whole Control Center is one hub tile (it opens the dashboard); its module tools are reached from the sidebar and search
export const CC_TILE = { id: 'controlcenter', label: 'Control Center', emoji: '🎛️', group: 'cc', href: CC,
  desc: 'Every command, button, automated post, scheduled job, DM and site section: on or off, who gets it, which channels' };

const legacy = (g) => (g === 'cc' ? [CC_TILE] : TOOLS.filter((t) => t.group === g));
/** [emoji, title, sub, [[href, emoji, label, desc]]] groups for the staff hub (managers) */
export const hubGroups = (ownerOnly = false) => GROUPS.filter(([id]) => (id === 'owner') === ownerOnly)
  .map(([id, e, t, sub]) => [e, t, sub, legacy(id).map((x) => [x.href, x.emoji, x.label, x.desc])]);
/** dock lists: [title, [[href, emoji, label]]] */
export const dockGroups = (ownerOnly = false) => hubGroups(ownerOnly).map(([, t, , tools]) => [t, tools.map(([h, e, l]) => [h, e, l])]);

/** source text for dock.js: the two lists as literals in the dock's own format, so the dock reads the manifest and holds no copy */
export function dockLists() {
  const lit = (g) => '[' + g.map(([t, items]) => `[${JSON.stringify(t).replace(/^"|"$/g, "'")}, [${items.map(([h, e, l]) => `['${h}', '${e}', '${l}']`).join(', ')}]]`).join(',\n    ') + ']';
  return `const STAFF = ${lit(dockGroups(false))};\n  // One Boardroom tile: its tabs (switches, health, announce, audit, hall of fame, medals, backup, organization) stay as deep links inside the page.\n  const OWNER = ${lit(dockGroups(true))};`;
}

/** the browser copy: window.PFStaffManifest = { sections, tools } (ccshell.js: sidebar, search, link resolver) */
export const manifestJs = () => `window.PFStaffManifest=${JSON.stringify({ sections: SECTIONS, tools: TOOLS })};\n`;

/** the link resolver: 'desk' | 'staff-desk.html' | 'staff-controlcenter.html#audit' -> the tool, or null */
export const resolve = (ref) => { const r = String(ref || '').replace(/^\//, ''); return TOOLS.find((t) => t.id === r || t.href === r) || (r === CC ? TOOLS[0] : null); };

/** problems with the manifest (empty = fine): duplicates and entries with no target; tests call this */
export function problems() {
  const out = [], ids = new Set(), hrefs = new Set(), secs = new Set(SECTIONS.map(([k]) => k)), groups = new Set(GROUPS.map(([k]) => k));
  for (const t of TOOLS) {
    for (const k of ['id', 'label', 'emoji', 'icon', 'desc', 'section']) if (!t[k]) out.push(`${t.id || '?'}: missing ${k}`);
    if (!t.href && !t.module) out.push(`${t.id}: no target (href or module)`);
    if (t.module && !/^(home|org|controlcenter:\w+)$/.test(t.module)) out.push(`${t.id}: unknown module ${t.module}`);
    if (ids.has(t.id)) out.push(`${t.id}: duplicate id`); ids.add(t.id);
    if (t.href) { if (hrefs.has(t.href)) out.push(`${t.href}: duplicate href`); hrefs.add(t.href); }
    if (!secs.has(t.section)) out.push(`${t.id}: unknown section ${t.section}`);
    if (t.group && !groups.has(t.group)) out.push(`${t.id}: unknown group ${t.group}`);
  }
  if (hrefs.has(CC_TILE.href) === false) out.push('home has no Control Center href');
  return out;
}
