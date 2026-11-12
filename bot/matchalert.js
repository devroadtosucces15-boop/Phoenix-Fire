// The match alert (review "message 3"): posted right after the match review only when a result trips the trigger.
// A loud warning line with sirens above the panel, then three separate tags (everyone, the managers role, the owner) and a drawn alert picture.
// Roles come from the Organization config (rolesFor, groups manager and owner) and the owner users from ADMIN_IDS; nothing is hardcoded.
// The channel comes from the Organization config purpose `match_results`. No button, no menu.
import { message, header, text, facts, footer, cards, bannerUrl } from './ui.js';
import { orgName, rolesFor, channelsFor } from './orgconfig.js';

// m = { opponent, us, them, line, when }  (line = "Heavy defeat 0–3 · every line below its usual", when = "Tue 13 Oct")
export function matchAlertMessage(env, m, { roles = [], owners = [] } = {}) {
  const name = orgName(env), vs = `${name} vs ${m.opponent}`;
  const tags = ['@everyone', ...roles.map((id) => `<@&${id}>`), ...owners.map((id) => `<@${id}>`)];
  return message({
    accent: 'loss',
    ping: [`# 🚨🚨 ⚠️ CAUTION ⚠️ 🚨🚨`, `# ⚠️ We need to change something · ${vs} ⚠️`, tags.join('\n')].join('\n'),
    mentions: { parse: ['everyone'], roles: roles.map(String), users: owners.map(String) },
    blocks: [
      cards({ url: bannerUrl(env, 'matchalert'), alt: 'Match alert' }),
      header({ eyebrow: `${name.toUpperCase()} · MATCH ALERT`, title: vs, sub: [m.line, m.when].filter(Boolean).join(' · ') }),
      m.us != null && m.them != null ? facts([['Score', `${m.us}–${m.them}`]]) : null,
      footer('Sent only after a result trips the alert'),
    ],
  });
}

// Resolves the tags and the channels from the Organization config. [] channels = "no channel set": the caller says so, never guesses.
export async function matchAlertTargets(env) {
  const roles = [...new Set((await rolesFor(env, 'manager').catch(() => [])).map((r) => String(r.role_id)))];
  const owners = String(env.ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!owners.length) roles.push(...(await rolesFor(env, 'owner').catch(() => [])).map((r) => String(r.role_id)).filter((id) => !roles.includes(id)));
  return { roles, owners, channels: await channelsFor(env, 'match_results').catch(() => []) };
}

export async function postMatchAlert(env, m) {
  const { roles, owners, channels } = await matchAlertTargets(env);
  if (!channels.length) return { posted: 0, reason: 'No match_results channel is set in the Organization config.' };
  if (!env.DISCORD_BOT_TOKEN) return { posted: 0, reason: 'No bot token.' };
  const body = JSON.stringify(matchAlertMessage(env, m, { roles, owners }));
  let posted = 0;
  for (const ch of channels) {
    const r = await fetch(`https://discord.com/api/v10/channels/${ch}/messages`, { method: 'POST', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body }).catch(() => null);
    if (r?.ok) posted++;
  }
  return { posted };
}
