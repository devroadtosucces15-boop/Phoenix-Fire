// The Worker's KV namespace. A2 alias: PHOENIX_KV is the binding name; NOREX_KV (same namespace id in wrangler.toml)
// is still accepted, so a Worker deployed with only the old binding keeps its cache, live state and post markers.
export const kvOf = (env) => env.PHOENIX_KV ?? env.NOREX_KV ?? null;
