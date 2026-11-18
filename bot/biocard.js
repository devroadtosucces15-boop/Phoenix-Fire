// PF-024 Item 16 – the player bio card. When a member who has claimed their player saves their profile, the tools app posts (or EDITS) one formatted card
// in the channel set for the purpose `member_bios`: player, positions, game IDs, play schedule and, only if the member switched them on, country, age and
// language. It mentions the player and, if a ping role is configured for the group `ping_bios`, that role: never @everyone. One card per member: a later
// save edits the same message (and pings nobody again); an unchanged card is not touched at all.
// Channel and role come from the Organization config (bot/orgconfig.js), never from code. No channel set = nothing is posted and the reason is returned.
import { flagOn } from './roles.js';
import { message, header, text, sep, footer, cards, bannerUrl } from './ui.js';
import { orgName, channelFor, pingRoleFor } from './orgconfig.js';
import { discord } from './servertools.js';
import { BIO_SHOW_DEFAULT, profileOut } from './profiles.js';
import { prettyDay } from './birthday.js';

export const BIO_FLAG = 'bioCard';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ID_LABEL = { psn: 'PSN', xbox: 'Xbox', ea: 'EA ID', steam: 'Steam' };
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
const flagOf = (cc) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');
const metaGet = async (env, key) => { try { return JSON.parse(await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first('value')); } catch { return null; } };
const metaSet = (env, key, v) => env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(v)).run();

/** the 7 play-time ints (bit h = plays hour h) as short lines: "Mon 18:00–23:00" */
export function scheduleLines(playTimes) {
  if (!Array.isArray(playTimes)) return [];
  const out = [];
  playTimes.slice(0, 7).forEach((bits, d) => {
    const runs = []; let start = null;
    for (let h = 0; h <= 24; h++) {
      const on = h < 24 && (bits >> h) & 1;
      if (on && start === null) start = h;
      if (!on && start !== null) { runs.push(`${String(start).padStart(2, '0')}:00–${String(h % 24).padStart(2, '0')}:00`); start = null; }
    }
    if (runs.length) out.push(`${DAYS[d]} ${runs.slice(0, 2).join(', ')}`);
  });
  return out;
}

/** the card for one member: { msg, hash } – the hash covers what is shown, so an unchanged card is not edited. Shows only what the member chose to share. */
export function bioMessage(env, { user, claim, profile, pingRole = null, first = true }) {
  const show = { ...BIO_SHOW_DEFAULT, ...(profile.bioShow ?? {}) };
  const name = claim?.player_name || user.name;
  const ids = Object.entries(profile.ids ?? {}).filter(([k, v]) => v && ID_LABEL[k]).map(([k, v]) => `${ID_LABEL[k]} \`${clip(v, 32)}\``);
  const sched = scheduleLines(profile.playTimes);
  const rows = [
    ['🧑 Player', `**${clip(name, 40)}**${profile.platform ? ` · ${profile.platform}` : ''}`],
    profile.positions?.length ? ['📍 Positions', profile.positions.join(' · ')] : null,
    profile.rushPositions?.length ? ['⚡ Rush', profile.rushPositions.join(' · ')] : null,
    show.ids && ids.length ? ['🎮 Game IDs', ids.join(' · ')] : null,
    show.schedule && sched.length ? ['🕒 Plays', `${sched.join('\n')}${profile.tz ? `\n-# times in ${profile.tz}` : ''}`] : null,
    show.country && profile.country ? ['🌍 Country', `${flagOf(profile.country)} ${profile.country}`] : null,
    show.age && profile.age ? ['🎂 Age', String(profile.age)] : null,
    show.birthday && prettyDay(profile.birthday) ? ['🎈 Birthday', prettyDay(profile.birthday)] : null, // day and month only, never a year (PF-024 Item 19)
    show.language && profile.language ? ['💬 Language', clip(profile.language, 24)] : null,
  ].filter(Boolean);
  const body = [header({ eyebrow: `${orgName(env)} · Player bio`, title: clip(name, 40), sub: profile.bio ? clip(profile.bio, 120) : 'New bio', thumb: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null, size: 3 }),
    text(rows.map(([k, v]) => `**${k}**\n${v}`).join('\n\n')), sep(), footer('Edit your bio on the site any time: this card updates itself. Only what you chose to share is shown.')];
  const ping = `<@${user.id}>${first && pingRole ? ` <@&${pingRole}>` : ''}`;
  const msg = message({ accent: 'red', ping, mentions: first ? { users: [user.id], roles: pingRole ? [pingRole] : [] } : { parse: [] }, blocks: [cards(bannerUrl(env, 'bio')), ...body] });
  return { msg, hash: JSON.stringify(rows) + JSON.stringify(profile.bio ?? '') + name };
}

/** Called after a profile save. → { posted: 'new' | 'edited' } or { skipped: reason }. Never throws. */
export async function postBio(env, me, { discordFn = discord } = {}) {
  try {
    if (!env.DB || !env.DISCORD_BOT_TOKEN) return { skipped: 'not-set-up' };
    if (!flagOn(env, me, BIO_FLAG)) return { skipped: 'flag-off' };
    const claim = await env.DB.prepare("SELECT player, player_name FROM claims WHERE user_id = ? AND status = 'approved'").bind(me.u).first();
    if (!claim) return { skipped: 'no-claim' };
    const channel = await channelFor(env, 'member_bios');
    if (!channel) return { skipped: 'no-channel' }; // the purpose is not set in the Organization config: say so, never guess a channel
    const [user, row, rec] = await Promise.all([env.DB.prepare('SELECT id, name, avatar FROM users WHERE id = ?').bind(me.u).first(), env.DB.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(me.u).first(), metaGet(env, `bio_msg:${me.u}`)]);
    if (!user || !row) return { skipped: 'no-profile' };
    const profile = profileOut(row), pingRole = await pingRoleFor(env, 'ping_bios');
    if (rec && rec.c === channel) {
      const { msg, hash } = bioMessage(env, { user, claim, profile, pingRole, first: false });
      if (rec.h === hash) return { skipped: 'unchanged' };
      try { await discordFn(env, 'PATCH', `/channels/${channel}/messages/${rec.m}`, { flags: msg.flags, components: msg.components, allowed_mentions: msg.allowed_mentions }); await metaSet(env, `bio_msg:${me.u}`, { c: channel, m: rec.m, h: hash }); return { posted: 'edited' }; }
      catch (e) { if (e.status !== 404) throw e; /* the card was deleted: post a fresh one below */ }
    }
    const { msg, hash } = bioMessage(env, { user, claim, profile, pingRole, first: true });
    const sent = await discordFn(env, 'POST', `/channels/${channel}/messages`, msg);
    if (sent?.id) await metaSet(env, `bio_msg:${me.u}`, { c: channel, m: sent.id, h: hash });
    return { posted: 'new' };
  } catch (e) { console.log('bio card failed', e.message); return { skipped: 'error' }; }
}
