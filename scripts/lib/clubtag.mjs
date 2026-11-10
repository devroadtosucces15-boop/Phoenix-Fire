// Which of our clubs a result came from, and how loudly to flag it. One source for the score card, the auto-posted result,
// /last and the hype post, so every output carries the same pill.
//   label     – the pill text, e.g. "PHOENIX FIRE 1", "PHOENIX XI"
//   important – true for results that must stand out (a friendly in a club with config.clubTags[id].friendlyLabel, e.g. XI → "PHOENIX XI VPG")
// Labels default to the organization's display name; config.clubTags[clubId] = { label, friendlyLabel } overrides it.
const up = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

export function clubTag({ src, type = 'league', org, config = {} } = {}) {
  const id = String(src ?? org?.primary ?? config.homeClubId ?? '');
  const custom = config.clubTags?.[id] ?? {};
  const named = org?.clubs?.find((c) => String(c.ea_club_id) === id)?.display_name;
  const friendly = type === 'friendly' && !!custom.friendlyLabel;
  return {
    id,
    label: up(friendly ? custom.friendlyLabel : custom.label ?? named ?? config.siteTitle ?? id),
    important: friendly,
  };
}
