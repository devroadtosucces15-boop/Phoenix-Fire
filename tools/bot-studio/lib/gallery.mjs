// Bot Studio gallery: every output drawn the way Discord shows it, in one self-contained page.
// Pictures are embedded (drawn cards as JPEG) because the page has to work offline and as a published artifact.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COMMANDS, APP_COMMANDS } from '../../../bot/commanddefs.js';
import { CHANNEL_PURPOSES } from '../../../bot/orgconsts.js';
import { ROOT, STUDIO_OUT, loadModel, cardPath, imageUrls } from './model.mjs';
import { depsFor } from './deps.mjs';
import { lintMessage, lintRepo, paletteFromUi } from './lint.mjs';

const TEMPLATE = fileURLToPath(new URL('../gallery.html', import.meta.url));
const CACHE = STUDIO_OUT + '.imgcache/';
let magick = null;
const hasMagick = () => { if (magick === null) { try { execFileSync('magick', ['-version'], { stdio: 'ignore' }); magick = true; } catch { magick = false; } } return magick; };
// file → data URI, shrunk when ImageMagick is installed (a full card is ~300 KB as PNG, ~60 KB as an 880px JPEG)
function dataUri(file, { width = 880, keepPng = false } = {}) {
  const buf = fs.readFileSync(file);
  if (!hasMagick()) return `data:image/png;base64,${buf.toString('base64')}`;
  fs.mkdirSync(CACHE, { recursive: true });
  const key = CACHE + crypto.createHash('sha1').update(buf).update(`${width}${keepPng}`).digest('hex').slice(0, 16) + (keepPng ? '.png' : '.jpg');
  if (!fs.existsSync(key)) execFileSync('magick', [file, '-resize', `${width}x${width}>`, ...(keepPng ? ['-strip'] : ['-background', '#0a0705', '-flatten', '-quality', '82', '-strip']), key]);
  return `data:image/${keepPng ? 'png' : 'jpeg'};base64,${fs.readFileSync(key).toString('base64')}`;
}

// The full model with dependencies and issues on every entry (also what `check`, `deps` and the tests use).
export function studioModel() {
  const model = loadModel();
  model.purposes = CHANNEL_PURPOSES;
  const palette = paletteFromUi();
  for (const e of model.entries) {
    e.deps = depsFor(e, model);
    const seen = new Set();
    e.issues = e.messages.flatMap((m) => lintMessage(m.body, { kind: m.kind, palette })).filter((i) => !seen.has(i.rule + i.msg) && seen.add(i.rule + i.msg));
  }
  model.repo = lintRepo({ commands: COMMANDS, appCommands: APP_COMMANDS, entries: model.entries, cfg: model.cfg });
  // a missing banner is also an issue of every message that shows it
  for (const e of model.entries) for (const u of e.messages.flatMap((m) => imageUrls(m.body))) {
    const f = /\/cards\/(banner-\w+\.png)/.exec(u)?.[1];
    if (f && !cardPath(model.manifest, f) && !e.issues.some((i) => i.rule === 'banner-missing')) e.issues.push({ level: 'error', rule: 'banner-missing', msg: `Shows ${f}, which scripts/cards.mjs does not draw: a broken picture in Discord.` });
  }
  return model;
}

export function buildGallery({ entries = null, model = studioModel(), title = null } = {}) {
  const list = entries ?? model.entries, cfg = model.cfg;
  const img = {}, pics = {};
  const put = (name, file, opt) => { if (!img[name]) img[name] = dataUri(file, opt); return name; };
  const crest = put('crest', path.join(ROOT, 'phoenix/overlay/crest-sm.png'), { width: 160, keepPng: true });
  const avatars = {};
  for (const app of Object.keys(model.apps)) {
    const f = [`bot/icons/phoenix/v2/phoenix-${app}-128.png`, `bot/icons/phoenix/phoenix-${app === 'tools' ? 'toolbot' : app}-128.png`, 'bot/icons/phoenix/phoenix-core-128.png'].map((x) => path.join(ROOT, x)).find((x) => fs.existsSync(x));
    avatars[app] = put('av-' + app, f, { width: 96, keepPng: true });
  }
  const resolve = (url) => {
    if (pics[url]) return;
    if (url.startsWith('data:image/')) { img['inline-' + Object.keys(img).length] = url; pics[url] = { src: Object.keys(img).at(-1), alt: 'inline picture' }; return; }
    if (url === '@share') { pics[url] = { src: put('share', path.join(ROOT, 'phoenix/overlay/share.png')), alt: 'Site share image' }; return; }
    const card = /(?:\/cards\/|attachment:\/\/)([A-Za-z0-9_.\-]+\.png)/.exec(url)?.[1] ?? (/^[A-Za-z0-9_.\-]+\.png$/.test(url) ? url : null);
    if (card) { const f = cardPath(model.manifest, card); pics[url] = f ? { src: put(card, f), alt: card } : { ph: `${card} is not drawn by scripts/cards.mjs: this picture is a broken link in Discord`, bad: true }; return; }
    if (/assets\/crest\.png|crest[-\w]*\.png$/.test(url) && !/easports/.test(url)) { pics[url] = { src: crest, alt: 'Phoenix Fire crest' }; return; }
    pics[url] = { ph: /easports/.test(url) ? 'Club crest (from EA)' : /embed\/avatars|cdn\.discordapp/.test(url) ? 'Member avatar' : /jtvnw|twitch/.test(url) ? 'Live stream preview (from Twitch)' : /ytimg|youtube/.test(url) ? 'Video thumbnail (from YouTube)' : 'Picture from ' + (url.match(/^https?:\/\/([^/]+)/)?.[1] ?? 'outside the repo') };
  };
  for (const e of list) { if (e.image) resolve(e.image); for (const m of e.messages) for (const u of imageUrls(m.body)) resolve(u); }

  const data = {
    at: Date.now(), generated: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', title,
    brand: { name: cfg.siteTitle, red: cfg.brand.red, motto: cfg.brand.motto }, site: cfg.siteUrl, apps: model.apps, crest, avatars, img, pics, repo: model.repo,
    entries: list.map((e) => ({ id: e.id, name: e.name, summary: e.summary, category: e.category, app: e.app, trigger: e.trigger, schedule: e.schedule, destinations: e.destinations, flag: e.flag, level: e.level, status: e.status, note: e.note, related: e.related, uncaptured: e.uncaptured, image: e.image, unfurl: e.unfurl,
      messages: e.messages.map((m) => ({ kind: m.kind, via: m.via, label: m.label, dest: m.dest, files: m.files, body: m.body })), issues: e.issues ?? [],
      deps: e.deps ? { source: e.deps.source, builder: e.deps.builder, files: e.deps.files, tests: e.deps.tests, checklist: e.deps.checklist } : null })),
  };
  const fragment = fs.readFileSync(TEMPLATE, 'utf8').replace('/*DATA*/null', () => JSON.stringify(data).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, ''));
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>\n${fragment}\n</body></html>`;
  return { fragment, page, stats: { entries: list.length, pictures: Object.keys(img).length, bytes: fragment.length } };
}
export function writeGallery(opt = {}, name = 'gallery') {
  const g = buildGallery(opt);
  fs.mkdirSync(STUDIO_OUT, { recursive: true });
  fs.writeFileSync(`${STUDIO_OUT}${name}.html`, g.page);
  fs.writeFileSync(`${STUDIO_OUT}${name}.artifact.html`, g.fragment);
  return { ...g.stats, file: `tools/bot-studio/out/${name}.html`, artifact: `tools/bot-studio/out/${name}.artifact.html` };
}
