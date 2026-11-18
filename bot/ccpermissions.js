// Control Center permissions on the server (PF-022 step 9). The site hides what a role may not use (data-for, the sidebar, viewAs); this file is the
// other half: every Worker route the Control Center calls is listed here against a tool of the one staff manifest (next/lib/staffmanifest.mjs), and the
// route is refused for a role that tool does not allow, so hiding a tab is never the only protection.
//   signed out          401 "Sign in with Discord"
//   member or guest     403 (none of the Control Center)
//   manager             the tools whose manifest level is 'manager'; an owner-only tool or write is 403
//   owner               everything
// A route is [method, path test, tool id, optional write level]. `min` for a route is the tool's level unless `write` raises it (the Site access flags are visible to
// managers but only the owner changes them). The owner's viewAs preview works through the existing X-View-As header (bot/roles.js viewAsRole): the request is answered as
// that lower role, so a preview as manager really gets the manager's 403s. Anything not listed here is not a Control Center route (its own checks still apply).
import { TOOLS, ccRoleOf, mayUse } from '../next/lib/staffmanifest.mjs';

const exact = (p) => (x) => x === p, prefix = (p) => (x) => x === p || x.startsWith(p + '/');
export const ROUTES = [
  // the Control Center API (bot/controlcenter.js, bot/ccsettings.js): every output's switch, the settings areas, the audit feed, the Discord pickers
  ['GET', exact('/api/controlcenter'), 'home'],
  ['POST', exact('/api/controlcenter/save'), 'command'],
  ['POST', exact('/api/controlcenter/reset'), 'command'],
  ['GET', exact('/api/controlcenter/settings'), 'settings'],
  ['POST', prefix('/api/controlcenter/settings'), 'settings'], // the area's own level (owner for `bot`) is checked by saveArea on top
  ['GET', exact('/api/controlcenter/audit'), 'audit'],
  ['GET', exact('/api/controlcenter/discord'), 'settings'],
  ['POST', exact('/api/controlcenter/create'), 'settings'],
  // the moved settings routes: still in the Worker, still owner-only, now stated by the same matrix
  ['GET', exact('/api/bot/settings'), 'settings', 'owner'], ['POST', exact('/api/bot/settings'), 'settings', 'owner'],
  ['GET', exact('/api/bot/commands'), 'command', 'owner'], ['POST', prefix('/api/bot/commands'), 'command', 'owner'],
  ['GET', exact('/api/bot/routes'), 'settings', 'owner'], ['POST', exact('/api/bot/routes'), 'settings', 'owner'],
  ['GET', prefix('/api/org'), 'org'], ['POST', prefix('/api/org'), 'org'],
  ['POST', prefix('/api/admin/flags'), 'access', 'owner'], // read is open to managers (see which level each feature has); changing one is the owner's
  ['GET', exact('/api/admin/health'), 'health'],
  ['GET', exact('/api/intel/counselor'), 'counselor'], // PF-024 Item 14: team tendencies and anomaly flags (numbers only), managers
  ['GET', exact('/api/intel/absences'), 'absences'], // PF-024 Item 17: absence notices with the private reason, managers
  ['GET', exact('/api/music/status'), 'music'], // the DJ bridge status and command log (music.manage); the member rooms routes stay members'
];

/** the matrix row for a request, or null when the route is not a Control Center route */
export function routeOf(method, path) {
  const m = String(method || 'GET').toUpperCase(), r = ROUTES.find(([mm, test]) => mm === m && test(path));
  if (!r) return null;
  const tool = TOOLS.find((t) => t.id === r[2]);
  return { tool: r[2], min: r[3] || tool?.level || 'owner' };
}
/** null when the request may go on, else { status, error } (401 signed out, 403 wrong role). `me` is the session after the viewAs preview was applied. */
export function ccDenied(me, method, path) {
  const row = routeOf(method, path); if (!row) return null;
  const role = me ? ccRoleOf(me.role ?? 'member') : null;
  if (!role) return { status: 401, error: 'Sign in with Discord to use the Control Center.' };
  if (role === 'member') return { status: 403, error: 'The Control Center is for managers and the owner.' };
  if (role === 'owner' || (row.min === 'manager' && mayUse(role, row.tool))) return null;
  return { status: 403, error: 'Owner only.' };
}
/** the tool ids a session may use (sent with GET /api/controlcenter so the page can check itself against the server) */
export const accessFor = (me) => TOOLS.filter((t) => me && mayUse(me.role ?? 'member', t)).map((t) => t.id);
