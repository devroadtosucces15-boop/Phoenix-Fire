// 4-Stage Pro Telemetry Matchday Interactive Flows (custom_id prefix: `pf:h:<eventId>:<action>...`).
// Handles:
//   - Member: I'm In (private 11-button formation-matched multi-position picker, max 3), Maybe, Out,
//             Suggested XI (private visual + rationale; read-only for members, Dugout controls for managers),
//             Full Roster (chronological by signed_in_at priority).
//   - Manager: Close & Lineup (locks sign-ups in place + Dugout deep link), Override (User Select for ANY member),
//              Reschedule (incremental -1d/+1d and -1h/-15m/+15m/+1h), Cancel, Open Check-In, Final XI lock.
import { can, flagOn } from './roles.js';
import { orgName } from './orgconfig.js';
import { message, text, sep, footer, cards, button, buttons, reply, notice, EPHEMERAL, IS_V2 } from './ui.js';
import { ic } from './icons.js';
import { parsePref, cleanPref, PREF_MAX } from './prefpos.js';
import { FORMATIONS, answerEvents, rsvpRows, refreshEventPost, refreshCheckinPost, setCheckin, openCheckinNow, lockFinalLineup } from './events.js';
import { normalizeFormationSlots, solveSuggestedXI, drawHostGraphic } from './hostgraphic.js';

export const HOST_FLOW_RE = /^pf:h:\d+:/;

const one = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
const all = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).all().then((r) => r.results);
const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();
const parse = (s, fb) => { try { return s ? JSON.parse(s) ?? fb : fb; } catch { return fb; } };
const updateMsg = (data) => ({ type: 7, data });

// Build the private 11-button formation-matched multi-position picker (5 + 5 + 1 + Save/Clear).
export function positionPickerMessage(eventId, formation, draft = [], { targetId = null, targetName = null, app = 'matchday' } = {}) {
  const raw = FORMATIONS[formation] ?? FORMATIONS['3-5-2'];
  const slots = normalizeFormationSlots(raw);
  const clean = cleanPref(draft, slots.map((s) => s.id));
  const prefix = targetId ? `pf:h:${eventId}:ovpos:${targetId}` : `pf:h:${eventId}:pos`;
  const saveId = targetId ? `pf:h:${eventId}:ovsave:${targetId}:${clean.join(',')}` : `pf:h:${eventId}:save:${clean.join(',')}`;
  const clearId = targetId ? `pf:h:${eventId}:ovclear:${targetId}` : `pf:h:${eventId}:clear`;

  const mkBtn = (s) => {
    const idx = clean.indexOf(s.id);
    const style = idx === 0 ? 'ok' : idx > 0 ? 'brand' : 'grey';
    const suffix = idx === 0 ? ' ★' : idx > 0 ? ' ✓' : '';
    const next = idx >= 0 ? clean.filter((x) => x !== s.id) : (clean.length < PREF_MAX ? [...clean, s.id] : clean);
    return button({ label: `${s.id}${suffix}`, id: `${prefix}:${s.id}:${next.join(',')}`, style, emoji: ic(`pos_${s.cat}`, app) });
  };

  const rows = [];
  for (let k = 0; k < slots.length; k += 5) rows.push({ type: 1, components: slots.slice(k, k + 5).map(mkBtn) });
  // Action row (Save + Clear, plus Maybe/Out when Manager is overriding)
  const actions = [
    button({ label: targetId ? 'Set In' : 'Save Positions', id: saveId, style: 'ok', emoji: ic('btn_in', app), disabled: clean.length === 0 }),
    button({ label: 'Clear', id: clearId, style: 'grey', emoji: ic('btn_out', app), disabled: clean.length === 0 }),
  ];
  if (targetId) {
    actions.push(button({ label: 'Maybe', id: `pf:h:${eventId}:ovst:${targetId}:maybe`, style: 'grey', emoji: ic('btn_maybe', app) }));
    actions.push(button({ label: 'Out', id: `pf:h:${eventId}:ovst:${targetId}:no`, style: 'no', emoji: ic('btn_out', app) }));
  }
  rows.push({ type: 1, components: actions });

  const pickedText = clean.length
    ? `**Selected (${clean.length}/${PREF_MAX}):** ★ **${clean[0]}**${clean.length > 1 ? ` · Flex: ${clean.slice(1).join(', ')}` : ''}`
    : `*Tap up to ${PREF_MAX} positions below (1st tap = Primary, extra taps = Flex).*`;

  return {
    flags: IS_V2 | EPHEMERAL,
    components: [{
      type: 17,
      accent_color: 0xf59e0b,
      components: [
        text(`### ${targetName ? `🛠 Override Positions · ${targetName}` : `Pick Your Positions · ${formation}`}\n${pickedText}`),
        sep(),
        ...rows,
        footer('Re-open anytime before sign-ups close to edit or switch to Maybe/Out.'),
      ],
    }],
  };
}

// Build incremental Date (-1d/+1d) + Time (-1h/-15m/+15m/+1h) Reschedule message.
export function rescheduleMessage(eventId, draftTs) {
  const unix = Math.floor(draftTs / 1000);
  return {
    flags: IS_V2 | EPHEMERAL,
    components: [{
      type: 17,
      accent_color: 0xf59e0b,
      components: [
        text(`### 📅 Reschedule Session\nNew kickoff: **<t:${unix}:F>** (<t:${unix}:R>)`),
        sep(),
        { type: 1, components: [
          button({ label: '◀ -1 Day', id: `pf:h:${eventId}:rs:${draftTs - 86400e3}`, style: 'grey' }),
          button({ label: '+1 Day ▶', id: `pf:h:${eventId}:rs:${draftTs + 86400e3}`, style: 'grey' }),
        ] },
        { type: 1, components: [
          button({ label: '-1 hr', id: `pf:h:${eventId}:rs:${draftTs - 3600e3}`, style: 'grey' }),
          button({ label: '-15m', id: `pf:h:${eventId}:rs:${draftTs - 900e3}`, style: 'grey' }),
          button({ label: '+15m', id: `pf:h:${eventId}:rs:${draftTs + 900e3}`, style: 'grey' }),
          button({ label: '+1 hr', id: `pf:h:${eventId}:rs:${draftTs + 3600e3}`, style: 'grey' }),
        ] },
        { type: 1, components: [
          button({ label: '✓ Save New Time', id: `pf:h:${eventId}:rssave:${draftTs}`, style: 'ok' }),
        ] },
      ],
    }],
  };
}

// Load lightweight all-time stats Map(userId → { ovr, stat, form }) from approved claims + site players JSON.
export async function loadPlayerTelemetry(env, userIds, loadSite) {
  const out = new Map();
  if (!userIds.length || !loadSite) return out;
  try {
    const [claims, players, club] = await Promise.all([
      all(env, `SELECT user_id, player FROM claims WHERE status = 'approved' AND user_id IN (${userIds.map(() => '?').join(',')})`, ...userIds),
      loadSite('players').catch(() => []),
      loadSite('club').catch(() => ({ matches: [] })),
    ]);
    const byKey = new Map((players ?? []).map((p) => [p.k, p]));
    const recentForm = (club?.matches ?? []).slice(0, 5).map((m) => m.r).filter((r) => ['W', 'D', 'L'].includes(r));
    for (const c of claims) {
      const p = byKey.get(c.player);
      if (!p) continue;
      const ovr = typeof p.avg === 'number' ? p.avg : (typeof p.r === 'number' ? p.r : 7.5);
      const stat = p.g != null && p.a != null ? `${p.g}G · ${p.a}A` : (p.gp ? `${p.gp} GP` : '');
      out.set(String(c.user_id), { ovr, stat, form: recentForm });
    }
  } catch { /* fallback to neutral 7.5 */ }
  return out;
}

export async function hostFlowInteraction(i, env, me, who, loadSite) {
  if (!env.DB) return reply(notice('Database unavailable', 'Try again in a moment.'));
  if (!flagOn(env, who, 'events')) return reply(notice('Not available yet', 'The schedule is not switched on yet.'));
  const parts = String(i.data?.custom_id ?? '').split(':');
  // parts: ['pf', 'h', eventId, action, ...rest]
  const eventId = Number(parts[2]) || 0;
  const action = parts[3] ?? '';
  const e = await one(env, 'SELECT * FROM events WHERE id = ?', eventId);
  if (!e) return reply(notice('Session not found', 'That event no longer exists.'));

  const formation = FORMATIONS[e.formation] ? e.formation : '3-5-2';
  const isManager = can(who, 'events.manage');
  const site = String(env.SITE_URL || '').replace(/\/?$/, '/');

  // --- Member: open multi-position picker ---
  if (action === 'in') {
    if (!can(who, 'events.rsvp')) return reply(notice('Members only', `Members of ${orgName(env)} only.`));
    if (e.status !== 'scheduled' || e.signup_closed_at) return reply(notice('Sign-ups closed', 'A manager has locked sign-ups for this session.'));
    const mine = await one(env, 'SELECT status, pref_pos FROM event_rsvps WHERE event_id = ? AND user_id = ?', e.id, me.u);
    const current = mine?.status === 'yes' ? parsePref(mine.pref_pos) : [];
    return reply(positionPickerMessage(e.id, formation, current));
  }

  // --- Member: toggle position in ephemeral picker ---
  if (action === 'pos') {
    const nextList = (parts[5] ?? '').split(',').filter(Boolean);
    return updateMsg(positionPickerMessage(e.id, formation, nextList));
  }
  if (action === 'clear') {
    return updateMsg(positionPickerMessage(e.id, formation, []));
  }

  // --- Member: save positions & mark yes ---
  if (action === 'save') {
    if (e.status !== 'scheduled' || e.signup_closed_at) return updateMsg(notice('Sign-ups closed', 'A manager locked sign-ups before your edit was saved.'));
    const chosen = cleanPref((parts[4] ?? '').split(',').filter(Boolean));
    if (!chosen.length) return updateMsg(positionPickerMessage(e.id, formation, []));
    const prev = await one(env, 'SELECT status, signed_in_at, first_at FROM event_rsvps WHERE event_id = ? AND user_id = ?', e.id, me.u);
    await answerEvents(env, me, [e.id], 'yes', chosen);
    const kept = prev?.status === 'yes' && (prev.signed_in_at || prev.first_at);
    return updateMsg(notice(
      `✅ Saved: ★ ${chosen[0]}${chosen.length > 1 ? ` · Flex: ${chosen.slice(1).join(', ')}` : ''}`,
      kept ? 'Updated your positions while preserving your original sign-up priority.' : 'You are locked in on the Roll Call. Re-open anytime to edit or change status.',
      { accent: 'win' }
    ));
  }

  // --- Member: quick Maybe / Out ---
  if (action === 'maybe' || action === 'no') {
    if (!can(who, 'events.rsvp')) return reply(notice('Members only', `Members of ${orgName(env)} only.`));
    if (e.status !== 'scheduled' || e.signup_closed_at) return reply(notice('Sign-ups closed', 'A manager has locked sign-ups for this session.'));
    await answerEvents(env, me, [e.id], action);
    return reply(notice(
      action === 'maybe' ? '❔ Marked as Maybe' : '❌ Marked as Out',
      'The Roll Call updated live. Note: switching from Maybe to I’m In later starts your sign-up priority clock when you commit.',
      { accent: action === 'maybe' ? 'gold' : 'steel' }
    ));
  }

  // --- Everyone: Private Suggested XI Visualizer (Managers also get Dugout action buttons) ---
  if (action === 'xi') {
    const rsvps = await rsvpRows(env, e.id);
    const yesIds = rsvps.filter((r) => r.status === 'yes').map((r) => r.user_id);
    const stats = await loadPlayerTelemetry(env, yesIds, loadSite);
    const slots = normalizeFormationSlots(FORMATIONS[formation]);
    const enriched = rsvps.map((r) => ({ ...r, prefs: parsePref(r.pref_pos) }));
    const solved = solveSuggestedXI(slots, enriched, stats);
    const captainId = Object.values(solved.assigned).sort((a, b) => b.p.ovr - a.p.ovr)[0]?.p?.id ?? null;
    const pic = await drawHostGraphic(env, 'suggested', e.id, {
      mode: 'suggested', formation, slots, assigned: solved.assigned, bench: solved.bench,
      avgOvr: solved.avgOvr, chemScore: 92, captainId,
    }, yesIds);
    const dugoutUrl = `${site}staff-dugout.html?event=${e.id}&formation=${encodeURIComponent(formation)}`;
    const extra = [
      pic.url ? cards({ url: pic.url, alt: `Suggested XI (${formation})` }) : null,
      solved.reasons.length ? text(`**Why This Lineup**\n${solved.reasons.slice(0, 6).map((x) => `• ${x}`).join('\n')}`) : null,
      solved.bench.length ? text(`**Bench (${solved.bench.length}):** ${solved.bench.slice(0, 12).map((b) => `${b.name} (${b.ovr.toFixed(1)} · ${b.mapped[0]})`).join(', ')}`) : null,
      isManager ? buttons([
        { label: 'Lock & Load Suggested XI ›', id: `pf:h:${e.id}:close`, style: 'brand' },
        { label: 'Choose Manually in Dugout', url: dugoutUrl },
      ]) : null,
      footer(isManager ? 'Manager view · Dugout controls enabled' : 'Member preview · Read-only'),
    ].filter(Boolean);
    return reply(message({ accent: 'gold', ephemeral: true, blocks: [text(`### ✨ Suggested XI · ${formation}${solved.avgOvr ? ` · AVG ${solved.avgOvr}` : ''}`), ...extra] }));
  }

  // --- Everyone: Private Full Roster (chronological by signed_in_at priority) ---
  if (action === 'roster') {
    const rsvps = await rsvpRows(env, e.id);
    const yes = rsvps.filter((r) => r.status === 'yes').sort((a, b) => (a.signed_in_at ?? a.first_at ?? a.at) - (b.signed_in_at ?? b.first_at ?? b.at));
    const maybe = rsvps.filter((r) => r.status === 'maybe');
    const out = rsvps.filter((r) => r.status === 'no');
    const lines = yes.slice(0, 35).map((r, idx) => {
      const ts = Math.floor((r.signed_in_at ?? r.first_at ?? r.at) / 1000);
      const prefs = parsePref(r.pref_pos);
      const posTxt = prefs.length ? `★ ${prefs[0]}${prefs.length > 1 ? ` · ${prefs.slice(1).join(', ')}` : ''}` : 'Any';
      return `\`#${String(idx + 1).padStart(2)}\` <t:${ts}:t> **${r.name}** — ${posTxt}`;
    });
    return reply(message({
      accent: 'gold', ephemeral: true,
      blocks: [
        text(`### 📋 Full Roster · Sign-Up Priority (${yes.length} IN)`),
        text(lines.length ? lines.join('\n') : '_Nobody signed up yet._'),
        maybe.length ? text(`**❔ Maybe (${maybe.length}):** ${maybe.map((x) => x.name).join(', ').slice(0, 800)}`) : null,
        out.length ? text(`**❌ Out (${out.length}):** ${out.map((x) => x.name).join(', ').slice(0, 800)}`) : null,
        footer('Ordered by first I’m In commit time · Editing positions preserves priority; Maybe → In starts clock on commit'),
      ],
    }));
  }

  // --- Check-In member actions ---
  if (action === 'ci') {
    const sub = parts[4] ?? 'ready';
    if (sub === 'open') {
      if (!isManager) return reply(notice('Managers only', 'Only managers can open Lobby Check-In manually.'));
      await openCheckinNow(env, e.id, me);
      return reply(notice('✅ Lobby Check-In Opened', 'Posted the live Check-In card for this session.', { accent: 'win' }));
    }
    if (sub === 'final') {
      if (!isManager) return reply(notice('Managers only', 'Only managers can lock the Final XI.'));
      await lockFinalLineup(env, e.id, me, loadSite);
      return reply(notice('🏆 Official Final XI Locked', 'Published the confirmed broadcast Starting XI.', { accent: 'win' }));
    }
    if (!can(who, 'events.checkin')) return reply(notice('Members only', `Members of ${orgName(env)} only.`));
    if (sub === 'drop') {
      await setCheckin(env, me, e, false, null, 'wait');
      return reply(notice('❌ Dropped from Check-In', 'Updated your lobby status.', { accent: 'steel' }));
    }
    await setCheckin(env, me, e, true, null, sub === 'late' ? 'late' : 'ready');
    return reply(notice(sub === 'late' ? '⏱ Marked Running Late' : '✅ Checked In to Lobby!', 'Your status ring updated live on the Check-In pitch.', { accent: sub === 'late' ? 'gold' : 'win' }));
  }

  // ---------- Manager-only controls below ----------
  if (!isManager) return reply(notice('🔒 Managers only', 'Only managers and above can use Manager Controls.'));

  // Close & Lineup: locks sign-ups in place, updates public post to SIGN-UPS CLOSED with disabled buttons, sends private Dugout link
  if (action === 'close') {
    await run(env, 'UPDATE events SET signup_closed_at = ?, manager_id = COALESCE(manager_id, ?) WHERE id = ?', Date.now(), me.u, e.id);
    await refreshEventPost(env, e.id, loadSite);
    const dugoutUrl = `${site}staff-dugout.html?event=${e.id}&formation=${encodeURIComponent(formation)}`;
    return reply(notice(
      '🔒 Sign-Ups Locked',
      'The public Roll Call now shows **SIGN-UPS CLOSED** with disabled buttons. Open the Match Dugout to publish your Lineup Call — publishing there links straight into Lobby Check-In.',
      { accent: 'win', extra: [buttons([{ label: `Open Match Dugout (${formation})`, url: dugoutUrl }])] }
    ));
  }

  // Override: Step 1 -> Discord native User Select Menu (type: 5) for ANY member in the server
  if (action === 'override') {
    return reply({
      flags: IS_V2 | EPHEMERAL,
      components: [{
        type: 17, accent_color: 0xf59e0b,
        components: [
          text('### 🛠 Override Sign-Up\nSelect **any member in the server** to submit or edit their positions on their behalf.'),
          { type: 1, components: [{ type: 5, custom_id: `pf:h:${e.id}:ovpick`, placeholder: 'Search any server member…', min_values: 1, max_values: 1 }] },
        ],
      }],
    });
  }
  if (action === 'ovpick') {
    const targetId = String(i.data?.values?.[0] ?? '');
    if (!targetId) return updateMsg(notice('No member picked', 'Select a member from the list.'));
    const u = i.data?.resolved?.users?.[targetId];
    const m = i.data?.resolved?.members?.[targetId];
    const targetName = String(m?.nick || u?.global_name || u?.username || 'Member').slice(0, 40);
    const existing = await one(env, 'SELECT status, pref_pos FROM event_rsvps WHERE event_id = ? AND user_id = ?', e.id, targetId);
    return updateMsg(positionPickerMessage(e.id, formation, existing?.status === 'yes' ? parsePref(existing.pref_pos) : [], { targetId, targetName }));
  }
  if (action === 'ovpos') {
    const targetId = parts[4], nextList = (parts[6] ?? '').split(',').filter(Boolean);
    const row = await one(env, 'SELECT name FROM users WHERE id = ?', targetId);
    return updateMsg(positionPickerMessage(e.id, formation, nextList, { targetId, targetName: row?.name || `Member ${targetId}` }));
  }
  if (action === 'ovclear') {
    const targetId = parts[4];
    const row = await one(env, 'SELECT name FROM users WHERE id = ?', targetId);
    return updateMsg(positionPickerMessage(e.id, formation, [], { targetId, targetName: row?.name || `Member ${targetId}` }));
  }
  if (action === 'ovsave' || action === 'ovst') {
    const targetId = parts[4];
    const status = action === 'ovsave' ? 'yes' : parts[5];
    const chosen = action === 'ovsave' ? cleanPref((parts[5] ?? '').split(',').filter(Boolean)) : undefined;
    const uRow = await one(env, 'SELECT name, avatar FROM users WHERE id = ?', targetId);
    const fakeMe = { u: targetId, n: uRow?.name || `Member ${targetId}`, a: uRow?.avatar ?? null };
    await answerEvents(env, fakeMe, [e.id], status, chosen, { override: true });
    return updateMsg(notice(`🛠 Override Saved (${fakeMe.n})`, `Set to **${status.toUpperCase()}**${chosen?.length ? ` (${chosen.join(', ')})` : ''}. Roll Call updated live.`, { accent: 'win' }));
  }

  // Incremental Date & Time Reschedule
  if (action === 'resched') return reply(rescheduleMessage(e.id, e.start));
  if (action === 'rs') return updateMsg(rescheduleMessage(e.id, Number(parts[4]) || e.start));
  if (action === 'rssave') {
    const nextStart = Number(parts[4]) || e.start;
    await run(env, 'UPDATE events SET start = ?, edited_by = ?, edited_at = ?, remind24_at = NULL, remind2_at = NULL WHERE id = ?', nextStart, me.n, Date.now(), e.id);
    await refreshEventPost(env, e.id, loadSite);
    return updateMsg(notice('📅 Session Rescheduled', `Updated kickoff to **<t:${Math.floor(nextStart / 1000)}:F>** and refreshed the post.`, { accent: 'win' }));
  }

  // Cancel Session
  if (action === 'cancel') {
    await run(env, "UPDATE events SET status = 'cancelled', edited_by = ?, edited_at = ? WHERE id = ?", me.n, Date.now(), e.id);
    await refreshEventPost(env, e.id, loadSite);
    return reply(notice('🚫 Session Cancelled', 'Marked cancelled and locked the public Roll Call.', { accent: 'loss' }));
  }

  return reply(notice('Unknown action', 'Please try again from the latest Roll Call post.'));
}
