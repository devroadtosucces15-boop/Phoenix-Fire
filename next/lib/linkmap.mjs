// One link map for every "old" or bot-written address (PF-018). The site's bell, toasts and alerts page, the members.html
// forwarder, the redirect stubs and the bot link test all read THIS file, so a feature never has two landing pages.
// Targets are pages of the Phoenix build ("page.html" or "page.html#id"); the test checks each one exists.

// members.html#<key> (Discord embeds, DMs and notification rows already sent use these)
export const HASH_MAP = {
  locker: 'hub.html', me: 'hub-profile.html#lk-me', achievements: 'hub-medals.html#lk-medals', alerts: 'index.html#bell', 'alerts-settings': 'hub-alerts.html#lk-alertset',
  cards: 'hub-cardstudio.html#lk-cards', stats: 'hub-stats.html#lk-mystats', points: 'hub-profile.html#lk-me', discoveries: 'hub-discoveries.html#dc-feed',
  schedule: 'hub-matchnight.html#mn-week', events: 'hub-matchnight.html#mn-week', rsvp: 'hub-matchnight.html#mn-week', motm: 'hub-matchnight.html#mn-motm', vote: 'hub-matchnight.html#mn-motm', rush: 'hub-matchnight.html#mn-rush',
  awards: 'hub-squad.html#sq-awards', predict: 'hub-squad.html#sq-predict', squads: 'hub-squad.html#sq-squads', teamup: 'hub-squad.html#sq-team', recs: 'hub-squad.html#sq-team', scout: 'hub-squad.html#sq-scout',
  ideas: 'hub-clubhouse.html#ch-ideas', suggestions: 'hub-clubhouse.html#ch-ideas', feedback: 'hub-clubhouse.html#ch-feedback', clubhouse: 'hub-clubhouse.html',
  docs: 'hub-handbook.html#hb-docs', handbook: 'hub-handbook.html', manager: 'staff-controlcenter.html', portal: 'staff-controlcenter.html', 'portal-reports': 'staff-controlcenter.html#reports', trials: 'staff-controlcenter.html#desk',
};
// members.html#<prefix>-<id> (matches by prefix: schedule-12 → the week view)
export const HASH_PREFIX = { schedule: 'hub-matchnight.html#mn-week', event: 'hub-matchnight.html#mn-week' };

// the forwarder's table: HASH_MAP plus '~prefix' keys (a hash like schedule-12 matches '~schedule')
export const HASH_TABLE = { ...HASH_MAP, ...Object.fromEntries(Object.entries(HASH_PREFIX).map(([k, v]) => ['~' + k, v])) };

// Old page names that have a new home. A "#x" kept on the old link wins unless the new target already carries one.
export const PAGE_MAP = {
  'feed.html': 'hub-clubhouse.html#ch-feed', 'messages.html': 'hub-clubhouse.html#ch-chat', 'docs.html': 'hub-handbook.html#hb-docs', 'playstyle.html': 'hub-handbook.html#hb-ps',
  'builder.html': 'builds.html', 'compare.html': 'players.html', 'apply.html': 'join.html', 'tactics.html': 'playbook.html',
};
// feed.html#p12 / messages.html#c3 keep their own id on the clubhouse page
export const KEEP_ID = new Set(['feed.html', 'messages.html']);

// Resolve any old/bot link to a built-site page ('' for nothing). Pure: used by the site (via window.PhoenixLinks) and the tests.
export function resolveLink(link) {
  if (!link) return '';
  let s = String(link).trim();
  if (/^https?:/i.test(s)) return s;
  s = s.replace(/^\.?\/+/, '').replace(/^(\.\.\/)+/, '').replace(/^Phoenix-Fire\//, '');
  const [page, frag = ''] = s.split('#');
  if (page === 'members.html') {
    const key = frag.split('?')[0];
    if (HASH_MAP[key]) return HASH_MAP[key];
    const pre = key.split('-')[0];
    if (key.includes('-') && HASH_PREFIX[pre]) return HASH_PREFIX[pre];
    return key ? 'hub.html' : 'hub.html';
  }
  if (PAGE_MAP[page]) {
    const t = PAGE_MAP[page];
    return KEEP_ID.has(page) && frag ? t.split('#')[0] + '#' + frag : t.includes('#') || !frag ? t : t + '#' + frag;
  }
  return page + (frag ? '#' + frag : '');
}
