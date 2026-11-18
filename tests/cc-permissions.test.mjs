// PF-022 step 9: Control Center permissions. One matrix (owner, manager, member) read from the staff manifest, enforced on the site (data-for, viewAs, sidebar)
// AND in the Worker: every Control Center route and the moved settings routes answer a signed-out visitor, a member and a manager the way the matrix says,
// so hiding a tab is never the only protection. Fake sessions run the route handlers; the mock Worker runs the whole request path (sign-in, X-View-As).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { call, login, W, env } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import * as MAN from '../next/lib/staffmanifest.mjs';
import { ROUTES, routeOf, ccDenied, accessFor } from '../bot/ccpermissions.js';
import { controlCenterRoute } from '../bot/controlcenter.js';
import { orgConfigRoute } from '../bot/orgconfig.js';
import { botCommandsRoute } from '../bot/botcommands.js';
import { routingRoute } from '../bot/routing.js';
import { botSettingsRoute } from '../bot/settings.js';
import { ROOT } from './mock.mjs';

// ---- the matrix in the manifest
t('matrix: every manifest tool has a permission level (manager or owner) and it agrees with the owner flag', MAN.TOOLS.every((x) => MAN.LEVELS.includes(x.level) && (x.level === 'owner') === !!x.owner) && MAN.problems().length === 0);
t('matrix: a tool with no level is caught by the manifest check', (() => { const x = MAN.TOOLS[1], l = x.level; delete x.level; const bad = MAN.problems().some((p) => /permission level/.test(p)); x.level = l; return bad; })());
const M = MAN.matrix();
t('matrix: members see no tool, managers see every manager tool, the owner sees everything', M.member.length === 0 && M.owner.length === MAN.TOOLS.length && M.manager.join() === MAN.TOOLS.filter((x) => x.level === 'manager').map((x) => x.id).join() && MAN.TOOLS.some((x) => x.level === 'owner'));
t('matrix: no owner-only tool is open to a manager, a member or a guest', MAN.TOOLS.filter((x) => x.level === 'owner').every((x) => !MAN.mayUse('manager', x) && !MAN.mayUse('member', x) && !MAN.mayUse('guest', x) && !MAN.mayUse('claimed', x) && !MAN.mayUse(null, x) && MAN.mayUse('owner', x)));
t('matrix: the browser manifest carries the same matrix', MAN.manifestJs().includes(JSON.stringify(M)));

// ---- the Worker route table, from the same tools
t('routes: every route names a manifest tool', ROUTES.every(([, , id]) => MAN.TOOLS.some((x) => x.id === id)));
t('routes: a route is never more open than its tool (min is the tool level or higher)', ROUTES.every(([, , id, w]) => !(MAN.TOOLS.find((x) => x.id === id).level === 'owner' && w === 'manager')));
const PATHS = ['/api/controlcenter', '/api/controlcenter/save', '/api/controlcenter/reset', '/api/controlcenter/settings', '/api/controlcenter/settings/bot', '/api/controlcenter/settings/routes', '/api/controlcenter/audit',
  '/api/controlcenter/discord', '/api/controlcenter/create', '/api/bot/settings', '/api/bot/commands', '/api/bot/commands/sync', '/api/bot/routes', '/api/org/config', '/api/org/config/clubs', '/api/org/diagnostics', '/api/admin/flags', '/api/admin/flags/reset', '/api/admin/health', '/api/music/status', '/api/intel/counselor', '/api/intel/absences', '/api/emoji/review', '/api/emoji/review/file', '/api/emoji/review/decide'];
const rows = [];
for (const p of PATHS) for (const m of ['GET', 'POST']) { const r = routeOf(m, p); if (r) rows.push([m, p, r]); }
t('routes: the matrix covers every Control Center and moved settings path (a path in the list with no route would be unprotected)', PATHS.every((p) => ['GET', 'POST'].some((m) => routeOf(m, p))) && rows.length >= PATHS.length);
const S = { out: null, guest: { u: '1', role: 'guest' }, member: { u: '2', role: 'member' }, claimed: { u: '3', role: 'claimed' }, manager: { u: '4', role: 'manager' }, owner: { u: '5', role: 'owner' } };
t('routes: signed out is 401 on every matrix route', rows.every(([m, p]) => ccDenied(S.out, m, p)?.status === 401));
t('routes: guest, member and verified player are 403 on every matrix route', rows.every(([m, p]) => ['guest', 'member', 'claimed'].every((r) => ccDenied(S[r], m, p)?.status === 403)));
t('routes: a manager is let through exactly where the tool level is manager; an owner-only route is 403', rows.every(([m, p, r]) => (ccDenied(S.manager, m, p) === null) === (r.min === 'manager') && (r.min === 'manager' || ccDenied(S.manager, m, p).status === 403)));
t('routes: the owner is let through everywhere', rows.every(([m, p]) => ccDenied(S.owner, m, p) === null));
t('routes: a path outside the matrix is not a Control Center route (no false 401 on the rest of the API)', ccDenied(S.out, 'GET', '/api/me') === null && ccDenied(S.member, 'GET', '/api/feed') === null);
t('access list: members get none, a manager gets the manager tools, the owner gets all', accessFor(S.member).length === 0 && accessFor(S.out).length === 0 && accessFor(S.manager).join() === M.manager.join() && accessFor(S.owner).length === MAN.TOOLS.length);

// ---- the real handlers with fake sessions (the guard runs before any database work)
const ctl = (me, m, p) => controlCenterRoute(p, m, {}, me, { DB: null }, new URL('https://x.invalid' + p));
for (const [m, p, r] of rows.filter(([, p]) => p.startsWith('/api/controlcenter'))) {
  await tt(`handler ${m} ${p}: signed out 401, member 403, manager ${r.min === 'manager' ? 'passes the guard' : '403'}`, async () => {
    const out = await ctl(S.out, m, p), mem = await ctl(S.member, m, p), mgr = await ctl(S.manager, m, p);
    return out.status === 401 && mem.status === 403 && (r.min === 'manager' ? mgr.status === 503 : mgr.status === 403); // 503 = past the guard, no database in this fake env
  });
}
const OWN = (name, f, ...a) => tt(`${name}: signed out, member and manager are refused, the owner gets past the check`, async () => {
  const st = async (me) => { try { return (await f(...a.slice(0, 2), {}, me, { DB: null }, async () => {}))?.status; } catch { return 'past'; } }; // a throw = past the check, into the (absent) database
  const [o, m, g] = [await st(S.out), await st(S.member), await st(S.manager)];
  return o === 403 && m === 403 && g === 403 && (await st(S.owner)) !== 403;
});
await OWN('moved route /api/org/config', orgConfigRoute, '/api/org/config', 'GET');
await OWN('moved route /api/bot/settings', botSettingsRoute, '/api/bot/settings', 'GET');
await OWN('moved route /api/bot/routes', routingRoute, '/api/bot/routes', 'GET');
await OWN('moved route /api/bot/commands', botCommandsRoute, '/api/bot/commands', 'GET');

// ---- the whole request path: sign-in, session, X-View-As (the owner's preview is answered by the Worker as that role)
const owner = await login('111', [], 'Owner'), manager = await login('333', ['mgr'], 'Manager'), member = await login('444', [], 'Member');
const get = async (tok, p, extra = {}) => W(p, { headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...extra } });
t('worker: signed out gets 401 on the Control Center', (await get(null, '/api/controlcenter')).status === 401 && (await get(null, '/api/controlcenter/audit')).status === 401);
t('worker: a member gets 403 on every Control Center route and on the moved settings routes', (await Promise.all(['/api/controlcenter', '/api/controlcenter/settings', '/api/controlcenter/audit', '/api/controlcenter/discord', '/api/org/config', '/api/bot/settings', '/api/bot/routes', '/api/bot/commands', '/api/admin/health'].map((p) => get(member, p)))).every((r) => r.status === 403));
t('worker: a member cannot save, reset or create (POST) either', (await Promise.all(['/api/controlcenter/save', '/api/controlcenter/reset', '/api/controlcenter/create', '/api/controlcenter/settings/routes', '/api/admin/flags'].map((p) => W(p, { method: 'POST', headers: { Authorization: 'Bearer ' + member, 'Content-Type': 'application/json' }, body: '{}' })))).every((r) => r.status === 403));
t('worker: a manager reads the Control Center and its settings and audit', (await get(manager, '/api/controlcenter')).status === 200 && (await get(manager, '/api/controlcenter/settings')).status === 200 && (await get(manager, '/api/controlcenter/audit')).status === 200);
t('worker: a manager is refused the owner-only moved routes and the owner-only settings area', (await Promise.all(['/api/org/config', '/api/bot/settings', '/api/bot/routes', '/api/bot/commands', '/api/admin/health'].map((p) => get(manager, p)))).every((r) => r.status === 403)
  && (await W('/api/controlcenter/settings/bot', { method: 'POST', headers: { Authorization: 'Bearer ' + manager, 'Content-Type': 'application/json' }, body: '{}' })).status === 403
  && (await W('/api/admin/flags', { method: 'POST', headers: { Authorization: 'Bearer ' + manager, 'Content-Type': 'application/json' }, body: '{"name":"x","level":"off"}' })).status === 403);
t('worker: the owner reads all of it', (await Promise.all(['/api/controlcenter', '/api/controlcenter/settings', '/api/org/config', '/api/bot/settings'].map((p) => get(owner, p)))).every((r) => r.status === 200));
const cc = async (tok, v) => (await get(tok, '/api/controlcenter', v ? { 'X-View-As': v } : {})).json();
const own = await cc(owner), asMgr = await get(owner, '/api/controlcenter', { 'X-View-As': 'manager' }), asMem = await get(owner, '/api/controlcenter', { 'X-View-As': 'member' });
t('viewAs: the owner previewing as a manager is answered as a manager (the access list shrinks, real role reported, owner routes 403)', asMgr.status === 200 && (await asMgr.clone().json()).me.role === 'manager' && (await asMgr.json()).me.realRole === 'owner'
  && (await get(owner, '/api/org/config', { 'X-View-As': 'manager' })).status === 403 && own.me.access.length === MAN.TOOLS.length);
t('viewAs: the owner previewing as a member is answered as a member (403) and nobody can climb: a member asking for owner stays a member', asMem.status === 403 && (await get(member, '/api/controlcenter', { 'X-View-As': 'owner' })).status === 403 && (await get(manager, '/api/org/config', { 'X-View-As': 'owner' })).status === 403);
t('viewAs: a preview never changes the real permissions (the next plain request is the owner again)', (await get(owner, '/api/org/config')).status === 200);

// ---- the built site: signed-out and wrong-role states, the View as strip, Phoenix branding
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
execFileSync(process.execPath, ['phoenix/build.mjs', '--out', out], { cwd: ROOT, stdio: 'pipe' });
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
const page = read('staff-controlcenter.html'), shell = read('ccshell.js'), css = read('ccshell.css'), sess = read('session.js'), man = read('staffmanifest.js');
const vis = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
t('site: the page opens on the staff sign-in gate (works without scripts), with a Discord sign-in link and the Phoenix crest', /id="cxGate"[^>]*data-state="out"/.test(page) && /data-login/.test(page.slice(page.indexOf('id="cxGate"'))) && /Sign in with Discord/.test(page) && /<img class="cx-gate-crest" src="crest-sm\.png"/.test(page));
t('site: the shell shows the gate signed out (sign-in link back to this page), a wrong-role notice for members, and the member preview', /showGate\('out'\)/.test(shell) && /showGate\(A\.ccView === 'member' \? 'preview' : 'role'\)/.test(shell) && /A\.loginUrl\(\)/.test(shell));
t('site: no tool is mounted and no request is made for a role the matrix does not allow (the gate returns before loadAll)', shell.indexOf("showGate('out'); return;") > 0 && shell.indexOf("showGate('out'); return;") < shell.indexOf('loadAll();', shell.indexOf('showGate')) && /ready = true;[\s\S]*loadAll\(\)/.test(shell));
t('site: the sidebar and the palette are filtered by the manifest matrix, not by a hardcoded role', /MAN\.matrix/.test(shell) && /li\.hidden = !may\(/.test(shell) && !/A\?\.role === 'owner'/.test(shell));
t('site: the owner has a View as strip (Owner, Manager, Member) that sets the preview and reloads', /id="cxView"/.test(page) && ['owner', 'manager', 'member'].every((v) => page.includes(`data-view="${v}"`)) && /setCcView/.test(shell) && /phoenix\.cc\.viewas/.test(sess));
t('site: only the real owner can preview, and the preview sends X-View-As so the Worker answers as that role', /role === 'owner' && \['manager', 'member'\]\.includes\(ls\.get\('phoenix\.cc\.viewas'\)\)/.test(sess) && /'X-View-As': ccView/.test(sess));
t('site: the old redirect pages still land on the Control Center, which then asks a signed-out visitor to sign in (the #tool survives the Discord round trip)', /keepHash/.test(sess) && ['staff-boardroom.html', 'staff-switches.html', 'staff-audit.html'].every((f) => /staff-controlcenter\.html#/.test(read(f))));
t('brand: the signed-out, wrong-role and View as states show no NOREX name, colour or crest and use Phoenix accents', !/norex/i.test(vis(page)) && !/c8352c|080b11/i.test(page + css + shell + man) && /var\(--red,/.test(css.slice(css.indexOf('.cx-gate'))) && !/NOREX/.test(shell.slice(shell.indexOf('sign-in, wrong role'))));
t('brand: the gate takes the club name from config and the crest is the Phoenix one', /PHOENIX FIRE staff/i.test(page) && fs.statSync(path.join(out, 'crest-sm.png')).size === fs.statSync(path.join(ROOT, 'phoenix/overlay/crest-sm.png')).size);
fs.rmSync(out, { recursive: true, force: true }); // the build is big: do not leave it in /tmp
done();
