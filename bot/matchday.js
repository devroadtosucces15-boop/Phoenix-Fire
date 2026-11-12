// /matchday – Phoenix Matchday app (PLANNING/BOT-SPLIT.md, wave MB1). Dark until that Discord application is configured
// (bot/apps.js HELD): nothing is registered or answered before then.
//   /matchday create   managers: schedule a league night, playoffs, friendly, tournament or VPG match – the same event save as /host
//   /matchday checkin  members: "I'm on" for tonight (opens an hour before the start)
//   /matchday status   who is in for the next event and which positions are missing
import { hostCommand } from './host.js';
import { eventsRoute, eventPost } from './events.js';
import { can, flagOn } from './roles.js';
import { reply, pictureNote } from './ui.js';

// kind → [event type, default title]. Tournament and VPG are league-type events with their own title, so lineups,
// predictions and stats treat them like league games without a schema change.
export const MATCHDAY_KINDS = {
  league: ['league', null], playoffs: ['playoffs', null], friendly: ['friendly', 'Friendly'], tournament: ['league', 'Tournament'], vpg: ['league', 'VPG match'],
};
export function matchdayBody(o, tz, when) {
  const [type, title] = MATCHDAY_KINDS[o.kind] ?? MATCHDAY_KINDS.league;
  const opp = o.opponent ? String(o.opponent).trim() : '';
  return {
    type, title: title ? (opp ? `${title} vs ${opp}` : title) : (opp ? `${type === 'playoffs' ? 'Playoffs' : 'League'} vs ${opp}` : null),
    date: when.date, time: when.time, tz, duration: o.length ?? 120, needs: { players: o.players ?? 11 },
    notes: o.notes ?? '', notify: true, repeat: o.weekly ? 3 : 0,
  };
}

const say = (env, key, title, body, accent) => reply(pictureNote(env, key, title, body, accent ? { accent } : {}));
const nextEvent = (env) => env.DB.prepare("SELECT * FROM events WHERE status = 'scheduled' AND start + duration * 60000 > ? ORDER BY start LIMIT 1").bind(Date.now()).first();

// `sub` is the subcommand name; `o` its options by name; me/who already resolved by botcmds.js.
export async function matchdayCommand(i, env, me, who, sub, o, deps) {
  if (!flagOn(env, who, 'events')) return say(env, 'cmd-locked', 'The schedule is not switched on yet', 'Ask a manager.');
  if (sub === 'create') {
    if (!can(who, 'events.manage')) return say(env, 'cmd-locked', 'Managers only', 'Only managers can set up a match day – ask one, or suggest a time in the chat.');
    return hostCommand(i, env, me, { ...o, mode: 'league', kind: o.kind ?? 'league' }, deps, matchdayBody, 'cmd-matchday-create');
  }
  if (sub === 'checkin') {
    const e = await nextEvent(env);
    if (!e) return say(env, 'cmd-matchday-none', 'Nothing to check in to', 'No match day is scheduled right now.');
    const res = await eventsRoute('/api/events/checkin', 'POST', { id: e.id, on: true }, me, env, deps.log, deps.loadSite, new URL('https://bot.invalid/'));
    const d = await res.json().catch(() => ({}));
    return res.ok ? say(env, 'cmd-matchday-in', '✅ You are on', `Checked in for **${e.title || 'the next match day'}**. Good luck tonight.`, 'win') : say(env, 'cmd-problem', 'Could not check in', d.error ?? 'Try again in a moment.');
  }
  if (sub === 'status') {
    const e = await nextEvent(env);
    if (!e) return say(env, 'cmd-matchday-none', 'Nothing scheduled yet', 'Managers add match days with /matchday create.');
    const rsvps = await env.DB.prepare('SELECT r.status, r.name, r.user_id, p.positions, p.rush_positions FROM event_rsvps r LEFT JOIN profiles p ON p.user_id = r.user_id WHERE r.event_id = ? ORDER BY r.at').bind(e.id).all().then((r) => r.results);
    return reply(await eventPost(env, e, rsvps, '', { who: true }));
  }
  return say(env, 'cmd-problem', 'Unknown /matchday command', 'Use create, checkin or status.');
}
