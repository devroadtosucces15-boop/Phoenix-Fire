// Bot output audit, step 3: combine captures + registry into ONE self-contained page: PLANNING/bot-audit.html.
// Run from the repo root:  node tools/bot-audit/build.mjs   (after render-cards.mjs, capture.mjs, capture-auto.mjs; `node tools/bot-audit/run.mjs` does all four)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, APP_COMMANDS, MOVED_FROM, HELD, STAFF_COMMANDS } from '../../bot/commanddefs.js';
import { FLAG_OF, SLASH_DEST, UNCAPTURED } from './registry.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
const config = JSON.parse(fs.readFileSync(ROOT + 'config.json', 'utf8'));
const caps = JSON.parse(fs.readFileSync(OUT + 'captures.json', 'utf8'));
const auto = JSON.parse(fs.readFileSync(OUT + 'auto.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync(OUT + 'cards.json', 'utf8'));
const wrangler = fs.readFileSync(ROOT + 'bot/wrangler.toml', 'utf8');
const live = (k) => new RegExp(`DISCORD_APP_ID_${k}\\s*=\\s*"\\d+"`).test(wrangler) && new RegExp(`APP_LIVE_SINCE_${k}\\s*=`).test(wrangler);
const APP_NAME = { core: 'Phoenix Fire', stats: 'Phoenix Stats', tools: 'Phoenix Tools', fun: 'Phoenix Fun', matchday: 'Phoenix Matchday', rush: 'Phoenix Rush' };
const appOf = (cmd) => Object.entries(APP_COMMANDS).find(([, l]) => l.includes(cmd))?.[0] ?? 'core';
const botFiles = fs.readdirSync(ROOT + 'bot').filter((f) => f.endsWith('.js'));
const srcCache = Object.fromEntries(botFiles.map((f) => [f, fs.readFileSync(ROOT + 'bot/' + f, 'utf8')]));
const sourceOfCmd = (n) => { for (const f of botFiles) { if (['worker.js', 'commanddefs.js', 'botcommands.js', 'apps.js'].includes(f)) continue; if (new RegExp(`['"]${n}['"]`).test(srcCache[f]) || new RegExp(`name === '${n}'`).test(srcCache[f])) return 'bot/' + f; } return 'bot/worker.js'; };
const sourceOfId = (id) => { const p = id.match(/(?:norex|pf):([a-z]+)/i)?.[1]; if (!p) return 'bot/worker.js'; for (const f of botFiles) if (f !== 'worker.js' && srcCache[f].includes(`:${p}:`)) return 'bot/' + f; return 'bot/worker.js'; };

// ---------- flatten helpers ----------
const flat = (cs = [], o = []) => { for (const c of cs) { o.push(c); if (c.components) flat(c.components, o); if (c.accessory) o.push(c.accessory); } return o; };
const textOf = (b) => [b?.content, ...flat(b?.components).filter((c) => c.type === 10).map((c) => c.content), ...(b?.embeds ?? []).flatMap((e) => [e.title, e.description, ...(e.fields ?? []).map((f) => f.name + ' ' + f.value)])].filter(Boolean).join('\n');
const norm = (s) => s.replace(/<[@#t:&]+[^>]*>/g, '').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
const PALETTE = new Set([0xe8651a, 0xefcf7a, 0x4be08a, 0xff7d72, 0x6c7890]);
const chanPurpose = (url) => { const m = url.match(/channels\/(CH-[a-z_]+)\//); return m ? m[1].slice(3) : url.includes('/channels/DM-') || url.includes('/users/') ? 'DM' : url.includes('/webhooks/') ? 'webhook' : null; };
const levelOf = (flag) => (flag && config.features?.[flag]) || null;
const statusOf = (level, staff, extra) => extra ?? (level === 'owner' ? 'owner testing' : level === 'managers' || staff ? 'staff only' : 'active now');

function notesFor(b, ctx = {}) {
  const n = [];
  const txt = textOf(b), cs = flat(b.components);
  const isV2 = !!((b.flags ?? 0) & (1 << 15));
  if (!isV2 && (b.embeds?.length)) n.push('Classic embed, not a Components V2 panel (the rest of the bot uses panels).');
  else if (!isV2 && b.content && !b.embeds?.length) n.push('Plain text message, not a panel.');
  if (isV2) {
    const texts = cs.filter((c) => c.type === 10).map((c) => c.content);
    if (texts[0] && !/^-# /.test(texts[0]) && !/^#/.test(texts[0])) n.push('First line is neither an eyebrow (-#) nor a heading.');
    if (!texts.some((t) => /^-# /.test(t))) n.push('No small "-#" footer or eyebrow line.');
    const box = (b.components ?? []).find((c) => c.type === 17);
    if (box && box.accent_color != null && !PALETTE.has(box.accent_color)) n.push(`Accent colour #${box.accent_color.toString(16)} is not in the Phoenix palette.`);
    if (!cs.some((c) => c.type === 11 || c.type === 12)) n.push('No crest, thumbnail or picture.');
    if (txt.length > 2600) n.push('Long compact wall of text.');
  }
  for (const e of b.embeds ?? []) if (e.color != null && !PALETTE.has(e.color)) n.push(`Embed colour #${e.color.toString(16)} is not Phoenix orange.`);
  return n;
}
function leaks(b) {
  const l = [];
  const s = JSON.stringify(b);
  if (/norex(?!:|_)/i.test(s.replace(/norex:[a-z]+/gi, ''))) l.push('NOREX name in the message');
  if (/c8352c/i.test(s) || /"(?:accent_)?color":13120812/.test(s)) l.push('NOREX red in the message');
  if (/080b11/i.test(s)) l.push('NOREX ink in the message');
  if (/workers\.dev/.test(s) && /norexunited/.test(s)) l.push('NOREX-account Worker host in a link');
  return l;
}
// images the message uses: card files (the drawn art uses the repo template palette) vs platform placeholders
const cardKeys = (b) => [...JSON.stringify(b).matchAll(/(?:localhost:4321\/cards\/|attachment:\/\/)([A-Za-z0-9_.\-]+\.png)/g)].map((m) => m[1]);

const entries = [];
const push = (e) => entries.push({ notes: [], leaks: [], related: [], destinations: [], messages: [], ...e });

// ---------- slash commands + interactions ----------
const byTrigger = new Map();
for (const c of caps) { const k = c.command ?? c.parent ?? c.trigger; if (!byTrigger.has(k)) byTrigger.set(k, []); byTrigger.get(k).push(c); }
function messagesOf(rec) {
  const m = [];
  const r = rec.response;
  if (r?.type === 9) m.push({ kind: 'modal', body: r.data, via: 'modal' });
  else if (r?.data && (r.data.components || r.data.embeds || r.data.content)) m.push({ kind: ((r.data.flags ?? 0) & 64) ? 'private' : 'reply', body: r.data, via: r.type === 7 ? 'edits the original message' : 'instant reply' });
  for (const c of rec.calls) {
    if (!c.body || !(c.body.components || c.body.embeds || c.body.content)) continue;
    const dest = chanPurpose(c.url);
    const kind = /@original/.test(c.url) ? (((c.body.flags ?? 0) & 64) ? 'private' : 'reply') : dest === 'DM' ? 'dm' : 'channel';
    m.push({ kind, body: c.body, via: /@original/.test(c.url) ? 'deferred reply (edited in)' : dest === 'DM' ? 'DM' : 'posted to #' + dest, dest });
  }
  return m;
}
for (const [key, recs] of byTrigger) {
  const isCmd = recs[0].kind === 'slash';
  const cmd = isCmd ? key : null;
  const msgs = [];
  for (const rec of recs) for (const m of messagesOf(rec)) msgs.push({ ...m, label: rec.trigger });
  if (!isCmd) continue;
  const flag = FLAG_OF[cmd], level = levelOf(flag), staff = STAFF_COMMANDS.includes(cmd);
  const home = appOf(cmd), via = MOVED_FROM[cmd];
  const dests = new Set(); for (const m of msgs) dests.add(m.kind === 'private' ? 'private reply (only you see it)' : m.kind === 'dm' ? 'DM' : m.kind === 'channel' ? `channel: ${m.dest ?? 'configured'}` : 'public reply in the channel'); for (const d of SLASH_DEST[cmd] ?? []) dests.add(d);
  push({ id: 'slash:/' + cmd, name: '/' + cmd + ' ' + (COMMANDS.find((c) => c.name === cmd)?.description ?? ''), category: 'slash', app: home, how: 'real',
    trigger: `/${cmd}${COMMANDS.find((c) => c.name === cmd)?.options?.some((o) => o.type === 1) ? ' <subcommand>' : ''}`, schedule: 'instant (deferred replies edit in within seconds)', destinations: [...dests],
    flag: flag ?? (staff ? 'Discord permission (staff)' : 'none'), level: level ?? (staff ? 'managers' : 'public'), who: staff ? 'managers and owner (hidden from members in Discord)' : level === 'owner' ? 'owner only' : 'anyone in the server' + (level === 'members' ? ' with a member login' : ''),
    status: statusOf(level, staff), source: sourceOfCmd(cmd), movedFrom: via ? `lives on ${APP_NAME[home]} (was ${APP_NAME[via]})` : null, messages: msgs });
  // buttons/selects/modals that came out of this command
  const seenC = new Set();
  for (const rec of byTrigger.get(key)) { /* components are keyed by parent chain */ }
}
// component / modal captures: group by norm(custom_id), attach to the root slash command
const comps = new Map();
for (const c of caps.filter((x) => x.kind === 'component' || x.kind === 'modal-submit')) {
  const id = c.trigger.replace(/^(select|button|modal) /, '');
  const key = id.replace(/\d{3,}/g, 'N').replace(/:\d+(?=:|$)/g, ':#');
  if (!comps.has(key)) comps.set(key, { rec: [], id });
  comps.get(key).rec.push(c);
}
for (const [key, g] of comps) {
  const root = g.rec[0].command;
  const msgs = []; for (const rec of g.rec) for (const m of messagesOf(rec)) msgs.push({ ...m, label: rec.trigger });
  const isModal = g.rec[0].kind === 'modal-submit';
  const cmd = root ?? null, flag = cmd && FLAG_OF[cmd], level = levelOf(flag);
  push({ id: 'comp:' + key, name: `${isModal ? 'Modal' : /select/.test(g.rec[0].trigger) ? 'Select menu' : 'Button'} ${key}${g.rec[0].label ? ' · “' + g.rec[0].label + '”' : ''}`, category: isModal ? 'modal' : 'component', app: cmd ? appOf(cmd) : 'core', how: 'real',
    trigger: `${g.rec[0].trigger}${root ? ' (under /' + root + ')' : ''}`, schedule: 'instant, on click', destinations: [msgs[0]?.kind === 'private' ? 'private reply' : 'edits or replies in place'], flag: flag ?? 'follows the parent command', level: level ?? 'public',
    who: 'whoever the parent message is for (managers for panel buttons)', status: statusOf(level, root && STAFF_COMMANDS.includes(root)), source: sourceOfId(g.rec[0].trigger), related: cmd ? ['slash:/' + cmd] : [], messages: msgs });
}

// ---------- automated + DMs ----------
for (const a of auto.items) {
  const slashDest = (a.destination ?? []).map((d) => d.replace(/^(announcements|match_results|match_notifications|recruitment|claims|manager_alerts|logs|welcome|config_audit|system_alerts)$/, (p) => `#${p} (Organization → channel purpose)`));
  const level = a.level ?? levelOf(a.flag);
  push({ ...a, app: a.category === 'DM' ? 'core' : /lfg/.test(a.id) ? 'rush' : /event/.test(a.id) ? 'matchday' : /birthday|discovery/.test(a.id) ? 'fun' : 'core', destinations: slashDest, who: 'automatic', level, status: a.status ?? statusOf(level, false), messages: a.bodies.map((b, i) => ({ kind: a.category === 'DM' ? 'dm' : 'channel', body: b, via: a.how === 'real' ? 'captured from the real code' : 'rebuilt from the code’s own builder with sample data', label: a.bodies.length > 1 ? `variant ${i + 1}` : '' })) });
}
for (const u of UNCAPTURED) push({ ...u, category: 'automated', app: /dj/.test(u.id) ? 'dj' : /event|lineup/.test(u.id) ? 'matchday' : 'core', how: 'not captured', destinations: u.destination, who: 'automatic', status: u.status ?? statusOf(u.level, false), messages: [] });

// ---------- notes, leaks, duplicates ----------
const firstText = new Map();
for (const e of entries) {
  e.notes = []; e.leaks = [];
  for (const m of e.messages) {
    e.notes.push(...notesFor(m.body)); e.leaks.push(...leaks(m.body));
    if (cardKeys(m.body).length) e.cardArt = true;
    if (m.kind === 'dm') e.notes.push(...[]);
  }
  e.notes = [...new Set(e.notes)]; e.leaks = [...new Set(e.leaks)];
  if (e.cardArt) e.leaks.push('Card art is drawn by scripts/cards.mjs, whose template CSS still holds the NOREX red #c8352c and ink #080b11 (see page footer)');
  const main = e.messages[0];
  if (main) { const key = norm(textOf(main.body)); e.textKey = key; if (key.length > 25) { if (firstText.has(key)) e.dupOf = firstText.get(key); else firstText.set(key, e.id); } }
}
// registry-related ids count as "related" (same data, different trigger)
for (const e of entries) e.dup = e.dupOf ? 'duplicate' : entries.some((x) => x.dupOf === e.id) || e.related?.length ? 'duplicate' : 'unique';
for (const e of entries) delete e.textKey;

// ---------- images ----------
const used = new Set(entries.flatMap((e) => e.messages.flatMap((m) => cardKeys(m.body))));
const files = {};
const attach = {};
for (const [id, v] of Object.entries(manifest.match ?? {})) for (const kind of ['score', 'field', 'box']) if (v[kind]) attach[`${kind}-${id}.png`] = v[kind];
const dataUri = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
for (const k of used) { const f = attach[k] ?? k; const p = OUT + 'cards/' + f; if (fs.existsSync(p)) files[k] = dataUri(p); }
const crest = dataUri(ROOT + 'phoenix/overlay/crest-sm.png');

const counts = {}; for (const e of entries) counts[e.category] = (counts[e.category] ?? 0) + 1;
const data = { generated: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', entries, files, crest, appNames: APP_NAME, brand: config.brand, failures: auto.failures };
const tpl = fs.readFileSync(new URL('./template.html', import.meta.url), 'utf8');
const html = tpl.replace('/*DATA*/null', JSON.stringify(data).replace(/</g, '\\u003c'));
fs.writeFileSync(ROOT + 'PLANNING/bot-audit.html', html);
console.log('entries', entries.length, JSON.stringify(counts), '| images', Object.keys(files).length, '| html', (html.length / 1e6).toFixed(1) + ' MB');
