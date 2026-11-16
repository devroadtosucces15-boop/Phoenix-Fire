// Brainstorm inbox: one markdown file per idea in LIBRARY/inbox/ (date, source, status, text). No dependencies, no secrets.
// An idea is open until it is tackled or dropped; reminders.mjs and the Brainstorm tab list the open ones at the end of a session.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const INBOX = fileURLToPath(new URL('../../LIBRARY/inbox/', import.meta.url));
export const MAX_TEXT = 2000;
export const STATUSES = ['open', 'tackled', 'dropped'];
export const SOURCES = ['typed', 'dictated'];
// Same shapes the library test and the dashboard refuse: a note must never carry a credential value.
const SECRETISH = [/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /\b[0-9a-f]{32,}\b/, /\b\d{17,20}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(?:token|secret|password|passwd|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9+/_-]{12,}/i];
export const looksSecret = (s) => SECRETISH.some((re) => re.test(String(s)));
const ID = /^\d{4}-\d{2}-\d{2}-\d{6}-[0-9a-f]{4}$/;

const file = (id) => path.join(INBOX, `${id}.md`);
function parse(id, src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]).filter((p) => p[0]));
  return { id, date: meta.date || '', source: SOURCES.includes(meta.source) ? meta.source : 'typed', status: STATUSES.includes(meta.status) ? meta.status : 'open', updated: meta.updated || '', text: m[2].trim() };
}
const render = (n) => `---\ndate: ${n.date}\nsource: ${n.source}\nstatus: ${n.status}\nupdated: ${n.updated}\n---\n${n.text}\n`;

export function listNotes() {
  if (!fs.existsSync(INBOX)) return [];
  return fs.readdirSync(INBOX).filter((f) => ID.test(f.replace(/\.md$/, '')) && f.endsWith('.md')).sort().reverse()
    .map((f) => parse(f.slice(0, -3), fs.readFileSync(path.join(INBOX, f), 'utf8'))).filter(Boolean);
}
export const openNotes = () => listNotes().filter((n) => n.status === 'open');

// Returns { ok, note } or { ok:false, error }. Text only; length capped; a credential-shaped value is refused, never stored.
export function addNote(text, source = 'typed') {
  if (typeof text !== 'string') return { ok: false, error: 'text must be a string' };
  const t = text.replace(/\r/g, '').trim();
  if (!t) return { ok: false, error: 'empty note' };
  if (t.length > MAX_TEXT) return { ok: false, error: `note longer than ${MAX_TEXT} characters` };
  if (looksSecret(t)) return { ok: false, error: 'this looks like a secret value; notes never store secrets (name the secret instead)' };
  const now = new Date();
  const iso = now.toISOString();
  const id = `${iso.slice(0, 10)}-${iso.slice(11, 19).replace(/:/g, '')}-${(now.getUTCMilliseconds() * 64 + crypto.randomInt(64)).toString(16).padStart(4, '0')}`; // suffix sorts by millisecond, so same-second notes list newest first
  const note = { id, date: iso, source: SOURCES.includes(source) ? source : 'typed', status: 'open', updated: iso, text: t };
  fs.mkdirSync(INBOX, { recursive: true });
  fs.writeFileSync(file(id), render(note), { flag: 'wx' });
  return { ok: true, note };
}

export function setStatus(id, status) {
  if (!ID.test(String(id))) return { ok: false, error: 'bad id' };
  if (!STATUSES.includes(status)) return { ok: false, error: 'status must be open, tackled or dropped' };
  if (!fs.existsSync(file(id))) return { ok: false, error: 'no such note' };
  const n = parse(id, fs.readFileSync(file(id), 'utf8'));
  if (!n) return { ok: false, error: 'unreadable note' };
  n.status = status; n.updated = new Date().toISOString();
  fs.writeFileSync(file(id), render(n));
  return { ok: true, note: n };
}
