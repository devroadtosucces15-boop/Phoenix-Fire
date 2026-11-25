// Leaf module: the channel purposes and permission groups, so command definitions can list them without importing orgconfig.js (which would be a cycle).
export const CHANNEL_PURPOSES = ['announcements', 'match_results', 'match_notifications', 'lineup_posts', 'checkin_reminders', 'recruitment', 'claims', 'manager_alerts', 'logs', 'welcome', 'config_audit', 'system_alerts',
  'awards', 'reminders', 'member_log', 'hype', 'voice_recap', 'live_alerts', 'stream_watch', 'fun_posts', 'birthdays', 'automod_alerts', 'rush_queue', 'rush_queue_reports', 'rush_need', 'rush_lfg', 'rush_board', 'season_stats', 'session_recaps', 'pinned_posts', 'intel_skip', 'mascot_posts', 'member_bios', 'absence_notices', 'highlights', 'emoji_review'];
export const PERMISSION_GROUPS = ['owner', 'administrator', 'manager', 'division_manager', 'club_manager', 'player',
  'ping_results', 'ping_events', 'ping_rush', 'ping_match', 'ping_bios', 'ping_birthdays']; // the last three are opt-in ping roles (who gets tagged), not permission levels


// Autocomplete for /setup channel purpose: Discord allows 25 fixed choices, we have more, so the picker is typed (matches key and words).
export function purposeChoices(query = '') {
  const words = String(query).toLowerCase().split(/[\s_]+/).filter(Boolean); // "check in" finds checkin_reminders, "lineup" finds lineup_posts
  return CHANNEL_PURPOSES.filter((p) => words.every((w) => p.includes(w))).slice(0, 25).map((p) => ({ name: p.replaceAll('_', ' '), value: p }));
}
