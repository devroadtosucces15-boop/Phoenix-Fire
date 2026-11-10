// Merged slash commands. Several old commands did the same job, so each family is now ONE command with subcommands
// (see PLANNING/BOT-SPLIT.md, "Merges"). The handlers did not change: a merged interaction is rewritten here into the
// shape the old command had, so every existing handler, permission check and test keeps working.
//
//   /matchday schedule | next | who      ← /schedule · /nextevent · /availability   (create, checkin, status stay as they were)
//   /tag post | list | set | delete      ← /tag · /tags
//   /remind add | list                   ← /remind · /reminders
//   /watch latest | add | remove | list  ← /watch · /watchlist
//   /intel                               ← /insights (renamed, so it is not mistaken for /insight)
//   /rushladder scan | latest            ← /board (renamed: it is the club ladder, not a player board)
//   /top is gone: /leaderboard mode:league does the same
// Plain module (no Worker imports) so tests can use it directly.
const REWRITE = {
  matchday: { schedule: ['schedule'], next: ['nextevent'], who: ['availability'] },
  tag: { post: ['tag'], list: ['tags', 'list'], set: ['tags', 'set'], delete: ['tags', 'delete'] },
  remind: { add: ['remind'], list: ['reminders'] },
  watch: { latest: ['watch'], add: ['watchlist', 'add'], remove: ['watchlist', 'remove'], list: ['watchlist', 'list'] },
};
const RENAME = { intel: 'insights', rushladder: 'board' };

// The command as the old handlers expect it: { name, options } (and the same `data` object otherwise).
export function unalias(data) {
  if (!data?.name) return data;
  if (RENAME[data.name]) return { ...data, name: RENAME[data.name] };
  const sub = data.options?.find((o) => o.type === 1);
  const map = REWRITE[data.name]?.[sub?.name];
  if (!map) return data;
  const [name, keep] = map;
  // a target that still has a subcommand (tags list/set/delete, watchlist add/remove/list) keeps the sub with its options
  if (keep) return { ...data, name, options: [{ ...sub, name: keep }] };
  return { ...data, name, options: sub.options ?? [] };
}
export const MERGED_NAMES = new Set(['matchday', 'tag', 'remind', 'watch', 'intel', 'rushladder']);
