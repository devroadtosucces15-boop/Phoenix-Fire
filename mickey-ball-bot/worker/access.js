// Shared helpers for the Worker's match-day, lineup and setup handlers.
import { notice } from '../core/ui.js';
import { clubView } from '../core/data.js';
import { allowed, needText } from '../core/perms.js';

export const who = (i) => { const u = i.member?.user ?? i.user ?? {}; return { id: u.id, name: i.member?.nick ?? u.global_name ?? u.username ?? 'Player' }; };
export const mainClub = async (st, g) => { const r = (await st.trackedFor(g))[0]; return r ? clubView(r) : null; };
export const nextOne = async (st, i) => (await st.upcoming(i.guild_id, 1))[0] ?? null;
export const publicUrl = (env) => String(env.PUBLIC_URL).replace(/\/$/, '');

// null when the person may do it; otherwise the private message that says why not.
export async function gate(st, i, key) {
  const [cfg, roles] = await Promise.all([st.getCfg(i.guild_id), st.perms(i.guild_id)]);
  return allowed(i, key, cfg, roles) ? null : notice('Not allowed', needText(key, roles), { accent: 'loss', ephemeral: true });
}
