// Bot Studio snapshots: a stable fingerprint of every output, so an edit shows exactly which messages it changed
// (and that the ones you did not mean to touch stayed the same).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { STUDIO_OUT, textOf, flat } from './model.mjs';

export const SNAP_FILE = STUDIO_OUT + 'snapshot.json';
// Values that differ on every run (clock, tokens, hashed file names) are levelled out first.
const stable = (s) => String(s)
  .replace(/<t:\d+(:\w)?>/g, '<t:T$1>')
  .replace(/([?&](?:t|v)=)\d+/g, '$1N')
  .replace(/-[0-9a-f]{10}\.png/g, '-H.png')
  .replace(/\b\d{9,}\b/g, 'N')
  .replace(/\b\d{1,2}:\d{2}\b/g, 'H:MM')
  .replace(/\b\d+ ?(d|h|m|min|s) ago\b/g, 'N$1 ago')
  .replace(/\b(in|about|~) ?\d+ (seconds?|minutes?|min|hours?|days?)\b/g, '$1 N $2');
export const normalise = (body) => JSON.parse(stable(JSON.stringify(body ?? null)));
const hash = (x) => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 12);

// A short readable outline of a message: what a reviewer needs to see in a diff.
export function outline(body) {
  if (!body) return [];
  const b = normalise(body), out = [];
  const box = (b.components ?? []).find((c) => c.type === 17);
  if (box?.accent_color != null) out.push(`stripe #${box.accent_color.toString(16).padStart(6, '0')}`);
  if (b.title) out.push(`form: ${b.title}`);
  for (const c of flat(b.components)) {
    if (c.type === 10) out.push(...String(c.content).split('\n').map((l) => `text: ${l}`));
    else if (c.type === 2) out.push(`button[${{ 1: 'blurple', 2: 'grey', 3: 'green', 4: 'red', 5: 'link' }[c.style] ?? c.style}]: ${c.emoji?.name ? c.emoji.name + ' ' : ''}${c.label ?? ''}${c.custom_id ? '  (' + c.custom_id + ')' : c.url ? '  → ' + c.url : ''}`);
    else if (c.type === 3) out.push(`menu: ${c.placeholder ?? ''} [${(c.options ?? []).length} options]  (${c.custom_id})`);
    else if (c.type === 4) out.push(`field: ${c.label ?? c.custom_id}`);
    else if (c.type === 11) out.push(`thumb: ${c.media?.url}`);
    else if (c.type === 12) out.push(...(c.items ?? []).map((i) => `picture: ${i.media?.url}`));
    else if (c.type === 14) out.push('---');
  }
  if (b.content) out.unshift(...String(b.content).split('\n').map((l) => `content: ${l}`));
  for (const e of b.embeds ?? []) out.push(`embed: ${textOf({ embeds: [e] }).replace(/\n/g, ' / ')}`);
  if ((b.flags ?? 0) & 64) out.push('(only you can see this)');
  return out;
}
export const fingerprint = (entries) => Object.fromEntries(entries.filter((e) => e.messages.length).map((e) => [e.id, { hash: hash(e.messages.map((m) => [m.kind, normalise(m.body)])), messages: e.messages.map((m) => ({ kind: m.kind, label: m.label ?? '', outline: outline(m.body) })) }]));

export function saveSnapshot(entries) { fs.mkdirSync(STUDIO_OUT, { recursive: true }); const snap = { at: new Date().toISOString(), outputs: fingerprint(entries) }; fs.writeFileSync(SNAP_FILE, JSON.stringify(snap, null, 1)); return snap; }
export const loadSnapshot = () => (fs.existsSync(SNAP_FILE) ? JSON.parse(fs.readFileSync(SNAP_FILE, 'utf8')) : null);

// → { changed: [{ id, lines: ['- old', '+ new'] }], added: [id], removed: [id], same: n }
export function diffSnapshot(old, entries) {
  const now = fingerprint(entries), res = { changed: [], added: [], removed: [], same: 0 };
  for (const [id, cur] of Object.entries(now)) {
    const was = old.outputs[id];
    if (!was) { res.added.push(id); continue; }
    if (was.hash === cur.hash) { res.same++; continue; }
    const lines = [], n = Math.max(was.messages.length, cur.messages.length);
    for (let k = 0; k < n; k++) {
      const a = was.messages[k]?.outline ?? [], b = cur.messages[k]?.outline ?? [];
      const gone = a.filter((l) => !b.includes(l)), came = b.filter((l) => !a.includes(l));
      if (!gone.length && !came.length) { if (a.join('\n') !== b.join('\n')) lines.push(`  ~ message ${k + 1}: same lines, new order`); continue; }
      lines.push(`  message ${k + 1}${cur.messages[k]?.label ? ` (${cur.messages[k].label})` : ''}:`, ...gone.map((l) => `    - ${l}`), ...came.map((l) => `    + ${l}`));
    }
    res.changed.push({ id, lines: lines.length ? lines : ['  (changed in a field the outline does not show: flags, mentions or component order)'] });
  }
  for (const id of Object.keys(old.outputs)) if (!now[id]) res.removed.push(id);
  return res;
}
