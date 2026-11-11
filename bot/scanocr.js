// Reads Rush screenshots with Workers AI vision and turns what it saw into checked numbers.
//
// Two screens: the global Rush leaderboard (managers, several times a day) and a member's end-of-season stats (once a season).
// EA exposes no Rush data, so a photo is the only source. A model can misread a digit, so nothing it says is trusted blindly:
//   * every read goes through cleanBoard() / cleanSeason(), which normalise the numbers and run quality checks;
//   * the leaderboard has a built-in checksum (AVG VP = VP ÷ M on every row) and must be sorted by VP, which catches most digit errors;
//   * the site shows what was read next to the checks, so a person can fix a number before it is saved.
// The vision call is isolated in visionJson() so tests can feed it a fake `env.AI`.
// Llama 4 Scout reads dense tables far better than the old 11B model and takes full-resolution screenshots; the 11B model stays as a
// fallback so a hiccup on one model never leaves /rushladder or /seasoncard dead. `env.VISION_MODEL` overrides the first choice.
export const VISION_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
export const FALLBACK_VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const READ_WIDTH = 2048;
const MIME = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

// ---------- image in ----------
// The site sends a data URL (already shrunk in the browser); Discord sends an attachment URL. Both end up as a data URL.
export function parseDataUrl(s) {
  const m = MIME.exec(String(s ?? '').trim());
  if (!m) return { error: 'Send a JPEG, PNG or WebP photo.' };
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes < 2000) return { error: 'That image is too small to read.' };
  if (bytes > MAX_IMAGE_BYTES) return { error: 'That image is too big – 6 MB max (the site shrinks photos for you).' };
  return { url: m[0], bytes };
}
export async function attachmentToDataUrl(att) {
  const type = String(att?.content_type ?? '').split(';')[0];
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return { error: 'Attach a JPEG, PNG or WebP image.' };
  if ((att.size ?? 0) > MAX_IMAGE_BYTES) return { error: 'That image is too big – 6 MB max.' };
  // Keep the picture sharp: small-print digits need pixels. Up to 2048 px wide and 1.5 MB goes through untouched; a bigger phone
  // photo or PNG comes back from Discord's media proxy as a near-lossless 2048 px JPEG (quality 92) so the upload stays quick.
  let src = att.url, mime = type;
  const heavy = (att.size ?? 0) > 1.5 * 1024 * 1024;
  if (att.proxy_url && att.width && att.height && (att.width > READ_WIDTH || heavy)) {
    const w = Math.min(att.width, READ_WIDTH);
    src = `${att.proxy_url}${att.proxy_url.includes('?') ? '&' : '?'}format=jpeg&quality=92&width=${w}&height=${Math.round((att.height / att.width) * w)}`;
    mime = 'image/jpeg';
  }
  let r = await fetch(src, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok && src !== att.url) { r = await fetch(att.url, { signal: AbortSignal.timeout(8000) }).catch(() => null); mime = type; }
  if (!r?.ok) return { error: 'Could not download that attachment from Discord.' };
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return parseDataUrl(`data:${mime};base64,${btoa(bin)}`);
}

// ---------- vision call ----------
export const BOARD_PROMPT = `This is a photo or screenshot of the EA SPORTS FC "Rush" global leaderboard (Leaderboards screen, Rush Season). The table columns are: RANK, Club Name, VP, GP, M, BFG, AVG VP. One row is highlighted (our club, "Phoenix Fire", may be shown in a different colour or with a crest). Read EVERY visible row, top to bottom, exactly as printed. Numbers use thousands separators (11,976): write them as plain integers. AVG VP has decimals. The first (highlighted) row's numbers may touch each other (12,539 and 7,464 can print as 12,5397,464): split them by column. The last row at the very bottom repeats our club's own row: do NOT list it again. Do not guess unreadable digits: use null. Do not invent rows. Reply with ONLY this JSON, no other text:
{"season_label": string|null, "highlighted_rank": number|null, "rows": [{"rank": number, "club": string, "vp": number, "gp": number|null, "m": number|null, "bfg": number|null, "avg_vp": number|null}]}`;
export const SEASON_PROMPT = `This is a photo or screenshot of a player's end-of-season screen from EA SPORTS FC "Rush" (it may be in any language, for example Ranked Rush / Rush Klassement / Classement Rush). Read the player's season numbers: matches played, wins, goals, the club's total VP (victory points), the player's own contribution in VP, the club name, the division or rank tier (for example "Top 1%", "Elite Division", "Division 4") and the season label if shown. Numbers use separators (17,520 or 17.520): write plain integers. If a field is not visible use null; never guess. Reply with ONLY this JSON, no other text:
{"club": string|null, "season_label": string|null, "tier": string|null, "matches": number|null, "wins": number|null, "goals": number|null, "club_vp": number|null, "my_vp": number|null}`;

// Lenient JSON out of a model answer (it sometimes wraps the object in prose or a code fence).
export function extractJson(s) {
  if (s && typeof s === 'object') return s;
  const t = String(s ?? '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through to a repair */ }
  try { return JSON.parse(t.slice(a, b + 1).replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"')); } catch { return null; }
}

// One vision call. The first use of the Llama vision model on an account needs a one-off licence acknowledgement; we send it once and retry.
// A deferred Discord reply is finished from ctx.waitUntil, which the runtime cancels ~30 s after the response goes out. A vision
// call that outlives that never reaches the edit and the command sits on "thinking…" – so the read is raced against a deadline
// well inside it and becomes an ordinary "could not read" notice.
export const VISION_TIMEOUT_MS = 26000;
// Models answer as {response}, {result} or OpenAI-style {choices:[{message:{content}}]}.
const answerText = (out) => {
  const r = out?.response ?? out?.result ?? out?.choices?.[0]?.message?.content ?? out;
  return Array.isArray(r) ? r.map((p) => p?.text ?? '').join('') : r;
};
async function readWith(env, model, dataUrl, prompt, maxTokens, ms) {
  const call = () => env.AI.run(model, {
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }],
    max_tokens: maxTokens, temperature: 0.1,
  });
  const read = async () => {
    try { return await call(); } catch (e) {
      if (!/agree|licen[sc]e|5016/i.test(String(e?.message))) throw e;
      await env.AI.run(model, { prompt: 'agree' }).catch(() => {});
      return call();
    }
  };
  let timer;
  const out = await Promise.race([
    read(),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Reading the photo took too long. Try again, or crop it to just the stats.')), ms); }),
  ]).finally(() => clearTimeout(timer));
  const json = extractJson(answerText(out));
  if (!json) throw new Error('The photo could not be read. Try again with the whole screen in frame and less glare.');
  return json;
}
// Strong model first (≈60% of the time budget), the older one with whatever is left; the first error is the one reported.
export async function visionJson(env, dataUrl, prompt, { maxTokens = 1500, timeoutMs = VISION_TIMEOUT_MS } = {}) {
  if (!env.AI) throw new Error('Photo reading is not connected (the Workers AI binding is missing).');
  const models = [...new Set([env.VISION_MODEL || VISION_MODEL, FALLBACK_VISION_MODEL])];
  const started = Date.now();
  let first = null;
  for (let k = 0; k < models.length; k++) {
    const left = timeoutMs - (Date.now() - started);
    if (left < 2500) break;
    try { return await readWith(env, models[k], dataUrl, prompt, maxTokens, k === models.length - 1 ? left : Math.round(left * 0.6)); }
    catch (e) { first ??= e; }
  }
  throw first ?? new Error('Reading the photo took too long. Try again, or crop it to just the stats.');
}

// ---------- cleaners ----------
// "11,976" "11.976" "11 976" "O" → plain integer; anything that is not a finite number → null.
export function num(v, { decimals = false } = {}) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[\s ']/g, '').replace(/[Oo]/g, '0');
  if (decimals) s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(/[.,]/g, '');
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? n : null;
}
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>@`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
export const sameClub = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (x.length > 4 && y.length > 4 && (x.includes(y) || y.includes(x)))); };

// A leaderboard read → { rows, us, season, qc }. `ours` = our club's name. Errors block saving until fixed; warnings do not.
export function cleanBoard(raw, { ours = 'Phoenix Fire' } = {}) {
  const qc = { errors: [], warnings: [], fixed: [] };
  const src = Array.isArray(raw?.rows) ? raw.rows : [];
  let rows = src.map((r) => ({
    rank: num(r.rank), club: cleanName(r.club), vp: num(r.vp), gp: num(r.gp), m: num(r.m), bfg: num(r.bfg), avg: num(r.avg_vp ?? r.avg, { decimals: true }),
  })).filter((r) => r.club && r.vp != null && r.vp >= 0);
  // The game pins our own row again at the bottom of the screen: the same rank and club twice is one row, not a misread.
  rows = rows.filter((r, i) => !(r.rank != null && rows.findIndex((o) => o.rank === r.rank && sameClub(o.club, r.club)) < i));
  if (rows.length < 3) qc.errors.push(`Only ${rows.length} row${rows.length === 1 ? '' : 's'} could be read. Retake the photo with the whole table in frame.`);
  if (rows.every((r) => r.rank == null)) rows.forEach((r, i) => { r.rank = i + 1; });
  else rows = rows.filter((r) => r.rank != null && r.rank >= 1).sort((a, b) => a.rank - b.rank);
  // Ranks must be unique; a repeated rank is a misread.
  const seen = new Set();
  for (const r of rows) { if (seen.has(r.rank)) qc.errors.push(`Rank ${r.rank} appears twice – check the rows around ${r.club}.`); seen.add(r.rank); }
  // Sorted by VP: the board is ordered by it, so a row with more VP than the one above is a digit error.
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].vp > rows[i - 1].vp) qc.errors.push(`${rows[i].club} (#${rows[i].rank}) shows ${rows[i].vp.toLocaleString('en-GB')} VP, more than ${rows[i - 1].club} above it. One of the numbers was misread.`);
  }
  // Checksum: AVG VP = VP ÷ M. Fill a missing average; flag a row whose three numbers disagree.
  for (const r of rows) {
    if (r.m > 0) {
      const exp = r.vp / r.m;
      if (r.avg == null) { r.avg = Math.round(exp * 100) / 100; qc.fixed.push(`${r.club}: average worked out from VP ÷ M.`); }
      else if (Math.abs(exp - r.avg) > 0.6) qc.warnings.push(`${r.club}: VP ÷ M is ${exp.toFixed(2)} but the screen says ${r.avg}. Check VP and M.`);
    }
  }
  const names = new Map();
  for (const r of rows) names.set(norm(r.club), (names.get(norm(r.club)) ?? 0) + 1);
  for (const [k, n] of names) if (n > 1) qc.warnings.push(`"${rows.find((r) => norm(r.club) === k).club}" is listed ${n} times.`);

  // Which row is us: the highlighted one when the model saw it, else the best-ranked row with our name.
  let us = null;
  const hl = num(raw?.highlighted_rank);
  if (hl != null) { const i = rows.findIndex((r) => r.rank === hl); if (i >= 0) us = i; }
  const byName = rows.findIndex((r) => sameClub(r.club, ours));
  // In the game the highlight is just the cursor (it often sits on the top club), so our own name wins over it.
  if (byName >= 0) us = byName;
  if (us == null) qc.errors.push(`${ours} was not found. Tap our row in the list to mark it.`);
  return { rows, us, season: cleanName(raw?.season_label) || null, qc };
}

// A season-stats read → { stats, qc }. Required: matches, wins, goals, myVp. Errors block; warnings are flags for managers.
export function cleanSeason(raw, { ours = 'Phoenix Fire' } = {}) {
  const qc = { errors: [], warnings: [] };
  const stats = {
    club: cleanName(raw?.club) || null, tier: cleanName(raw?.tier || raw?.division) || null,
    matches: num(raw?.matches), wins: num(raw?.wins), goals: num(raw?.goals), clubVp: num(raw?.club_vp ?? raw?.clubVp), myVp: num(raw?.my_vp ?? raw?.myVp),
  };
  return { ...validateSeason(stats, { ours }), season: cleanName(raw?.season_label) || null };
}
// The same checks for numbers a person typed or corrected on the site.
export function validateSeason(input, { ours = 'Phoenix Fire' } = {}) {
  const qc = { errors: [], warnings: [] };
  const stats = {
    club: cleanName(input.club) || null, tier: cleanName(input.tier) || null,
    matches: num(input.matches), wins: num(input.wins), goals: num(input.goals), clubVp: num(input.clubVp), myVp: num(input.myVp),
  };
  const need = [['matches', 'matches played'], ['wins', 'wins'], ['goals', 'goals'], ['myVp', 'your contribution (VP)']];
  for (const [k, label] of need) if (stats[k] == null) qc.errors.push(`Missing: ${label}. Fill it in from your screen.`);
  for (const k of ['matches', 'wins', 'goals', 'clubVp', 'myVp']) if (stats[k] != null && (stats[k] < 0 || !Number.isInteger(stats[k]))) qc.errors.push(`${k} must be a whole number of zero or more.`);
  if (stats.matches != null && stats.matches > 2000) qc.errors.push('That is more than 2,000 matches – check the number.');
  if (stats.matches != null && stats.wins != null && stats.wins > stats.matches) qc.errors.push('Wins cannot be more than matches played.');
  if (stats.clubVp != null && stats.myVp != null && stats.myVp > stats.clubVp) qc.errors.push('Your contribution cannot be more than the club total.');
  if (stats.club && !sameClub(stats.club, ours)) qc.errors.push(`This screen is for "${stats.club}", not ${ours}.`);
  if (!stats.club) qc.warnings.push('The club name was not visible, so it could not be checked.');
  if (!qc.errors.length && stats.matches >= 20) {
    const wr = stats.wins / stats.matches;
    if (wr < 0.35) qc.warnings.push(`Win rate is ${(wr * 100).toFixed(0)}% over ${stats.matches} matches.`);
    if (stats.goals / stats.matches < 0.2) qc.warnings.push(`Only ${stats.goals} goals in ${stats.matches} matches.`);
    if (stats.matches < 40) qc.warnings.push(`Only ${stats.matches} matches played this season.`);
  }
  return { stats, qc };
}

export const scanBoard = async (env, dataUrl, opts) => cleanBoard(await visionJson(env, dataUrl, BOARD_PROMPT), opts);
export const scanSeason = async (env, dataUrl, opts) => cleanSeason(await visionJson(env, dataUrl, SEASON_PROMPT, { maxTokens: 700 }), opts);
