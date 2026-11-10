// Uploads the icon set (bot/iconset.mjs) as application emoji to EVERY configured Discord app that has a bot token, and
// writes bot/emojis.gen.js ({ app → { icon → { id, name } } }) for the Worker. Application emoji belong to one app, so each
// app needs its own copy; bot/icons.js picks the set for the app handling a request.
// Run by .github/workflows/bot.yml before the deploy. Needs Chrome (the runners have it – ImageMagick can't draw strokes or
// gradients). App IDs come from bot/wrangler.toml, tokens from the environment: DISCORD_BOT_TOKEN_<APP> (core also takes
// DISCORD_BOT_TOKEN), exactly as in bot/apps.js.
// Never fails the deploy: anything that goes wrong leaves that app's unicode fallbacks (or its previous set) in place.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NAMES, svgOf } from './iconset.mjs';
import { findChrome } from '../scripts/lib/chrome.mjs';
import { registrationPlan, tomlVars } from './apps.js';
import { ensureAppEmojis } from './emojiset.mjs';
import { setsOf } from './icons.js';

const OUT = new URL('./emojis.gen.js', import.meta.url);
const toml = tomlVars(fs.existsSync(new URL('./wrangler.toml', import.meta.url)) ? fs.readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8') : '');
const env = { ...toml, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) };
const apps = registrationPlan(env); // configured apps that have a token (commands are irrelevant here)
if (!apps.length) { console.log('Icons: no bot token here – using unicode fallbacks'); process.exit(0); }

let sets = {};
try { sets = setsOf((await import(`${OUT.href}?${Date.now()}`)).default); } catch { /* start empty */ }

const chrome = findChrome();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-icons-'));
const render = (name) => {
  if (!chrome) throw new Error('no Chrome found');
  const html = path.join(dir, `${name}.html`), png = path.join(dir, `${name}.png`);
  if (!fs.existsSync(png)) {
    fs.writeFileSync(html, `<!doctype html><body style="margin:0;background:transparent">${svgOf(name).replace('width="24" height="24"', 'width="128" height="128"')}`);
    execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--screenshot=${png}`, '--window-size=128,128', `file://${html}`], { stdio: 'ignore', timeout: 40000 });
  }
  return fs.readFileSync(png);
};

for (const { app, appId, token } of apps) {
  try {
    sets[app] = await ensureAppEmojis({ appId, token, render, warn: (m) => console.warn(`[${app}] ${m}`) });
    console.log(`Icons [${app}]: ${Object.keys(sets[app]).length}/${NAMES.length} ready`);
  } catch (e) { console.warn(`Icons [${app}] skipped:`, e.message); } // keeps this app's previous set, if any
}
fs.writeFileSync(OUT, `// Written by bot/ensure-emojis.mjs during the bot deploy: { app → { icon name → { id, name } } }.\nexport default ${JSON.stringify(sets)};\n`);
