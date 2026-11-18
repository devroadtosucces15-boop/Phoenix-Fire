// Pure helpers the EA fetch uses (kept out of scripts/fetch.mjs so tests can import them without running a fetch).
import { rawEvents } from './events.mjs';
const n = (v) => (v == null || v === '' ? 0 : +v || 0);

// EA's per-club sums (`aggregate` of a clubs/matches item) without the opaque event buckets; evraw = the club's summed counters.
export function slimAggregate(agg) {
  const out = {};
  for (const [clubId, a] of Object.entries(agg || {})) {
    if (!a || typeof a !== 'object') continue;
    const { match_event_aggregate_0, match_event_aggregate_1, match_event_aggregate_2, match_event_aggregate_3, vproattr, vprohackreason, ...rest } = a;
    const ev = rawEvents(a);
    out[clubId] = { ...rest, ...(ev ? { evraw: ev } : {}) };
  }
  return out;
}

// A current-season leaderboard row → numbers (EA sends strings). The all-time row spans every season; this one is the running season.
export const seasonBoard = (h, at = null) => ({ currentDivision: n(h.currentDivision), points: n(h.points), gp: n(h.gamesPlayed), w: n(h.wins), d: n(h.ties), l: n(h.losses), gf: n(h.goals), ga: n(h.goalsAgainst), cs: n(h.cleanSheets), promotions: n(h.promotions), relegations: n(h.relegations), rep: n(h.reputationtier), fetchedAt: at });
