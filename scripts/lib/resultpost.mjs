// The auto-posted result of a new home match (design system: score card on top, goals/assists/MOTM, field view of ratings, buttons).
// Used by scripts/post-results.mjs, which runs after the site build and the Discord cards so the pictures exist; scripts/fetch.mjs
// calls it straight away only when posts aren't deferred (no cards then – the same layout without the pictures).
import fs from 'node:fs';
import path from 'node:path';
import { loadBotSettings, num } from '../lib.mjs';
import { resolveRoute, requestMatchAlert } from './org.mjs';
import { alertLine, loseByOf } from '../../bot/matchalert.js';
import { matchComponents } from '../../bot/matchcard.js';
import { message, header, facts, footer, resultAccent, cards, label, tagBlock } from '../../bot/ui.js';
import { clubTag } from './clubtag.mjs';
import { it } from '../../bot/icons.js';

// New home results → Discord. With the bot token and the discordMatch flag on for members/public, each result is
// posted by the bot into the webhook's channel with the P7.2 "Show my match" menu (plain webhooks can't carry
// interactive components); if that fails, or otherwise, it goes through the webhook as before.
// matches: raw EA matches (newest last). drawn: { dir, manifest } of site/cards + site/api/cards.json, or null.
export async function postResults(matches, { config, homeId, orgIds = [homeId], hidden = [], drawn = null, route = resolveRoute, org = null, alert = requestMatchAlert, noAlert = [] }) {
  const hook = process.env.DISCORD_WEBHOOK;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!matches.length) return;
  const settings = await loadBotSettings(config); // P7.5 – result channel override, ping role, emoji, on/off
  if (!settings.autoPosts.results) return;
  // The bot path needs only the token + the per-club match_results channel; the webhook secret is just the fallback.
  const interactive = token && ['members', 'public'].includes(settings.flags?.discordMatch ?? config.features?.discordMatch); // live Boardroom switch first, committed config as the fallback
  if (!hook && !interactive) {
    const why = 'no way to post: DISCORD_WEBHOOK is empty and the bot-token path is off (no DISCORD_BOT_TOKEN, or the discordMatch flag is not members/public)';
    console.warn(`Results NOT posted: ${why}`);
    return { posted: 0, missing: [{ club: 'all', purpose: 'match_results', why }] };
  }
  const flagOn = (k) => ['members', 'public'].includes(settings.flags?.[k] ?? config.features?.[k]);
  const matchPictureOn = flagOn('matchPicture'), reviewOn = flagOn('matchReview');
  const site = config.siteUrl?.replace(/\/?$/, '/') ?? '';
  const crestCdn = 'https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l';
  const hide = new Set([...(config.hiddenPlayers || []), ...hidden].map((h) => String(h).toLowerCase()));
  const items = matches
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-10)
    .map((m) => {
      // Source club: the organization club the match was fetched from (derbies: the first of ours in it). Its ID routes the post.
      const src = [m.fetchedFrom, ...orgIds, homeId].find((id) => id && m.clubs[id]);
      const us = m.clubs[src];
      const kind = m.matchType === 'playoffMatch' ? 'Playoff' : m.matchType === 'friendlyMatch' ? 'Friendly' : 'League';
      const tag = clubTag({ src, type: kind.toLowerCase(), org, config }); // which of our clubs this is – the pill on every output
      const oppId = Object.keys(m.clubs).find((k) => k !== src);
      const opp = m.clubs[oppId];
      const oppName = opp.details?.name ?? opp.name ?? oppId; // EA sometimes omits details – never show the bare club ID if a name exists
      const res = us.wins === '1' ? 'W' : us.losses === '1' ? 'L' : 'D';
      const ourIds = Object.entries(m.players?.[src] || {}).filter(([pid, p]) => !hide.has(pid.toLowerCase()) && !hide.has(String(p.playername).toLowerCase()));
      const ours = ourIds.map(([, p]) => p);
      const list = (f) => ours.filter((p) => num(p[f]) > 0).map((p) => `${p.playername}${num(p[f]) > 1 ? ` ×${p[f]}` : ''}`).join('\n');
      const motm = Object.values(m.players || {}).flatMap((l) => Object.values(l)).find((p) => p.mom === '1');
      const best = [...ours].sort((a, b) => num(b.rating) - num(a.rating))[0];
      const oppCrest = opp.details?.customKit?.crestAssetId;
      const url = site ? `${site}matches/${m.matchId}.html` : undefined;
      const components = matchComponents(m.matchId, ourIds.map(([k, p]) => ({ k, n: p.playername, r: num(p.rating), g: num(p.goals), a: num(p.assists) })), url);
      const clubName = us.details?.name ?? us.name ?? config.siteTitle ?? 'Club';
      // Drawn pictures are attached to the post itself (attachment://), so nothing has to be deployed before Discord can show them.
      const files = [];
      const pic = (kind, alt) => {
        const file = drawn?.manifest?.match?.[m.matchId]?.[kind];
        if (!file || !fs.existsSync(path.join(drawn.dir, file))) return null;
        files.push({ name: `${kind}-${m.matchId}.png`, path: path.join(drawn.dir, file) });
        return { url: `attachment://${kind}-${m.matchId}.png`, alt };
      };
      // The merged match picture (flag matchPicture) replaces the score card and the field view with one picture.
      const mergedFile = matchPictureOn ? drawn?.manifest?.match?.[m.matchId]?.picture : null;
      const mergedImg = mergedFile && fs.existsSync(path.join(drawn.dir, mergedFile)) ? pic('picture', `${clubName} ${us.goals}–${opp.goals} ${oppName}: scoreboard, goals and assists, man of the match, team stats, rating by line and the field view with every player's rating`) : null;
      const scoreImg = mergedImg ? null : pic('score', `${clubName} ${us.goals}–${opp.goals} ${oppName}`);
      const fieldImg = mergedImg ? null : pic('field', 'Our players on the pitch with their match ratings');
      // Message 2: the match review picture, posted right after the result (flag matchReview; skipped when the picture was not drawn).
      const reviewFiles = [];
      const reviewFile = drawn?.manifest?.match?.[m.matchId]?.review;
      const reviewImg = reviewOn && reviewFile && fs.existsSync(path.join(drawn.dir, reviewFile)) ? (reviewFiles.push({ name: `review-${m.matchId}.png`, path: path.join(drawn.dir, reviewFile) }), { url: `attachment://review-${m.matchId}.png`, alt: 'Match review: what went well, what to work on, next match targets and recommendations for the squad' }) : null;
      const reviewPanel = () => message({ accent: 'steel', blocks: [
        tagBlock(tag, kind),
        header({ eyebrow: `${clubName} · Match review`, title: `${clubName} vs ${oppName}`, sub: `Insights and recommendations · <t:${m.timestamp}:f>`, thumb: site ? `${site}assets/crest.png` : undefined }),
        cards(reviewImg),
        footer('Written from the match numbers'),
      ] });
      const panel = (ping, mentions) => message({ accent: resultAccent(res), ping, mentions, blocks: [
        tagBlock(tag, kind),
        header({
          eyebrow: `${clubName} · Match centre · ${kind}`,
          title: `${settings.emoji ? `${settings.emoji} ` : ''}${clubName} ${mergedImg ? 'vs' : `${us.goals}–${opp.goals}`} ${oppName}`, // the score is in the merged picture
          sub: `<t:${m.timestamp}:f> · ${{ W: 'Win', D: 'Draw', L: 'Defeat' }[res]}`,
          thumb: res === 'L' && oppCrest ? `${crestCdn}${oppCrest}.png` : site ? `${site}assets/crest.png` : undefined,
        }),
        cards(mergedImg ?? scoreImg),
        mergedImg ? null : facts([[`${it('goal')} Goals`, list('goals').replace(/\n/g, ', ')], [`${it('assist')} Assists`, list('assists').replace(/\n/g, ', ')], [`${it('motm')} Man of the match`, motm ? `${motm.playername} (${num(motm.rating).toFixed(1)})` : ''], ['📈 Top rated', best ? `${best.playername} (${num(best.rating).toFixed(1)})` : '']]),
        fieldImg ? label('Field view · ratings') : null,
        cards(fieldImg),
        footer(mergedImg ? 'Pick your name below to see your own match' : fieldImg ? 'Gold = man of the match · green 7+ · orange 6–6.9 · red under 6 · pick your name below to see your own match' : 'Pick your name below to see your own match'),
        ...components,
      ] });
      return { src, matchId: m.matchId, us: num(us.goals), them: num(opp.goals), oppName, ts: m.timestamp, components, files, panel, review: reviewImg ? { panel: reviewPanel, files: reviewFiles } : null, embed: {
        author: { name: `${tag.important ? '🚨 ' : ''}${tag.label} · ${kind.toUpperCase()}` },
        title: `${settings.emoji ? `${settings.emoji} ` : ''}${clubName} ${us.goals}–${opp.goals} ${oppName}`,
        url,
        color: { W: 0x22c55e, D: 0xeab308, L: 0xef4444 }[res],
        description: res === 'W' ? '✅ **Victory**' : res === 'L' ? '❌ **Defeat**' : '➖ **Draw**',
        thumbnail: { url: res === 'L' && oppCrest ? `${crestCdn}${oppCrest}.png` : `${site}assets/crest.png` },
        fields: [
          list('goals') && { name: '⚽ Goals', value: list('goals'), inline: true },
          list('assists') && { name: '🎯 Assists', value: list('assists'), inline: true },
          motm && { name: '⭐ Man of the match', value: `${motm.playername} (${num(motm.rating).toFixed(1)})`, inline: true },
          best && { name: '📈 Our top rated', value: `${best.playername} (${num(best.rating).toFixed(1)})`, inline: true },
        ].filter(Boolean),
        timestamp: new Date(m.timestamp * 1000).toISOString(),
        footer: { text: `${tag.label} · ${kind} match` },
      } };
    });
  // A "role" equal to the server's own ID is @everyone: <@&id> renders as "@@everyone" and pings nobody, so say it the way Discord expects.
  const everyone = !!settings.pingRole && settings.pingRole === settings.guildId;
  const pingContent = everyone ? '@everyone' : settings.pingRole ? `<@&${settings.pingRole}>` : undefined;
  const allowedMentions = everyone ? { parse: ['everyone'] } : settings.pingRole ? { roles: [settings.pingRole] } : { parse: [] };
  const missing = []; // destinations that did not resolve – reported, never replaced by another channel
  const report = (src, why) => { missing.push({ club: src, purpose: 'match_results', why }); console.warn(`Result post skipped for club ${src}: ${why}`); };
  if (interactive) {
    // Destination per source club: Organization config (club → division → org scope) via the Worker. A club with no match_results destination is reported.
    const cache = new Map();
    for (const item of items) {
      if (!cache.has(item.src)) cache.set(item.src, await route(config, 'match_results', item.src));
      const dest = cache.get(item.src);
      if (!dest.ok) { item.failed = true; report(item.src, `destination lookup failed (${dest.error})`); continue; }
      if (!dest.channelId) { item.failed = true; report(item.src, 'no match_results channel configured (club, division or organization scope) – set one in Boardroom → Organization'); continue; }
      const send = (card, ping, mentions) => {
        const payload = card.panel(ping, mentions);
        let body, headers = { Authorization: `Bot ${token}` };
        if (card.files.length) { // pictures ride along as attachments
          body = new FormData();
          body.set('payload_json', JSON.stringify(payload));
          card.files.forEach((f, k) => body.set(`files[${k}]`, new Blob([fs.readFileSync(f.path)], { type: 'image/png' }), f.name));
        } else { body = JSON.stringify(payload); headers['Content-Type'] = 'application/json'; }
        return fetch(`https://discord.com/api/v10/channels/${dest.channelId}/messages`, { method: 'POST', headers, body }).catch((e) => ({ ok: false, status: e.message }));
      };
      const r = await send(item, pingContent, allowedMentions);
      console.log(`Result ${item.matchId} (club ${item.src}) → channel ${dest.channelId} [scope ${dest.scope ?? '?'}, guild ${dest.guildId ?? '?'}] → Discord ${r.status}`);
      if (!r.ok) { item.failed = true; report(item.src, `Discord refused the post (${r.status}) – the bot needs View Channel + Send Messages + Embed Links in <#${dest.channelId}>`); continue; }
      if (item.review) await send(item.review, undefined, { parse: [] }); // the review goes right after its result, same channel, no ping
    }
  } else {
    // No bot token / flag off: the plain webhook IS the configured destination (the deployment's own DISCORD_WEBHOOK secret), as before.
    await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: config.siteTitle ?? 'Phoenix Fire', avatar_url: site ? `${site}assets/crest.png` : undefined, content: pingContent, embeds: items.map((x) => x.embed), allowed_mentions: allowedMentions }),
    }).catch((e) => console.warn('Discord post failed:', e.message));
  }
  // Match alert: a result that trips the rule (default: a defeat by 3 or more, config.matchAlert.loseBy) asks the Worker for the alert,
  // right after the result and its review. Only results that really went out; a manual repost never alerts twice.
  const loseBy = loseByOf(config);
  for (const item of items) {
    if (noAlert.includes(String(item.matchId)) || item.failed || !alertLine(item.us, item.them, loseBy)) continue;
    const when = new Date(item.ts * 1000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const r = await alert(config, { opponent: item.oppName, us: item.us, them: item.them, when, loseBy });
    console.log(`Match alert ${item.matchId} (${item.us}–${item.them}) → ${r.ok ? `posted ${r.posted}${r.reason ? ` (${r.reason})` : ''}` : `NOT sent: ${r.reason}`}`);
    if (!r.ok || !r.posted) console.warn(`::warning title=Match alert::not posted for ${item.matchId}: ${r.reason ?? 'no match_results channel set in the Organization config'}`);
  }
  if (missing.length) {
    fs.mkdirSync('.outbox', { recursive: true });
    fs.writeFileSync(path.join('.outbox', 'missing-destinations.json'), JSON.stringify({ at: new Date().toISOString(), missing }, null, 2));
  }
  return { posted: items.length - missing.length, missing };
}
