// Phoenix DJ bridge (PF-022 step 5). This PC is behind NAT, so the Worker cannot call it: the DJ PUSHES a snapshot of every live room to
// the Worker (/api/music/bridge/push) and POLLS the command queue (/api/music/bridge/commands) over the shared key, X-Phoenix-Key.
// State stays in memory here; the Worker keeps only the last snapshot. Everything is best effort: a dead network never touches playback.
import fs from 'node:fs';
import { BOT } from './brand.js';

export const KEY_HEADER = 'X-Phoenix-Key';
let seq = 0;
const secs = (ms) => Math.floor((+ms || 0) / 1000);

// Worker host: env WORKER_URL, else the one in the repo's config.json (members.api), so a host move is a one-line change there.
export const workerUrl = (env = process.env) => {
  if (env.WORKER_URL) return env.WORKER_URL.replace(/\/+$/, '');
  try { return String(JSON.parse(fs.readFileSync(new URL('../../config.json', import.meta.url), 'utf8')).members?.api || '').replace(/\/+$/, ''); } catch { return ''; }
};

const trackOf = (t, by) => ({ id: t.qid, title: t.info?.title || '', artist: t.info?.author || '', thumb: t.info?.artworkUrl || '', duration: secs(t.info?.length), by: t.by || by || { id: '', name: '' } });
// pure: live Room objects → the snapshot the site shows. `now` is unix ms.
export function snapshot(rooms, now = Date.now()) {
  return rooms.filter((r) => r && !r.dead).map((r) => {
    const cur = r.current, pos = secs(r.player?.position);
    if (cur) cur.qid ||= 'n' + (++seq);
    for (const q of r.queue) q.qid ||= 'q' + (++seq);
    const ch = r.helper?.client?.guilds?.cache?.get(r.guildId)?.channels?.cache?.get(r.channelId);
    return {
      id: String(r.binding.key || r.binding.textId), name: `${r.helper?.name || BOT} · ${ch?.name || 'voice'}`, paused: !!r.player?.paused,
      listeners: r.memberIds?.().length ?? 0, volume: r.settings?.volume ?? 80,
      nowPlaying: cur ? { ...trackOf(cur), startedAt: secs(now) - pos, position: pos } : null,
      queue: r.queue.slice(0, 50).map((q) => trackOf(q)),
    };
  });
}

// `ctx` = { rooms(): Room[], find(id): Room|undefined, resolve(query): Promise<{tracks}|null>, search(q): Promise<track[]> }
export function createBridge({ url, key, ctx, fetchImpl = fetch, pushEvery = 20_000, pollEvery = 2_000, minGap = 1_000, log = console }) {
  let stopped = false, pushTimer = 0, lastBody = '', lastPush = 0, pollTimer = 0, backoff = 0, down = false;
  const head = { [KEY_HEADER]: key, 'Content-Type': 'application/json' };
  const note = (ok, why) => { if (ok === !down) return; down = !ok; log.log(ok ? `${BOT} bridge: connected to the Worker` : `${BOT} bridge: Worker unreachable (${why}), retrying`); };
  const call = async (path, init) => {
    const r = await fetchImpl(url + path, { ...init, headers: head, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  async function push(force = false) {
    clearTimeout(pushTimer); pushTimer = 0;
    const body = JSON.stringify({ rooms: snapshot(ctx.rooms()) }), now = Date.now();
    if (!force && body === lastBody && now - lastPush < pushEvery - 1000) return false;
    try { await call('/api/music/bridge/push', { method: 'POST', body }); lastBody = body; lastPush = now; note(true); return true; }
    catch (e) { note(false, e.message); return false; }
  }
  // call on every room change: pushes soon, never faster than minGap, never a burst
  function changed() { if (stopped || pushTimer) return; pushTimer = setTimeout(() => push().catch(() => {}), Math.max(0, minGap - (Date.now() - lastPush))); }

  async function exec(c) {
    if (c.type === 'search') return { ok: true, result: await ctx.search(String(c.arg?.q || '')) };
    const room = ctx.find(c.room);
    if (!room || room.dead) return { ok: false, error: 'That room is not running.' };
    const by = c.by?.id ? { id: String(c.by.id), name: String(c.by.name || '') } : undefined;
    switch (c.type) {
      case 'pause': if (!room.current) return { ok: false, error: 'Nothing is playing.' }; await room.pause(true); break;
      case 'resume': if (!room.current) return { ok: false, error: 'Nothing is playing.' }; await room.pause(false); break;
      case 'skip': if (!room.current) return { ok: false, error: 'Nothing is playing.' }; await room.skip(); break;
      case 'volume': await room.setVolume(Math.min(100, Math.max(0, Math.floor(+c.arg?.v) || 0))); break;
      case 'remove': { const n = room.queue.length; room.queue = room.queue.filter((q) => q.qid !== c.arg?.id); if (room.queue.length === n) return { ok: false, error: 'That song is no longer in the queue.' }; room.changed(); break; }
      case 'add': {
        const found = await ctx.resolve(String(c.arg?.track?.id || ''));
        if (!found?.tracks?.length) return { ok: false, error: 'Could not load that song.' };
        for (const t of found.tracks) t.by = by;
        await room.add(found.tracks); break;
      }
      default: return { ok: false, error: 'Unknown command.' };
    }
    return { ok: true };
  }

  async function poll() {
    if (stopped) return;
    let wait = pollEvery;
    try {
      const { commands = [] } = await call('/api/music/bridge/commands');
      note(true); backoff = 0;
      if (commands.length) {
        const done = [];
        for (const c of commands) { // one at a time, in order; a failing command never stops the rest
          try { done.push({ id: c.id, ...(await exec(c)) }); } catch (e) { done.push({ id: c.id, ok: false, error: String(e.message || e).slice(0, 200) }); }
        }
        await call('/api/music/bridge/ack', { method: 'POST', body: JSON.stringify({ done }) });
        push(true).catch(() => {}); // the site sees the effect at once
      } else if (Date.now() - lastPush >= pushEvery) push(true).catch(() => {}); // heartbeat: the Worker calls a silent DJ offline after 90 s
    } catch (e) { note(false, e.message); backoff = Math.min(30_000, (backoff || pollEvery) * 2); wait = backoff; }
    if (!stopped) pollTimer = setTimeout(poll, wait);
  }

  return { start() { stopped = false; push(true).catch(() => {}); pollTimer = setTimeout(poll, pollEvery); }, stop() { stopped = true; clearTimeout(pushTimer); clearTimeout(pollTimer); }, changed, push, poll, exec, get down() { return down; } };
}

// the live search the site's "Add a song" box uses: top matches as { id: link the DJ can play later, title, artist, thumb, duration (s) }
export async function searchTracks(node, q) {
  const r = await node.rest.resolve(`ytmsearch:${q}`);
  const list = r?.loadType === 'search' ? r.data : r?.loadType === 'track' ? [r.data] : [];
  return list.slice(0, 8).filter((t) => t.info?.uri).map((t) => ({ id: t.info.uri, title: t.info.title, artist: t.info.author, thumb: t.info.artworkUrl || '', duration: secs(t.info.length) }));
}
