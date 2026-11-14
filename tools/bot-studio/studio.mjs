#!/usr/bin/env node
// Phoenix Bot Studio: see, check and safely change every message and picture the Phoenix apps put into Discord.
//   node tools/bot-studio/studio.mjs <command>      (run from the repo root; `help` lists the commands)
// It reads the real bot code through tools/bot-audit's capture harness. It never edits bot code itself:
// it shows what an output is wired to, renders drafts, and proves an edit changed only what you meant.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, STUDIO_OUT } from './lib/model.mjs';

const [cmd = 'help', ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--'))), args = rest.filter((a) => !a.startsWith('--'));
const C = process.stdout.isTTY ? { b: '\x1b[1m', d: '\x1b[2m', r: '\x1b[31m', y: '\x1b[33m', g: '\x1b[32m', o: '\x1b[38;5;208m', x: '\x1b[0m' } : { b: '', d: '', r: '', y: '', g: '', o: '', x: '' };
const say = (...a) => console.log(...a);
const node = (file, a = [], opt = {}) => spawnSync(process.execPath, [path.join(ROOT, file), ...a], { cwd: ROOT, encoding: 'utf8', ...opt });
const lib = async () => ({ ...(await import('./lib/gallery.mjs')), ...(await import('./lib/snapshot.mjs')) });

function find(model, word, { many = false } = {}) {
  if (!word) return many ? model.entries : null;
  const w = word.toLowerCase();
  const exact = model.entries.filter((e) => e.id.toLowerCase() === w || e.id.toLowerCase() === `slash:${w}` || e.id.toLowerCase() === `slash:/${w}`);
  const hit = exact.length ? exact : model.entries.filter((e) => `${e.id} ${e.name}`.toLowerCase().includes(w));
  if (many) return hit;
  if (hit.length === 1) return hit[0];
  if (!hit.length) { say(`${C.r}No output matches “${word}”.${C.x} Try: node tools/bot-studio/studio.mjs list ${word.replace(/[^a-z]/gi, '').slice(0, 4)}`); process.exit(2); }
  say(`${C.y}“${word}” matches ${hit.length} outputs. Use one of these IDs:${C.x}`); for (const e of hit.slice(0, 30)) say('  ' + e.id); process.exit(2);
}
const issueLine = (i) => `${i.level === 'error' ? C.r + 'FIX ' : C.y + 'warn'}${C.x} ${i.msg}`;

function capture({ cards = false } = {}) {
  const steps = [...(cards ? [['tools/bot-audit/render-cards.mjs', 'drawing card images (needs Chrome, outside any sandbox)']] : []), ['tools/bot-audit/capture.mjs', 'running every slash command, button and form through the real Worker'], ['tools/bot-audit/capture-auto.mjs', 'running automated posts and DMs']];
  for (const [file, what] of steps) {
    say(`${C.d}… ${what}${C.x}`);
    const r = node(file);
    if (r.status !== 0) { say(`${C.r}${file} failed${C.x}\n${(r.stderr || r.stdout).split('\n').slice(-12).join('\n')}`); process.exit(1); }
    say(`  ${(r.stdout.trim().split('\n').filter((l) => /^(captured|auto items|cards drawn)/.test(l)).pop()) ?? 'done'}`);
  }
}

const COMMANDS = {
  help() {
    say(`${C.b}${C.o}Phoenix Bot Studio${C.x}  every Discord message and picture the apps send: see it, check it, change it safely

  ${C.b}See${C.x}
    list [word]          every output with its ID (filter by any word: club, rush, dm, image…)
    show <id>            one output as text: every line, button and picture
    gallery [word]       build the visual gallery → tools/bot-studio/out/gallery.html
    deps <id>            everything that must stay in step when this output changes, plus the edit checklist

  ${C.b}Check${C.x}
    check [word]         Discord limits, Phoenix design system, NOREX leaks, cross-file mismatches  (--strict: warnings fail too)
    snapshot             remember how every output looks now (do this before you start an edit)
    diff                 what changed since the snapshot, output by output
    verify <id>          after an edit: recapture → check → diff → run the tests tied to that output

  ${C.b}Design${C.x}
    registry [--check]   write bot/registry.gen.js: every output the Control Center manages (--check only compares)
    new <name>           start a draft message in tools/bot-studio/drafts/<name>.mjs (built with bot/ui.js)
    render <draft.mjs>   draw a draft the way Discord shows it → tools/bot-studio/out/draft.html
    capture [--cards]    refresh the captures from the bot code (--cards also redraws the card images)

  IDs look like  slash:/club · comp:norex:mp:… · auto:event-league · dm:notify:award · image:score
  A unique part of an ID is enough:  studio.mjs deps /club`);
  },
  async list() {
    const { studioModel } = await lib(); const model = studioModel();
    const rows = find(model, args[0], { many: true });
    const w = Math.min(46, Math.max(...rows.map((e) => e.id.length)));
    for (const e of rows) { const er = e.issues.filter((i) => i.level === 'error').length, wa = e.issues.length - er; say(`${e.id.padEnd(w)}  ${e.category.padEnd(9)} ${String(model.apps[e.app] ?? e.app).padEnd(16)} ${(e.status ?? '').padEnd(14)} ${er ? C.r + er + ' to fix' + C.x + ' ' : ''}${wa ? C.y + wa + ' warn' + C.x : ''}${!e.messages.length && !e.image ? C.d + 'no offline preview' + C.x : ''}`); }
    say(`${C.d}${rows.length} outputs${C.x}`);
  },
  async show() {
    const { studioModel, outline } = await lib(); const model = studioModel(), e = find(model, args[0]);
    say(`${C.b}${e.name}${C.x}  ${C.d}${e.id}${C.x}\n${e.summary || ''}`);
    say(`sent when: ${e.trigger}  ·  lands in: ${e.destinations.join(', ') || 'n/a'}  ·  ${e.status}`);
    if (!e.messages.length) say(e.image ? `picture: tools/bot-audit/out/cards/${e.image}` : `${C.y}no offline preview:${C.x} ${e.uncaptured ?? ''}`);
    e.messages.forEach((m, k) => { say(`\n${C.o}── message ${k + 1}/${e.messages.length}${m.label ? ' · ' + m.label : ''} · ${m.kind} · ${m.via}${C.x}`); for (const l of outline(m.body)) say('  ' + l); });
    if (e.issues.length) { say(''); e.issues.forEach((i) => say(issueLine(i))); }
  },
  async deps() {
    const { studioModel } = await lib(); const model = studioModel(), e = find(model, args[0]), d = e.deps;
    if (flags.has('--json')) return say(JSON.stringify({ id: e.id, ...d }, null, 1));
    say(`${C.b}${e.name}${C.x}  ${C.d}${e.id}${C.x}`);
    say(`\n${C.o}Files that change with it${C.x}`); for (const f of d.files) say(`  ${f.file.padEnd(30)} ${C.d}${f.why}${C.x}`);
    if (d.usedBy?.length) say(`\n${C.o}Other code that imports ${d.source}${C.x} ${C.d}(a change to a shared helper there reaches these too)${C.x}\n  ${d.usedBy.join('  ')}`);
    if (d.handlers.length) { say(`\n${C.o}Buttons and menus${C.x}`); for (const h of d.handlers) say(`  ${h.id.padEnd(22)} ${C.d}${h.files.join(', ') || 'no handler found by prefix: check bot/worker.js'}${C.x}`); }
    if (d.cards.length) { say(`\n${C.o}Pictures${C.x}`); for (const c of d.cards) say(`  ${c.kind.padEnd(10)} ${C.d}${c.file} ${c.fn}()${C.x}`); }
    if (d.pictures.length) say(`${C.d}  outside pictures: ${d.pictures.join(', ')}${C.x}`);
    if (d.flag || d.channels.length) say(`\n${C.o}Gate and destination${C.x}\n  ${d.flag ? `flag ${d.flag.name} = ${d.flag.level}` : 'no flag'}${d.channels.length ? `  ·  channel purpose: ${d.channels.join(', ')}` : ''}`);
    say(`\n${C.o}Tests that guard it${C.x}\n  ${d.tests.join('\n  ') || C.y + 'none found: add one when you change it' + C.x}`);
    say(`\n${C.o}Checklist${C.x}`); d.checklist.forEach((c, k) => say(`  ${k + 1}. ${c}`));
    if (e.related.length) say(`\n${C.d}related outputs: ${e.related.join(', ')}${C.x}`);
  },
  async check() {
    const { studioModel } = await lib(); const model = studioModel(), rows = find(model, args[0], { many: true });
    let errors = 0, warns = 0;
    if (!args[0] && model.repo.length) { say(`${C.b}Cross-file${C.x}`); for (const i of model.repo) { say('  ' + issueLine(i) + (i.files ? `  ${C.d}${i.files.join(', ')}${C.x}` : '')); i.level === 'error' ? errors++ : warns++; } say(''); }
    for (const e of rows.filter((x) => x.issues.length)) { say(`${C.b}${e.id}${C.x}  ${C.d}${e.deps.source ?? ''}${C.x}`); for (const i of e.issues) { say('  ' + issueLine(i)); i.level === 'error' ? errors++ : warns++; } }
    say(`\n${rows.length} outputs checked · ${errors ? C.r : C.g}${errors} to fix${C.x} · ${warns} warnings`);
    process.exitCode = errors || (flags.has('--strict') && warns) ? 1 : 0;
  },
  async snapshot() {
    const { studioModel, saveSnapshot } = await lib(); const snap = saveSnapshot(studioModel().entries);
    say(`Snapshot saved: ${Object.keys(snap.outputs).length} outputs → tools/bot-studio/out/snapshot.json`);
  },
  async diff() {
    const { studioModel, loadSnapshot, diffSnapshot } = await lib(); const old = loadSnapshot();
    if (!old) { say(`${C.y}No snapshot yet.${C.x} Run: node tools/bot-studio/studio.mjs snapshot`); process.exitCode = 2; return null; }
    const d = diffSnapshot(old, studioModel().entries);
    for (const c of d.changed) { say(`${C.o}changed${C.x} ${C.b}${c.id}${C.x}`); for (const l of c.lines.slice(0, flags.has('--full') ? 1e4 : 40)) say(l.replace(/^(\s+)- /, `$1${C.r}- `).replace(/^(\s+)\+ /, `$1${C.g}+ `) + C.x); }
    for (const id of d.added) say(`${C.g}new${C.x}     ${id}`);
    for (const id of d.removed) say(`${C.r}gone${C.x}    ${id}`);
    say(`\nsince ${old.at.slice(0, 16).replace('T', ' ')} UTC: ${d.changed.length} changed · ${d.added.length} new · ${d.removed.length} gone · ${d.same} the same`);
    return d;
  },
  async gallery() {
    const { studioModel, writeGallery } = await lib(); const model = studioModel();
    const entries = args[0] ? find(model, args[0], { many: true }) : null;
    const r = writeGallery({ model, entries }, args[0] ? 'gallery-' + args[0].replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') : 'gallery');
    say(`${r.entries} outputs · ${r.pictures} pictures · ${(r.bytes / 1e6).toFixed(1)} MB → ${r.file}`);
  },
  capture() { capture({ cards: flags.has('--cards') }); },
  async verify() {
    if (!args[0]) { say('verify needs an output ID. Example: node tools/bot-studio/studio.mjs verify /club'); process.exitCode = 2; return; }
    capture({ cards: flags.has('--cards') });
    const { studioModel, loadSnapshot, diffSnapshot } = await lib(); const model = studioModel(), e = find(model, args[0]);
    let bad = 0;
    say(`\n${C.b}1. Check${C.x}  ${e.id}`);
    if (!e.issues.length) say(`  ${C.g}clean${C.x}`); for (const i of e.issues) { say('  ' + issueLine(i)); if (i.level === 'error') bad++; }
    for (const i of model.repo.filter((x) => x.level === 'error' && x.files?.some((f) => e.deps.files.some((d) => d.file === f)))) { say('  ' + issueLine(i)); bad++; }
    say(`\n${C.b}2. What changed since the snapshot${C.x}`);
    const old = loadSnapshot();
    if (!old) say(`  ${C.y}no snapshot to compare with${C.x} (run snapshot before the next edit)`);
    else {
      const d = diffSnapshot(old, model.entries), mine = d.changed.find((c) => c.id === e.id), family = new Set([e.id, ...e.related, ...model.entries.filter((x) => x.related.includes(e.id) || (e.command && x.command === e.command)).map((x) => x.id)]);
      say(mine ? `  ${C.g}${e.id} changed${C.x}\n${mine.lines.slice(0, 30).join('\n')}` : `  ${C.y}${e.id} looks the same as the snapshot${C.x}`);
      const others = d.changed.filter((c) => !family.has(c.id));
      if (others.length) { say(`  ${C.r}also changed, outside this output and its related ones:${C.x}`); for (const o of others) say(`    ${o.id}`); say(`  ${C.d}If that was not meant, a shared helper moved. See: studio.mjs diff${C.x}`); }
      else say(`  ${C.g}nothing else moved${C.x}${d.changed.length > (mine ? 1 : 0) ? ` (related outputs changed too: ${d.changed.filter((c) => c.id !== e.id).map((c) => c.id).join(', ')})` : ''}`);
    }
    say(`\n${C.b}3. Tests${C.x}`);
    const names = e.deps.tests.map((t) => path.basename(t, '.test.mjs'));
    if (!names.length) say(`  ${C.y}no test is tied to this output: add one${C.x}`);
    else {
      const r = node('tests/run.mjs', ['--no-build', ...names]);
      const tail = (r.stdout + r.stderr).trim().split('\n').slice(-Math.min(14, names.length + 6));
      say(tail.map((l) => '  ' + l).join('\n'));
      if (r.status !== 0) bad++;
    }
    say(`\n${bad ? C.r + 'Not ready: fix the items above.' : C.g + 'Ready.'}${C.x} When you are happy with the new look: studio.mjs snapshot && studio.mjs gallery`);
    process.exitCode = bad ? 1 : 0;
  },
  new() {
    const name = (args[0] ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!name) { say('new needs a name. Example: node tools/bot-studio/studio.mjs new transfer-news'); process.exitCode = 2; return; }
    const dir = path.join(ROOT, 'tools/bot-studio/drafts/'), file = `${dir}${name}.mjs`;
    if (fs.existsSync(file)) { say(`${C.y}tools/bot-studio/drafts/${name}.mjs already exists.${C.x}`); process.exitCode = 2; return; }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, fs.readFileSync(new URL('./draft.template.mjs', import.meta.url), 'utf8').replaceAll('__NAME__', name));
    say(`Draft created: tools/bot-studio/drafts/${name}.mjs
  1. Shape the message there (bot/ui.js blocks only), then draw it:
       node tools/bot-studio/studio.mjs render tools/bot-studio/drafts/${name}.mjs
  2. When the look is right, move the builder into its bot module and wire it:
       · a new slash command → bot/commanddefs.js (COMMANDS + APP_COMMANDS), a handler in bot/worker.js, a line in bot/help.js, then re-register
       · a new automated post → a channel purpose in bot/orgconsts.js CHANNEL_PURPOSES (never a channel ID), read through bot/orgconfig.js
       · gate it with a flag in config.json features
       · add it to tools/bot-audit/capture-auto.mjs so the gallery and the snapshot cover it
       · add a test in tests/ that it reads its channel from config and carries no NOREX name, colour or crest
  3. node tools/bot-studio/studio.mjs capture && node tools/bot-studio/studio.mjs check ${name}`);
  },
  async registry() {
    const { buildRegistry, renderRegistryFile, REGISTRY_FILE } = await import('./lib/registry.mjs');
    const reg = buildRegistry(), next = renderRegistryFile(reg), cur = fs.existsSync(REGISTRY_FILE) ? fs.readFileSync(REGISTRY_FILE, 'utf8') : '';
    const kinds = Object.entries(reg.items.reduce((a, i) => ({ ...a, [i.kind]: (a[i.kind] ?? 0) + 1 }), {})).map(([k, n]) => `${n} ${k}`).join(' · ');
    if (process.argv.includes('--check')) { say(cur === next ? `${C.g}registry is current${C.x}: ${reg.items.length} outputs (${kinds})` : `${C.r}bot/registry.gen.js is stale${C.x}: run node tools/bot-studio/studio.mjs registry`); process.exitCode = cur === next ? 0 : 1; return; }
    fs.writeFileSync(REGISTRY_FILE, next); say(`registry written: ${reg.items.length} outputs (${kinds}) → bot/registry.gen.js`);
  },
  async render() {
    if (!args[0]) { say('render needs a draft file. Example: node tools/bot-studio/studio.mjs render tools/bot-studio/drafts/transfer-news.mjs'); process.exitCode = 2; return; }
    const file = path.resolve(process.cwd(), args[0]);
    const mod = file.endsWith('.json') ? { default: JSON.parse(fs.readFileSync(file, 'utf8')) } : await import(pathToFileURL(file).href + `?t=${Date.now()}`);
    const out = mod.default, list = Array.isArray(out) ? out : out?.components || out?.embeds || out?.content ? [out] : Object.entries(out ?? {}).map(([label, body]) => ({ label, body }));
    const messages = list.map((m, k) => (m.body ? m : { body: m, label: `message ${k + 1}` })).map((m) => ({ kind: m.kind ?? ((m.body.flags ?? 0) & 64 ? 'private' : 'channel'), via: 'draft', label: m.label, dest: m.dest ?? 'draft', body: JSON.parse(JSON.stringify(m.body)) }));
    const { studioModel, writeGallery } = await lib(); const { lintMessage, paletteFromUi } = await import('./lib/lint.mjs');
    const model = studioModel(), palette = paletteFromUi(), seen = new Set();
    const entry = { id: 'draft:' + path.basename(file).replace(/\.\w+$/, ''), name: mod.meta?.name ?? path.basename(file), summary: mod.meta?.summary ?? 'Draft: not wired into the bot yet.', category: 'automated', app: mod.meta?.app ?? 'core', trigger: mod.meta?.trigger ?? 'draft', schedule: '', destinations: [mod.meta?.destination ?? 'draft'], level: 'draft', status: 'draft', related: [], messages, deps: null,
      issues: messages.flatMap((m) => lintMessage(m.body, { kind: m.kind, palette })).filter((i) => !seen.has(i.msg) && seen.add(i.msg)) };
    const r = writeGallery({ model: { ...model, repo: [] }, entries: [entry] }, 'draft');
    say(`${messages.length} message${messages.length > 1 ? 's' : ''} drawn → ${r.file}`);
    if (!entry.issues.length) say(`${C.g}clean: inside Discord's limits and on the Phoenix design system${C.x}`); for (const i of entry.issues) say(issueLine(i));
    process.exitCode = entry.issues.some((i) => i.level === 'error') ? 1 : 0;
  },
};
if (!COMMANDS[cmd]) { say(`Unknown command “${cmd}”.`); COMMANDS.help(); process.exit(2); }
fs.mkdirSync(STUDIO_OUT, { recursive: true });
await COMMANDS[cmd]();
