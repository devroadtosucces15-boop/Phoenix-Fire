// Maps and inputs/outputs for the project brain: site pages and bot commands with what builds them, what they read and what they post.
// Static reads only (LIBRARY/SITEMAP-INDEX.md, LIBRARY/BOT-COMMANDS.md, bot-studio deps.mjs, the source files). Names and places, never values.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceOfCommand, buildGraph } from '../bot-studio/lib/deps.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (f) => (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '');
const uniq = (a) => [...new Set(a.filter(Boolean))];
const SECRET_NAME = /TOKEN|SECRET|KEY|PASSWORD/;
const SITE_LABEL = { club: 'Club pages', matches: 'Matches and opponents', hub: 'Member locker and staff hub', stats: 'Stats and leaders', tactics: 'Tactics and builds', about: 'About and scouting', lookbook: 'Lookbook', canvas: 'Canvas and cards', burners: 'Burner clubs', rush: 'Rush', rushboard: 'Rush leaderboard', seasoncards: 'Season cards', swap: 'Shell pages', claim: 'Claim your player' };

// What a source file reads (config, tables, data files, APIs, secret names) and what it puts out (channels, pictures, buttons).
export function scan(file, g = buildGraph()) {
  const s = g.src[file] ?? read(file);
  const purposes = (read('bot/orgconsts.js').match(/CHANNEL_PURPOSES = \[([^\]]*)\]/)?.[1] ?? '').match(/'([a-z_]+)'/g)?.map((x) => x.slice(1, -1)) ?? [];
  return {
    tables: uniq([...s.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]{3,})\b/g)].map((m) => m[1])).filter((t) => !/^(the|a|an|this|that|each|every|per|one|all|any|you|its|set|row|rows)$/.test(t)),
    env: uniq([...s.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1])),
    api: uniq([...s.matchAll(/['"`](\/api\/[a-z0-9_/-]+)/g)].map((m) => m[1].replace(/\/$/, ''))),
    data: uniq([...s.matchAll(/['"`](data\/[a-z0-9_/.-]+)/g)].map((m) => m[1])),
    accessors: uniq([...s.matchAll(/import \{([^}]+)\} from '\.\.\/lib\/data\.mjs'/g)].flatMap((m) => m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]))),
    channels: uniq([...s.matchAll(/channelFor\w*\(\s*\w+,\s*'([a-z_]+)'/g)].map((m) => m[1]).filter((p) => !purposes.length || purposes.includes(p))),
    pictures: uniq([...s.matchAll(/\/cards\/([a-z]+)[A-Za-z0-9_.-]*\.png/g)].map((m) => m[1])),
    buttons: uniq([...s.matchAll(/custom_id:\s*[`'"]((?:norex|pf):[a-z]+)/gi)].map((m) => m[1])),
    ai: /\benv\.AI\b/.test(s),
    imports: (g.imports[file] ?? []).filter((f) => f.startsWith('bot/') && f !== file).slice(0, 12),
  };
}
const row = (cells) => cells.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|').replace(/`/g, ''));

export function sitePages() {
  const out = [];
  for (const l of read('LIBRARY/SITEMAP-INDEX.md').split('\n')) {
    if (!/^\| `/.test(l)) continue;
    const [page, title, audience, source] = row(l);
    const sc = source && fs.existsSync(path.join(ROOT, source)) ? scan(source) : null;
    const staticSrc = /^(hub|staff)/.test(page) ? ['next/static/staffhub.js', 'next/static/locker.css'].filter((f) => fs.existsSync(path.join(ROOT, f))) : [];
    const api = uniq([...(sc?.api ?? []), ...staticSrc.filter((f) => f.endsWith('.js')).flatMap((f) => scan(f).api)]).slice(0, 12);
    out.push({
      page, title, audience, source, feature: path.basename(source, path.extname(source)),
      builtBy: uniq([source, 'phoenix/build.mjs', ...staticSrc]),
      reads: { accessors: sc?.accessors ?? [], api, data: sc?.data ?? [] },
      posts: { pages: [page], images: sc?.pictures ?? [] },
    });
  }
  return out;
}

export function botCommands() {
  const g = buildGraph(); const out = []; let app = null;
  for (const l of read('LIBRARY/BOT-COMMANDS.md').split('\n')) {
    const h = l.match(/^## (\w+) \((\d+) commands?\)/); if (h) { app = h[1]; continue; }
    if (/^## Defined but not mapped/.test(l)) app = 'unmapped';
    const c = l.match(/^- \*\*\/([a-z0-9_-]+)\*\*: (.*)/); if (!c || !app) continue;
    const source = sourceOfCommand(c[1], g); const sc = scan(source, g);
    out.push({
      command: c[1], app, what: c[2], source, builtBy: uniq([source, 'bot/commanddefs.js', 'bot/worker.js', ...sc.imports.slice(0, 4)]),
      reads: { tables: sc.tables.slice(0, 12), env: sc.env.filter((e) => !SECRET_NAME.test(e)), secrets: sc.env.filter((e) => SECRET_NAME.test(e)), apis: sc.api, ai: sc.ai },
      posts: { channels: sc.channels, pictures: sc.pictures, buttons: sc.buttons },
    });
  }
  return out;
}

// One folder per feature: the union of what its pages and commands read (in) and put out (out).
export function inputsOutputs(pages, commands) {
  const f = new Map(); const get = (k, label, kind) => { if (!f.has(k)) f.set(k, { key: k, label, kind, items: [], in: { tables: [], config: [], apis: [], data: [], secrets: [] }, out: { channels: [], pages: [], images: [], buttons: [] } }); return f.get(k); };
  for (const p of pages) { const x = get('site:' + p.feature, SITE_LABEL[p.feature] || p.feature, 'site'); x.items.push(p.page); x.in.apis.push(...p.reads.api); x.in.data.push(...p.reads.data, ...p.reads.accessors.map((a) => `data.mjs: ${a}`)); x.out.pages.push(p.page); x.out.images.push(...p.posts.images); }
  for (const c of commands) { const x = get('bot:' + c.app, `Bot: ${c.app}`, 'bot'); x.items.push('/' + c.command); x.in.tables.push(...c.reads.tables); x.in.config.push(...c.reads.env); x.in.secrets.push(...c.reads.secrets); x.in.apis.push(...c.reads.apis); x.out.channels.push(...c.posts.channels); x.out.images.push(...c.posts.pictures); x.out.buttons.push(...c.posts.buttons); }
  return [...f.values()].map((x) => ({ ...x, in: Object.fromEntries(Object.entries(x.in).map(([k, v]) => [k, uniq(v)])), out: Object.fromEntries(Object.entries(x.out).map(([k, v]) => [k, uniq(v)])) })).sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
}

export function mapsModel() {
  const pages = sitePages(); const commands = botCommands();
  return { maps: { pages, commands }, io: inputsOutputs(pages, commands) };
}
