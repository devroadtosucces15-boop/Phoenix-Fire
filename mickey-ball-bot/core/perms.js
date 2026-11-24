// Who may run what. A server picks one Discord role per permission key (/setup); Administrators always pass, the person who
// claimed setup always passes the setup key, and a key with no role falls back to the Manage Server permission.
import { message, header, text, sep, footer, button } from './ui.js';

export const PERM_KEYS = {
  setup: { label: 'Roles & permissions', cmds: '`/setup`', hint: 'Who can change these settings' },
  tracking: { label: 'Club tracking', cmds: '`/match track` · `untrack` · `main`', hint: 'Who can choose the clubs the bot follows' },
  matchday: { label: 'Match days', cmds: '`/host` · `/matchday create` · `cancel`', hint: 'Who can schedule or cancel match days' },
  lineup: { label: 'Lineups', cmds: '`/setlineup` · lineup buttons', hint: 'Who can set and post the lineup' },
};
const ADMIN = 0x8n, MANAGE = 0x20n;

// i = a Discord interaction; cfg = guild_cfg row or null; roles = Map key → role id
export function allowed(i, key, cfg, roles) {
  const perms = BigInt(i.member?.permissions ?? 0), uid = (i.member?.user ?? i.user)?.id;
  if (perms & ADMIN) return true;
  if (key === 'setup' && cfg && cfg.owner_id === uid) return true;
  const role = roles.get(key);
  if (role) return (i.member?.roles ?? []).includes(role);
  if (key === 'setup' && !cfg) return (perms & MANAGE) !== 0n; // nobody has claimed it yet: a server manager can
  return (perms & MANAGE) !== 0n;
}
export const needText = (key, roles) => (roles.get(key) ? `You need the <@&${roles.get(key)}> role to do that.` : 'You need the Manage Server permission to do that.');

export function setupPanel(cfg, roles, { flash = null } = {}) {
  const rows = Object.entries(PERM_KEYS).flatMap(([key, k]) => [
    text(`**${k.label}** · ${k.cmds}\n-# ${k.hint} · now: ${roles.get(key) ? `<@&${roles.get(key)}>` : 'Manage Server (default)'}`),
    { type: 1, components: [{ type: 6, custom_id: `ml:cfg:${key}`, placeholder: `Role for ${k.label.toLowerCase()}`, min_values: 0, max_values: 1, default_values: roles.get(key) ? [{ id: roles.get(key), type: 'role' }] : undefined }] },
  ]);
  return message({ accent: 'info', ephemeral: true, blocks: [
    header({ eyebrow: 'Settings', title: 'Roles & permissions', sub: cfg ? `Set up by <@${cfg.owner_id}> · Administrators can always change everything` : 'You are the first to open this, so you own the setup' }),
    flash ? text(`✅ ${flash}`) : null,
    sep(),
    ...rows,
    sep(),
    text('Pick a role for each row to lock that command group to it. Clearing a row puts it back to Manage Server. Choosing a role for **Roles & permissions** also locks this panel; you and Administrators always keep access.'),
    { type: 1, components: [button({ label: 'Reset all to default', id: 'ml:cfg:reset', style: 'no' })] },
    footer('Only people allowed by the “Roles & permissions” row can see or change this'),
  ] });
}
