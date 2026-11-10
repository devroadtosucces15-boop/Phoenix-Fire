// Uploads the icon set to ONE Discord app as application emoji and returns { icon name → { id, name } }.
// fetch and render are injectable so tests never touch Discord or Chrome. Throws only on a failed listing; one icon that
// won't upload is skipped (it keeps its unicode fallback).
import { NAMES } from './iconset.mjs';

export async function ensureAppEmojis({ appId, token, names = NAMES, render, fetchFn = fetch, warn = () => {} }) {
  const api = (p, init = {}) => fetchFn(`https://discord.com/api/v10/applications/${appId}/emojis${p}`, { ...init, headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' } });
  const listed = await api('');
  if (!listed.ok) throw new Error(`listing emoji: Discord said ${listed.status}`);
  const map = {};
  for (const e of (await listed.json()).items ?? []) if (e.name.startsWith('nx_')) map[e.name.slice(3)] = { id: e.id, name: e.name };
  for (const name of names) {
    if (map[name]) continue;
    const r = await api('', { method: 'POST', body: JSON.stringify({ name: `nx_${name}`, image: `data:image/png;base64,${render(name).toString('base64')}` }) });
    const e = await r.json();
    if (e.id) map[name] = { id: e.id, name: e.name }; else warn(`Icon ${name} not uploaded: ${JSON.stringify(e).slice(0, 160)}`);
  }
  return map;
}
