// Pro Telemetry 4-Stage Matchday Graphic Renderer (Cloudflare Worker native: pure SVG → env.IMAGES PNG → R2 env.MEDIA).
// Renders:
//   1. Roll Call (/host)       – vertical pitch with solid circular position nodes (blurred custom icon watermark),
//                                overlapping avatar pills (max 3 + +N circle), +N flex tags, 1-row-per-player roster
//                                with 5-match form dots, line readiness chips, and Pro Telemetry footer.
//   2. Provisional Lineup Call – called-up starters in gold-outlined Site Avatar / Discord PFP circles + standby bench.
//   3. Lobby Check-In          – live green/amber/dim status rings + lobby status roster + standby bench queue.
//   4. Final Official XI       – broadcast Starting XI with gold avatar circles, Captain ©, emerald/gold chemistry links,
//                                all-time stat lines, and AVG OVR / CHEM / FORM header.
//   5. Suggested XI (private)  – auto-picked Best XI from live sign-ups using all-time stats + chemistry links.
import { facesOf } from './faces.js';
import { crestData, imageData, sha } from './rosterpic.js';

const W = 940, H = 820, BANNER_H = 128, FACE_BYTES = 200e3;
const FONT = "Oswald, 'Segoe UI', Arial, Helvetica, sans-serif";

// Standalone Circular Gold-Ringed Crest Thumbnail (256×256 transparent PNG for Discord Section accessory).
export function crestThumbSvg(crest = null) {
  const S = 256, c = 128;
  const defs = `<clipPath id="pfCt"><circle cx="${c}" cy="${c}" r="106"/></clipPath>`;
  let body = `<circle cx="${c}" cy="${c}" r="120" fill="#120d06" stroke="#fbbf24" stroke-width="10"/>`;
  body += `<circle cx="${c}" cy="${c}" r="108" fill="#1e1609" stroke="#fde68a" stroke-opacity="0.6" stroke-width="3"/>`;
  if (crest) {
    body += `<image href="${crest}" x="22" y="22" width="212" height="212" preserveAspectRatio="xMidYMid meet" clip-path="url(#pfCt)"/>`;
  } else {
    body += `<text x="${c}" y="152" font-size="82" font-weight="800" text-anchor="middle" fill="#fbbf24" font-family="${FONT}">PF</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><defs>${defs}</defs>${body}</svg>`;
}

// Standalone Top Header Banner SVG (1040×128): circular gold-ringed crest on left,
// PHOENIX FIRE · MATCHDAY gold pill + trophy + League Session + notes aligned on the right.
export function headerBannerSvg({ org = 'PHOENIX FIRE', title = 'League session', formation = '3-5-2', notes = '', stageLabel = 'ROLL CALL', stageColor = '#fbbf24', crest = null } = {}) {
  const orgTxt = `${plain(org, 22).toUpperCase()} · MATCHDAY`;
  const titleTxt = `${plain(title, 26).toUpperCase()} · ${formation}`;
  const noteTxt = notes ? plain(notes, 54).toUpperCase() : 'UNLIMITED SIGN-UPS · PRO TELEMETRY';
  const pillW = Math.max(158, orgTxt.length * 8.4 + 26);
  const stageW = Math.max(146, stageLabel.length * 9.6 + 32);
  let defs = `<linearGradient id="pfBanBg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#3a2604"/><stop offset="42%" stop-color="#17140e"/><stop offset="100%" stop-color="#2b1d05"/></linearGradient>`;
  defs += `<linearGradient id="pfBanGold" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#f59e0b"/><stop offset="50%" stop-color="#fde68a"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient>`;
  defs += `<clipPath id="pfBanCrest"><circle cx="68" cy="64" r="39"/></clipPath>`;
  let body = `<rect width="${W}" height="${BANNER_H}" rx="16" fill="url(#pfBanBg)"/>`;
  body += `<rect x="0" y="0" width="${W}" height="5" fill="url(#pfBanGold)"/>`;
  // Circular gold-ringed crest on the left
  body += `<circle cx="68" cy="64" r="44" fill="#120d06" stroke="#fbbf24" stroke-width="3.2"/>`;
  body += `<circle cx="68" cy="64" r="39.5" fill="#1e1609" stroke="#fde68a" stroke-opacity="0.55" stroke-width="1.2"/>`;
  if (crest) {
    body += `<image href="${crest}" x="29" y="25" width="78" height="78" preserveAspectRatio="xMidYMid slice" clip-path="url(#pfBanCrest)"/>`;
  } else {
    body += `<text x="68" y="74" font-size="28" font-weight="800" text-anchor="middle" fill="#fbbf24" font-family="${FONT}">PF</text>`;
  }
  // Right of crest: yellow PHOENIX FIRE · MATCHDAY pill + trophy + League session + notes
  body += `<rect x="132" y="18" width="${pillW}" height="24" rx="6" fill="#f59e0b" fill-opacity="0.2" stroke="#fbbf24" stroke-opacity="0.8" stroke-width="1.2"/>`;
  body += `<text x="145" y="34.5" font-size="13" font-weight="800" letter-spacing="1.4" fill="#fde68a" font-family="${FONT}">${esc(orgTxt)}</text>`;
  body += `<g transform="translate(132,50) scale(1.25)">
    <path d="M4 2h12v5a6 6 0 0 1-12 0V2z" fill="#fbbf24" stroke="#fde68a" stroke-width="1"/>
    <path d="M4 4H1.5a2 2 0 0 0 0 4H4M16 4h2.5a2 2 0 0 1 0 4H16" fill="none" stroke="#f59e0b" stroke-width="1.5"/>
    <path d="M10 13v4M6.5 17h7" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
  </g>`;
  body += `<text x="166" y="75" font-size="30" font-weight="800" fill="#ffffff" font-family="${FONT}">${esc(titleTxt)}</text>`;
  body += `<text x="134" y="106" font-size="15" font-weight="700" letter-spacing="0.8" fill="#d4d4d8" font-family="${FONT}">${esc(noteTxt)}</text>`;
  // Stage badge on far right
  body += `<rect x="${W - stageW - 24}" y="42" width="${stageW}" height="44" rx="10" fill="#141008" stroke="${stageColor}" stroke-width="2.2"/>`;
  body += `<text x="${W - stageW / 2 - 24}" y="70" font-size="17" font-weight="800" text-anchor="middle" letter-spacing="1.2" fill="${stageColor}" font-family="${FONT}">${esc(stageLabel)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BANNER_H}" viewBox="0 0 ${W} ${BANNER_H}"><defs>${defs}</defs>${body}<rect x="2" y="2" width="${W - 4}" height="${BANNER_H - 4}" rx="15" fill="none" stroke="#fbbf24" stroke-width="3.5"/></svg>`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = (s, max = 16) => (String(s ?? '').replace(/[^\p{L}\p{N}\p{M} ._\-'|]/gu, '').replace(/\s+/g, ' ').trim() || '?').slice(0, max);
const initialOf = (s) => (plain(s, 30).match(/[\p{L}\p{N}]/gu) ?? ['?'])[0].toUpperCase();

export const CAT_STYLE = {
  att: { ring: '#ef4444', bg: '#2b1010', fill: '#f87171', badgeBg: '#ef4444', text: '#fca5a5' },
  cam: { ring: '#f59e0b', bg: '#2b1e08', fill: '#fbbf24', badgeBg: '#f59e0b', text: '#fcd34d' },
  wide: { ring: '#06b6d4', bg: '#08252d', fill: '#22d3ee', badgeBg: '#06b6d4', text: '#67e8f9' },
  cdm: { ring: '#a855f7', bg: '#211033', fill: '#c084fc', badgeBg: '#a855f7', text: '#d8b4fe' },
  def: { ring: '#22c55e', bg: '#0b2616', fill: '#4ade80', badgeBg: '#22c55e', text: '#86efac' },
  gk: { ring: '#3b82f6', bg: '#0d1d3d', fill: '#60a5fa', badgeBg: '#3b82f6', text: '#93c5fd' },
};

const AV_COLORS = ['#e53935', '#f97316', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#10b981', '#22c55e', '#3b82f6'];
const avColor = (id) => AV_COLORS[Math.abs([...String(id)].reduce((a, c) => ((a * 31) + c.charCodeAt(0)) | 0, 0)) % AV_COLORS.length];

export function slotCategory(code) {
  const c = String(code ?? '').toUpperCase();
  if (c === 'GK') return 'gk';
  if (['ST', 'LS', 'RS', 'LST', 'RST', 'CF', 'LF', 'RF', 'LW', 'RW'].includes(c)) return 'att';
  if (['CAM', 'LAM', 'RAM'].includes(c)) return 'cam';
  if (['LM', 'RM', 'LWB', 'RWB', 'LB', 'RB'].includes(c)) return 'wide';
  if (['CDM', 'LDM', 'RDM', 'LCDM', 'RCDM', 'CM', 'LCM', 'RCM'].includes(c)) return 'cdm';
  return 'def';
}

// Normalizes any formation's [slot, x, y] array into generously spaced vertical-pitch percentages (attack top, GK bottom).
export function normalizeFormationSlots(rawSlots = []) {
  if (!rawSlots.length) return [];
  const gk = rawSlots.find(([s]) => s === 'GK');
  const flipY = gk ? gk[2] < 50 : false;
  const outfield = rawSlots.filter(([s]) => s !== 'GK').map(([, , y]) => (flipY ? 100 - y : y));
  const minY = outfield.length ? Math.min(...outfield) : 15;
  const maxY = outfield.length ? Math.max(...outfield) : 75;
  const spanY = Math.max(1, maxY - minY);
  return rawSlots.map(([id, x, y]) => {
    const yyRaw = flipY ? 100 - y : y;
    const xx = Math.round((10 + (x / 100) * 80) * 10) / 10;
    const yy = id === 'GK' ? 88.5 : Math.round((10 + ((yyRaw - minY) / spanY) * 60) * 10) / 10;
    return { id, cat: slotCategory(id), x: xx, y: yy };
  }).sort((a, b) => a.y - b.y || a.x - b.x);
}

// Maps a player's stored slot preference gracefully onto the active formation's slots.
export function mapSlotToFormation(pos, slots) {
  const code = String(pos ?? '').toUpperCase();
  if (slots.some((s) => s.id === code)) return code;
  const alts = {
    ST: ['LS', 'RS', 'CF', 'ST'], LS: ['ST', 'CF', 'LW', 'LF'], RS: ['ST', 'CF', 'RW', 'RF'],
    LST: ['LS', 'ST', 'CF'], RST: ['RS', 'ST', 'CF'],
    CAM: ['LCM', 'RCM', 'CM', 'LAM', 'RAM', 'CF'],
    LM: ['LWB', 'LW', 'LAM', 'LB', 'LCM'], RM: ['RWB', 'RW', 'RAM', 'RB', 'RCM'],
    LWB: ['LB', 'LM', 'LW', 'LCB'], RWB: ['RB', 'RM', 'RW', 'RCB'],
    LB: ['LWB', 'LCB', 'LM'], RB: ['RWB', 'RCB', 'RM'],
    CDM: ['LDM', 'RDM', 'CM', 'LCM', 'RCM', 'CB'], LDM: ['CDM', 'LCM', 'CM'], RDM: ['CDM', 'RCM', 'CM'],
    LCDM: ['LDM', 'CDM', 'LCM'], RCDM: ['RDM', 'CDM', 'RCM'],
    CM: ['LCM', 'RCM', 'CDM', 'LDM', 'RDM', 'CAM'], LCM: ['CM', 'LDM', 'CDM', 'CAM', 'LM'], RCM: ['CM', 'RDM', 'CDM', 'CAM', 'RM'],
    CB: ['LCB', 'RCB', 'CDM'], LCB: ['CB', 'LB', 'LWB'], RCB: ['CB', 'RB', 'RWB'],
    LW: ['LM', 'LF', 'LS', 'ST'], RW: ['RM', 'RF', 'RS', 'ST'],
  };
  for (const a of alts[code] ?? []) if (slots.some((s) => s.id === a)) return a;
  return slots[0]?.id ?? code;
}

// Inline SVG emblem shape for a position (used both as blurred circle watermark and crisp miniature icon on pills).
function emblemPath(id, cat, col) {
  const isRight = id.startsWith('R') && (id.endsWith('M') || id.endsWith('W') || id.endsWith('B'));
  if (cat === 'att') return `<path d="M12 3l6.8 14.5-6.8-3.4-6.8 3.4z" fill="${col}"/>`;
  if (cat === 'cam') return `<path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z" fill="${col}"/>`;
  if (cat === 'wide') {
    return isRight
      ? `<path d="M7 5l10 7-10 7v-4.2H3v-5.6h4z" fill="${col}"/>`
      : `<path d="M17 5L7 12l10 7v-4.2h4v-5.6h-4z" fill="${col}"/>`;
  }
  if (cat === 'cdm') return `<path d="M12 2.8L20.5 12 12 21.2 3.5 12z" fill="${col}"/>`;
  if (cat === 'gk') return `<circle cx="12" cy="12" r="7.5" fill="none" stroke="${col}" stroke-width="2.6"/><circle cx="12" cy="12" r="2.8" fill="${col}"/>`;
  return `<path d="M12 3.2l7.5 2.9v5.8c0 4.6-3.2 7.8-7.5 9.2-4.3-1.4-7.5-4.6-7.5-9.2V6.1z" fill="${col}"/>`;
}

function miniIconGroup(x, y, size, id, cat) {
  const st = CAT_STYLE[cat] ?? CAT_STYLE.def;
  const sc = size / 24;
  return `<g transform="translate(${x},${y}) scale(${sc.toFixed(4)})"><rect rx="5" width="24" height="24" fill="${st.ring}"/>${emblemPath(id, cat, '#ffffff')}</g>`;
}

// 3-Pass Smart Suggested XI Solver:
//   Pass 1: Highest all-time rating among players who chose this slot as Primary.
//   Pass 2: Highest all-time rating among unplaced players who chose this slot as Flex.
//   Pass 3: 1-step Flex shift (move a starter to their Flex spot if an unplaced bench player covers their old spot).
export function solveSuggestedXI(slots, rsvps = [], statsMap = new Map()) {
  const pool = rsvps.filter((r) => r.status === 'yes').map((r) => {
    const uid = String(r.user_id ?? r.id);
    const st = statsMap.get(uid) ?? {};
    const rawPrefs = Array.isArray(r.prefs) && r.prefs.length ? r.prefs : (r.primary ? [r.primary] : []);
    const mapped = [...new Set(rawPrefs.map((p) => mapSlotToFormation(p, slots)))];
    return {
      id: uid,
      name: plain(r.name ?? r.n, 15),
      ovr: typeof st.ovr === 'number' ? st.ovr : 7.5,
      stat: st.stat ?? '',
      form: Array.isArray(st.form) ? st.form.slice(-5) : [],
      signedInAt: r.signed_in_at ?? r.first_at ?? r.at ?? 9e15,
      mapped: mapped.length ? mapped : [slots[0]?.id ?? 'ST'],
    };
  });
  const used = new Set(), assigned = {}, reasons = [];
  const byOvr = (a, b) => (b.ovr - a.ovr) || (a.signedInAt - b.signedInAt);

  for (const s of slots) {
    const cands = pool.filter((p) => !used.has(p.id) && p.mapped[0] === s.id).sort(byOvr);
    if (cands[0]) {
      assigned[s.id] = { p: cands[0], mode: 'primary' };
      used.add(cands[0].id);
      if (cands.length > 1) reasons.push(`**${s.id}:** ${cands[0].name} (${cands[0].ovr.toFixed(1)}) edges ${cands[1].name} (${cands[1].ovr.toFixed(1)})`);
    }
  }
  for (const s of slots) {
    if (assigned[s.id]) continue;
    const cands = pool.filter((p) => !used.has(p.id) && p.mapped.includes(s.id)).sort(byOvr);
    if (cands[0]) {
      assigned[s.id] = { p: cands[0], mode: 'flex' };
      used.add(cands[0].id);
      reasons.push(`**${s.id} (Flex):** ${cands[0].name} (${cands[0].ovr.toFixed(1)}) covers open slot`);
    }
  }
  for (const s of slots) {
    if (assigned[s.id]) continue;
    const benchCands = pool.filter((p) => !used.has(p.id)).sort(byOvr);
    for (const [otherSlot, pick] of Object.entries(assigned)) {
      if (!pick.p.mapped.includes(s.id)) continue;
      const repl = benchCands.find((b) => b.mapped.includes(otherSlot));
      if (repl) {
        assigned[s.id] = { p: pick.p, mode: 'flex' };
        assigned[otherSlot] = { p: repl, mode: repl.mapped[0] === otherSlot ? 'primary' : 'flex' };
        used.add(repl.id);
        reasons.push(`**${s.id} (Flex Shift):** ${pick.p.name} shifts to ${s.id}, ${repl.name} (${repl.ovr.toFixed(1)}) starts at ${otherSlot}`);
        break;
      }
    }
  }
  const bench = pool.filter((p) => !used.has(p.id)).sort((a, b) => a.signedInAt - b.signedInAt);
  const starters = Object.values(assigned).map((x) => x.p);
  const avgOvr = starters.length ? +(starters.reduce((a, b) => a + b.ovr, 0) / starters.length).toFixed(2) : null;
  return { assigned, bench, reasons, avgOvr, count: starters.length };
}

function pitchBaseSvg(px, py, pw, ph) {
  let stripes = '';
  const sh = ph / 12;
  for (let i = 0; i < 12; i++) {
    stripes += `<rect x="${px}" y="${py + i * sh}" width="${pw}" height="${sh + 0.5}" fill="${i % 2 === 0 ? '#0c2a16' : '#0f311b'}"/>`;
  }
  const m = 14, ix = px + m, iy = py + m, iw = pw - m * 2, ih = ph - m * 2;
  const cx = px + pw / 2, cy = py + ph / 2;
  return `${stripes}
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="4" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"/>
    <line x1="${ix}" y1="${cy}" x2="${ix + iw}" y2="${cy}" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="54" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"/>
    <rect x="${cx - 95}" y="${iy}" width="190" height="68" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"/>
    <rect x="${cx - 95}" y="${iy + ih - 68}" width="190" height="68" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"/>`;
}

// ---------- Stage 1: Roll Call (/host) Pro Telemetry SVG ----------
// Phone-first card (v10). Discord shows the picture about 285pt wide on a phone, so it is drawn on a 480-unit canvas
// (half the old 940) and exported at RC_SCALE× for sharpness: every label lands at 7–11pt on screen instead of ~5pt.
// Layout: stage header + 11-segment slot meter · pitch (left) and squad list (right) · Maybe / Out footer.
// One border weight (1.5), one corner radius family (14 outer / 10 panels / 6 chips), 12-unit gutters throughout.
export const RC_W = 480, RC_H = 560, RC_SCALE = 2.25;
export function rollCallSvg(model, faces = new Map()) {
  const { formation = '3-5-2', slots = [], rsvps = [], closed = false, avgOvr = null, winForm = null } = model;
  const yes = rsvps.filter((r) => r.status === 'yes');
  const maybe = rsvps.filter((r) => r.status === 'maybe');
  const out = rsvps.filter((r) => r.status === 'no');
  const replied = yes.length + maybe.length + out.length;
  const W0 = RC_W, H0 = RC_H, G = 12;

  const bySlot = Object.fromEntries(slots.map((s) => [s.id, { primary: [], flex: [] }]));
  const lineCnt = { att: 0, mid: 0, def: 0, gk: 0 };
  const mappedYes = yes.map((r) => {
    const raw = Array.isArray(r.prefs) && r.prefs.length ? r.prefs : (r.primary ? [r.primary] : []);
    const mapped = [...new Set((raw.length ? raw : [slots[0]?.id ?? 'ST']).map((p) => mapSlotToFormation(p, slots)))];
    const prim = mapped[0];
    if (bySlot[prim]) bySlot[prim].primary.push(r);
    mapped.slice(1).forEach((f) => { if (bySlot[f]) bySlot[f].flex.push(r); });
    const cat = slotCategory(prim);
    lineCnt[cat === 'att' ? 'att' : cat === 'gk' ? 'gk' : cat === 'def' ? 'def' : 'mid']++;
    return { ...r, mapped, prim, cat };
  });
  const order = Object.fromEntries(slots.map((s, i) => [s.id, i]));
  mappedYes.sort((a, b) => (order[a.prim] ?? 99) - (order[b.prim] ?? 99) || (a.signed_in_at ?? a.at ?? 0) - (b.signed_in_at ?? b.at ?? 0));
  const covered = slots.filter((s) => (bySlot[s.id]?.primary.length ?? 0) > 0).length;
  const full = slots.length > 0 && covered === slots.length;

  let defs = `<linearGradient id="rcGold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f59e0b" stop-opacity="0"/><stop offset=".5" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/></linearGradient>`;
  let body = '';
  let clipN = 0;
  const T = (x, y, size, fill, str, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-family="${FONT}"${/font-weight/.test(extra) ? "" : " font-weight=\"700\""}${extra}>${str}</text>`;

  // ── Header (0–64): stage pill · formation · avg / filled chips, then the slot meter ──
  const headH = 64;
  body += `<rect x="0" y="0" width="${W0}" height="${headH}" fill="#121419"/>`;
  const stageTxt = closed ? 'SIGN-UPS CLOSED' : 'ROLL CALL';
  const stageCol = closed ? '#f87171' : '#fbbf24';
  const stageW = stageTxt.length * 6.6 + 30;
  body += `<rect x="${G}" y="14" width="${stageW}" height="24" rx="12" fill="${stageCol}" fill-opacity="0.12" stroke="${stageCol}" stroke-opacity="0.7" stroke-width="1.5"/>`;
  body += `<circle cx="${G + 13}" cy="26" r="3.6" fill="${stageCol}"/><circle cx="${G + 13}" cy="26" r="6.5" fill="none" stroke="${stageCol}" stroke-opacity="0.35" stroke-width="1.5"/>`;
  body += T(G + 23, 30.5, 12, stageCol, esc(stageTxt), ' letter-spacing="1"');
  body += T(G + stageW + 10, 32, 19, '#ffffff', esc(formation));
  // right side chips: AVG (if known) and X/11
  const chip = (xr, label, col, bg) => {
    const w = label.length * 6.4 + 18;
    return { w, svg: `<rect x="${xr - w}" y="14" width="${w}" height="24" rx="6" fill="${bg}" fill-opacity="0.14" stroke="${col}" stroke-opacity="0.6" stroke-width="1.5"/>${T(xr - w / 2, 30.5, 12, col, esc(label), ' text-anchor="middle" letter-spacing="0.6"')}` };
  };
  const fillChip = chip(W0 - G, closed ? 'LOCKED' : `${covered}/${slots.length} FILLED`, full ? '#4ade80' : closed ? '#f87171' : '#e5e7eb', full ? '#22c55e' : closed ? '#ef4444' : '#ffffff');
  body += fillChip.svg;
  if (avgOvr) {
    const ac = avgOvr >= 8 ? '#4ade80' : avgOvr >= 7 ? '#fbbf24' : '#f87171';
    body += chip(W0 - G - fillChip.w - 6, `XI AVG ${Number(avgOvr).toFixed(1)}`, ac, ac).svg;
  }
  // slot meter: one segment per formation slot, coloured by line when someone picked it as primary
  const segGap = 3, segW = (W0 - G * 2 - segGap * (slots.length - 1)) / Math.max(1, slots.length);
  slots.forEach((s, i) => {
    const on = (bySlot[s.id]?.primary.length ?? 0) > 0;
    const st = CAT_STYLE[s.cat] ?? CAT_STYLE.def;
    body += `<rect x="${(G + i * (segW + segGap)).toFixed(1)}" y="48" width="${segW.toFixed(1)}" height="5" rx="2.5" fill="${on ? st.ring : '#ffffff'}" fill-opacity="${on ? 1 : 0.1}"/>`;
  });
  body += `<rect x="0" y="${headH - 1}" width="${W0}" height="1" fill="url(#rcGold)" opacity="0.8"/>`;

  // ── Body: pitch panel (left) + squad panel (right) ──
  const footH = 58, bodyY = headH + G, bodyH = H0 - headH - footH - G * 2;
  const pw = 262, px = G, py = bodyY, ph = bodyH;
  const rx0 = px + pw + G, rw = W0 - rx0 - G;
  defs += `<clipPath id="rcPitch"><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="10"/></clipPath>`;
  let pitch = '';
  const stripes = 10, sh = ph / stripes;
  for (let i = 0; i < stripes; i++) pitch += `<rect x="${px}" y="${(py + i * sh).toFixed(1)}" width="${pw}" height="${(sh + 0.5).toFixed(1)}" fill="${i % 2 ? '#0f301b' : '#0c2915'}"/>`;
  const m = 10, ix = px + m, iy = py + m, iw = pw - m * 2, ih = ph - m * 2, pcx = px + pw / 2, pcy = py + ph / 2;
  const ln = 'fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1.5"';
  pitch += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="3" ${ln}/><line x1="${ix}" y1="${pcy}" x2="${ix + iw}" y2="${pcy}" ${ln}/>`;
  pitch += `<circle cx="${pcx}" cy="${pcy}" r="34" ${ln}/><circle cx="${pcx}" cy="${pcy}" r="2.5" fill="#ffffff" fill-opacity="0.2"/>`;
  pitch += `<rect x="${pcx - 62}" y="${iy}" width="124" height="44" ${ln}/><rect x="${pcx - 62}" y="${iy + ih - 44}" width="124" height="44" ${ln}/>`;
  pitch += `<rect x="${pcx - 28}" y="${iy + ih - 16}" width="56" height="16" ${ln}/>`;
  body += `<g clip-path="url(#rcPitch)">${pitch}</g><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="10" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1.5"/>`;

  // position nodes: ring + dimmed emblem watermark + code. Each node then gets one tag: the primary sign-ups' faces,
  // a FLEX chip (open but someone can cover it) or OPEN. Tags are placed below the node, else above, else made smaller,
  // so in every formation no tag lands on another node or tag.
  const R = 17, outTop = py + 40, outBot = py + ph - 96;
  const nodes = slots.map((s) => ({
    s, st: CAT_STYLE[s.cat] ?? CAT_STYLE.def, d: bySlot[s.id] ?? { primary: [], flex: [] },
    cx: Math.round(px + pw * (0.07 + ((s.x - 10) / 80) * 0.86)),
    cy: Math.round(s.id === 'GK' ? py + ph - 46 : outTop + ((s.y - 10) / 60) * (outBot - outTop)),
  }));
  for (const n of nodes) {
    const { s, st, cx, cy } = n, has = n.d.primary.length > 0, cid = `rn${clipN++}`;
    defs += `<clipPath id="${cid}"><circle cx="${cx}" cy="${cy}" r="${R - 1}"/></clipPath>`;
    if (has) body += `<circle cx="${cx}" cy="${cy}" r="${R + 4}" fill="${st.ring}" fill-opacity="0.18"/>`;
    body += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${st.bg}" stroke="${st.ring}" stroke-width="${has ? 2.2 : 1.5}"${has ? '' : ' stroke-dasharray="3 2.5"'}/>`;
    body += `<g clip-path="url(#${cid})"><g opacity="0.34" transform="translate(${cx - 15},${cy - 15}) scale(1.25)">${emblemPath(s.id, s.cat, st.fill)}</g></g>`;
    body += T(cx, cy + 4.2, s.id.length > 3 ? 10 : 11.5, '#ffffff', esc(s.id), ' text-anchor="middle" font-weight="800"');
  }
  const placed = [];
  const hits = (a, b) => a.x < b.x + b.w + 2 && b.x < a.x + a.w + 2 && a.y < b.y + b.h + 2 && b.y < a.y + a.h + 2;
  const clear = (box, self) => box.x >= px + 3 && box.x + box.w <= px + pw - 3 && box.y >= py + 3 && box.y + box.h <= py + ph - 3
    && !nodes.some((o) => o !== self && hits(box, { x: o.cx - R - 4, y: o.cy - R - 4, w: 2 * R + 8, h: 2 * R + 8 }))
    && !placed.some((p) => hits(box, p));
  const spot = (n, w, h) => {
    for (const y of [n.cy + R + 3, n.cy - R - 3 - h]) {
      const box = { x: n.cx - w / 2, y, w, h };
      if (clear(box, n)) return box;
    }
    return null;
  };
  const AR = 8, STEP = 13;
  for (const n of nodes) {
    const { cx, d } = n;
    if (d.primary.length) {
      let box = null, k = Math.min(3, d.primary.length);
      for (; k >= 1; k--) {
        const items = k + (d.primary.length > k ? 1 : 0);
        box = spot(n, (items - 1) * STEP + AR * 2 + 6, AR * 2 + 4);
        if (box) break;
      }
      if (!box) { k = 1; box = { x: cx - (d.primary.length > 1 ? 16.5 : 11), y: n.cy + R + 3, w: d.primary.length > 1 ? 33 : 22, h: AR * 2 + 4 }; }
      placed.push(box);
      const shown = d.primary.slice(0, k), extra = d.primary.length - shown.length;
      body += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${box.h / 2}" fill="#0a0705" fill-opacity="0.88" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1"/>`;
      shown.forEach((p, i) => {
        const ax = box.x + 3 + AR + i * STEP, ay = box.y + 2 + AR;
        const uri = faces.get(String(p.user_id ?? p.id));
        if (uri) {
          const aid = `ra${clipN++}`;
          defs += `<clipPath id="${aid}"><circle cx="${ax}" cy="${ay}" r="${AR}"/></clipPath>`;
          body += `<image href="${uri}" x="${ax - AR}" y="${ay - AR}" width="${AR * 2}" height="${AR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${aid})"/>`;
        } else {
          body += `<circle cx="${ax}" cy="${ay}" r="${AR}" fill="${avColor(p.user_id ?? p.id)}"/>`;
          body += T(ax, ay + 3.3, 9, '#ffffff', esc(initialOf(p.name)), ' text-anchor="middle" font-weight="800"');
        }
        body += `<circle cx="${ax}" cy="${ay}" r="${AR}" fill="none" stroke="#0a0705" stroke-width="1.5"/>`;
      });
      if (extra > 0) {
        const ax = box.x + 3 + AR + shown.length * STEP, ay = box.y + 2 + AR;
        body += `<circle cx="${ax}" cy="${ay}" r="${AR}" fill="#1f2937" stroke="#f59e0b" stroke-width="1.2"/>`;
        body += T(ax, ay + 3, 8.5, '#fcd34d', `+${extra}`, ' text-anchor="middle" font-weight="800"');
      }
    } else {
      const flex = d.flex.length > 0;
      const col = flex ? '#fcd34d' : '#fca5a5', bd = flex ? '#f59e0b' : '#ef4444', bg = flex ? '#1c1405' : '#2a0b0b';
      let lbl = flex ? `FLEX ${d.flex.length}` : 'OPEN', box = spot(n, lbl.length * 6 + 12, 16);
      if (!box) { lbl = flex ? `+${d.flex.length}` : '—'; box = spot(n, lbl.length * 6 + 12, 16) ?? { x: cx - (lbl.length * 6 + 12) / 2, y: n.cy + R + 3, w: lbl.length * 6 + 12, h: 16 }; }
      placed.push(box);
      body += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="16" rx="5" fill="${bg}" fill-opacity="0.92" stroke="${bd}" stroke-opacity="0.6" stroke-width="1"/>`;
      body += T(box.x + box.w / 2, box.y + 11.6, 9.5, col, lbl, ' text-anchor="middle" font-weight="800" letter-spacing="0.6"');
    }
  }

  // squad panel: title + line counts, one row per player (line bar · name · rating · position badge)
  body += `<rect x="${rx0}" y="${py}" width="${rw}" height="${ph}" rx="10" fill="#111317" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1.5"/>`;
  body += T(rx0 + 12, py + 22, 12, '#e5e7eb', 'SQUAD', ' letter-spacing="1.2"');
  body += T(rx0 + rw - 12, py + 22, 12, '#4ade80', `${yes.length} IN`, ' text-anchor="end" letter-spacing="0.8"');
  body += `<rect x="${rx0 + 12}" y="${py + 32}" width="${rw - 24}" height="1" fill="#ffffff" fill-opacity="0.08"/>`;

  const rowH = 32, rowsTop = py + 40, room = Math.floor((ph - 46) / rowH);
  const maxRows = mappedYes.length > room ? room - 1 : room;
  const shownPlayers = mappedYes.slice(0, maxRows), hidden = mappedYes.length - shownPlayers.length;
  shownPlayers.forEach((p, i) => {
    const ry = rowsTop + i * rowH, st = CAT_STYLE[p.cat] ?? CAT_STYLE.def;
    body += `<rect x="${rx0 + 8}" y="${ry}" width="${rw - 16}" height="${rowH - 4}" rx="6" fill="#ffffff" fill-opacity="${i % 2 ? 0.025 : 0.05}"/>`;
    body += `<rect x="${rx0 + 8}" y="${ry + 6}" width="3" height="${rowH - 16}" rx="1.5" fill="${st.ring}"/>`;
    body += T(rx0 + 18, ry + 19, 14, '#f3f4f6', esc(plain(p.name, 12)));
    const bw = Math.max(40, p.prim.length * 7 + 24), bx = rx0 + rw - 12 - bw;
    body += `<rect x="${bx}" y="${ry + 5}" width="${bw}" height="18" rx="5" fill="${st.badgeBg}" fill-opacity="0.22" stroke="${st.ring}" stroke-opacity="0.85" stroke-width="1"/>`;
    body += miniIconGroup(bx + 3.5, ry + 8, 12, p.prim, p.cat);
    body += T(bx + 19, ry + 18, 10.5, st.text, esc(p.prim), ' font-weight="800"');
    const avg = typeof p.avg === 'number' && p.avg > 0 ? p.avg : null;
    if (avg != null) {
      const ac = avg >= 8 ? '#4ade80' : avg >= 7 ? '#fbbf24' : '#f87171';
      body += `<rect x="${bx - 34}" y="${ry + 5}" width="30" height="18" rx="5" fill="${ac}" fill-opacity="0.14"/>`;
      body += T(bx - 19, ry + 18, 10.5, ac, avg.toFixed(1), ' text-anchor="middle" font-weight="800"');
    }
  });
  if (hidden > 0) {
    const oy = rowsTop + maxRows * rowH;
    body += `<rect x="${rx0 + 8}" y="${oy}" width="${rw - 16}" height="${rowH - 4}" rx="6" fill="#f59e0b" fill-opacity="0.1" stroke="#f59e0b" stroke-opacity="0.5" stroke-dasharray="4 3" stroke-width="1"/>`;
    body += T(rx0 + rw / 2, oy + 18, 11, '#fcd34d', `+${hidden} MORE SIGNED UP`, ' text-anchor="middle" font-weight="800" letter-spacing="0.6"');
  }
  if (!yes.length) body += T(rx0 + rw / 2, py + ph / 2, 13, '#6b7280', 'NO SIGN-UPS YET', ' text-anchor="middle" letter-spacing="1"');

  // ── Footer: Maybe / Out names + replied and form ──
  const fy = H0 - footH;
  body += `<rect x="0" y="${fy}" width="${W0}" height="${footH}" fill="#121419"/><rect x="0" y="${fy}" width="${W0}" height="1" fill="url(#rcGold)" opacity="0.5"/>`;
  const namesOf = (arr, max = 5) => (arr.length ? arr.slice(0, max).map((x) => plain(x.name, 11)).join(', ') + (arr.length > max ? ` +${arr.length - max}` : '') : 'None');
  const tail = [`${replied} REPLIED`, winForm != null ? `FORM ${winForm}%` : null].filter(Boolean).join('  ·  ');
  body += T(G, fy + 23, 12, '#9ca3af', `<tspan fill="#fbbf24">MAYBE ${maybe.length}</tspan>   ${esc(namesOf(maybe, 4))}`);
  body += T(G, fy + 44, 12, '#9ca3af', `<tspan fill="#f87171">OUT ${out.length}</tspan>   ${esc(namesOf(out, 6))}`);
  body += T(W0 - G, fy + 23, 11, '#6b7280', esc(tail), ' text-anchor="end" letter-spacing="0.6"');

  const S = RC_SCALE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W0 * S}" height="${H0 * S}" viewBox="0 0 ${W0} ${H0}"><defs>${defs}</defs><rect width="${W0}" height="${H0}" rx="14" fill="#0b0c0e"/>${body}<rect x="0.75" y="0.75" width="${W0 - 1.5}" height="${H0 - 1.5}" rx="13.5" fill="none" stroke="#fbbf24" stroke-opacity="0.75" stroke-width="1.5"/></svg>`;
}

// ---------- Stages 2, 3, 4 & Private Suggested XI SVG ----------
// mode: 'suggested' | 'call' (Provisional Lineup Call) | 'checkin' (Live Lobby Check-In) | 'final' (Official Confirmed XI)
export function lineupStageSvg(model, faces = new Map()) {
  const {
    mode = 'final', formation = '3-5-2', slots = [], assigned = {}, bench = [],
    checkinMap = new Map(), avgOvr = null, chemScore = 90, winForm = null, captainId = null,
  } = model;
  const isCheckin = mode === 'checkin';
  const isCall = mode === 'call';
  const isFinal = mode === 'final';
  const showChem = isFinal || mode === 'suggested';
  const banH = 62, footH = 44, px = 0, py = banH, pw = 516, ph = H - banH - footH;
  const rx = pw, rw = W - pw;
  let defs = '';
  let body = '';
  let clipN = 0;

  const starters = slots.map((s) => ({ s, pick: assigned[s.id] })).filter((x) => x.pick);
  const stOf = (id) => checkinMap.get(String(id)) ?? 'wait';
  const readyCnt = starters.filter((x) => stOf(x.pick.p.id) === 'ready').length;
  const lateCnt = starters.filter((x) => stOf(x.pick.p.id) === 'late').length;
  const waitCnt = starters.length - readyCnt - lateCnt;

  // Telemetry Top Bar
  const barY = 0;
  body += `<rect x="0" y="0" width="${W}" height="${banH}" fill="#14161b"/>`;
  body += `<line x1="0" y1="${banH}" x2="${W}" y2="${banH}" stroke="#fbbf24" stroke-opacity="0.7" stroke-width="1.8"/>`;
  if (isCheckin) {
    body += `<rect x="14" y="15" width="124" height="32" rx="7" fill="#22c55e" fill-opacity="0.16" stroke="#22c55e" stroke-width="1.2"/><text x="76" y="36.5" font-size="14.5" font-weight="700" text-anchor="middle" fill="#86efac" font-family="${FONT}">${readyCnt} IN LOBBY</text>`;
    body += `<rect x="146" y="15" width="92" height="32" rx="7" fill="#f59e0b" fill-opacity="0.16" stroke="#f59e0b" stroke-width="1.2"/><text x="192" y="36.5" font-size="14.5" font-weight="700" text-anchor="middle" fill="#fcd34d" font-family="${FONT}">${lateCnt} LATE</text>`;
    body += `<rect x="246" y="15" width="112" height="32" rx="7" fill="#71717a" fill-opacity="0.2" stroke="#52525b" stroke-width="1.2"/><text x="302" y="36.5" font-size="14.5" font-weight="700" text-anchor="middle" fill="#a1a1aa" font-family="${FONT}">${waitCnt} WAITING</text>`;
  } else if (isCall) {
    body += `<rect x="14" y="15" width="144" height="32" rx="7" fill="#f59e0b" fill-opacity="0.16" stroke="#f59e0b" stroke-width="1.2"/><text x="86" y="36.5" font-size="14.5" font-weight="700" text-anchor="middle" fill="#fcd34d" font-family="${FONT}">${starters.length} CALLED UP</text>`;
    body += `<rect x="166" y="15" width="124" height="32" rx="7" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/><text x="228" y="36.5" font-size="14.5" font-weight="700" text-anchor="middle" fill="#e4e4e7" font-family="${FONT}">${bench.length} STANDBY</text>`;
  } else {
    body += `<rect x="14" y="15" width="134" height="32" rx="7" fill="#22c55e" fill-opacity="0.16" stroke="#4ade80" stroke-width="1.2"/><text x="81" y="36.5" font-size="14.5" font-weight="700" text-anchor="middle" fill="#86efac" font-family="${FONT}">AVG OVR ${avgOvr ?? '—'}</text>`;
    body += `<rect x="156" y="15" width="100" height="32" rx="7" fill="#f59e0b" fill-opacity="0.16" stroke="#f59e0b" stroke-width="1.2"/><text x="206" y="36.5" font-size="14.5" font-weight="700" text-anchor="middle" fill="#fcd34d" font-family="${FONT}">CHEM ${chemScore}</text>`;
    if (winForm != null) body += `<rect x="264" y="15" width="106" height="32" rx="7" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/><text x="317" y="36.5" font-size="14.5" font-weight="700" text-anchor="middle" fill="#e4e4e7" font-family="${FONT}">${winForm}% FORM</text>`;
  }

  body += `<rect x="668" y="14" width="118" height="34" rx="8" fill="#23262e" stroke="#f59e0b" stroke-opacity="0.5" stroke-width="1.2"/><text x="727" y="36.5" font-size="15" font-weight="700" text-anchor="middle" fill="#f4f4f5" font-family="${FONT}">${esc(formation)}</text>`;
  const stageBadge = isCheckin ? `${readyCnt}/${starters.length} READY` : isCall ? 'PROVISIONAL' : mode === 'suggested' ? 'SUGGESTED XI' : 'FINAL XI';
  const sbCol = isFinal ? '#4ade80' : isCall ? '#fcd34d' : '#fde68a';
  body += `<rect x="794" y="14" width="132" height="34" rx="8" fill="#f59e0b" fill-opacity="0.14" stroke="${sbCol}" stroke-width="1.3"/><text x="860" y="36.5" font-size="14" font-weight="800" text-anchor="middle" fill="${sbCol}" font-family="${FONT}">${stageBadge}</text>`;

  // Left Pitch + Chemistry Link Lines
  body += pitchBaseSvg(px, py, pw, ph);
  body += `<line x1="${pw}" y1="${banH}" x2="${pw}" y2="${H - footH}" stroke="#f59e0b" stroke-opacity="0.45" stroke-width="1.5"/>`;

  if (showChem) {
    const filled = slots.filter((s) => assigned[s.id]);
    for (let i = 0; i < filled.length; i++) {
      for (let j = i + 1; j < filled.length; j++) {
        const a = filled[i], b = filled[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 34) {
          const avg = ((assigned[a.id].p.ovr ?? 7.5) + (assigned[b.id].p.ovr ?? 7.5)) / 2;
          const col = avg >= 8.3 ? '#4ade80' : '#fbbf24';
          const x1 = px + (a.x / 100) * pw, y1 = py + (a.y / 100) * ph;
          const x2 = px + (b.x / 100) * pw, y2 = py + (b.y / 100) * ph;
          body += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="2.5" stroke-opacity="0.58"${avg >= 8.3 ? '' : ' stroke-dasharray="6 4"'}/>`;
        }
      }
    }
  }

  // Starter Nodes: Gold-outlined Site Avatar / Discord PFP circles + Nameplate pill ([Icon] Name OVR)
  for (const s of slots) {
    const cx = Math.round(px + (s.x / 100) * pw);
    const cy = Math.round(py + (s.y / 100) * ph);
    const pick = assigned[s.id];
    const st = CAT_STYLE[s.cat] ?? CAT_STYLE.def;
    if (!pick) {
      body += `<circle cx="${cx}" cy="${cy}" r="24" fill="${st.bg}" stroke="${st.ring}" stroke-width="2.4"/>`;
      body += `<text x="${cx}" y="${cy + 5}" font-size="13" font-weight="800" text-anchor="middle" fill="#ffffff" font-family="${FONT}">${esc(s.id)}</text>`;
      body += `<rect x="${cx - 24}" y="${cy + 22}" width="48" height="17" rx="5" fill="#300a0a" fill-opacity="0.9" stroke="#ef4444" stroke-opacity="0.55"/><text x="${cx}" y="${cy + 34}" font-size="10" font-weight="800" text-anchor="middle" fill="#fca5a5" font-family="${FONT}">OPEN</text>`;
      continue;
    }
    const p = pick.p;
    const ciState = stOf(p.id);
    const ringCol = isCheckin ? (ciState === 'ready' ? '#22c55e' : ciState === 'late' ? '#f59e0b' : '#52525b') : '#f59e0b';
    const r = 25;
    const uri = faces.get(String(p.id));
    const cid = `xa${clipN++}`;
    defs += `<clipPath id="${cid}"><circle cx="${cx}" cy="${cy}" r="${r - 1.5}"/></clipPath>`;
    if (uri) {
      body += `<image href="${uri}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"${isCheckin && ciState === 'wait' ? ' opacity="0.55"' : ''}/>`;
    } else {
      body += `<circle cx="${cx}" cy="${cy}" r="${r - 1.5}" fill="${avColor(p.id)}"${isCheckin && ciState === 'wait' ? ' opacity="0.55"' : ''}/>`;
      body += `<text x="${cx}" y="${cy + 7}" font-size="19" font-weight="800" text-anchor="middle" fill="#ffffff" font-family="${FONT}">${esc(initialOf(p.name))}</text>`;
    }
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ringCol}" stroke-width="3"/>`;

    if (captainId && String(p.id) === String(captainId) && !isCheckin) {
      body += `<circle cx="${cx - 19}" cy="${cy - 18}" r="9" fill="#f59e0b" stroke="#0b0c0e" stroke-width="2"/><text x="${cx - 19}" y="${cy - 14.5}" font-size="11" font-weight="900" text-anchor="middle" fill="#0a0705" font-family="${FONT}">C</text>`;
    }
    if (isCheckin) {
      const dg = ciState === 'ready' ? '✓' : ciState === 'late' ? '!' : '·';
      body += `<circle cx="${cx + 19}" cy="${cy - 18}" r="9" fill="${ringCol}" stroke="#0b0c0e" stroke-width="2"/><text x="${cx + 19}" y="${cy - 14.5}" font-size="11" font-weight="900" text-anchor="middle" fill="${ciState === 'late' ? '#111' : '#fff'}" font-family="${FONT}">${dg}</text>`;
    }

    // Nameplate pill: [Custom Position Icon] · Name · OVR
    const nm = plain(p.name, 10);
    const rtTxt = isCheckin ? '' : ` ${(p.ovr ?? 7.5).toFixed(1)}`;
    const pillW = Math.max(82, 24 + (nm.length + rtTxt.length) * 7.6);
    const pillX = cx - pillW / 2, pillY = cy + r - 7;
    body += `<rect x="${pillX}" y="${pillY}" width="${pillW}" height="23" rx="11.5" fill="#0a0705" fill-opacity="0.92" stroke="#fbbf24" stroke-opacity="0.48" stroke-width="1.2"/>`;
    body += miniIconGroup(pillX + 4, pillY + 3.5, 16, s.id, s.cat);
    body += `<text x="${pillX + 24}" y="${pillY + 15.5}" font-size="12.5" font-weight="800" fill="#f3f4f6" font-family="${FONT}">${esc(nm)}${rtTxt ? `<tspan fill="${pick.mode === 'flex' ? '#fcd34d' : '#4ade80'}">${esc(rtTxt)}</tspan>` : ''}</text>`;
  }

  // Right Panel
  body += `<rect x="${rx}" y="${banH}" width="${rw}" height="${ph}" fill="#111317"/>`;
  const rHead = isCheckin ? 'STARTING XI · LOBBY STATUS' : isCall ? 'PROVISIONAL XI · CALLED UP' : 'OFFICIAL XI · ALL-TIME STATS';
  body += `<text x="${rx + 18}" y="${banH + 26}" font-size="13" font-weight="700" letter-spacing="1.2" fill="#949ba4" font-family="${FONT}">${rHead}</text>`;
  body += `<text x="${W - 18}" y="${banH + 26}" font-size="13" font-weight="700" text-anchor="end" fill="#fbbf24" font-family="${FONT}">${starters.length}/${slots.length}</text>`;
  body += `<line x1="${rx + 16}" y1="${banH + 36}" x2="${W - 16}" y2="${banH + 36}" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>`;

  starters.slice(0, 11).forEach(({ s, pick }, i) => {
    const ry = banH + 46 + i * 42;
    const st = CAT_STYLE[s.cat] ?? CAT_STYLE.def;
    const p = pick.p;
    body += `<rect x="${rx + 14}" y="${ry}" width="${rw - 28}" height="36" rx="6" fill="#ffffff" fill-opacity="0.03"/>`;
    body += `<rect x="${rx + 20}" y="${ry + 6.5}" width="64" height="23" rx="5" fill="${st.badgeBg}" fill-opacity="0.26" stroke="${st.ring}" stroke-width="1.2"/>`;
    body += miniIconGroup(rx + 24, ry + 10, 16, s.id, s.cat);
    body += `<text x="${rx + 45}" y="${ry + 22.5}" font-size="12" font-weight="800" fill="${st.text}" font-family="${FONT}">${esc(s.id)}</text>`;
    body += `<text x="${rx + 94}" y="${ry + 23}" font-size="15" font-weight="700" fill="#f3f4f6" font-family="${FONT}">${esc(plain(p.name, 14))}${captainId && String(p.id) === String(captainId) ? ' (C)' : ''}</text>`;

    if (isCheckin) {
      const ci = stOf(p.id);
      const cbg = ci === 'ready' ? '#22c55e' : ci === 'late' ? '#f59e0b' : '#71717a';
      const cst = ci === 'ready' ? '#22c55e' : ci === 'late' ? '#f59e0b' : '#52525b';
      const ctx = ci === 'ready' ? 'IN LOBBY' : ci === 'late' ? 'LATE' : 'WAITING';
      body += `<rect x="${W - 104}" y="${ry + 7}" width="84" height="22" rx="5" fill="${cbg}" fill-opacity="0.2" stroke="${cst}" stroke-width="1.1"/><text x="${W - 62}" y="${ry + 22}" font-size="11.5" font-weight="800" text-anchor="middle" fill="${ci === 'ready' ? '#86efac' : ci === 'late' ? '#fcd34d' : '#a1a1aa'}" font-family="${FONT}">${ctx}</text>`;
    } else if (isCall) {
      body += `<rect x="${W - 108}" y="${ry + 7}" width="88" height="22" rx="5" fill="#f59e0b" fill-opacity="0.18" stroke="#f59e0b" stroke-width="1.1"/><text x="${W - 64}" y="${ry + 22}" font-size="11.5" font-weight="800" text-anchor="middle" fill="#fcd34d" font-family="${FONT}">CALLED UP</text>`;
    } else {
      if (p.stat) body += `<text x="${W - 66}" y="${ry + 23}" font-size="12.5" text-anchor="end" fill="#94a3b8" font-family="${FONT}">${esc(p.stat)}</text>`;
      body += `<rect x="${W - 58}" y="${ry + 7}" width="38" height="22" rx="5" fill="#4ade80" fill-opacity="0.14" stroke="#4ade80" stroke-opacity="0.45" stroke-width="1.1"/><text x="${W - 39}" y="${ry + 22}" font-size="12.5" font-weight="800" text-anchor="middle" fill="#4ade80" font-family="${FONT}">${(p.ovr ?? 7.5).toFixed(1)}</text>`;
    }
  });

  // Bench footer inside right panel
  const fy = H - footH - 42;
  body += `<line x1="${rx + 16}" y1="${fy}" x2="${W - 16}" y2="${fy}" stroke="#ffffff" stroke-opacity="0.09" stroke-width="1"/>`;
  const bTxt = bench.slice(0, 5).map((b) => `${plain(b.name, 12)} (${b.mapped?.[0] ?? ''})`).join(', ') + (bench.length > 5 ? ` +${bench.length - 5}` : '');
  body += `<text x="${rx + 18}" y="${fy + 25}" font-size="13" fill="#9ca3af" font-family="${FONT}"><tspan fill="#e5e7eb" font-weight="700">Bench (${bench.length}): </tspan>${esc(bTxt || 'None')}</text>`;

  // Bottom Telemetry Strip
  body += `<rect x="0" y="${H - footH}" width="${W}" height="${footH}" fill="#14161b"/>`;
  body += `<line x1="0" y1="${H - footH}" x2="${W}" y2="${H - footH}" stroke="#f59e0b" stroke-opacity="0.38" stroke-width="1.2"/>`;
  const stripTxt = isCheckin
    ? 'OPEN RULE: Manager trigger or auto 15m before kickoff · 5–10m grace period'
    : isCall
    ? 'PROVISIONAL CALL-UP: Called-up starters & standby bench must check in before kickoff'
    : 'CONFIRMED XI: Green links = High Duo Chem · Gold = Solid Chem · Auto-fallback verified by manager';
  body += `<text x="20" y="${H - 14}" font-size="13.5" font-weight="700" fill="${isFinal ? '#4ade80' : '#fbbf24'}" font-family="${FONT}">${esc(stripTxt)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><rect width="${W}" height="${H}" rx="16" fill="#0b0c0e"/>${body}<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="15" fill="none" stroke="#fbbf24" stroke-width="3.5"/><rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="12" fill="none" stroke="#f59e0b" stroke-opacity="0.28" stroke-width="1"/></svg>`;
}

const faceData = (url) => (url ? imageData(/^https:\/\/cdn\.discordapp\.com\//.test(url) && !url.includes('?') ? `${url}?size=128` : url, FACE_BYTES) : null);

let clubMemo = null;
async function loadClubMatches(env) {
  const site = String(env?.SITE_URL || '').replace(/\/?$/, '/');
  if (!site) return [];
  if (clubMemo?.site === site && Date.now() - clubMemo.at < 10 * 60e3) return clubMemo.matches;
  try {
    const r = await fetch(`${site}api/club.json`, { signal: AbortSignal.timeout(3000) });
    const d = r.ok ? await r.json().catch(() => null) : null;
    const matches = Array.isArray(d?.matches) ? d.matches : [];
    clubMemo = { site, at: Date.now(), matches };
    return matches;
  } catch { return clubMemo?.matches ?? []; }
}

async function enrichRollCallForm(env, model) {
  if (!Array.isArray(model?.rsvps) || !model.rsvps.length) return model;
  if (model.rsvps.some((r) => Array.isArray(r.form) && r.form.length)) return model;
  const matches = await loadClubMatches(env);
  if (!matches.length) return model;
  const clubForm = matches.map((m) => m.res).filter((x) => ['W', 'D', 'L'].includes(x)).slice(0, 5);
  const claimMap = new Map();
  if (env?.DB) {
    try {
      const ids = [...new Set(model.rsvps.map((r) => String(r.user_id ?? r.id ?? '')).filter(Boolean))];
      if (ids.length) {
        const rows = (await env.DB.prepare(`SELECT user_id, player FROM claims WHERE status = 'approved' AND user_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results ?? [];
        for (const c of rows) claimMap.set(String(c.user_id), String(c.player));
      }
    } catch { /* ignore */ }
  }
  const byKey = new Map();
  const byName = new Map();
  for (const m of matches) {
    if (!Array.isArray(m.ps)) continue;
    for (const p of m.ps) {
      const rt = typeof p.r === 'number' && p.r > 0 ? p.r : null;
      if (rt == null) continue;
      const k = String(p.k ?? '');
      const n = String(p.n ?? '').toLowerCase();
      if (k) { const a = byKey.get(k) ?? []; if (a.length < 15) { a.push(rt); byKey.set(k, a); } }
      if (n) { const a = byName.get(n) ?? []; if (a.length < 15) { a.push(rt); byName.set(n, a); } }
    }
  }
  const toDots = (arr) => arr.slice(0, 5).map((rt) => (rt >= 8.0 ? 'G' : rt >= 7.0 ? 'Y' : 'R'));
  const rsvps = model.rsvps.map((r) => {
    const uid = String(r.user_id ?? r.id ?? '');
    const ck = claimMap.get(uid);
    const nm = String(r.name ?? '').toLowerCase();
    const ratings = (ck && byKey.get(ck)) || byName.get(nm) || null;
    if (ratings && ratings.length) {
      const avg = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
      return { ...r, avg, form: toDots(ratings) };
    }
    return { ...r, avg: null, form: clubForm };
  });
  const winForm = model.winForm ?? (clubForm.length ? Math.round((clubForm.filter((x) => x === 'W').length / clubForm.length) * 100) : null);
  return { ...model, rsvps, winForm };
}

// Renders any Pro Telemetry graphic via @resvg/resvg-wasm → R2 env.MEDIA (or KV fallback when R2 is off). Never throws.
export async function drawHostGraphic(env, kind, eventId, model, userIds = []) {
  try {
    const kv = env?.PHOENIX_KV ?? env?.NOREX_KV ?? null;
    if (!env?.MEDIA && !kv) return { error: 'MEDIA and KV bindings unavailable.' };
    const base = String(env.PUBLIC_URL || '').replace(/\/?$/, '');
    if (!base) return { error: 'PUBLIC_URL is not set.' };
    const ids = [...new Set(userIds.map(String))].slice(0, 24);
    const isSimple = kind === 'banner' || kind === 'crest';
    const [faceUrls, crest, enrichedModel] = await Promise.all([
      isSimple ? Promise.resolve(new Map()) : (ids.length ? facesOf(env, ids) : Promise.resolve(new Map())),
      isSimple ? crestData(env) : Promise.resolve(null),
      kind === 'rollcall' ? enrichRollCallForm(env, model) : Promise.resolve(model),
    ]);
    const hash = await sha(JSON.stringify(['v10', kind, enrichedModel, !!crest, ids.map((id) => faceUrls.get(id))]));
    const key = `ht/${eventId}-${kind}-${hash}.png`;
    if (env.MEDIA) {
      if (await env.MEDIA.head?.(key) ?? await env.MEDIA.get(key)) return { url: `${base}/media/${key}`, key, cached: true };
    } else if (await kv.get(`media:${key}`, 'arrayBuffer')) {
      return { url: `${base}/media/${key}`, key, cached: true };
    }
    const faces = isSimple ? new Map() : new Map((await Promise.all(ids.map(async (id) => [id, await faceData(faceUrls.get(id))]))).filter(([, d]) => d));
    const fullModel = { ...enrichedModel, crest };
    const svg = kind === 'crest' ? crestThumbSvg(crest) : kind === 'banner' ? headerBannerSvg(fullModel) : kind === 'rollcall' ? rollCallSvg(fullModel, faces) : lineupStageSvg(fullModel, faces);
    const { svgToPng } = await import('./svgpng.js');
    const png = await svgToPng(svg);
    if (!png || png.byteLength < 2000) return { error: 'Empty PNG returned.' };
    if (env.MEDIA) {
      await env.MEDIA.put(key, png, { httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' } });
      env.MEDIA.list?.({ prefix: `ht/${eventId}-${kind}-`, limit: 40 }).then((l) => l.objects.filter((o) => o.key !== key).forEach((o) => env.MEDIA.delete(o.key).catch(() => {}))).catch(() => {});
    } else {
      await kv.put(`media:${key}`, png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength), { expirationTtl: 30 * 86400 });
    }
    return { url: `${base}/media/${key}`, key, cached: false };
  } catch (err) {
    console.log('drawHostGraphic failed:', err?.message ?? err);
    return { error: String(err?.message ?? err).slice(0, 200) };
  }
}
