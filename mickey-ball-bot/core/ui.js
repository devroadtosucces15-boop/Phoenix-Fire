// Message layout kit: every message the bot sends is one panel (Discord's container) with a colour stripe, a header (small label, title,
// detail line, optional crest on the right), body blocks split by dividers, drawn pictures, a small footer and the buttons last.
// With this layout a message has no `content`/`embeds`: all text lives in text blocks.
//   message({ accent: 'win', blocks: [header({...}), cards(url), text('…'), footer('…'), buttons([...])] })
export const IS_V2 = 1 << 15;
export const EPHEMERAL = 1 << 6;

// Stripe colours – what kind of message it is, before anyone reads a word.
export const ACCENT = {
  win: 0x3ddc84,   // a win
  draw: 0xf5c842,  // a draw
  loss: 0xff5a52,  // a defeat
  info: 0xb54cff, // everything that is not a match result: stats, search, help, notices
};
export const resultAccent = (res) => ({ W: 'win', D: 'draw', L: 'loss' }[res] ?? 'info');
export const ICON = { goal: '⚽', assist: '🎯', motm: '⭐', win: '✅', draw: '➖', loss: '❌' };
export const RESULT_ICON = { W: ICON.win, D: ICON.draw, L: ICON.loss };
export const RESULT_WORD = { W: 'Win', D: 'Draw', L: 'Defeat' };

const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

// ---------- blocks ----------
export const text = (content) => (content ? { type: 10, content: clip(content, 3900) } : null);
export const sep = ({ big = false, line = true } = {}) => ({ type: 14, divider: line, spacing: big ? 2 : 1 });
export const footer = (s) => (s ? text(`-# ${s}`) : null);
export const label = (s) => text(`-# **${String(s).toUpperCase()}**`);
// Club pill for a result: inline code reads as a badge.
export const tagBlock = (tag, kind) => (tag ? text(`**\`${String(tag).toUpperCase()}\`**${kind ? ` · ${String(kind).toUpperCase()}` : ''}`) : null);
const webUrl = (u) => (/^https?:\/\//i.test(String(u ?? '')) ? String(u) : null); // Discord only fetches http(s) pictures
// Header: small label · bold title · grey detail line, with an optional picture on the right (the club crest).
export function header({ eyebrow = null, title, sub, thumb, size = 2 }) {
  thumb = webUrl(thumb);
  const t = text([eyebrow && `-# ${String(eyebrow).toUpperCase()}`, `${'#'.repeat(size)} ${title}`, sub && `-# ${sub}`].filter(Boolean).join('\n'));
  return thumb ? { type: 9, components: [t], accessory: { type: 11, media: { url: thumb } } } : t;
}
export const side = (content, accessory) => (accessory ? { type: 9, components: [text(content)], accessory } : text(content));
export const thumb = (url) => (webUrl(url) ? { type: 11, media: { url: webUrl(url) } } : null);
// Drawn pictures. Null when there is nothing to show, so callers can fall back to text.
export function cards(...imgs) {
  const items = imgs.flat().filter(Boolean).map((i) => (typeof i === 'string' ? { media: { url: i } } : { media: { url: i.url }, description: i.alt ? clip(i.alt, 1000) : undefined }));
  return items.length ? { type: 12, items: items.slice(0, 10) } : null;
}
// "Label  value" lines – short facts one per line, label in bold.
export const facts = (pairs) => text(pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => `**${k}** ${v}`).join('\n'));

// ---------- buttons ----------
const STYLE = { grey: 2, ok: 3, no: 4, brand: 1 };
export function button({ label: l, id, url, style = 'grey', emoji, disabled }) {
  const b = url ? { type: 2, style: 5, url, label: clip(l, 80) } : { type: 2, style: STYLE[style] ?? 2, custom_id: id, label: l ? clip(l, 80) : undefined };
  if (emoji) b.emoji = { name: emoji };
  if (disabled) b.disabled = true;
  return b;
}
export function buttons(list) {
  const all = list.filter(Boolean).map((b) => (b.type === 2 ? b : button(b)));
  const sorted = [...all.filter((b) => b.style !== 5), ...all.filter((b) => b.style === 5)];
  const rows = [];
  for (let k = 0; k < sorted.length && rows.length < 2; k += 5) rows.push({ type: 1, components: sorted.slice(k, k + 5) });
  return rows;
}
export const menu = ({ id, placeholder, options }) => ({ type: 1, components: [{ type: 3, custom_id: id, placeholder, min_values: 1, max_values: 1, options }] });

// ---------- messages ----------
export function panel({ accent = 'info', blocks }) {
  return { type: 17, accent_color: ACCENT[accent] ?? accent, components: blocks.flat().filter(Boolean) };
}
export function message({ accent, blocks, ephemeral = false }) {
  return { flags: IS_V2 | (ephemeral ? EPHEMERAL : 0), components: [panel({ accent, blocks })], allowed_mentions: { parse: [] } };
}
// Compact reply – errors, confirmations, empty states: one bold line, one line on what to do.
export function notice(title, body = '', { accent = 'info', ephemeral = false, extra = [] } = {}) {
  return message({ accent, ephemeral, blocks: [text(`**${title}**${body ? `\n${body}` : ''}`), ...extra] });
}

// Every piece of text in a message, flattened – for tests.
export function plainText(msg) {
  const out = [];
  const walk = (c) => {
    if (!c || typeof c !== 'object') return;
    if (Array.isArray(c)) return c.forEach(walk);
    if (c.type === 10) out.push(c.content);
    if (c.label) out.push(c.label);
    walk(c.components); walk(c.accessory);
  };
  walk(msg?.components);
  return out.join('\n');
}
export function images(msg) {
  const out = [];
  const walk = (c) => {
    if (!c || typeof c !== 'object') return;
    if (Array.isArray(c)) return c.forEach(walk);
    if (c.type === 12) c.items.forEach((i) => out.push(i.media.url));
    if (c.type === 11) out.push(c.media.url);
    walk(c.components); walk(c.accessory);
  };
  walk(msg?.components);
  return out;
}
