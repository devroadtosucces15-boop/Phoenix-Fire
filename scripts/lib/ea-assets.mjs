// EA image and colour helpers, from the documented URL patterns of the community fc-clubs-api project (MIT, ported as facts, no code copied).
// Pure functions, no I/O. Phoenix pages show OPPONENT crests/badges only through these; our own crest stays phoenix/overlay/crest*.png.
const CREST = (id) => `https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l${id}.png`;
export const NOT_FOUND_CREST_URL = 'https://media.contentapi.ea.com/content/dam/eacom/fc/pro-clubs/notfound-crest.png';
const posId = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 && String(v ?? '') !== '' ? n : null; };

export function crestUrl(id) { const n = posId(id); if (n == null) throw new RangeError('crest id must be a positive number'); return CREST(n); }
// Crest URLs to try in order, ending with the not-found crest. `team` = clubs[id].TEAM from clubs/matches (best source); selectedKitType "0" = real badge first.
export function crestCandidates({ team, teamId, crestAssetId, selectedKitType } = {}) {
  const order = [team, ...(String(selectedKitType) === '0' ? [teamId, crestAssetId] : [crestAssetId, teamId])];
  const urls = [];
  for (const v of order) { const n = posId(v); if (n != null && !urls.includes(CREST(n))) urls.push(CREST(n)); }
  return [...urls, NOT_FOUND_CREST_URL];
}
export const clubCrestUrl = (o) => crestCandidates(o)[0];
export function divisionBadgeUrl(div) { const n = posId(div); if (n == null || n > 6) throw new RangeError('division must be 1 to 6'); return `https://media.contentapi.ea.com/content/dam/eacom/fc/pro-clubs/divisioncrest${n}.png`; }
export function reputationTierUrl(tier) { const n = Number.parseInt(tier, 10); if (!(n >= 0 && n <= 3)) throw new RangeError('tier must be 0 to 3'); return `https://media.contentapi.ea.com/content/dam/eacom/fc/pro-clubs/reputation-tier${n}.png`; }
// EA stores kit colours as decimal RGB ("16777215" = white).
export function kitColorHex(v) { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 0xffffff) throw new RangeError('colour must be 0 to 16777215'); return `#${n.toString(16).padStart(6, '0')}`; }
