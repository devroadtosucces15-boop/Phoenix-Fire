// MB2 – preferred position on check-in (PLANNING/BOT-SPLIT.md, "Request 1"). Tapping in / maybe also asks which position
// they would like that night: one or up to two of the eight groups below, optional. Stored in event_rsvps.pref_pos as a JSON
// array, best first. It is a preference, never a promise. The lineup recommender reads it through expandPref().
import { reply, notice } from './ui.js';

export const PREF_POSITIONS = ['GK', 'CB', 'LB/RB', 'CDM', 'CM', 'CAM', 'LW/RW', 'ST'];
export const PREF_MAX = 2;
// Individual positions behind each group, for the recommender (profiles use LB, RB, LW, RW …).
export const PREF_EXPAND = { 'LB/RB': ['LB', 'RB'], 'LW/RW': ['LW', 'RW'] };

// Anything → a clean list (valid groups only, unique, order kept, at most two). null input = no preference given.
export function cleanPref(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((x) => String(x).toUpperCase().trim()).filter((x) => PREF_POSITIONS.includes(x)))].slice(0, PREF_MAX);
}
export const expandPref = (list) => cleanPref(list).flatMap((g) => PREF_EXPAND[g] ?? [g]);
export const parsePref = (s) => { try { return cleanPref(JSON.parse(s)); } catch { return []; } };

export const PREF_ID = /^pf:pos:\d+$/;
// The ephemeral select shown after "I'm in" / "Maybe". min_values 0: choosing nothing is fine.
export function prefSelect(eventId, current = []) {
  return { type: 1, components: [{
    type: 3, custom_id: `pf:pos:${Number(eventId)}`, placeholder: 'Which position do you want tonight? (optional, up to 2)', min_values: 0, max_values: PREF_MAX,
    options: PREF_POSITIONS.map((p) => ({ label: p, value: p, default: cleanPref(current).includes(p) })),
  }] };
}

// Saves the preference for someone who has answered yes or maybe. Returns false when they have no such answer.
export async function savePref(env, eventId, userId, list) {
  const pref = cleanPref(list);
  const r = await env.DB.prepare("UPDATE event_rsvps SET pref_pos = ? WHERE event_id = ? AND user_id = ? AND status IN ('yes', 'maybe')")
    .bind(pref.length ? JSON.stringify(pref) : null, Number(eventId), userId).run();
  return (r.meta?.changes ?? r.changes ?? 0) > 0;
}

// The select's answer from Discord (component interaction, custom_id pf:pos:<event id>). `me` is the resolved member.
export async function prefPosSelect(i, env, me) {
  const id = Number(String(i.data?.custom_id).split(':')[2]);
  const chosen = cleanPref(i.data?.values ?? []);
  const ok = await savePref(env, id, me.u, chosen);
  if (!ok) return reply(notice('Answer first', 'Tap “I’m in” or “Maybe” on the post, then pick your position.'));
  return reply(notice(chosen.length ? `✅ Noted: ${chosen.join(' / ')}` : 'No position preference', 'A preference only – managers pick the lineup and can see it. Change it any time.', { accent: 'win' }));
}
