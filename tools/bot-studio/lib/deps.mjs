// Bot Studio dependency map: for one output, every file that has to stay in step when it changes.
// Static reads only (imports, command sets, custom_id prefixes, card functions, tests, help pages, flags, channel purposes).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, customIds, cardFiles, imageUrls, textOf, CARD_KINDS } from './model.mjs';

const SCAN = [['bot', /\.(js|mjs)$/, false], ['scripts', /\.mjs$/, true], ['tests', /\.mjs$/, false], ['tools/bot-audit', /\.mjs$/, false], ['web', /\.js$/, false]];
const walk = (dir, re, deep) => (fs.existsSync(path.join(ROOT, dir)) ? fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? (deep && !/^(__pycache__|node_modules)$/.test(f.name) ? walk(`${dir}/${f.name}`, re, deep) : []) : re.test(f.name) ? [`${dir}/${f.name}`] : [])) : []);

let graph = null;
export function buildGraph() {
  if (graph) return graph;
  const src = {}, imports = {}, importedBy = {};
  for (const [dir, re, deep] of SCAN) for (const f of walk(dir, re, deep)) src[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const [f, s] of Object.entries(src)) {
    imports[f] = [...new Set([...s.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]))).filter((x) => src[x]))];
    for (const t of imports[f]) (importedBy[t] ??= []).push(f);
  }
  return (graph = { src, imports, importedBy });
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const botFiles = (g) => Object.keys(g.src).filter((f) => /^bot\/[^/]+\.js$/.test(f));

// The module that builds a slash command's reply.
export function sourceOfCommand(cmd, g = buildGraph()) {
  const worker = g.src['bot/worker.js'] ?? '';
  for (const f of botFiles(g)) { // a module's own command set: export const FUN_COMMANDS = new Set(['jail', …]) / HELP_COMMANDS = { corehelp: … }
    if (/^bot\/(worker|commanddefs|botcommands|apps|merged)\.js$/.test(f)) continue;
    for (const m of g.src[f].matchAll(/export const \w*COMMANDS\w* = (?:new Set\(\[([^\]]*)\]\)|\{([^}]*)\})/g)) if (new RegExp(`['"]${esc(cmd)}['"]|\\b${esc(cmd)}:`).test(m[1] ?? m[2])) return f;
  }
  // routed by name in the Worker: the first imported handler called after `i.data.name === 'cmd'`
  const at = worker.search(new RegExp(`i\\.data\\.name === '${esc(cmd)}'`));
  if (at >= 0) {
    const from = (fn) => new RegExp(`import \\{[^}]*\\b${fn}\\b[^}]*\\} from '\\./(\\w+)\\.js'`).exec(worker)?.[1];
    const calls = [...worker.slice(at, at + 900).split(/\n\s{4}if \(/)[0].matchAll(/\b([a-zA-Z]\w+)\(/g)].map((m) => m[1]).filter((fn) => { const f = from(fn); return f && !/^(ui|apps|roles|icons|orgconfig)$/.test(f); });
    const fn = calls.find((x) => /Command$/.test(x)) ?? calls.find((x) => x !== 'memberOf') ?? null;
    if (fn) return `bot/${from(fn)}.js`;
  }
  return 'bot/worker.js';
}
// The modules that mint or answer a custom_id (by its first two segments, e.g. norex:mp or pf:rq).
export function handlersOfId(id, g = buildGraph()) {
  const p = /^((?:norex|pf):[a-z]+)/i.exec(id)?.[1];
  if (!p) return [];
  const hit = botFiles(g).filter((f) => g.src[f].includes(p + ':') || g.src[f].includes('^' + p) || new RegExp(`${esc(p.split(':')[0])}:\\(?[^'"\`/]*\\b${esc(p.split(':')[1])}\\b`).test(g.src[f]));
  return hit.length > 1 ? hit.filter((f) => f !== 'bot/worker.js').concat(hit.includes('bot/worker.js') ? ['bot/worker.js'] : []) : hit;
}

const testsFor = (g, files, words = []) => Object.keys(g.src).filter((f) => f.startsWith('tests/') && f.endsWith('.test.mjs') && (files.some((x) => x !== 'bot/worker.js' && x !== 'bot/ui.js' && g.imports[f].includes(x)) || words.some((w) => g.src[f].includes(w)))).sort();
const mentions = (g, re, where) => Object.keys(g.src).filter((f) => where.test(f) && re.test(g.src[f]));

export function depsFor(entry, model) {
  const g = buildGraph(), cfg = model.cfg;
  const source = entry.source ?? (entry.command ? sourceOfCommand(entry.command, g) : null);
  const d = { source, builder: entry.builder ?? null, files: [], tests: [], handlers: [], cards: [], pictures: [], flag: null, channels: [], commandDef: null, help: [], site: [], capture: null, shared: [], checklist: [] };
  const add = (file, why) => { if (file && !d.files.some((x) => x.file === file)) d.files.push({ file, why }); };
  add(source, entry.builder ? `builds it (${entry.builder})` : 'builds it');

  // slash command wiring
  if (entry.category === 'slash') {
    d.commandDef = entry.command;
    add('bot/commanddefs.js', `defines /${entry.command}, its options and which app owns it (APP_COMMANDS)`);
    if (source !== 'bot/worker.js') add('bot/worker.js', 'routes the command to its handler');
    const help = mentions(g, new RegExp(`/${esc(entry.command)}\\b`), /^bot\/(help|docs)\.js$/);
    d.help = help; for (const f of help) add(f, `mentions /${entry.command} in the help or docs text`);
    d.site = fs.existsSync(path.join(ROOT, 'next/static')) ? fs.readdirSync(path.join(ROOT, 'next/static')).filter((f) => /\.(js|html)$/.test(f) && new RegExp(`["'\`>/ ]/${esc(entry.command)}\\b`).test(fs.readFileSync(path.join(ROOT, 'next/static', f), 'utf8'))).map((f) => `next/static/${f}`).slice(0, 6) : [];
    for (const f of d.site) add(f, `shows /${entry.command} on the site`);
  }
  // buttons, menus and forms inside the messages
  const ids = [...new Set([...(entry.customId ? [entry.customId] : []), ...entry.messages.flatMap((m) => customIds(m.body))])];
  const seen = new Set();
  for (const id of ids) {
    const p = /^((?:norex|pf):[a-z]+)/i.exec(id)?.[1] ?? id;
    if (seen.has(p)) continue; seen.add(p);
    const hs = handlersOfId(id, g);
    d.handlers.push({ id: p + ':…', files: hs });
    for (const f of hs) add(f, `handles the ${p}:… buttons or menus`);
  }
  // pictures
  const files = [...new Set([...entry.messages.flatMap((m) => cardFiles(m.body)), ...(entry.image && entry.image !== '@share' ? [entry.image] : [])])];
  const kinds = [...new Set(files.map((f) => /^(score|field|box|player|cmp|top|club|results|banner)/.exec(f)?.[1]).filter(Boolean).map((k) => (k === 'cmp' ? 'compare' : k)))];
  for (const k of kinds) d.cards.push({ kind: k, fn: CARD_KINDS[k].fn, file: 'scripts/cards.mjs' });
  if (kinds.length) {
    add('scripts/cards.mjs', `draws the ${kinds.join(', ')} picture${kinds.length > 1 ? 's' : ''} (${kinds.map((k) => CARD_KINDS[k].fn).join(', ')}); bump TEMPLATE_VERSION after a template change`);
    if (kinds.includes('banner')) add('bot/ui.js', 'BANNER_V must equal TEMPLATE_VERSION or Discord keeps the cached banner');
  }
  d.pictures = [...new Set(entry.messages.flatMap((m) => imageUrls(m.body)))].filter((u) => !/\/cards\/|attachment:/.test(u)).map((u) => u.replace(/\?.*$/, '')).slice(0, 6);
  if (entry.id === 'image:site-share') { add('phoenix/build.mjs', 'copies the share image into the built site and writes the og:image tags'); add('tests/phoenix-brand.test.mjs', 'guards the built site against NOREX branding'); }
  if (/cardstudio|avatarcard/.test(entry.id)) { add('web/cardcomposer.js', 'crops and composes the card (CHEST_ASPECT, FIT_PAD): chest-up rule'); add('tests/cardstudio.test.mjs', 'guards the prompts and the chest-up rule'); }
  // gate + where it lands
  if (entry.flag && cfg.features?.[entry.flag] != null) { d.flag = { name: entry.flag, level: cfg.features[entry.flag] }; add('config.json', `feature flag ${entry.flag} (now: ${cfg.features[entry.flag]})`); }
  const purposes = [...new Set([...entry.destinations.map((x) => /^#?([a-z_]+)\b/.exec(x)?.[1]), ...entry.messages.map((m) => m.dest)].filter((p) => p && model.purposes.includes(p)))];
  d.channels = purposes;
  if (purposes.length) add('bot/orgconfig.js', `resolves the channel by purpose (${purposes.join(', ')}); never hardcode an ID`);
  // design system + tests
  if (source && source.startsWith('bot/') && (g.imports[source] ?? []).includes('bot/ui.js')) d.shared.push('bot/ui.js');
  if (source && (g.imports[source] ?? []).includes('bot/icons.js')) d.shared.push('bot/icons.js');
  const words = [entry.command ? `'${entry.command}'` : null, entry.builder && entry.builder.length > 5 ? entry.builder : null].filter(Boolean);
  d.tests = testsFor(g, [source, ...d.handlers.flatMap((h) => h.files)].filter(Boolean), words).slice(0, 12);
  if (kinds.length) for (const t of ['tests/discord.test.mjs', 'tests/design.test.mjs']) if (g.src[t] && !d.tests.includes(t)) d.tests.push(t);
  d.capture = entry.category === 'slash' || entry.category === 'component' || entry.category === 'form' ? 'tools/bot-audit/capture.mjs (automatic, from COMMANDS)' : entry.category === 'image' ? 'tools/bot-audit/render-cards.mjs' : 'tools/bot-audit/capture-auto.mjs';
  d.usedBy = source ? (g.importedBy[source] ?? []).filter((f) => !f.startsWith('tests/') && !f.startsWith('tools/')).slice(0, 10) : [];

  // ---- the checklist: what to do so the edit breaks nothing ----
  const c = d.checklist;
  c.push(`Edit the builder in ${source ?? 'the source module'}${entry.builder ? ` (${entry.builder})` : ''}. Build with bot/ui.js blocks (header, text, facts, sep, footer, buttons, cards); do not hand-write component JSON.`);
  if (d.shared.includes('bot/ui.js')) c.push('Colours come from ACCENT in bot/ui.js (red = Phoenix orange #e8651a). Never add a hex value in the module.');
  if (entry.category === 'slash') c.push(`If the name, description or options change: edit bot/commanddefs.js, then re-register the command (Boardroom → Sync to Discord, or node bot/register.mjs).${d.help.length ? ` Update the help text in ${d.help.join(', ')}.` : ''}`);
  if (d.handlers.length) c.push(`Keep every custom_id exactly as it is (${d.handlers.map((h) => h.id).join(', ')}): posts already in Discord still send the old IDs, and ${[...new Set(d.handlers.flatMap((h) => h.files))].join(', ') || 'the Worker'} matches them by pattern.`);
  if (kinds.length) c.push(`Pictures are drawn by scripts/cards.mjs (${kinds.map((k) => CARD_KINDS[k].fn).join(', ')}). After a template change bump TEMPLATE_VERSION${kinds.includes('banner') ? ' and BANNER_V in bot/ui.js to the same number' : ''}, then redraw: node tools/bot-studio/studio.mjs capture --cards.`);
  if (purposes.length) c.push(`The channel comes from the Organization config by purpose (${purposes.join(', ')}). A new destination means a new purpose in bot/orgconsts.js CHANNEL_PURPOSES plus a test that the feature reads it from config.`);
  if (d.flag) c.push(`Gate stays on the ${d.flag.name} flag (config.json features, level ${d.flag.level}).`);
  if (entry.messages.some((m) => /<@&?\w+>|@here|@everyone/.test(textOf(m.body)))) c.push('This message pings people. Keep allowed_mentions tight (message({ mentions })) so a redesign cannot widen who gets pinged.');
  if (entry.messages.some((m) => m.kind === 'private')) c.push('Private replies stay private: keep ephemeral: true (or notice()/privateNote()).');
  c.push(`Run: node tools/bot-studio/studio.mjs verify ${entry.id}  (recapture → limits and brand check → diff against the snapshot → ${d.tests.length ? d.tests.length + ' related test file' + (d.tests.length > 1 ? 's' : '') : 'tests'}).`);
  c.push('Phoenix branding carries through everything this output feeds (CLAUDE.md): no NOREX name, colour, crest or link in the text, the pictures or the buttons.');
  return d;
}
