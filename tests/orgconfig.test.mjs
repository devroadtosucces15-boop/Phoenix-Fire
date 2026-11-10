// Phase 0: Organization Configuration – EA club instances, Discord servers/channels/roles, audit, diagnostics, resolvers.
import { call, env, login, sqlite, W } from './mock.mjs';
import { activeClubs, resolveChannel, rolesFor } from '../bot/orgconfig.js';
import { settingsKey } from '../bot/settings.js';
import { t, tt, done } from './lib.mjs';

const owner = await login('111', [], 'Owner');
const mgr = await login('801', ['mgr'], 'Mgr');
const member = await login('800', [], 'Member');
const G = '1328821938243637381', G2 = '1400000000000000001';
const C = (n) => `14000000000000${String(n).padStart(5, '0')}`;

t('guests are refused', (await call(null, '/api/org/config')).s === 401);
t('members and managers cannot read the config', (await call(member, '/api/org/config')).s === 403 && (await call(mgr, '/api/org/config')).s === 403);
t('members cannot write the config', (await call(member, '/api/org/config/clubs', { ea_club_id: '2', display_name: 'x' })).s === 403);

const cfg = (await call(owner, '/api/org/config')).d;
t('seeds the known club 1111 and the known guild', cfg.clubs.some((c) => c.ea_club_id === '1111') && cfg.servers.some((s) => s.guild_id === G));

// clubs: unlimited by design, validated, no duplicates
t('rejects a non-numeric EA id', (await call(owner, '/api/org/config/clubs', { ea_club_id: 'abc', display_name: 'X' })).s === 400);
t('rejects a duplicate EA id', (await call(owner, '/api/org/config/clubs', { ea_club_id: '1111', display_name: 'Dup' })).s === 400);
const lg = (await call(owner, '/api/org/config/divisions', { name: 'League' })).d;
const mx = (await call(owner, '/api/org/config/divisions', { name: 'Mixed' })).d;
t('divisions are created', lg.id && mx.id && lg.name === 'League');
t('rejects a club in a missing division', (await call(owner, '/api/org/config/clubs', { ea_club_id: '2222', display_name: 'X', division_id: 999 })).s === 400);
const home = cfg.clubs.find((c) => c.ea_club_id === '1111');
t('edits the seeded club', (await call(owner, '/api/org/config/clubs', { id: home.id, ea_club_id: '1111', display_name: 'Phoenix Fire', division_id: lg.id })).d.display_name === 'Phoenix Fire');
const c2 = (await call(owner, '/api/org/config/clubs', { ea_club_id: '2222', display_name: 'Phoenix Mixed A', division_id: mx.id })).d;
const c3 = (await call(owner, '/api/org/config/clubs', { ea_club_id: '3333', display_name: 'Phoenix Mixed B', division_id: mx.id })).d;
// the acceptance test: a fourth club needs no code change and is picked up by the readers
await call(owner, '/api/org/config/clubs', { ea_club_id: '4444', display_name: 'Phoenix Four' });
t('a fourth club is live with no code edit', (await activeClubs(env)).map((c) => c.ea_club_id).join() === '1111,2222,3333,4444');
await call(owner, '/api/org/config/clubs', { id: c3.id, ea_club_id: '3333', display_name: 'Phoenix Mixed B', active: false });
t('deactivated club leaves the active list', !(await activeClubs(env)).some((c) => c.ea_club_id === '3333'));
t('deleting a club archives it, history rows stay', (await call(owner, `/api/org/config/clubs/${c3.id}/delete`, {})).s === 200 && sqlite.prepare('SELECT archived FROM ea_clubs WHERE id = ?').get(c3.id).archived === 1);
t('archived club is hidden from the config list', !(await call(owner, '/api/org/config')).d.clubs.some((c) => c.id === c3.id));
t('a division with clubs cannot be removed', (await call(owner, `/api/org/config/divisions/${mx.id}/delete`, {})).s === 400);

// servers, channels, roles
const s1 = cfg.servers.find((s) => s.guild_id === G);
t('rejects a bad server id', (await call(owner, '/api/org/config/servers', { guild_id: '12', display_name: 'x' })).s === 400);
const s2 = (await call(owner, '/api/org/config/servers', { guild_id: G2, display_name: 'Phoenix Mixed Discord' })).d;
t('a second server is allowed (multi-server)', s2.id && s2.id !== s1.id);
t('rejects a channel on an unknown server', (await call(owner, '/api/org/config/channels', { server_id: 999, channel_id: C(1), purpose: 'announcements' })).s === 400);
t('rejects an unknown purpose', (await call(owner, '/api/org/config/channels', { server_id: s1.id, channel_id: C(1), purpose: 'gossip' })).s === 400);
t('rejects a club-scoped channel with no club', (await call(owner, '/api/org/config/channels', { server_id: s1.id, channel_id: C(1), purpose: 'match_results', scope_type: 'club', scope_id: 9999 })).s === 400);
await call(owner, '/api/org/config/channels', { server_id: s1.id, channel_id: C(1), purpose: 'match_results' });
t('org-wide channel resolves for any club', (await resolveChannel(env, 'match_results', { clubId: c2.id }))?.channelId === C(1));
const dch = (await call(owner, '/api/org/config/channels', { server_id: s2.id, channel_id: C(2), purpose: 'match_results', scope_type: 'division', scope_id: mx.id })).d;
t('division channel beats org for that division, on its own server', (await resolveChannel(env, 'match_results', { clubId: c2.id, divisionId: mx.id }))?.guildId === G2);
await call(owner, '/api/org/config/channels', { server_id: s1.id, channel_id: C(3), purpose: 'match_results', scope_type: 'club', scope_id: c2.id });
t('club channel beats division', (await resolveChannel(env, 'match_results', { clubId: c2.id, divisionId: mx.id }))?.channelId === C(3));
t('other clubs still use the org channel', (await resolveChannel(env, 'match_results', { clubId: home.id, divisionId: lg.id }))?.channelId === C(1));
t('a purpose with no channel resolves to null, never a substitute', (await resolveChannel(env, 'recruitment', { clubId: c2.id })) === null);
await call(owner, '/api/org/config/channels', { id: dch.id, server_id: s2.id, channel_id: C(4), purpose: 'match_results', scope_type: 'division', scope_id: mx.id });
t('changing a channel takes effect with no rebuild', (await resolveChannel(env, 'match_results', { divisionId: mx.id }))?.channelId === C(4));
await call(owner, '/api/org/config/channels', { id: dch.id, server_id: s2.id, channel_id: C(4), purpose: 'match_results', scope_type: 'division', scope_id: mx.id, active: false });
t('inactive channel is skipped', (await resolveChannel(env, 'match_results', { divisionId: mx.id }))?.channelId === C(1));
t('a server that still has channels cannot be deleted', (await call(owner, `/api/org/config/servers/${s2.id}/delete`, {})).s === 400);

t('rejects a bad permission group', (await call(owner, '/api/org/config/roles', { server_id: s1.id, role_id: C(9), permission_group: 'god' })).s === 400);
await call(owner, '/api/org/config/roles', { server_id: s1.id, role_id: C(9), permission_group: 'owner' });
await call(owner, '/api/org/config/roles', { server_id: s2.id, role_id: C(8), permission_group: 'club_manager', scope_type: 'club', scope_id: c2.id });
t('roles map to groups, with scope and server', (await rolesFor(env, 'club_manager'))[0]?.guild_id === G2 && (await rolesFor(env, 'owner')).length === 1);

// audit + diagnostics
const audit = (await call(owner, '/api/org/config')).d.audit;
t('every change is audited with who and before/after', audit.length > 15 && audit.every((a) => a.user_id === '111') && audit.some((a) => a.action === 'update' && a.before && a.after) && audit.some((a) => a.action === 'archive'));
const diag = (await call(owner, '/api/org/diagnostics')).d;
t('diagnostics flag missing org channels instead of guessing', diag.ok && diag.issues.some((i) => /announcements/.test(i.msg)) && diag.issues.some((i) => /placeholder/.test(i.msg)) === false);

// keyed endpoint for fetch jobs
t('public club list needs the key', (await W('/api/org/clubs/public')).status === 403);
const key = await settingsKey(env.DISCORD_CLIENT_SECRET);
const pub = await (await W('/api/org/clubs/public', { headers: { 'X-Norex-Key': key } })).json();
t('keyed club list returns active clubs only', pub.clubs.map((c) => c.ea_club_id).join() === '1111,2222,4444');
done();
