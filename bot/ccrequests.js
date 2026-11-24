// Control Center › requests and uploads (2026-11-23). What members send through the bot, in one place for the managers:
//   GET  /api/controlcenter/requests        the counts the Overview and the deck badges show: emoji and sticker suggestions waiting, absence notices not yet acknowledged,
//                                           GIFs being made, and how many GIFs and highlight clips are stored
//   GET  /api/controlcenter/media           every GIF and every highlight clip (newest first, 50 of each): who made it, size, length, status, the storage key to open it
//   POST /api/controlcenter/media/remove    { kind: 'gif' | 'highlight', id }: the same deletion a manager can do with /gif delete and /highlight delete, from the site
// The counts belong to the dashboard (tool `home`) and the lists to the tool `media`, both listed in bot/ccpermissions.js, so a member is refused by the matrix before this file
// runs; the checks below repeat the bot permission names (gif.manage, highlight.manage) as the second lock. Removals are written to config_audit (entity cc:media).
// Nothing here creates a channel or role name: where results post is Organization config like everywhere else.
import { can } from './roles.js';
import { usedBytes, REFUSE_AT } from './media.js';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const count = async (env, sql, ...bind) => { try { return (await env.DB.prepare(sql).bind(...bind).first())?.n ?? 0; } catch { return 0; } }; // a table the migration has not created yet counts as 0
const rowsOf = async (env, sql, ...bind) => { try { return (await env.DB.prepare(sql).bind(...bind).all()).results ?? []; } catch { return []; } };

/** the public shape of one GIF job row (the interaction token, input key and error text stay in D1) */
export const gifOut = (r) => ({ id: r.id, userId: r.user_id, user: r.user_name, title: r.title, status: r.status, outSize: r.out_size ?? 0, inSize: r.in_size ?? 0, secs: r.secs ?? null, width: r.width ?? null, fps: r.fps ?? null, error: r.error || '', key: r.status === 'done' ? r.out_key : '', createdAt: r.created_at, doneAt: r.done_at ?? null });
/** the public shape of one highlight row */
export const clipOut = (r) => ({ id: r.id, userId: r.user_id, user: r.user_name, title: r.title, note: r.note, type: r.type, size: r.size, status: r.status, key: r.status === 'stored' ? r.key : '', createdAt: r.created_at });

export async function ccRequestsRoute(p, method, body, me, env, log) {
  if (p !== '/api/controlcenter/requests' && !p.startsWith('/api/controlcenter/media')) return null;
  if (!env.DB) return json({ error: 'The member database is not connected.' }, 503);

  if (p === '/api/controlcenter/requests' && method === 'GET') {
    const [emojis, absences, gifsRunning, gifs, clips] = await Promise.all([
      count(env, "SELECT COUNT(*) AS n FROM emoji_suggestions WHERE status = 'pending'"),
      count(env, "SELECT COUNT(*) AS n FROM absences WHERE status = 'open' AND expires_at > ?", Date.now()),
      count(env, "SELECT COUNT(*) AS n FROM gif_jobs WHERE status IN ('queued', 'converting')"),
      count(env, "SELECT COUNT(*) AS n FROM gif_jobs WHERE status = 'done'"),
      count(env, "SELECT COUNT(*) AS n FROM highlights WHERE status = 'stored'"),
    ]);
    return json({ emojis, absences, gifsRunning, gifs, clips, at: Date.now() });
  }

  if (p === '/api/controlcenter/media' && method === 'GET') {
    if (!can(me, 'gif.manage') && !can(me, 'highlight.manage')) return json({ error: 'Managers only.' }, 403);
    const [gifs, clips] = await Promise.all([
      rowsOf(env, "SELECT * FROM gif_jobs WHERE status IN ('queued', 'converting', 'done', 'failed') ORDER BY id DESC LIMIT 50"),
      rowsOf(env, "SELECT * FROM highlights WHERE status IN ('pending', 'stored', 'failed') ORDER BY id DESC LIMIT 50"),
    ]);
    let used = null; try { used = await usedBytes(env); } catch { /* storage not bound: the sizes still show */ }
    return json({ gifs: gifs.map(gifOut), clips: clips.map(clipOut), storage: { used, refuseAt: REFUSE_AT } });
  }

  if (p === '/api/controlcenter/media/remove' && method === 'POST') {
    const kind = String(body?.kind), id = Number(body?.id) || 0, now = Date.now(), who = me.u ?? me.id ?? '';
    if (kind === 'gif') {
      if (!can(me, 'gif.manage')) return json({ error: 'Managers only.' }, 403);
      const row = await env.DB.prepare('SELECT * FROM gif_jobs WHERE id = ?').bind(id).first();
      if (!row || row.status !== 'done') return json({ error: 'No finished GIF with that number.' }, 404);
      if (env.MEDIA && row.out_key) await env.MEDIA.delete(row.out_key).catch(() => null);
      await env.DB.prepare("UPDATE gif_jobs SET status = 'deleted', deleted_at = ?, deleted_by = ? WHERE id = ?").bind(now, who, row.id).run();
      await log?.(env, me, 'gif-remove', `#${row.id} · ${row.user_name || row.user_id}`);
      return json({ ok: true });
    }
    if (kind === 'highlight') {
      if (!can(me, 'highlight.manage')) return json({ error: 'Managers only.' }, 403);
      const row = await env.DB.prepare('SELECT * FROM highlights WHERE id = ?').bind(id).first();
      if (!row || row.status !== 'stored') return json({ error: 'No stored clip with that number.' }, 404);
      if (env.MEDIA) await env.MEDIA.delete(row.key).catch(() => null);
      await env.DB.prepare("UPDATE highlights SET status = 'deleted', deleted_at = ?, deleted_by = ? WHERE id = ?").bind(now, who, row.id).run();
      await log?.(env, me, 'highlight-remove', `#${row.id} · ${row.user_name || row.user_id}`);
      return json({ ok: true });
    }
    return json({ error: 'Pick gif or highlight.' }, 400);
  }
  return json({ error: 'Not found' }, 404);
}
