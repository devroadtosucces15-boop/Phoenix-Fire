// Usage intelligence for the project brain (PF-016). Reads the local Claude Code session transcripts (JSONL, outside the repo), keeps only
// numbers (turns, tokens, minutes, tool mix, flags) and never message text, then:
//   - flags likely causes of heavy use with plain rules (no model),
//   - attributes sessions to roadmap items (PF-nnn from the branch name or the first words),
//   - estimates the share of the 5-hour window a session used from the usage snapshots (LIBRARY/state/usage.json),
//   - writes LIBRARY/LESSONS.md (lessons + improvement plans) for the dashboard and the next session.
//   node tools/brain/intel.mjs [--dir <transcripts dir>] [--write]      (--write updates LIBRARY/LESSONS.md and LIBRARY/state/intel.json)
// Transcript dir default: ~/.claude/projects/<this folder's path with / as ->. A session adds the "why" only when asked.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readUsage } from './usage.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT_MD = path.join(ROOT, 'LIBRARY/LESSONS.md');
const OUT_JSON = path.join(ROOT, 'LIBRARY/state/intel.json');
export const defaultDir = () => path.join(os.homedir(), '.claude/projects', ROOT.replace(/\/$/, '').replace(/[/.]/g, '-'));

// Thresholds for the rules (minutes = active minutes). Plain numbers so a lesson can quote them.
export const LIMITS = { turns: 250, minutes: 240, peakContext: 300000, bigResultChars: 20000, bigResults: 8, images: 12, repeatFail: 3, readShare: 0.45 };

const ITEM = /\bPF-\d{3}\b/;
const tokensOf = (u) => (u ? (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) : 0);
const ctxOf = (u) => (u ? (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) : 0);
const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x && x.type === 'text' ? x.text : '')).join('') : '');
const imagesIn = (c) => (Array.isArray(c) ? c.filter((x) => x && x.type === 'image').length : 0);

// Pure: records (parsed JSONL objects) -> numbers for one session. No text is kept.
export function analyzeSession(records, id = '') {
  const seen = new Set(); const tools = {}; const fails = {}; const idToName = new Map();
  let turns = 0; let tokens = 0; let outTokens = 0; let peak = 0; let first = null; let last = null; let bigResults = 0; let images = 0; let item = null; let branch = null;
  let readChars = 0; let allChars = 0; let userTurns = 0; const stamps = [];
  for (const r of records) {
    if (r.timestamp) { const t = Date.parse(r.timestamp); if (Number.isFinite(t)) { stamps.push(t); if (first == null || t < first) first = t; if (last == null || t > last) last = t; } }
    if (!branch && r.gitBranch) branch = String(r.gitBranch);
    const m = r.message;
    if (r.type === 'assistant' && m) {
      const key = m.id || r.uuid;
      if (!seen.has(key)) { seen.add(key); turns++; tokens += tokensOf(m.usage); outTokens += (m.usage && m.usage.output_tokens) || 0; peak = Math.max(peak, ctxOf(m.usage)); }
      for (const b of Array.isArray(m.content) ? m.content : []) if (b && b.type === 'tool_use') {
        tools[b.name] = (tools[b.name] || 0) + 1; idToName.set(b.id, { name: b.name, cmd: b.name === 'Bash' ? String(b.input && b.input.command || '').split(/\s+/).slice(0, 3).join(' ') : '' });
      }
    } else if (r.type === 'user' && m && !r.isSidechain) {
      if (typeof m.content === 'string' || (Array.isArray(m.content) && m.content.some((c) => c && c.type === 'text'))) {
        userTurns++;
        if (!item) { const hit = textOf(m.content).slice(0, 600).match(ITEM); if (hit) item = hit[0]; }
      }
      for (const b of Array.isArray(m.content) ? m.content : []) if (b && b.type === 'tool_result') {
        const len = textOf(b.content).length; const n = imagesIn(b.content); images += n; allChars += len;
        const who = idToName.get(b.tool_use_id);
        if (who && (who.name === 'Read' || who.name === 'Grep' || who.name === 'Glob')) readChars += len;
        if (len > LIMITS.bigResultChars) bigResults++;
        if (b.is_error && who && who.name === 'Bash') { const k = who.cmd || 'bash'; fails[k] = (fails[k] || 0) + 1; }
      }
    }
  }
  if (!item && branch) item = (branch.match(ITEM) || [])[0] || null;
  if (!item) { const b = (branch || '').match(/pf-?(\d{3})/i); if (b) item = 'PF-' + b[1]; }
  // Active minutes: gaps over 30 minutes (a session left open overnight) do not count as work.
  stamps.sort((x, y) => x - y);
  const minutes = Math.round(stamps.reduce((n, t, i) => n + (i && t - stamps[i - 1] <= 1800000 ? t - stamps[i - 1] : 0), 0) / 60000);
  const repeatFail = Object.entries(fails).filter(([, n]) => n >= LIMITS.repeatFail).map(([cmd, n]) => ({ cmd, n }));
  return { id, item, branch, start: first ? new Date(first).toISOString() : null, end: last ? new Date(last).toISOString() : null, minutes, turns, userTurns, tokens, outTokens,
    peakContext: peak, tools, images, bigResults, readShare: allChars ? Math.round((readChars / allChars) * 100) / 100 : 0, repeatFail };
}

// Pure: flags for one session. Each flag has a code, a plain reason and one thing to do next time.
export function flagsFor(s) {
  const f = [];
  if (s.turns > LIMITS.turns) f.push({ code: 'long-session', why: `${s.turns} turns in one session`, fix: 'Start a new session at 100 to 150 turns; the library and handoff carry the state.' });
  if (s.minutes > LIMITS.minutes) f.push({ code: 'long-running', why: `${Math.round(s.minutes / 60)} active hours`, fix: 'Split the item; one roadmap item per session.' });
  if (s.peakContext > LIMITS.peakContext) f.push({ code: 'big-context', why: `context reached ${Math.round(s.peakContext / 1000)}k tokens`, fix: 'Read only the part of a file you need; check text before screenshots.' });
  if (s.images > LIMITS.images) f.push({ code: 'many-images', why: `${s.images} images returned by tools`, fix: 'Use read_page or get_page_text for logic; screenshots only for design talk.' });
  if (s.bigResults > LIMITS.bigResults) f.push({ code: 'big-results', why: `${s.bigResults} tool results over ${LIMITS.bigResultChars / 1000}k characters`, fix: 'Narrow the command (head, grep, a line range) before running it.' });
  if (s.readShare > LIMITS.readShare && s.turns > 40) f.push({ code: 'read-heavy', why: `${Math.round(s.readShare * 100)}% of tool output was file and search reads`, fix: 'Start from LIBRARY/README.md instead of surveying the repo.' });
  for (const r of s.repeatFail) f.push({ code: 'repeat-fail', why: `\`${r.cmd}\` failed ${r.n} times`, fix: 'After two failures read the error and change the approach instead of retrying.' });
  return f;
}

// Pure: sessions + usage history -> per-session window use. A session's use is the rise in the 5-hour percent across snapshots inside its span.
export function windowUse(s, history) {
  const a = Date.parse(s.start); const b = Date.parse(s.end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const inside = history.filter((h) => h.fiveHour != null && Date.parse(h.timestamp) >= a - 600000 && Date.parse(h.timestamp) <= b + 600000).sort((x, y) => Date.parse(x.timestamp) - Date.parse(y.timestamp));
  if (inside.length < 2) return null;
  const d = inside[inside.length - 1].fiveHour - inside[0].fiveHour;
  return d >= 0 ? Math.round(d * 10) / 10 : null; // a drop means the window reset; no honest number then
}

// Pure: roll sessions up per roadmap item.
export function byItem(sessions) {
  const out = {};
  for (const s of sessions) {
    const k = s.item || 'unassigned'; const o = out[k] || (out[k] = { item: k, sessions: 0, turns: 0, tokens: 0, minutes: 0, windowPercent: 0, measured: 0 });
    o.sessions++; o.turns += s.turns; o.tokens += s.tokens; o.minutes += s.minutes;
    if (s.windowPercent != null) { o.windowPercent = Math.round((o.windowPercent + s.windowPercent) * 10) / 10; o.measured++; }
  }
  return Object.values(out).sort((a, b) => b.tokens - a.tokens);
}

// Pure: what repeats across sessions becomes a lesson; a lesson is a flag code seen in 2+ sessions (or 1 when only one session exists).
export function lessons(sessions) {
  const by = {};
  for (const s of sessions) for (const f of s.flags) { const o = by[f.code] || (by[f.code] = { code: f.code, fix: f.fix, sessions: [], examples: [] }); o.sessions.push(s.id.slice(0, 8)); if (o.examples.length < 2) o.examples.push(`${s.item || s.id.slice(0, 8)}: ${f.why}`); }
  const need = sessions.length > 1 ? 2 : 1;
  return Object.values(by).filter((l) => l.sessions.length >= need).sort((a, b) => b.sessions.length - a.sessions.length);
}

export function readTranscripts(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => {
    const recs = [];
    for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) { if (!l) continue; try { recs.push(JSON.parse(l)); } catch { /* a half-written last line */ } }
    return analyzeSession(recs, f.replace(/\.jsonl$/, ''));
  }).filter((s) => s.turns > 0).sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

export function intel(dir = defaultDir(), history = readUsage().history.concat(readUsage().latest || [])) {
  const sessions = readTranscripts(dir).map((s) => ({ ...s, windowPercent: windowUse(s, history), flags: flagsFor(s) }));
  return { generated: new Date().toISOString(), dir: dir.replace(os.homedir(), '~'), sessions, items: byItem(sessions), lessons: lessons(sessions), limits: LIMITS };
}

export function lessonsMd(m) {
  const flagged = m.sessions.filter((s) => s.flags.length).length;
  const L = ['# Lessons and improvement plans', '', 'Generated by `node tools/brain/intel.mjs --write` from the local session transcripts. Numbers only, no message text. Do not edit by hand.',
    '', `Last generated: ${m.generated.slice(0, 10)} · ${m.sessions.length} sessions read · ${flagged} with at least one flag.`, '', '## Lessons (seen in more than one session)', ''];
  if (!m.lessons.length) L.push('Nothing repeats yet.');
  for (const l of m.lessons) L.push(`- **${l.code}** (${l.sessions.length} sessions): ${l.fix} Examples: ${l.examples.join('; ')}.`);
  L.push('', '## Improvement plans', '');
  const top = m.items.filter((i) => i.item !== 'unassigned').slice(0, 5);
  if (!top.length) L.push('No session could be tied to a roadmap item yet. Put the item id (PF-nnn) in the first message of a session.');
  for (const i of top) L.push(`- **${i.item}**: ${i.sessions} session${i.sessions === 1 ? '' : 's'}, ${i.turns} turns, ${Math.round(i.tokens / 1e6 * 10) / 10}M tokens, ${i.minutes} min${i.measured ? `, about ${i.windowPercent}% of the 5-hour window (measured)` : ''}.`);
  L.push('', '## Per roadmap item', '', '| Item | Sessions | Turns | Tokens (M) | Minutes | 5-hour window |', '|---|---|---|---|---|---|');
  for (const i of m.items) L.push(`| ${i.item} | ${i.sessions} | ${i.turns} | ${Math.round(i.tokens / 1e5) / 10} | ${i.minutes} | ${i.measured ? i.windowPercent + '%' : 'not measured'} |`);
  L.push('', '## Rule limits', '', Object.entries(m.limits).map(([k, v]) => `\`${k}\` ${v}`).join(' · '), '');
  return L.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2); const i = a.indexOf('--dir');
  const m = intel(i >= 0 ? a[i + 1] : defaultDir());
  if (a.includes('--write')) {
    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.writeFileSync(OUT_MD, lessonsMd(m));
    fs.writeFileSync(OUT_JSON, JSON.stringify({ generated: m.generated, items: m.items, lessons: m.lessons, sessions: m.sessions.map(({ flags, ...s }) => ({ ...s, flags: flags.map((f) => f.code) })) }, null, 2) + '\n');
    console.log(`wrote LIBRARY/LESSONS.md and LIBRARY/state/intel.json (${m.sessions.length} sessions, ${m.lessons.length} lessons)`);
  } else console.log(lessonsMd(m));
}
