// Leaf module: the channel purposes and permission groups, so command definitions can list them without importing orgconfig.js (which would be a cycle).
export const CHANNEL_PURPOSES = ['announcements', 'match_results', 'match_notifications', 'recruitment', 'claims', 'manager_alerts', 'logs', 'welcome', 'config_audit', 'system_alerts',
  'awards', 'reminders', 'member_log', 'hype', 'voice_recap', 'live_alerts', 'fun_posts', 'automod_alerts', 'rush_queue', 'rush_queue_reports', 'rush_need', 'rush_board', 'season_stats'];
export const PERMISSION_GROUPS = ['owner', 'administrator', 'manager', 'division_manager', 'club_manager', 'player'];

