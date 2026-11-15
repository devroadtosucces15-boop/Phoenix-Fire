// /avatarcard: a private member panel that runs the real Card Studio pipeline (PF-020 4e). It replaces the old one-shot
// background maker. Nothing is stored between clicks: every choice is carried in the custom ids of the controls, which
// each click re-renders in place (type 7).
//   pf:card:<act>:<photo>:<outs>:<bg>:<pose>:<kit>:<number>
//   act = out | bg | pose | kit-m | kit-f | num (opens the number form) | go ; photo = 32 hex + ext letter, "last" or "none"
//   outs: 1 cinematic avatar, 2 website portrait, 3 both ; kit: m | f ; number: digits or "x" for none
import { can, flagOn } from './roles.js';
import { hex } from './media.js';
import { message, header, text, sep, buttons, footer, notice } from './ui.js';
import { submitCardRequest, canUseTemplate, photoType, PHOTO_MAX } from './cardstudio.js';
import { log } from './members.js';

export const CARD_ID = /^pf:card:/;
const EXT = { 'image/png': 'p', 'image/jpeg': 'j', 'image/webp': 'w' };
const EXT_NAME = { p: 'png', j: 'jpg', w: 'webp' };
const keyOf = (ph) => `cardphoto/${ph.slice(0, 32)}.${EXT_NAME[ph[32]]}`;
const PHOTO_RE = /^(none|last|[0-9a-f]{32}[pjw])$/;
const all = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results ?? []);

export const enc = (act, s) => `pf:card:${act}:${s.ph || 'none'}:${s.o}:${s.b || 0}:${s.p || 0}:${s.k}:${s.n === '' || s.n == null ? 'x' : s.n}`;
export function dec(id) {
  const [, , act, ph, o, b, p, k, n] = String(id).split(':');
  if (!PHOTO_RE.test(ph || '') || !/^[123]$/.test(o) || !/^\d{1,9}$/.test(b) || !/^\d{1,9}$/.test(p) || !/^[mf]$/.test(k) || !/^(x|\d{1,2})$/.test(n || '')) return null;
  return { act, s: { ph: ph === 'none' ? '' : ph, o: Number(o), b: Number(b), p: Number(p), k, n: n === 'x' ? '' : n } };
}

const lastPhoto = (env, uid) => env.DB.prepare("SELECT photo_key FROM card_requests WHERE user_id = ? AND photo_key <> '' AND photo_key IS NOT NULL ORDER BY created_at DESC LIMIT 1").bind(uid).first().then((r) => r?.photo_key || null);

async function looks(env, me, kind) {
  const rows = await all(env, 'SELECT * FROM card_templates WHERE kind = ? AND active = 1 ORDER BY id LIMIT 25', kind);
  const out = [];
  for (const t of rows) if (await canUseTemplate(env, me.u, t)) out.push(t);
  return out;
}

const select = (id, placeholder, options, { min = 1, max = 1 } = {}) => ({ type: 1, components: [{ type: 3, custom_id: id, placeholder, min_values: min, max_values: max, options }] });

export async function cardPanel(env, me, s, note) {
  const [bgs, poses] = await Promise.all([looks(env, me, 'bg'), looks(env, me, 'pose')]);
  const wantA = (s.o & 1) !== 0;
  if (!bgs.some((t) => t.id === s.b)) s = { ...s, b: 0 };
  if (!poses.some((t) => t.id === s.p)) s = { ...s, p: 0 };
  const missing = !s.ph ? 'a photo' : wantA && !s.b ? 'a background' : wantA && !s.p ? 'a pose' : '';
  const rows = [
    select(enc('out', s), 'What to make', [
      { label: 'Cinematic avatar', value: 'a', description: 'A club scene with your pose', default: wantA },
      { label: 'Website portrait', value: 'p', description: 'Your face on every player card', default: (s.o & 2) !== 0 },
    ], { min: 1, max: 2 }),
  ];
  if (wantA) {
    rows.push(select(enc('bg', s), bgs.length ? 'Background' : 'No backgrounds yet', bgs.length ? bgs.map((t) => ({ label: t.name.slice(0, 100), value: String(t.id), default: t.id === s.b })) : [{ label: 'None yet', value: '0' }]));
    rows.push(select(enc('pose', s), poses.length ? 'Pose' : 'No poses yet', poses.length ? poses.map((t) => ({ label: t.name.slice(0, 100), value: String(t.id), default: t.id === s.p })) : [{ label: 'None yet', value: '0' }]));
  }
  const kitRow = buttons([
    { label: 'Male kit', id: enc('kit-m', s), style: s.k === 'm' ? 'brand' : 'grey' },
    { label: 'Female kit', id: enc('kit-f', s), style: s.k === 'f' ? 'brand' : 'grey' },
    { label: s.n === '' ? 'Kit number' : `Kit #${s.n}`, id: enc('num', s), emoji: '🔢' },
    { label: 'Send to a manager', id: enc('go', s), style: 'ok', disabled: !!missing },
  ]);
  return message({ accent: 'red', ephemeral: true, blocks: [
    header({ eyebrow: 'Card Studio', title: '🪪 Your card', sub: s.ph ? (s.ph === 'last' ? 'Using the photo from your last request' : 'Using the photo you attached') : 'No photo yet' }),
    note ? text(note) : null,
    text('**How it works**\n1. Check the photo: face to the camera, head and shoulders, good light.\n2. Choose what to make, a look, your kit and a number.\n3. Send it. A manager checks the photo, then the card is drawn.'),
    sep(),
    ...rows, ...kitRow,
    footer(missing ? `Still needed: ${missing}` : 'Ready. One request a month.'),
  ] });
}

// The slash command. `attachment` is Discord's resolved attachment (or undefined).
export async function cardOpen(i, env, me, attachment) {
  if (!env.DB || !env.MEDIA) return { type: 4, data: notice('Card Studio is not connected yet') };
  if (!flagOn(env, me, 'cardStudio') || !can(me, 'cards.use')) return { type: 4, data: notice('Card Studio is not switched on for you yet') };
  let ph = '';
  if (attachment) {
    const e = EXT[attachment.content_type];
    if (!e) return { type: 4, data: notice('Use a PNG, JPG or WEBP photo') };
    if ((attachment.size ?? 0) > PHOTO_MAX) return { type: 4, data: notice('That photo is too big', '8 MB max.') };
    const res = await fetch(attachment.url);
    if (!res.ok) return { type: 4, data: notice('Could not download that photo from Discord') };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!photoType(bytes)) return { type: 4, data: notice('That is not a PNG, JPG or WEBP photo') };
    const id = hex(16);
    ph = `${id}${e}`;
    await env.MEDIA.put(keyOf(ph), bytes, { httpMetadata: { contentType: attachment.content_type } });
  } else if (await lastPhoto(env, me.u)) ph = 'last';
  return { type: 4, data: await cardPanel(env, me, { ph, o: 3, b: 0, p: 0, k: 'm', n: '' }) };
}

async function photoBytes(env, me, ph) {
  const key = ph === 'last' ? await lastPhoto(env, me.u) : keyOf(ph);
  const obj = key ? await env.MEDIA.get(key) : null;
  return obj ? new Uint8Array(await new Response(obj.body).arrayBuffer()) : null;
}

// Buttons (type 3), menus (type 3) and the number form (type 5).
export async function cardInteraction(i, env, me, loadSite) {
  const d = dec(i.data.custom_id);
  const update = async (s, note) => ({ type: 7, data: { ...(await cardPanel(env, me, s, note)), flags: 1 << 15 } });
  if (!d) return { type: 7, data: { ...notice('That panel is out of date', 'Run /avatarcard again.'), flags: 1 << 15 } };
  const { act, s } = d;
  if (i.type === 5) {
    const raw = String(i.data.components?.flatMap((r) => r.components ?? [r.component]).find((c) => c?.custom_id === 'n')?.value ?? '').trim();
    if (raw !== '' && !/^\d{1,2}$/.test(raw)) return update(s, '⚠️ The kit number is 0 to 99.');
    return update({ ...s, n: raw }, raw === '' ? 'Kit number cleared.' : `Kit number set to ${raw}.`);
  }
  const pick = i.data.values ?? [];
  if (act === 'out') { const o = (pick.includes('a') ? 1 : 0) | (pick.includes('p') ? 2 : 0); return update({ ...s, o: o || 3 }); }
  if (act === 'bg') return update({ ...s, b: Number(pick[0]) || 0 });
  if (act === 'pose') return update({ ...s, p: Number(pick[0]) || 0 });
  if (act === 'kit-m' || act === 'kit-f') return update({ ...s, k: act === 'kit-m' ? 'm' : 'f' });
  if (act === 'num') return { type: 9, data: { custom_id: i.data.custom_id, title: 'Kit number', components: [{ type: 1, components: [
    { type: 4, custom_id: 'n', style: 1, label: 'Shirt number, 0 to 99 (empty for none)', required: false, max_length: 2, value: s.n || undefined },
  ] }] } };
  if (act === 'go') {
    const bytes = await photoBytes(env, me, s.ph);
    if (!bytes) return update(s, '⚠️ That photo is gone. Run /avatarcard again with a new one.');
    const res = await submitCardRequest(me, env, {
      avatar: (s.o & 1) !== 0, portrait: (s.o & 2) !== 0, kit: s.k === 'f' ? 'female' : 'male', kitNumber: s.n, bg: s.b, pose: s.p, bytes,
    }, log, loadSite);
    if (res.error) return update(s, `⚠️ ${res.error}`);
    if (s.ph !== 'last') await env.MEDIA.delete(keyOf(s.ph)).catch(() => {});
    return { type: 7, data: { ...notice('Sent to a manager', 'They check the photo first. You get a notification when the card is ready, and it shows in Card Studio on the site.', { accent: 'red' }), flags: 1 << 15 } };
  }
  return update(s);
}
