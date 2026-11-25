// MB2 – preferred position on check-in (PLANNING/BOT-SPLIT.md, "Request 1"). Tapping in / maybe also asks which position
// they would like that night: one or up to two of the eight groups below, optional. Stored in event_rsvps.pref_pos as a JSON
// array, best first. It is a preference, never a promise. The lineup recommender reads it through expandPref().
import { reply, notice } from './ui.js';

// The positions a player can ask for, in the order the dropdown shows them (front to back). Several can be chosen: they are shown as small tags
// after the name on the sign-up post, best first, so whoever builds the lineup can see who can play where.
export const PREF_POSITIONS = ['ST', 'CAM', 'LW', 'RW', 'LM', 'RM', 'CM', 'LCM', 'RCM', 'CDM', 'CB', 'LB', 'RB', 'LFB', 'RFB', 'GK'];
export const PREF_MAX = 6;
// Older answers were saved as the eight groups below; they are still read (and mapped to the new names) so nobody loses what they picked.
const LEGACY = { 'LB/RB': ['LB', 'RB'], 'LW/RW': ['LW', 'RW'] };
// Individual lineup positions behind each choice, for the recommender (profiles and formation slots use LB, RB, CM …).
export const PREF_EXPAND = { LFB: ['LB'], RFB: ['RB'], LCM: ['CM'], RCM: ['CM'] };

// Anything → a clean list (valid positions only, unique, order kept, at most PREF_MAX). null input = no preference given.
export function cleanPref(list) {
  if (!Array.isArray(list)) return [];
  const out = list.map((x) => String(x).toUpperCase().trim()).flatMap((x) => LEGACY[x] ?? [x]).filter((x) => PREF_POSITIONS.includes(x));
  return [...new Set(out)].slice(0, PREF_MAX);
}
export const expandPref = (list) => cleanPref(list).flatMap((g) => PREF_EXPAND[g] ?? [g]);
export const parsePref = (s) => { try { return cleanPref(JSON.parse(s)); } catch { return []; } };
// The small boxes on the post: `ST` `CAM` `RW` (a code span each), left-aligned right after the name. '' when nothing was picked.
export const prefTags = (list) => cleanPref(list).map((p) => `\`${p}\``).join(' ');

export const PREF_ID = /^pf:pos:\d+$/;
// The ephemeral select shown after "I'm in" / "Maybe". min_values 0: choosing nothing is fine.
export function prefSelect(eventId, current = []) {
  return { type: 1, components: [{
    type: 3, custom_id: `pf:pos:${Number(eventId)}`, placeholder: `Which positions can you play tonight? (pick any, up to ${PREF_MAX})`, min_values: 0, max_values: PREF_MAX,
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
  try { (await import('./events.js')).refreshEventPost(env, id); } catch { /* the post catches up on the next answer */ } // the tags show on the post at once
  return reply(notice(chosen.length ? `✅ Noted: ${chosen.join(' · ')}` : 'No position preference', 'It shows next to your name on the post so whoever builds the lineup can see where you can play. Change it any time.', { accent: 'win' }));
}
