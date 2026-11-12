// Bot Studio checks: what would make Discord reject a message, break the Phoenix look, or leave a picture missing.
// `error` = must fix (Discord refuses it, or a NOREX leak). `warn` = off the design system (bot/ui.js), still sends.
import { BANNER_SPEC } from '../../../bot/banners.js';
import fs from 'node:fs';
import path from 'node:path';
import { flat, textOf, ROOT } from './model.mjs';

const hex = (n) => '#' + Number(n).toString(16).padStart(6, '0');
const NOREX_COLOURS = [0xc8352c, 0x080b11];
// custom_id values keep their norex: prefix on purpose (identifiers, see CLAUDE.md), so they are removed before the name check.
const visibleJson = (b) => JSON.stringify(b, (k, v) => (k === 'custom_id' || k === 'value' ? undefined : v));

export function lintMessage(body, { kind = 'reply', palette = [] } = {}) {
  const out = [], err = (rule, msg) => out.push({ level: 'error', rule, msg }), warn = (rule, msg) => out.push({ level: 'warn', rule, msg });
  if (!body) return out;
  const cs = flat(body.components), v2 = !!((body.flags ?? 0) & (1 << 15));

  if (kind === 'modal') {
    if ((body.title ?? '').length > 45) err('modal-title', `Form title is ${body.title.length} characters (Discord allows 45).`);
    if ((body.components ?? []).length > 5) err('modal-rows', 'A form can hold 5 fields at most.');
    for (const c of cs.filter((x) => x.type === 4)) if ((c.label ?? '').length > 45) err('modal-label', `Field label “${c.label.slice(0, 30)}…” is ${c.label.length} characters (Discord allows 45).`);
    if ((body.custom_id ?? '').length > 100) err('custom-id', 'Form custom_id is over 100 characters.');
    return brand(body, out);
  }
  // ---- Discord limits ----
  if (v2) {
    if (body.content || body.embeds?.length) err('v2-mixed', 'A Components V2 message cannot also carry content or embeds: Discord rejects it.');
    const chars = cs.filter((c) => c.type === 10).reduce((n, c) => n + (c.content?.length ?? 0), 0);
    if (chars > 4000) err('v2-text', `Text adds up to ${chars} characters (Discord allows 4000 per message).`);
    else if (chars > 2600) warn('wall', `Long message (${chars} characters). Split it or move detail to the site.`);
    if (cs.length > 40) err('v2-count', `${cs.length} components (Discord allows 40 per message).`);
    for (const c of cs.filter((x) => x.type === 12)) if ((c.items ?? []).length > 10) err('gallery', 'A picture row holds 10 pictures at most.');
  } else {
    if ((body.content ?? '').length > 2000) err('content', `Content is ${body.content.length} characters (Discord allows 2000).`);
    if ((body.embeds ?? []).length > 10) err('embeds', 'More than 10 embeds.');
    for (const e of body.embeds ?? []) {
      if ((e.title ?? '').length > 256) err('embed-title', 'Embed title is over 256 characters.');
      if ((e.description ?? '').length > 4096) err('embed-desc', 'Embed description is over 4096 characters.');
      if ((e.fields ?? []).length > 25) err('embed-fields', 'More than 25 embed fields.');
    }
    if ((body.components ?? []).length > 5) err('rows', 'More than 5 button rows.');
  }
  const ids = new Map();
  for (const c of cs) {
    if (c.type === 1) {
      const kids = c.components ?? [];
      if (kids.filter((k) => k.type === 2).length > 5) err('row-buttons', 'A row holds 5 buttons at most.');
      if (kids.some((k) => k.type !== 2) && kids.length > 1) err('row-mixed', 'A menu must sit alone in its row.');
      if (!kids.length) err('row-empty', 'Empty button row.');
    }
    if (c.type === 2) {
      if ((c.label ?? '').length > 80) err('button-label', `Button label “${c.label.slice(0, 24)}…” is over 80 characters.`);
      if (!c.label && !c.emoji) err('button-empty', 'Button has no label and no emoji.');
      if (c.style === 5 ? !c.url : !c.custom_id) err('button-target', c.style === 5 ? 'Link button has no url.' : `Button “${c.label ?? ''}” has no custom_id.`);
      if (c.style === 5 && c.url && !/^https?:\/\//.test(c.url)) err('button-url', `Link button url is not http(s): ${String(c.url).slice(0, 60)}`);
    }
    if (c.type === 3) {
      const n = (c.options ?? []).length;
      if (n > 25) err('select-options', `Menu has ${n} options (Discord allows 25).`);
      if (!n) err('select-empty', 'Menu has no options.');
      for (const o of c.options ?? []) if ((o.label ?? '').length > 100 || (o.description ?? '').length > 100) err('select-label', `Menu option “${String(o.label).slice(0, 24)}…” is over 100 characters.`);
      if ((c.placeholder ?? '').length > 150) err('select-placeholder', 'Menu placeholder is over 150 characters.');
    }
    if (c.custom_id) {
      if (c.custom_id.length > 100) err('custom-id', `custom_id ${c.custom_id.slice(0, 30)}… is over 100 characters.`);
      if (c.type !== 4) { if (ids.has(c.custom_id)) err('custom-id-dup', `Two controls share the custom_id ${c.custom_id}: Discord rejects the message.`); ids.set(c.custom_id, 1); }
    }
    if ((c.type === 11 || c.type === 12) ) for (const u of c.type === 11 ? [c.media?.url] : (c.items ?? []).map((i) => i.media?.url)) if (!u || !/^(https?:|attachment:)\/\//.test(u)) err('media-url', !u ? 'A picture block has no url: Discord rejects the message.' : `Picture url is ${String(u).slice(0, 24)}…, not http(s) or an attachment: Discord rejects it.`);
  }
  // ---- design system (bot/ui.js) ----
  if (!v2 && body.embeds?.length) warn('classic-embed', 'Classic embed. The rest of the bot uses Components V2 panels (bot/ui.js message()).');
  else if (!v2 && body.content) warn('plain-text', 'Plain text message, not a panel.');
  if (v2) {
    const box = (body.components ?? []).find((c) => c.type === 17);
    if (!box) warn('no-panel', 'No panel: text sits loose in the message.');
    if (box && box.accent_color != null && palette.length && !palette.includes(box.accent_color)) (NOREX_COLOURS.includes(box.accent_color) ? err : warn)('accent', `Stripe colour ${hex(box.accent_color)} is not in the Phoenix palette (bot/ui.js ACCENT).`);
    const texts = flat(box?.components ?? body.components).filter((c) => c.type === 10).map((c) => c.content ?? ''); // the ping line above the panel does not count
    const full = texts.length > 1 || cs.some((c) => c.type === 1 || c.type === 12); // one-line notices are exempt by design
    if (full && texts[0] && !/^(-# |#{1,3} |\*\*`)/.test(texts[0]) && !(kind === 'private' && /^\*\*/.test(texts[0]))) warn('no-header', 'Does not open with an eyebrow line or a heading.');
    if (full && kind !== 'private' && !texts.some((t) => /(^|\n)-# /.test(t))) warn('no-footer', 'No small footer or eyebrow line.');
    const rows = cs.filter((c) => c.type === 1 && (c.components ?? []).every((k) => k.type === 2));
    const all = rows.flatMap((r) => r.components);
    if (all.some((b, k) => b.style === 5 && all.slice(k + 1).some((x) => x.style !== 5))) warn('link-last', 'Link buttons should come last (bot/ui.js buttons() sorts them: build rows with it).');
    if (all.filter((b) => b.style === 3).length > 2) warn('green', 'More than two green buttons: green is for the one approving action.');
  }
  for (const e of body.embeds ?? []) if (e.color != null && palette.length && !palette.includes(e.color)) warn('embed-colour', `Embed colour ${hex(e.color)} is not in the Phoenix palette.`);
  return brand(body, out);
}
function brand(body, out) {
  const s = visibleJson(body);
  if (/norex/i.test(s.replace(/norexunited\.workers\.dev/g, ''))) out.push({ level: 'error', rule: 'norex-name', msg: 'A NOREX name is visible in this message.' });
  if (/c8352c|080b11/i.test(s) || NOREX_COLOURS.some((c) => new RegExp(`"(?:accent_)?color":${c}\\b`).test(s))) out.push({ level: 'error', rule: 'norex-colour', msg: 'A NOREX colour is used in this message.' });
  if (/norexunited\.workers\.dev/.test(s)) out.push({ level: 'warn', rule: 'worker-host', msg: 'Link goes to the norexunited Worker host (known leftover, owner decision pending).' });
  return out;
}

// ---- cross-file checks: the places that must change together ----
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
export function lintRepo({ commands, appCommands, entries, cfg }) {
  const out = [], add = (level, rule, msg, files) => out.push({ level, rule, msg, files });
  const ui = read('bot/ui.js'), cards = read('scripts/cards.mjs');
  const bannerV = +(/export const BANNER_V = (\d+)/.exec(ui)?.[1] ?? NaN), tplV = +(/export const TEMPLATE_VERSION = (\d+)/.exec(cards)?.[1] ?? NaN);
  if (bannerV !== tplV) add('error', 'banner-version', `bot/ui.js BANNER_V is ${bannerV} but scripts/cards.mjs TEMPLATE_VERSION is ${tplV}. Discord keeps showing the old cached banners until they match.`, ['bot/ui.js', 'scripts/cards.mjs']);
  const defined = new Set([...(/export const BANNERS = \{([\s\S]*?)\n\};/.exec(cards)?.[1] ?? '').matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
  // pictures added after the object (BANNERS.name = …), the family banners (bot/banners.js) and the help posters are drawn too
  for (const m of cards.matchAll(/^BANNERS\.(\w+) =/gm)) defined.add(m[1]);
  for (const k of Object.keys(BANNER_SPEC)) defined.add(k);
  for (const k of ['hub', 'core', 'stats', 'tools', 'matchday', 'rush']) defined.add(`help-${k}`);
  for (const f of fs.readdirSync(path.join(ROOT, 'bot')).filter((x) => x.endsWith('.js'))) {
    const src = read('bot/' + f);
    for (const m of src.matchAll(/bannerUrl\(\s*\w+\s*,\s*([^)]+)\)/g)) for (const n of m[1].matchAll(/'(\w+)'/g))
      if (!defined.has(n[1])) add('error', 'banner-missing', `bot/${f} shows the “${n[1]}” banner, but scripts/cards.mjs BANNERS has no “${n[1]}”: the picture is a broken link in Discord.`, ['bot/' + f, 'scripts/cards.mjs']);
  }
  const red = /red:\s*0x([0-9a-f]{6})/i.exec(ui)?.[1]?.toLowerCase();
  if (red && cfg.brand?.red && red !== cfg.brand.red.replace('#', '').toLowerCase()) add('error', 'accent-config', `bot/ui.js ACCENT.red (#${red}) differs from config.json brand.red (${cfg.brand.red}).`, ['bot/ui.js', 'config.json']);
  const leak = [...new Set([...cards.matchAll(/#?(c8352c|080b11)|rgba\(200,\s*53,\s*44/gi)].map((m) => m[0].toLowerCase()))];
  if (leak.length) add('error', 'cards-norex-colour', `scripts/cards.mjs still draws with NOREX colours (${leak.join(', ')}): they show in every card image and banner.`, ['scripts/cards.mjs']);
  const owned = Object.values(appCommands).flat();
  for (const c of commands) {
    const n = owned.filter((x) => x === c.name).length;
    if (n !== 1) add('error', 'app-owner', `/${c.name} is listed in ${n} apps in APP_COMMANDS (must be exactly one).`, ['bot/commanddefs.js']);
    if ((c.description ?? '').length > 100) add('error', 'cmd-description', `/${c.name} description is over 100 characters: Discord refuses the registration.`, ['bot/commanddefs.js']);
    if (!entries.some((e) => e.id === `slash:/${c.name}` && e.messages.length)) add('warn', 'no-capture', `/${c.name} has no captured reply. Run: node tools/bot-studio/studio.mjs capture`, ['bot/commanddefs.js']);
  }
  for (const n of owned) if (!commands.some((c) => c.name === n)) add('error', 'app-ghost', `APP_COMMANDS lists /${n}, which is not in COMMANDS.`, ['bot/commanddefs.js']);
  return out.filter((x, k) => out.findIndex((y) => y.msg === x.msg) === k);
}
export function paletteFromUi() {
  const block = /export const ACCENT = \{([\s\S]*?)\};/.exec(read('bot/ui.js'))?.[1] ?? '';
  return [...block.matchAll(/0x([0-9a-f]{6})/gi)].map((m) => parseInt(m[1], 16));
}
