// Bot Studio: one list of every message and image the Phoenix apps put into Discord.
// Built from the capture files that tools/bot-audit writes (real Worker runs + the code's own builders), so nothing here
// is hand-written sample output. Pure reads: no bot code is touched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, APP_COMMANDS, MOVED_FROM, STAFF_COMMANDS } from '../../../bot/commanddefs.js';
import { APP_LABEL } from '../../../bot/apps.js';
import { FLAG_OF, SLASH_DEST, UNCAPTURED } from '../../bot-audit/registry.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const AUDIT_OUT = path.join(ROOT, 'tools/bot-audit/out/');
export const STUDIO_OUT = path.join(ROOT, 'tools/bot-studio/out/');
export const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const config = () => readJson(path.join(ROOT, 'config.json'));

export const flat = (cs = [], out = []) => { for (const c of cs ?? []) { if (!c) continue; out.push(c); if (c.components) flat(c.components, out); if (c.accessory) out.push(c.accessory); } return out; };
export const textOf = (b) => [b?.content, ...flat(b?.components).filter((c) => c.type === 10).map((c) => c.content), ...(b?.embeds ?? []).flatMap((e) => [e.author?.name, e.title, e.description, ...(e.fields ?? []).map((f) => `${f.name} ${f.value}`), e.footer?.text])].filter(Boolean).join('\n');
export const customIds = (b) => [...new Set(flat(b?.components).map((c) => c.custom_id).filter(Boolean)), ...(b?.custom_id ? [b.custom_id] : [])];
// Card files a message shows: drawn cards served from the site, or uploaded as attachments.
export const cardFiles = (b) => [...new Set([...JSON.stringify(b ?? {}).matchAll(/(?:\/cards\/|attachment:\/\/)([A-Za-z0-9_.\-]+\.png)/g)].map((m) => m[1]))];
export const imageUrls = (b) => [...new Set([...flat(b?.components).flatMap((c) => (c.type === 12 ? (c.items ?? []).map((i) => i.media?.url) : c.type === 11 ? [c.media?.url] : [])), ...(b?.embeds ?? []).flatMap((e) => [e.image?.url, e.thumbnail?.url]), b?.avatar_url].filter(Boolean))];

const appOf = (cmd) => Object.entries(APP_COMMANDS).find(([, l]) => l.includes(cmd))?.[0] ?? 'core';
const def = (cmd) => COMMANDS.find((c) => c.name === cmd);
const hasVisible = (d) => !!(d && (d.components?.length || d.embeds?.length || d.content));
const chanPurpose = (url) => { const m = url.match(/channels\/CH-([a-z_]+)\//); return m ? m[1] : /\/channels\/DM-|\/users\//.test(url) ? 'DM' : /\/webhooks\/\d+\/x/.test(url) ? 'webhook' : null; };

// One captured interaction → the messages a person would see, in order.
function messagesOf(rec) {
  const out = [], r = rec.response;
  if (r?.type === 9) out.push({ kind: 'modal', via: 'opens a form', body: r.data });
  else if (hasVisible(r?.data)) out.push({ kind: (r.data.flags ?? 0) & 64 ? 'private' : 'reply', via: r.type === 7 ? 'edits the message in place' : 'instant reply', body: r.data });
  const deferredPrivate = r?.type === 5 && ((r.data?.flags ?? 0) & 64);
  for (const c of rec.calls ?? []) {
    if (!hasVisible(c.body)) continue;
    const dest = chanPurpose(c.url), original = /@original/.test(c.url) || /\/webhooks\/\d+\/tok/.test(c.url);
    const kind = original ? (((c.body.flags ?? 0) & 64) || deferredPrivate ? 'private' : 'reply') : dest === 'DM' ? 'dm' : dest === 'webhook' ? 'webhook' : 'channel';
    out.push({ kind, via: original ? 'reply after thinking' : dest === 'DM' ? 'direct message' : dest === 'webhook' ? 'webhook post' : `posted to ${dest ? '#' + dest : 'a channel'}`, dest, body: c.body, files: c.body.files });
  }
  return out;
}
const normId = (id) => String(id).replace(/\d{3,}/g, 'N').replace(/:\d+(?=:|$)/g, ':#');
const levelOf = (cfg, flag) => (flag && cfg.features?.[flag]) || null;
const statusOf = (level, staff, extra) => extra ?? (level === 'owner' ? 'owner testing' : level === 'managers' || staff ? 'staff only' : 'live');

// What each drawn card kind is, and the function that draws it (scripts/cards.mjs).
export const CARD_KINDS = {
  score: { name: 'Score card', fn: 'scoreCard', usedBy: ['slash:/last', 'auto:result-panel'], what: 'Final score, crests, division and scorers for one match.' },
  field: { name: 'Lineup on the pitch', fn: 'fieldCard', usedBy: ['slash:/last', 'auto:result-panel'], what: 'Who played where, with match ratings.' },
  box: { name: 'Box score', fn: 'boxScoreCard', usedBy: ['slash:/last'], what: 'Per-player stat table for one match.' },
  player: { name: 'Player card', fn: 'playerCard', usedBy: ['slash:/player', 'slash:/me'], what: 'Season numbers and rating graph for one player.' },
  compare: { name: 'Compare card', fn: 'compareCard', usedBy: ['slash:/compare'], what: 'Two players side by side.' },
  top: { name: 'Leaderboard card', fn: 'tableCard', usedBy: ['slash:/leaderboard'], what: 'Top ten for one stat.' },
  club: { name: 'Club card', fn: 'clubCard', usedBy: ['slash:/club'], what: 'Record, division and form.' },
  results: { name: 'Recent results card', fn: 'resultsCard', usedBy: ['slash:/results'], what: 'The last eight results.' },
  banner: { name: 'Banner', fn: 'BANNERS', usedBy: [], what: 'A fixed wide picture that sets the scene above the text.' },
};
const BANNER_USE = { jail: ['slash:/jail'], wheel: ['slash:/wheel'], discovery: ['auto:discovery', 'slash:/share'], matchnight: ['auto:event-league', 'auto:event-rush'] };

export function loadModel() {
  const cfg = config();
  const caps = readJson(AUDIT_OUT + 'captures.json'), auto = readJson(AUDIT_OUT + 'auto.json'), manifest = readJson(AUDIT_OUT + 'cards.json');
  const entries = [];
  const push = (e) => entries.push({ related: [], destinations: [], messages: [], ...e });

  // ---- slash commands: one entry per command, every option variant as its own message ----
  const byCmd = new Map();
  for (const c of caps.filter((x) => x.kind === 'slash')) (byCmd.get(c.command) ?? byCmd.set(c.command, []).get(c.command)).push(c);
  for (const [cmd, recs] of byCmd) {
    const d = def(cmd), flag = FLAG_OF[cmd], level = levelOf(cfg, flag), staff = STAFF_COMMANDS.includes(cmd), app = recs[0].app ?? appOf(cmd);
    const messages = recs.flatMap((rec) => messagesOf(rec).map((m) => ({ ...m, label: rec.trigger.trim() })));
    const dests = new Set(messages.map((m) => (m.kind === 'private' ? 'private reply' : m.kind === 'dm' ? 'DM' : m.kind === 'channel' ? `#${m.dest ?? 'configured channel'}` : m.kind === 'modal' ? 'form' : 'reply in the channel')));
    for (const x of SLASH_DEST[cmd] ?? []) dests.add(x);
    push({ id: `slash:/${cmd}`, name: `/${cmd}`, summary: d?.description ?? '', category: 'slash', app, command: cmd,
      trigger: `/${cmd}${d?.options?.some((o) => o.type === 1) ? ' <subcommand>' : ''}`, schedule: 'when someone runs it', destinations: [...dests],
      flag: flag ?? null, level: level ?? (staff ? 'managers' : 'public'), status: statusOf(level, staff), source: null,
      note: MOVED_FROM[cmd] ? `Lives on ${APP_LABEL[app]} (moved from ${APP_LABEL[MOVED_FROM[cmd]]}).` : null, messages });
  }
  // ---- buttons, menus and forms: grouped by the shape of their custom_id ----
  const comps = new Map();
  for (const c of caps.filter((x) => x.kind === 'component' || x.kind === 'modal-submit')) {
    const raw = c.trigger.replace(/^(select|button|modal) /, ''), key = normId(raw);
    (comps.get(key) ?? comps.set(key, { raw, recs: [] }).get(key)).recs.push(c);
  }
  for (const [key, g] of comps) {
    const first = g.recs[0], cmd = first.command ?? null, flag = cmd && FLAG_OF[cmd], level = levelOf(cfg, flag);
    const what = first.kind === 'modal-submit' ? 'Form submit' : /^select/.test(first.trigger) ? 'Menu' : 'Button';
    const messages = g.recs.flatMap((rec) => messagesOf(rec).map((m) => ({ ...m, label: rec.label ? `“${rec.label}”` : '' })));
    if (!messages.length) continue;
    push({ id: `comp:${key}`, name: `${what}${first.label ? ` “${first.label}”` : ''}`, summary: key, category: first.kind === 'modal-submit' ? 'form' : 'component', app: first.app ?? (cmd ? appOf(cmd) : 'core'), command: cmd, customId: g.raw,
      trigger: `${what.toLowerCase()} press${cmd ? ` under /${cmd}` : ''}`, schedule: 'on click', destinations: [messages[0].kind === 'private' ? 'private reply' : messages[0].kind === 'modal' ? 'form' : 'in place'],
      flag: flag ?? null, level: level ?? 'public', status: statusOf(level, cmd && STAFF_COMMANDS.includes(cmd)), source: null, related: cmd ? [`slash:/${cmd}`] : [], messages });
  }
  // ---- automated posts and DMs ----
  for (const a of auto.items) {
    if (!a.bodies?.length) continue;
    const isDm = a.category === 'DM', level = a.level ?? levelOf(cfg, a.flag);
    const app = isDm ? 'core' : /lfg|rush|season/.test(a.id) ? 'rush' : /event/.test(a.id) ? 'matchday' : /birthday/.test(a.id) ? 'fun' : 'core';
    const [file, fn] = String(a.source ?? '').split(' ');
    push({ id: a.id, name: a.name, summary: '', category: isDm ? 'dm' : 'automated', app, trigger: a.trigger, schedule: a.schedule ?? '', destinations: a.destination ?? [], flag: a.flag ?? null, level: level ?? 'public',
      status: a.status ?? statusOf(level, false), source: file || null, builder: fn?.replace(/\(\)$/, '') ?? null, related: a.related ?? [], how: a.how, control: a.control ?? null,
      messages: a.bodies.map((b, k) => ({ kind: isDm ? 'dm' : b.username || b.avatar_url ? 'webhook' : 'channel', via: isDm ? 'direct message' : 'posted by the bot', body: b, files: b.files, label: a.bodies.length > 1 ? `sample ${k + 1}` : '' })) });
  }
  // ---- known outputs with no offline capture (needs live Discord, EA or an AI model) ----
  for (const u of UNCAPTURED) {
    const [file, fn] = String(u.source ?? '').split(' ');
    push({ id: u.id, name: u.name, summary: '', category: 'automated', app: /dj/.test(u.id) ? 'dj' : /event|lineup/.test(u.id) ? 'matchday' : 'core', trigger: u.trigger, schedule: u.schedule ?? '', destinations: u.destination ?? [], flag: u.flag ?? null,
      level: u.level ?? 'public', status: u.status ?? statusOf(u.level, false), source: file?.replace(/,$/, '') || null, builder: fn?.replace(/\(\)$/, '') ?? null, related: u.related ?? [], uncaptured: u.why, control: u.control ?? null, messages: [] });
  }
  // ---- images: one sample of every picture the apps and the site put into Discord ----
  const img = (id, name, file, extra) => push({ id: `image:${id}`, name, category: 'image', app: 'core', trigger: 'drawn at site build (scripts/cards.mjs)', schedule: 'redrawn when the data or TEMPLATE_VERSION changes', destinations: ['attached to the messages listed'], level: 'public', status: 'live', source: 'scripts/cards.mjs', image: file, messages: [], ...extra });
  const firstMatch = Object.values(manifest.match ?? {})[0] ?? {};
  for (const k of ['score', 'field', 'box']) if (firstMatch[k]) img(k, CARD_KINDS[k].name, firstMatch[k], { summary: CARD_KINDS[k].what, builder: CARD_KINDS[k].fn, related: CARD_KINDS[k].usedBy });
  const one = (o) => Object.values(o ?? {})[0];
  if (one(manifest.player)) img('player', CARD_KINDS.player.name, one(manifest.player), { summary: CARD_KINDS.player.what, builder: 'playerCard', related: CARD_KINDS.player.usedBy });
  const cmp = one(one(manifest.compare) ?? {});
  if (cmp) img('compare', CARD_KINDS.compare.name, cmp, { summary: CARD_KINDS.compare.what, builder: 'compareCard', related: CARD_KINDS.compare.usedBy });
  for (const [stat, file] of Object.entries(manifest.top ?? {})) img(`top-${stat}`, `Leaderboard card: ${stat}`, file, { summary: CARD_KINDS.top.what, builder: 'tableCard', related: CARD_KINDS.top.usedBy });
  if (manifest.club) img('club', CARD_KINDS.club.name, manifest.club, { summary: CARD_KINDS.club.what, builder: 'clubCard', related: CARD_KINDS.club.usedBy });
  if (manifest.results) img('results', CARD_KINDS.results.name, manifest.results, { summary: CARD_KINDS.results.what, builder: 'resultsCard', related: CARD_KINDS.results.usedBy });
  for (const [name, file] of Object.entries(manifest.banner ?? {})) img(`banner-${name}`, `Banner: ${name}`, file, { summary: CARD_KINDS.banner.what, builder: 'BANNERS', related: BANNER_USE[name] ?? [] });
  push({ id: 'image:site-share', name: 'Site link preview', summary: 'What Discord shows under any pasted site link (the Open Graph image).', category: 'image', app: 'core', trigger: 'someone pastes a site link', schedule: 'fetched by Discord', destinations: ['any channel'], level: 'public', status: 'live', source: 'phoenix/overlay/share.png', image: '@share', unfurl: true, related: ['slash:/site'], messages: [] });
  for (const [id, name, src, why] of [
    ['cardstudio', 'Card Studio player card', 'bot/cardstudio.js', 'Needs the image model and a member photo. The prompts are in bot/cardstudio.js and the crop in web/cardcomposer.js.'],
    ['avatarcard', 'Avatar card background', 'bot/avatarcard.js', 'Needs the image model and an uploaded avatar.'],
    ['hype', 'Hype poster art', 'bot/hype.js', 'Needs the image model and a hype channel.'],
    ['voicecard', 'Voice clip quote card', 'bot/voicerecap.js', 'Needs a transcript and the image model.'],
  ]) push({ id: `image:${id}`, name, summary: '', category: 'image', app: 'core', trigger: 'generated by the image model', schedule: 'on request or by the 10-minute cron', destinations: ['DM', 'channel'], level: 'owner', status: 'owner testing', source: src, uncaptured: why, messages: [] });

  return { entries, manifest, cfg, apps: APP_LABEL, purposes: [], failures: auto.failures ?? [] };
}

// Where a card file on disk is, for a name found in a message (attachments are named score-<match>.png, the files score-<match>-<hash>.png).
export function cardPath(manifest, name) {
  const dir = AUDIT_OUT + 'cards/';
  if (fs.existsSync(dir + name)) return dir + name;
  const m = /^(score|field|box)-(\d+)\.png$/.exec(name);
  const f = m && manifest.match?.[m[2]]?.[m[1]];
  return f && fs.existsSync(dir + f) ? dir + f : null;
}
