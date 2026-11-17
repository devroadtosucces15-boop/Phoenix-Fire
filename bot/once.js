// once(env, key): the idempotency claim behind every automated post (PF-024 Item 8, duplicate-post fix).
// One atomic INSERT into `meta`; true for the first caller only. Claim BEFORE posting so two cron runs, two apps or a retry cannot both post.
// Keys: remind24:<event>, remind2:<event>, remind30:<event>, result:<match>, alert:<match>:<channel>, board:<channel>, hotw:<week>.
export async function once(env, key) {
  if (!env.DB) return true;
  const r = await env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING').bind(String(key), String(Date.now())).run();
  return (r?.meta?.changes ?? 1) > 0; // D1 always reports changes; a stub without it counts as a win
}

// Gives a claim back after a failed post so the next run can try again (a claim that never posted must not swallow the output).
export async function unclaim(env, key) {
  if (env.DB) await env.DB.prepare('DELETE FROM meta WHERE key = ?').bind(String(key)).run();
}
