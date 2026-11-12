// The match-night roster as one picture (design "Match Report Looks", check-in section): small round faces in three
// groups – in, maybe, out – numbered in the order people FIRST answered, with a tick on everyone who has checked in.
// Everyone fits in one picture, so a full squad no longer makes the post long. Drawn in the Worker because the roster
// changes with every tap: a model → SVG (pure, tested) → PNG through the Images binding, stored in R2 under a hash of
// the roster so an unchanged roster is never drawn twice. Any failure returns null and the post keeps its text rows.
// Phoenix look: ember accent, warm ink panel, the Phoenix crest (static/crest-sm.png on the site) and the org name from config.
//   Flag `rosterPicture` (off by default). GET /api/events/roster-test?id= (owner) says why a draw failed.
import { flagOn } from './roles.js';
import { facesOf } from './faces.js';
import { cards } from './ui.js';
import { orgName } from './orgconfig.js';

export const rosterOn = (env) => flagOn(env, { role: 'owner' }, 'rosterPicture') && !!env.IMAGES?.input && !!env.MEDIA;

const W = 1000, PAD = 28, ROW = 54, FACE_MAX = 24, FACE_BYTES = 200e3, CREST_BYTES = 150e3;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Emoji and symbols would draw as empty boxes in a font-less renderer.
const plain = (s, max = 22) => (String(s ?? '').replace(/[^\p{L}\p{N}\p{M} ._\-'|]/gu, '').replace(/\s+/g, ' ').trim() || '?').slice(0, max);
const initials = (s) => (plain(s, 40).match(/[\p{L}\p{N}]/gu) ?? ['?']).slice(0, 2).join('').toUpperCase();

// Phoenix identity (config.json brand): the accent may be overridden per deployment with env.BRAND_ACCENT.
export const rosterTheme = (env) => ({ accent: /^#[0-9a-f]{6}$/i.test(env?.BRAND_ACCENT ?? '') ? env.BRAND_ACCENT : '#e8651a', ink: '#0a0705', name: orgName(env) });

// rsvps: rows in first-answer order (rsvpRows). checkins: event_checkins rows. mode 'rsvp' groups by answer;
// 'checkin' groups by who is here.
export function rosterModel(rsvps = [], checkins = [], { mode = 'rsvp', posOf = () => '' } = {}) {
  const here = new Set(checkins.map((c) => String(c.user_id)));
  const rank = new Map(rsvps.map((r, i) => [String(r.user_id), i + 1]));
  const one = (r) => ({ id: String(r.user_id), n: rank.get(String(r.user_id)) ?? null, name: plain(r.name), pos: posOf(r) || '', on: here.has(String(r.user_id)) });
  const walkIns = checkins.filter((c) => !rank.has(String(c.user_id))).map((c) => ({ id: String(c.user_id), n: null, name: plain(c.name), pos: '', on: true }));
  const by = (st) => rsvps.filter((r) => r.status === st).map(one);
  if (mode === 'checkin') {
    const keen = [...by('yes'), ...by('maybe')].sort((a, b) => a.n - b.n);
    return { mode, groups: [['Checked in', 'ok', [...keen.filter((x) => x.on), ...walkIns]], ['Not checked in yet', 'warn', keen.filter((x) => !x.on)]] };
  }
  return { mode, groups: [['In', 'ok', by('yes')], ['Maybe', 'warn', by('maybe')], ['Out', 'no', by('no')]] };
}

const TONE = { ok: '#4be08a', warn: '#efcf7a', no: '#ff7d72' };
const FONT = "Oswald, 'Arial Narrow', Arial, Helvetica, sans-serif";

// faces: Map(id → data: URI). crest: a data: URI of the Phoenix crest (or null). Returns the SVG text.
export function rosterSvg(model, faces = new Map(), { title = 'Who is playing', sub = '', crest = null, theme = rosterTheme() } = {}) {
  const { accent, ink, name } = theme;
  let y = 0, body = '', clip = 0;
  const face = (x, cy, r, p) => {
    const id = `f${clip++}`, uri = faces.get(p.id);
    const ring = `<circle cx="${x + r}" cy="${cy}" r="${r + 2}" fill="none" stroke="${p.on ? '#4be08a' : '#3a2a20'}" stroke-width="3"/>`;
    return uri
      ? `<clipPath id="${id}"><circle cx="${x + r}" cy="${cy}" r="${r}"/></clipPath><image href="${uri}" x="${x}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>${ring}`
      : `<circle cx="${x + r}" cy="${cy}" r="${r}" fill="#2a1a10"/><text x="${x + r}" y="${cy + r * 0.32}" font-size="${Math.round(r * 0.85)}" font-weight="600" text-anchor="middle" fill="#c9a98f" font-family="${FONT}">${esc(initials(p.name))}</text>${ring}`;
  };
  const counts = model.groups.map(([label, tone, list]) => `<tspan fill="${TONE[tone]}" font-weight="700">${list.length}</tspan> <tspan fill="#c9a98f">${esc(label.toLowerCase())}</tspan>`).join('<tspan fill="#6b5546">   ·   </tspan>');
  y = 28;
  body += `<text x="${PAD}" y="${y + 14}" font-size="17" font-weight="700" letter-spacing="5" fill="${accent}" font-family="${FONT}">${esc(String(name).toUpperCase())}</text>`;
  body += `<text x="${PAD}" y="${y + 50}" font-size="34" font-weight="700" fill="#fff4ea" font-family="${FONT}" letter-spacing="1">${esc(title.toUpperCase())}</text>`;
  body += `<text x="${PAD}" y="${y + 88}" font-size="24" font-family="${FONT}">${counts}</text>`;
  const right = crest ? W - PAD - 64 : W - PAD;
  if (crest) body += `<image href="${crest}" x="${W - PAD - 56}" y="${y - 6}" width="56" height="56" preserveAspectRatio="xMidYMid meet"/>`;
  if (sub) body += `<text x="${right}" y="${y + 80}" font-size="20" text-anchor="end" fill="#b89a85" font-family="${FONT}">${esc(sub)}</text>`;
  y += 116;
  for (const [label, tone, list] of model.groups) {
    if (!list.length) continue;
    body += `<rect x="${PAD}" y="${y}" width="6" height="26" rx="3" fill="${TONE[tone]}"/><text x="${PAD + 18}" y="${y + 22}" font-size="21" font-weight="700" letter-spacing="3" fill="#c9a98f" font-family="${FONT}">${esc(label.toUpperCase())}</text>`;
    y += 40;
    // two columns once a group has more than 6 people
    const cols = list.length > 6 ? 2 : 1, colW = (W - PAD * 2) / cols, rows = Math.ceil(list.length / cols);
    list.forEach((p, i) => {
      const cx = PAD + (i % cols) * colW, cy = y + Math.floor(i / cols) * ROW + ROW / 2;
      body += `<text x="${cx + 28}" y="${cy + 8}" font-size="22" text-anchor="end" fill="#b89a85" font-family="${FONT}">${p.n ?? '+'}</text>`;
      body += face(cx + 44, cy, 19, p);
      body += `<text x="${cx + 96}" y="${cy + 8}" font-size="24" font-weight="600" fill="#fff4ea" font-family="${FONT}">${esc(p.name)}</text>`;
      if (p.pos) body += `<text x="${cx + colW - 20}" y="${cy + 8}" font-size="20" text-anchor="end" fill="#b89a85" font-family="${FONT}">${esc(p.pos)}</text>`;
      if (p.on && model.mode === 'rsvp') body += `<circle cx="${cx + 44 + 36}" cy="${cy + 15}" r="9" fill="#4be08a" stroke="${ink}" stroke-width="2"/><path d="M${cx + 44 + 31.5} ${cy + 15} l3.2 3.4 l6 -6.6" fill="none" stroke="#06210f" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    });
    y += rows * ROW + 16;
  }
  const H = y + 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c0f08"/><stop offset="1" stop-color="${ink}"/></linearGradient><linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="#ffb27a"/></linearGradient></defs><rect width="${W}" height="${H}" rx="22" fill="url(#bg)"/><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="21" fill="none" stroke="rgba(232,101,26,.28)" stroke-width="2"/><rect x="0" y="0" width="${W}" height="6" rx="3" fill="url(#bar)"/>${body}</svg>`;
}

// ---------- drawing + caching ----------
const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
async function imageData(url, limit) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const type = r.headers.get('Content-Type') ?? '';
    if (!r.ok || !/^image\/(png|jpeg|webp)/.test(type)) return null;
    const buf = await r.arrayBuffer();
    return buf.byteLength <= limit ? `data:${type.split(';')[0]};base64,${b64(buf)}` : null;
  } catch { return null; }
}
const faceData = (url) => imageData(/^https:\/\/cdn\.discordapp\.com\//.test(url) && !url.includes('?') ? `${url}?size=64` : url, FACE_BYTES);
// The Phoenix crest from the published site (phoenix/overlay/crest-sm.png → static/crest-sm.png); null if the site is not reachable.
let crestMemo = null;
export const crestData = async (env) => {
  const site = String(env.SITE_URL || '').replace(/\/?$/, '/');
  if (!env.SITE_URL) return null;
  if (crestMemo?.site !== site || (!crestMemo.uri && Date.now() - crestMemo.at > 6e4)) crestMemo = { site, at: Date.now(), uri: await imageData(`${site}static/crest-sm.png`, CREST_BYTES) };
  return crestMemo.uri;
};
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');

// → { url, key, cached } or { error }. Never throws.
export async function drawRoster(env, eventId, model, opts = {}) {
  try {
    const people = model.groups.flatMap((g) => g[2]).slice(0, FACE_MAX);
    const faceUrls = await facesOf(env, people.map((p) => p.id));
    const theme = rosterTheme(env);
    const crest = await crestData(env);
    const hash = await sha(JSON.stringify([model, opts, theme, !!crest, people.map((p) => faceUrls.get(p.id))]));
    const key = `r/${eventId}-${model.mode}-${hash}.png`, base = String(env.PUBLIC_URL || '').replace(/\/?$/, '');
    if (!base) return { error: 'PUBLIC_URL is not set.' };
    if (await env.MEDIA.head?.(key) ?? await env.MEDIA.get(key)) return { url: `${base}/media/${key}`, key, cached: true };
    const faces = new Map((await Promise.all(people.map(async (p) => [p.id, await faceData(faceUrls.get(p.id))]))).filter(([, d]) => d));
    const svg = rosterSvg(model, faces, { ...opts, crest, theme });
    const out = await env.IMAGES.input(new Blob([svg], { type: 'image/svg+xml' }).stream()).output({ format: 'image/png' });
    const png = await out.response().arrayBuffer();
    if (png.byteLength < 2000) return { error: 'The Images binding returned an empty picture.' };
    await env.MEDIA.put(key, png, { httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' } });
    // best effort: older drawings of this roster are never shown again
    env.MEDIA.list?.({ prefix: `r/${eventId}-${model.mode}-`, limit: 50 }).then((l) => l.objects.filter((o) => o.key !== key).forEach((o) => env.MEDIA.delete(o.key).catch(() => {}))).catch(() => {});
    return { url: `${base}/media/${key}`, key, cached: false };
  } catch (err) { return { error: String(err?.message ?? err).slice(0, 200) }; }
}

// The picture as a post block, or null (flag off, nothing to show, or the draw failed → the post keeps its text rows).
export async function rosterBlock(env, eventId, rsvps, checkins, { mode = 'rsvp', posOf, title, sub } = {}) {
  if (!rosterOn(env)) return null;   // checkins may be a function, so a post with the flag off costs no extra read
  if (typeof checkins === 'function') checkins = await checkins();
  if (!(rsvps.length || checkins.length)) return null;
  const model = rosterModel(rsvps, checkins, { mode, posOf });
  const res = await drawRoster(env, eventId, model, { title, sub });
  if (!res.url) { console.log('roster picture failed:', res.error); return null; }
  const alt = model.groups.map(([label, , list]) => `${label}: ${list.map((p) => `${p.n ?? '+'} ${p.name}${p.pos ? ` ${p.pos}` : ''}`).join(', ') || 'nobody'}`).join('. ');
  return cards({ url: res.url, alt });
}
