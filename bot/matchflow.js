// The Matchday timeline (CR-07). One event, three windows, all measured from its start time:
//
//   start − 60 min   the lineup window opens: managers may post the latest lineup from here
//   lineup posted    check-in opens for the players in that lineup (never before the window)
//   start − 30 min   check-in closes at the latest (a lineup posted later never gets a check-in)
//
// Pure functions (no I/O) so /host, /lineup, /matchday, the site routes, the cron and the tests share one rule.
export const MIN = 60e3;
export const LINEUP_OPEN_MIN = 60;
export const CHECKIN_CLOSE_MIN = 30;
// The reminder to players who have not confirmed goes out this long before the close (10 min = one cron tick).
export const CHECKIN_NUDGE_MIN = 10;

const parse = (s, fb) => { try { return s ? JSON.parse(s) ?? fb : fb; } catch { return fb; } };
export const lineupOf = (e) => (typeof e?.lineup === 'string' ? parse(e.lineup, {}) : e?.lineup ?? {});
export const hasLineupPosted = (e) => !!e?.lineup_at && Object.keys(lineupOf(e)).length > 0;

export const lineupOpensAt = (e) => e.start - LINEUP_OPEN_MIN * MIN;
export const checkinClosesAt = (e) => e.start - CHECKIN_CLOSE_MIN * MIN;
export const lineupWindowOpen = (e, now = Date.now()) => now >= lineupOpensAt(e) && now < e.start + (e.duration ?? 0) * MIN;

// Where an event is on the timeline:
//   'waiting'  before the window opens · 'lineup' window open, no lineup posted yet · 'checkin' lineup posted, check-in running
//   'closed'   check-in is over (closed at −30, or the lineup came after it) · 'live' kick-off passed · 'over' finished
export function phaseOf(e, now = Date.now()) {
  if (e.status === 'cancelled') return 'over';
  if (now >= e.start + (e.duration ?? 0) * MIN) return 'over';
  if (now >= e.start) return 'live';
  if (now < lineupOpensAt(e)) return 'waiting';
  if (now >= checkinClosesAt(e)) return 'closed';
  return hasLineupPosted(e) && e.lineup_at <= now ? 'checkin' : 'lineup';
}

// Check-in is open only while phaseOf is 'checkin'. `in` = the player is in the posted lineup (managers may override).
export const checkinOpen = (e, now = Date.now()) => phaseOf(e, now) === 'checkin';
export const inLineup = (e, userId) => Object.hasOwn(lineupOf(e), String(userId));

// May a manager post (publish) a lineup now? Drafts are always fine; posting waits for the window.
export function canPostLineup(e, now = Date.now()) {
  if (now < lineupOpensAt(e)) return { ok: false, opensAt: lineupOpensAt(e), error: `The lineup window opens an hour before the start. You can post it from <t:${Math.floor(lineupOpensAt(e) / 1000)}:t> (<t:${Math.floor(lineupOpensAt(e) / 1000)}:R>); until then it stays a draft.` };
  if (now >= e.start + (e.duration ?? 0) * MIN) return { ok: false, error: 'That event is over.' };
  return { ok: true, lateForCheckin: now >= checkinClosesAt(e) };
}

// Who is still to confirm: players in the posted lineup with no check-in, in lineup order.
export function unconfirmed(e, checkins = []) {
  const on = new Set(checkins.map((c) => String(c.user_id ?? c.id)));
  return Object.keys(lineupOf(e)).filter((id) => !on.has(id));
}
export const confirmed = (e, checkins = []) => { const L = lineupOf(e); return checkins.map((c) => String(c.user_id ?? c.id)).filter((id) => Object.hasOwn(L, id)); };

// Reminder due? From (close − nudge) until the close, once the lineup is up; a lineup posted inside that span nudges at once.
export const nudgeDue = (e, now = Date.now()) => phaseOf(e, now) === 'checkin' && now >= checkinClosesAt(e) - CHECKIN_NUDGE_MIN * MIN;

// One line for the post and /lineup: what happens next and when (Discord timestamps).
export function timelineLine(e, now = Date.now()) {
  const ts = (ms, f = 't') => `<t:${Math.floor(ms / 1000)}:${f}>`;
  switch (phaseOf(e, now)) {
    case 'waiting': return `🕐 Lineup window opens ${ts(lineupOpensAt(e))} (${ts(lineupOpensAt(e), 'R')}) · check-in follows the lineup and closes ${ts(checkinClosesAt(e))}`;
    case 'lineup': return `🧩 Lineup window is open – the lineup is posted soon · check-in closes ${ts(checkinClosesAt(e))}`;
    case 'checkin': return `✅ Check-in is open for the lineup – confirm before ${ts(checkinClosesAt(e))} (${ts(checkinClosesAt(e), 'R')})`;
    case 'closed': return hasLineupPosted(e) ? '🔒 Check-in is closed – kick-off is close' : '🔒 Check-in window has passed without a lineup';
    case 'live': return '🔴 Under way';
    default: return null;
  }
}

// Why check-in is not open right now, in plain words (site errors and the Check in button's private reply – no Discord timestamps).
export function whyNotOpen(e, now = Date.now()) {
  switch (phaseOf(e, now)) {
    case 'waiting': return 'Check-in is not open yet. It opens once the lineup is posted, and the lineup can be posted from an hour before the start.';
    case 'lineup': return 'The lineup has not been posted yet. Check-in opens for the players in it as soon as it is.';
    case 'closed': return hasLineupPosted(e) ? `Check-in is closed: it closes ${CHECKIN_CLOSE_MIN} minutes before the start.` : 'Check-in is closed: no lineup was posted before it had to close.';
    case 'checkin': return null;
    default: return 'Check-in is closed for this event.';
  }
}
