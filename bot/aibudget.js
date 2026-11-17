// One shared counter for the Workers AI free pool (10,000 neurons a day, resets 00:00 UTC), kept in KV (PF-024 Item 9).
// Every NEW AI feature calls `spendAi` before `env.AI.run`; features that already existed keep their own limits for now.
// The numbers are estimates in neurons, not exact bills: a short text-model call is a few hundred. The daily cap leaves
// headroom for the card studio and the hype post, which draw from the same pool. No KV bound = no limit (mock server).
import { kvOf } from './kv.js';

export const AI_DAILY_CAP = 6000; // neurons this counter lets the new features use per UTC day (of the 10,000 free)
export const AI_COST = { text: 250, enhance: 350 }; // estimated neurons per call
export const AI_COOLDOWN_SEC = 20; // per person, per feature: a held-down button cannot burn the pool

const day = (now) => new Date(now).toISOString().slice(0, 10);
export const dailyCap = (env) => Math.max(0, Number(env?.AI_DAILY_CAP) || AI_DAILY_CAP);

// Reads what has been spent today (for a status line or the Control Center).
export async function aiUsed(env, now = Date.now()) {
  const kv = kvOf(env);
  return kv ? Number(await kv.get(`aibudget:${day(now)}`)) || 0 : 0;
}

// Asks to spend `cost`. Returns { ok: true, used, cap } or { ok: false, reason: 'cooldown' | 'budget', wait?, used, cap }.
// `who` + `feature` give the per-person cooldown; leave `who` out for automatic (cron) calls.
export async function spendAi(env, { cost = AI_COST.text, who = null, feature = 'ai', now = Date.now() } = {}) {
  const kv = kvOf(env), cap = dailyCap(env);
  if (!kv) return { ok: true, used: 0, cap };
  if (who) {
    const ck = `aicool:${feature}:${who}`;
    const last = Number(await kv.get(ck)) || 0; // KV's minimum TTL is 60 s, so the stored time is the real window
    if (now - last < AI_COOLDOWN_SEC * 1000) return { ok: false, reason: 'cooldown', wait: Math.max(1, Math.ceil((AI_COOLDOWN_SEC * 1000 - (now - last)) / 1000)), used: await aiUsed(env, now), cap };
    await kv.put(ck, String(now), { expirationTtl: 60 });
  }
  const key = `aibudget:${day(now)}`, used = Number(await kv.get(key)) || 0;
  if (used + cost > cap) return { ok: false, reason: 'budget', used, cap };
  await kv.put(key, String(used + cost), { expirationTtl: 2 * 86400 });
  return { ok: true, used: used + cost, cap };
}

// What a person sees when the counter says no.
export const aiRefusal = (r) => (r.reason === 'cooldown'
  ? `Easy – wait ${r.wait} seconds between uses.`
  : "Today's AI allowance for new tools is used up. It resets at 00:00 UTC.");
