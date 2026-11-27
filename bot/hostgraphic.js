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
import { imageData, sha } from './rosterpic.js';

const W = 1040, H = 720, FACE_BYTES = 200e3;
const FONT = "Oswald, 'Segoe UI', Arial, Helvetica, sans-serif";
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
    CM: ['LCM', 'RCM', 'CDM', 'CAM'], LCM: ['CM', 'CDM', 'CAM', 'LM'], RCM: ['CM', 'CDM', 'CAM', 'RM'],
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
export function rollCallSvg(model, faces = new Map()) {
  const { formation = '3-5-2', slots = [], rsvps = [], closed = false, avgOvr = null, winForm = null } = model;
  const yes = rsvps.filter((r) => r.status === 'yes');
  const maybe = rsvps.filter((r) => r.status === 'maybe');
  const out = rsvps.filter((r) => r.status === 'no');
  const totalReplied = yes.length + maybe.length + out.length;

  const bySlot = Object.fromEntries(slots.map((s) => [s.id, { primary: [], flex: [] }]));
  const lineCnt = { att: 0, mid: 0, def: 0, gk: 0 };
  const mappedYes = yes.map((r) => {
    const raw = Array.isArray(r.prefs) && r.prefs.length ? r.prefs : (r.primary ? [r.primary] : []);
    const mapped = [...new Set((raw.length ? raw : [slots[0]?.id ?? 'ST']).map((p) => mapSlotToFormation(p, slots)))];
    const prim = mapped[0];
    if (bySlot[prim]) bySlot[prim].primary.push(r);
    mapped.slice(1).forEach((f) => { if (bySlot[f]) bySlot[f].flex.push(r); });
    const cat = slotCategory(prim);
    if (cat === 'att') lineCnt.att++;
    else if (cat === 'gk') lineCnt.gk++;
    else if (cat === 'def') lineCnt.def++;
    else lineCnt.mid++;
    return { ...r, mapped, prim, cat };
  });

  const order = Object.fromEntries(slots.map((s, i) => [s.id, i]));
  mappedYes.sort((a, b) => (order[a.prim] ?? 99) - (order[b.prim] ?? 99) || (a.signed_in_at ?? a.at ?? 0) - (b.signed_in_at ?? b.at ?? 0));
  const covered = slots.filter((s) => (bySlot[s.id]?.primary.length ?? 0) > 0).length;

  const banH = 58, footH = 40, px = 0, py = banH, pw = 592, ph = H - banH - footH;
  const rx = pw, rw = W - pw;
  let defs = `
    `;
  let body = '';
  let clipN = 0;

  // Top Banner Bar: ATT/MID/DEF/GK chips left + glowing gold counter + formation + X/11 FILLED right
  body += `<rect x="0" y="0" width="${W}" height="${banH}" fill="#14161b"/>`;
  body += `<line x1="0" y1="${banH}" x2="${W}" y2="${banH}" stroke="#f59e0b" stroke-opacity="0.55" stroke-width="1.5"/>`;
  const chips = [
    ['ATT', lineCnt.att, '#ef4444'],
    ['MID', lineCnt.mid, '#a855f7'],
    ['DEF', lineCnt.def, '#22c55e'],
    ['GK', lineCnt.gk, '#3b82f6'],
  ];
  chips.forEach(([lbl, n, col], i) => {
    const cx = 18 + i * 96;
    body += `<rect x="${cx}" y="15" width="84" height="28" rx="7" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1"/>
      <circle cx="${cx + 14}" cy="29" r="4.5" fill="${col}"/>
      <text x="${cx + 26}" y="34" font-size="14" font-weight="700" fill="#e4e4e7" font-family="${FONT}">${lbl} ${n}</text>`;
  });

  // Glowing gold counter + formation + filled badge on right
  body += `<rect x="572" y="14" width="194" height="30" rx="7" fill="#14161a" stroke="#f59e0b" stroke-opacity="0.75" stroke-width="1.4"/>
    <text x="669" y="34" font-size="15" font-weight="700" text-anchor="middle" font-family="${FONT}">
      <tspan fill="#4ade80">IN ${yes.length}</tspan><tspan fill="#52525b">  ·  </tspan><tspan fill="#fbbf24">M ${maybe.length}</tspan><tspan fill="#52525b">  ·  </tspan><tspan fill="#f87171">OUT ${out.length}</tspan>
    </text>`;
  body += `<rect x="778" y="14" width="112" height="30" rx="7" fill="#23262e" stroke="#3f434e" stroke-width="1.2"/>
    <text x="834" y="34" font-size="14" font-weight="700" text-anchor="middle" fill="#f4f4f5" font-family="${FONT}">${esc(formation)}</text>`;
  const fillBg = closed ? '#ef4444' : covered === slots.length ? '#22c55e' : '#ffffff';
  const fillOp = closed ? '0.24' : covered === slots.length ? '0.2' : '0.06';
  const fillStroke = closed ? '#ef4444' : covered === slots.length ? '#22c55e' : '#ffffff';
  const fillStrOp = closed || covered === slots.length ? '1' : '0.18';
  const fillTxt = closed ? 'CLOSED' : `${covered}/${slots.length} FILLED`;
  body += `<rect x="900" y="14" width="122" height="30" rx="7" fill="${fillBg}" fill-opacity="${fillOp}" stroke="${fillStroke}" stroke-opacity="${fillStrOp}" stroke-width="1.2"/>
    <text x="961" y="34" font-size="13.5" font-weight="700" text-anchor="middle" fill="${closed ? '#fca5a5' : covered === slots.length ? '#86efac' : '#e5e7eb'}" font-family="${FONT}">${fillTxt}</text>`;

  // Left Vertical Pitch
  body += pitchBaseSvg(px, py, pw, ph);
  body += `<line x1="${pw}" y1="${banH}" x2="${pw}" y2="${H - footH}" stroke="#f59e0b" stroke-opacity="0.45" stroke-width="1.5"/>`;

  // Position Nodes (solid circles + blurred custom icon watermark + overlapping max-3 avatar pill + flex tag)
  for (const s of slots) {
    const cx = Math.round(px + (s.x / 100) * pw);
    const cy = Math.round(py + (s.y / 100) * ph);
    const st = CAT_STYLE[s.cat] ?? CAT_STYLE.def;
    const d = bySlot[s.id] ?? { primary: [], flex: [] };
    const r = 24;
    const cid = `nc${clipN++}`;
    defs += `<clipPath id="${cid}"><circle cx="${cx}" cy="${cy}" r="${r - 1}"/></clipPath>`;
    // Circle + blurred watermark icon
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${st.bg}" stroke="${st.ring}" stroke-width="2.6"/>`;
    body += `<g clip-path="url(#${cid})" opacity="0.44" transform="translate(${cx - 22},${cy - 22}) scale(1.85)">${emblemPath(s.id, s.cat, st.fill)}</g>`;
    body += `<text x="${cx}" y="${cy + 5}" font-size="${s.id.length > 3 ? 11.5 : 13}" font-weight="800" text-anchor="middle" fill="#ffffff" font-family="${FONT}">${esc(s.id)}</text>`;

    // Side-by-side avatar pill (max 3 + +N 4th circle)
    let belowY = cy + r + 10;
    if (d.primary.length > 0) {
      const shown = d.primary.slice(0, 3);
      const extra = d.primary.length - shown.length;
      const totalDots = shown.length + (extra > 0 ? 1 : 0);
      const pillW = totalDots * 22 + 16;
      const pillX = cx - pillW / 2;
      body += `<rect x="${pillX}" y="${cy + r - 6}" width="${pillW}" height="28" rx="14" fill="#0a0705" fill-opacity="0.9" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1.2"/>`;
      shown.forEach((p, idx) => {
        const ax = pillX + 19 + idx * 22;
        const ay = cy + r + 8;
        const uri = faces.get(String(p.user_id ?? p.id));
        if (uri) {
          const aid = `av${clipN++}`;
          defs += `<clipPath id="${aid}"><circle cx="${ax}" cy="${ay}" r="11"/></clipPath>`;
          body += `<image href="${uri}" x="${ax - 11}" y="${ay - 11}" width="22" height="22" preserveAspectRatio="xMidYMid slice" clip-path="url(#${aid})"/>`;
          body += `<circle cx="${ax}" cy="${ay}" r="11" fill="none" stroke="#0a0705" stroke-width="1.8"/>`;
        } else {
          body += `<circle cx="${ax}" cy="${ay}" r="11" fill="${avColor(p.user_id ?? p.id)}" stroke="#0a0705" stroke-width="1.8"/>`;
          body += `<text x="${ax}" y="${ay + 4}" font-size="11" font-weight="800" text-anchor="middle" fill="#ffffff" font-family="${FONT}">${esc(initialOf(p.name))}</text>`;
        }
      });
      if (extra > 0) {
        const ax = pillX + 19 + shown.length * 22;
        const ay = cy + r + 8;
        body += `<circle cx="${ax}" cy="${ay}" r="11.5" fill="#1f2937" stroke="#f59e0b" stroke-width="1.5"/>`;
        body += `<text x="${ax}" y="${ay + 4}" font-size="10" font-weight="800" text-anchor="middle" fill="#fcd34d" font-family="${FONT}">+${extra}</text>`;
      }
      belowY = cy + r + 28;
    }

    if (d.flex.length > 0) {
      body += `<rect x="${cx - 28}" y="${belowY - 2}" width="56" height="17" rx="5" fill="#140e06" fill-opacity="0.88" stroke="#f59e0b" stroke-opacity="0.5" stroke-width="1"/>`;
      body += `<text x="${cx}" y="${belowY + 10}" font-size="10.5" font-weight="700" text-anchor="middle" fill="#fcd34d" font-family="${FONT}">+${d.flex.length} flex</text>`;
    } else if (d.primary.length === 0) {
      body += `<rect x="${cx - 24}" y="${belowY - 8}" width="48" height="17" rx="5" fill="#300a0a" fill-opacity="0.9" stroke="#ef4444" stroke-opacity="0.55" stroke-width="1"/>`;
      body += `<text x="${cx}" y="${belowY + 4}" font-size="10" font-weight="800" text-anchor="middle" fill="#fca5a5" font-family="${FONT}">OPEN</text>`;
    }
  }

  // Right Roster Panel (1 row per player, max 12 rows + overflow bar, form dots + custom position icons)
  body += `<rect x="${rx}" y="${banH}" width="${rw}" height="${ph}" fill="#111317"/>`;
  body += `<text x="${rx + 18}" y="${banH + 26}" font-size="13" font-weight="700" letter-spacing="1.2" fill="#949ba4" font-family="${FONT}">SQUAD · PRIMARY + FLEX</text>`;
  body += `<text x="${W - 18}" y="${banH + 26}" font-size="13" font-weight="700" text-anchor="end" fill="#949ba4" font-family="${FONT}">${totalReplied} REPLIED</text>`;
  body += `<line x1="${rx + 16}" y1="${banH + 36}" x2="${W - 16}" y2="${banH + 36}" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>`;

  const maxRows = 12;
  const shownPlayers = mappedYes.slice(0, maxRows);
  const hiddenCount = mappedYes.length - shownPlayers.length;
  const rowH = 38;
  shownPlayers.forEach((p, i) => {
    const ry = banH + 46 + i * rowH;
    const st = CAT_STYLE[p.cat] ?? CAT_STYLE.def;
    body += `<rect x="${rx + 14}" y="${ry}" width="${rw - 28}" height="33" rx="6" fill="#ffffff" fill-opacity="0.03"/>`;
    body += `<circle cx="${rx + 26}" cy="${ry + 16.5}" r="4" fill="${st.ring}"/>`;
    body += `<text x="${rx + 38}" y="${ry + 21.5}" font-size="15" font-weight="700" fill="#f3f4f6" font-family="${FONT}">${esc(plain(p.name, 14))}</text>`;

    // 5-match W/D/L form dots
    const form = Array.isArray(p.form) ? p.form.slice(-5) : [];
    form.forEach((f, fi) => {
      const fc = f === 'W' ? '#4ade80' : f === 'D' ? '#fbbf24' : '#f87171';
      body += `<circle cx="${rx + 178 + fi * 10}" cy="${ry + 16.5}" r="3.2" fill="${fc}"/>`;
    });

    // Primary badge (with custom position icon) + Flex pills right-aligned
    let tagX = W - 20;
    const flex = p.mapped.slice(1, 3).reverse();
    for (const fl of flex) {
      const fw = Math.max(38, fl.length * 8 + 14);
      tagX -= fw;
      body += `<rect x="${tagX}" y="${ry + 6}" width="${fw}" height="21" rx="4" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1"/>`;
      body += `<text x="${tagX + fw / 2}" y="${ry + 20.5}" font-size="11.5" font-weight="700" text-anchor="middle" fill="#a1a1aa" font-family="${FONT}">${esc(fl)}</text>`;
      tagX -= 5;
    }
    const pwBadge = Math.max(58, p.prim.length * 9 + 30);
    tagX -= pwBadge;
    body += `<rect x="${tagX}" y="${ry + 5}" width="${pwBadge}" height="23" rx="5" fill="${st.badgeBg}" fill-opacity="0.26" stroke="${st.ring}" stroke-width="1.2"/>`;
    body += miniIconGroup(tagX + 4, ry + 8.5, 16, p.prim, p.cat);
    body += `<text x="${tagX + 25}" y="${ry + 21}" font-size="12.5" font-weight="800" fill="${st.text}" font-family="${FONT}">${esc(p.prim)}</text>`;
  });

  if (hiddenCount > 0) {
    const oy = banH + 46 + maxRows * rowH;
    body += `<rect x="${rx + 14}" y="${oy}" width="${rw - 28}" height="28" rx="6" fill="#f59e0b" fill-opacity="0.14" stroke="#f59e0b" stroke-opacity="0.55" stroke-dasharray="4 3" stroke-width="1.2"/>`;
    body += `<text x="${rx + rw / 2}" y="${oy + 19}" font-size="13" font-weight="800" text-anchor="middle" fill="#fcd34d" font-family="${FONT}">+${hiddenCount} MORE SIGNED UP · TAP ROSTER FOR FULL LIST</text>`;
  }

  // Maybe / Out footer inside roster panel
  const fy = H - footH - 58;
  body += `<line x1="${rx + 16}" y1="${fy}" x2="${W - 16}" y2="${fy}" stroke="#ffffff" stroke-opacity="0.09" stroke-width="1"/>`;
  const mNames = maybe.slice(0, 6).map((x) => plain(x.name, 12)).join(', ') + (maybe.length > 6 ? ` +${maybe.length - 6}` : '');
  const oNames = out.slice(0, 6).map((x) => plain(x.name, 12)).join(', ') + (out.length > 6 ? ` +${out.length - 6}` : '');
  body += `<text x="${rx + 18}" y="${fy + 21}" font-size="13" fill="#9ca3af" font-family="${FONT}"><tspan fill="#fbbf24" font-weight="700">Maybe (${maybe.length}): </tspan>${esc(mNames || 'None')}</text>`;
  body += `<text x="${rx + 18}" y="${fy + 42}" font-size="13" fill="#9ca3af" font-family="${FONT}"><tspan fill="#f87171" font-weight="700">Out (${out.length}): </tspan>${esc(oNames || 'None')}</text>`;

  // Bottom Pro Telemetry Strip
  body += `<rect x="0" y="${H - footH}" width="${W}" height="${footH}" fill="#14161b"/>`;
  body += `<line x1="0" y1="${H - footH}" x2="${W}" y2="${H - footH}" stroke="#f59e0b" stroke-opacity="0.38" stroke-width="1.2"/>`;
  const teleText = `PRO TELEMETRY · ${avgOvr ? `Projected XI Avg ${avgOvr}` : `${yes.length} Players Ready`}${winForm != null ? ` · ${winForm}% Recent Win Form` : ''}`;
  body += `<text x="20" y="${H - 14}" font-size="14" font-weight="700" fill="#fbbf24" font-family="${FONT}">${esc(teleText)}</text>`;
  body += `<text x="${W - 20}" y="${H - 14}" font-size="13" font-weight="600" text-anchor="end" fill="#a1a1aa" font-family="${FONT}">Chem Links Active in Suggested XI</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><rect width="${W}" height="${H}" rx="16" fill="#0b0c0e"/>${body}<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="15" fill="none" stroke="#f59e0b" stroke-opacity="0.7" stroke-width="2.5"/></svg>`;
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
  const banH = 58, footH = 40, px = 0, py = banH, pw = 592, ph = H - banH - footH;
  const rx = pw, rw = W - pw;
  let defs = ``;
  let body = '';
  let clipN = 0;

  const starters = slots.map((s) => ({ s, pick: assigned[s.id] })).filter((x) => x.pick);
  const stOf = (id) => checkinMap.get(String(id)) ?? 'wait';
  const readyCnt = starters.filter((x) => stOf(x.pick.p.id) === 'ready').length;
  const lateCnt = starters.filter((x) => stOf(x.pick.p.id) === 'late').length;
  const waitCnt = starters.length - readyCnt - lateCnt;

  // Top Banner Bar
  body += `<rect x="0" y="0" width="${W}" height="${banH}" fill="#14161b"/>`;
  body += `<line x1="0" y1="${banH}" x2="${W}" y2="${banH}" stroke="#f59e0b" stroke-opacity="0.55" stroke-width="1.5"/>`;
  if (isCheckin) {
    body += `<rect x="18" y="15" width="128" height="28" rx="7" fill="#22c55e" fill-opacity="0.16" stroke="#22c55e" stroke-width="1.2"/><text x="82" y="34" font-size="14" font-weight="700" text-anchor="middle" fill="#86efac" font-family="${FONT}">${readyCnt} IN LOBBY</text>`;
    body += `<rect x="156" y="15" width="96" height="28" rx="7" fill="#f59e0b" fill-opacity="0.16" stroke="#f59e0b" stroke-width="1.2"/><text x="204" y="34" font-size="14" font-weight="700" text-anchor="middle" fill="#fcd34d" font-family="${FONT}">${lateCnt} LATE</text>`;
    body += `<rect x="262" y="15" width="118" height="28" rx="7" fill="#71717a" fill-opacity="0.2" stroke="#52525b" stroke-width="1.2"/><text x="321" y="34" font-size="14" font-weight="700" text-anchor="middle" fill="#a1a1aa" font-family="${FONT}">${waitCnt} WAITING</text>`;
  } else if (isCall) {
    body += `<rect x="18" y="15" width="150" height="28" rx="7" fill="#f59e0b" fill-opacity="0.16" stroke="#f59e0b" stroke-width="1.2"/><text x="93" y="34" font-size="14" font-weight="700" text-anchor="middle" fill="#fcd34d" font-family="${FONT}">${starters.length} CALLED UP</text>`;
    body += `<rect x="178" y="15" width="130" height="28" rx="7" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/><text x="243" y="34" font-size="14" font-weight="700" text-anchor="middle" fill="#e4e4e7" font-family="${FONT}">${bench.length} STANDBY</text>`;
  } else {
    body += `<rect x="18" y="15" width="138" height="28" rx="7" fill="#22c55e" fill-opacity="0.16" stroke="#4ade80" stroke-width="1.2"/><text x="87" y="34" font-size="14" font-weight="700" text-anchor="middle" fill="#86efac" font-family="${FONT}">AVG OVR ${avgOvr ?? '—'}</text>`;
    body += `<rect x="166" y="15" width="104" height="28" rx="7" fill="#f59e0b" fill-opacity="0.16" stroke="#f59e0b" stroke-width="1.2"/><text x="218" y="34" font-size="14" font-weight="700" text-anchor="middle" fill="#fcd34d" font-family="${FONT}">CHEM ${chemScore}</text>`;
    if (winForm != null) body += `<rect x="280" y="15" width="110" height="28" rx="7" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/><text x="335" y="34" font-size="14" font-weight="700" text-anchor="middle" fill="#e4e4e7" font-family="${FONT}">${winForm}% FORM</text>`;
  }

  body += `<rect x="760" y="14" width="120" height="30" rx="7" fill="#23262e" stroke="#3f434e" stroke-width="1.2"/><text x="820" y="34" font-size="14" font-weight="700" text-anchor="middle" fill="#f4f4f5" font-family="${FONT}">${esc(formation)}</text>`;
  const stageBadge = isCheckin ? `${readyCnt}/${starters.length} READY` : isCall ? 'PROVISIONAL' : mode === 'suggested' ? 'SUGGESTED XI' : 'FINAL XI';
  const sbCol = isFinal ? '#4ade80' : isCall ? '#fcd34d' : '#fde68a';
  body += `<rect x="890" y="14" width="132" height="30" rx="7" fill="#f59e0b" fill-opacity="0.14" stroke="${sbCol}" stroke-width="1.2"/><text x="956" y="34" font-size="13.5" font-weight="800" text-anchor="middle" fill="${sbCol}" font-family="${FONT}">${stageBadge}</text>`;

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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><rect width="${W}" height="${H}" rx="16" fill="#0b0c0e"/>${body}<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="15" fill="none" stroke="#f59e0b" stroke-opacity="0.7" stroke-width="2.5"/></svg>`;
}

const faceData = (url) => (url ? imageData(/^https:\/\/cdn\.discordapp\.com\//.test(url) && !url.includes('?') ? `${url}?size=128` : url, FACE_BYTES) : null);

// Renders any Pro Telemetry graphic via @resvg/resvg-wasm → R2 env.MEDIA with content-hash caching. Never throws.
export async function drawHostGraphic(env, kind, eventId, model, userIds = []) {
  try {
    if (!env?.MEDIA) return { error: 'MEDIA binding unavailable.' };
    const base = String(env.PUBLIC_URL || '').replace(/\/?$/, '');
    if (!base) return { error: 'PUBLIC_URL is not set.' };
    const ids = [...new Set(userIds.map(String))].slice(0, 24);
    const faceUrls = ids.length ? await facesOf(env, ids) : new Map();
    const hash = await sha(JSON.stringify(['v3', kind, model, ids.map((id) => faceUrls.get(id))]));
    const key = `ht/${eventId}-${kind}-${hash}.png`;
    if (await env.MEDIA.head?.(key) ?? await env.MEDIA.get(key)) return { url: `${base}/media/${key}`, key, cached: true };
    const faces = new Map((await Promise.all(ids.map(async (id) => [id, await faceData(faceUrls.get(id))]))).filter(([, d]) => d));
    const svg = kind === 'rollcall' ? rollCallSvg(model, faces) : lineupStageSvg(model, faces);
    const { svgToPng } = await import('./svgpng.js');
    const png = await svgToPng(svg);
    if (!png || png.byteLength < 2000) return { error: 'Empty PNG returned.' };
    await env.MEDIA.put(key, png, { httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' } });
    env.MEDIA.list?.({ prefix: `ht/${eventId}-${kind}-`, limit: 40 }).then((l) => l.objects.filter((o) => o.key !== key).forEach((o) => env.MEDIA.delete(o.key).catch(() => {}))).catch(() => {});
    return { url: `${base}/media/${key}`, key, cached: false };
  } catch (err) {
    console.log('drawHostGraphic failed:', err?.message ?? err);
    return { error: String(err?.message ?? err).slice(0, 200) };
  }
}
