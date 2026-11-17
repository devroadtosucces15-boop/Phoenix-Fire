// PF-024 Item 10 – the Quote card. Right click a message → Apps → "Quote card" turns it into a clean share picture: big quote
// text, the author's avatar and name, the date, the Phoenix crest and motto. Interactions only (no gateway, no Message Content
// intent): the message arrives resolved inside the interaction. Same drawing path as the roster picture (bot/rosterpic.js):
// a model → SVG (pure, tested) → PNG through the Images binding → R2, named by a hash so the same quote is never drawn twice.
// No Images/R2 binding or a failed draw → the reply falls back to a styled text quote. Flag `quoteCard` (owner until QA).
import { flagOn } from './roles.js';
import { message, header, text, footer, cards } from './ui.js';
import { orgName, orgMotto } from './orgconfig.js';
import { imageData, sha, crestData, rosterTheme } from './rosterpic.js';
import { kvOf } from './kv.js';

export const MAX_QUOTE = 600; // characters kept; longer messages end with …
export const QUOTES_PER_HOUR = 20; // per person, so a held-down command cannot fill the image bucket
const W = 1080, H = 1080, FONT = "Oswald, 'Arial Narrow', Arial, Helvetica, sans-serif", SERIF = "Georgia, 'Times New Roman', serif";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const quoteOn = (env) => flagOn(env, { role: 'owner' }, 'quoteCard');
export const imagesReady = (env) => !!env.IMAGES?.input && !!env.MEDIA;

// Discord text → plain words the (font-less) renderer can draw: mentions become @name, custom emoji and markup go, and any emoji or
// symbol that would draw as an empty box is dropped.
export function cleanQuote(content, { mentions = [], channels = {} } = {}) {
  const names = new Map(mentions.map((u) => [String(u.id), u.member?.nick || u.global_name || u.username || 'someone']));
  let s = String(content ?? '')
    .replace(/<a?:\w+:\d+>/g, '')
    .replace(/<@[!&]?(\d+)>/g, (_, id) => `@${names.get(id) ?? 'someone'}`)
    .replace(/<#(\d+)>/g, (_, id) => `#${channels[id] ?? 'channel'}`)
    .replace(/<t:\d+(?::\w)?>/g, '')
    .replace(/^>+\s?/gm, '')
    .replace(/(\*\*|__|~~|\|\||`+)/g, '')
    .replace(/(^|\s)[*_](\S[^*_\n]*?)[*_](?=\s|$)/g, '$1$2')
    .replace(/[^\p{L}\p{N}\p{M}\p{P}\p{Sc}\s+=<>~^|&%]/gu, '')
    .replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (s.length > MAX_QUOTE) s = `${s.slice(0, MAX_QUOTE - 1).replace(/\s+\S*$/, '')}…`;
  return s;
}
const plainName = (s, n = 28) => (String(s ?? '').replace(/[^\p{L}\p{N}\p{M}\p{P} ]/gu, '').replace(/\s+/g, ' ').trim() || 'Someone').slice(0, n);
const initials = (s) => (plainName(s, 40).match(/[\p{L}\p{N}]/gu) ?? ['?']).slice(0, 2).join('').toUpperCase();
const day = (iso) => { const d = new Date(iso); return Number.isFinite(+d) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''; };

// The picture model from the resolved message of a context-menu interaction (null when there is nothing to quote).
export function quoteModel(msg, resolved = {}) {
  if (!msg || msg.author?.bot) return null;
  const members = resolved.members ?? {}, mentions = (msg.mentions ?? []).map((u) => ({ ...u, member: u.member ?? members[u.id] }));
  const body = cleanQuote(msg.content, { mentions });
  if (!body) return null;
  const a = msg.author ?? {}, nick = members[a.id]?.nick;
  return {
    text: body, name: plainName(nick || a.global_name || a.username), handle: a.username ? `@${plainName(a.username, 32)}` : '', date: day(msg.timestamp),
    authorId: String(a.id ?? ''), avatar: a.avatar && a.id ? `https://cdn.discordapp.com/avatars/${a.id}/${a.avatar}.png` : null,
  };
}

// Greedy word wrap on an estimated glyph width (Oswald is narrow: ~0.46 em). Over-long words are cut.
export function wrapQuote(s, size, width) {
  const per = Math.max(8, Math.floor(width / (size * 0.5))), lines = [];
  let line = '';
  for (let w of String(s).split(' ')) {
    while (w.length > per) { if (line) { lines.push(line); line = ''; } lines.push(w.slice(0, per)); w = w.slice(per); }
    if (!line) line = w; else if ((line + ' ' + w).length <= per) line += ' ' + w; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}
// The biggest type size whose lines still fit the text area.
export function fitQuote(s, { width = 880, height = 470 } = {}) {
  for (const size of [76, 64, 54, 46, 40, 34]) {
    const lines = wrapQuote(s, size, width);
    if (lines.length * size * 1.28 <= height) return { size, lines };
  }
  const size = 30, max = Math.floor(height / (size * 1.28)), lines = wrapQuote(s, size, width);
  return { size, lines: lines.length > max ? [...lines.slice(0, max - 1), `${lines[max - 1].replace(/\s*\S*$/, '')}…`] : lines };
}

// avatar / crest: data: URIs or null. Returns the SVG text.
export function quoteSvg(model, { avatar = null, crest = null, theme = rosterTheme(), motto = '' } = {}) {
  const { accent, ink, name } = theme, { size, lines } = fitQuote(model.text), lh = Math.round(size * 1.28);
  let body = `<text x="90" y="108" font-size="22" font-weight="700" letter-spacing="7" fill="${accent}" font-family="${FONT}">${esc(String(name).toUpperCase())}</text>`;
  if (crest) body += `<image href="${crest}" x="${W - 90 - 64}" y="52" width="64" height="64" preserveAspectRatio="xMidYMid meet"/>`;
  body += `<text x="74" y="330" font-size="280" font-weight="700" fill="${accent}" opacity=".9" font-family="${SERIF}">“</text>`;
  const top = 360 + Math.max(0, Math.floor((470 - lines.length * lh) / 2)); // centre the words in the text area
  lines.forEach((l, i) => { body += `<text x="90" y="${top + size + i * lh}" font-size="${size}" font-weight="500" fill="#fff4ea" font-family="${FONT}">${esc(l)}</text>`; });
  const by = H - 196;
  body += `<rect x="90" y="${by - 34}" width="140" height="5" rx="2.5" fill="${accent}"/>`;
  body += avatar
    ? `<clipPath id="av"><circle cx="146" cy="${by + 44}" r="46"/></clipPath><image href="${avatar}" x="100" y="${by - 2}" width="92" height="92" preserveAspectRatio="xMidYMid slice" clip-path="url(#av)"/><circle cx="146" cy="${by + 44}" r="48" fill="none" stroke="${accent}" stroke-width="3"/>`
    : `<circle cx="146" cy="${by + 44}" r="46" fill="#2a1a10" stroke="${accent}" stroke-width="3"/><text x="146" y="${by + 62}" font-size="46" font-weight="600" text-anchor="middle" fill="#c9a98f" font-family="${FONT}">${esc(initials(model.name))}</text>`;
  body += `<text x="212" y="${by + 36}" font-size="42" font-weight="700" fill="#fff4ea" font-family="${FONT}">${esc(model.name)}</text>`;
  body += `<text x="212" y="${by + 76}" font-size="26" fill="#b89a85" font-family="${FONT}">${esc([model.handle, model.date].filter(Boolean).join('  ·  '))}</text>`;
  if (motto) body += `<text x="${W - 90}" y="${H - 64}" font-size="24" letter-spacing="4" text-anchor="end" fill="#b89a85" font-family="${FONT}">${esc(motto.toUpperCase())}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c0f08"/><stop offset="1" stop-color="${ink}"/></linearGradient><radialGradient id="glow" cx="1" cy="1" r="0.85"><stop offset="0" stop-color="${accent}" stop-opacity=".32"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#glow)"/><rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="30" fill="none" stroke="${accent}" stroke-opacity=".35" stroke-width="2"/>${body}</svg>`;
}

// → { url, key, cached } or { error }. Never throws.
export async function drawQuote(env, model) {
  try {
    const theme = rosterTheme(env), motto = orgMotto(env), base = String(env.PUBLIC_URL || '').replace(/\/?$/, '');
    if (!base) return { error: 'PUBLIC_URL is not set.' };
    const crest = await crestData(env);
    const key = `q/${await sha(JSON.stringify([model, theme, motto, !!crest]))}.png`;
    if (await (env.MEDIA.head ? env.MEDIA.head(key) : env.MEDIA.get(key))) return { url: `${base}/media/${key}`, key, cached: true };
    const avatar = model.avatar ? await imageData(`${model.avatar}?size=128`, 250e3) : null;
    const svg = quoteSvg(model, { avatar, crest, theme, motto });
    const out = await env.IMAGES.input(new Blob([svg], { type: 'image/svg+xml' }).stream()).output({ format: 'image/png' });
    const png = await out.response().arrayBuffer();
    if (png.byteLength < 2000) return { error: 'The Images binding returned an empty picture.' };
    await env.MEDIA.put(key, png, { httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' } });
    return { url: `${base}/media/${key}`, key, cached: false };
  } catch (err) { return { error: String(err?.message ?? err).slice(0, 200) }; }
}

// Per-person hourly counter in KV (the card studio's pattern). No KV bound = no limit.
export async function spendQuote(env, uid, now = Date.now()) {
  const kv = kvOf(env);
  if (!kv || !uid) return true;
  const key = `quoterl:${uid}:${Math.floor(now / 3600e3)}`, n = Number(await kv.get(key)) || 0;
  if (n >= QUOTES_PER_HOUR) return false;
  await kv.put(key, String(n + 1), { expirationTtl: 2 * 3600 });
  return true;
}

// The public reply: the picture, or (no image binding / failed draw) the same words as a Phoenix text panel.
export function quoteMessage(env, model, imageUrl, { byLine = null } = {}) {
  const tag = `${orgName(env)} · quote card${byLine ? ` · shared by ${byLine}` : ''}`;
  return message({
    accent: 'red',
    blocks: imageUrl
      ? [cards({ url: imageUrl, alt: `“${model.text.slice(0, 300)}” – ${model.name}` }), footer(tag)]
      : [header({ eyebrow: 'Quote card', title: model.name, sub: [model.handle, model.date].filter(Boolean).join(' · '), size: 3 }), text(`“${model.text}”`), footer(tag)],
  });
}
export const quoteNote = (content) => message({ accent: 'steel', ephemeral: true, blocks: [text(String(content))] });
