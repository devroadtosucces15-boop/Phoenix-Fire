// The shared-secret header value for the GIF converter's keyed routes (/api/gif/*): the Actions job (scripts/gif-convert.mjs) and the Worker both derive it from
// DISCORD_CLIENT_SECRET, the same pattern as bot/crawl.js. No imports so the Actions job can load it cheaply.
export async function gifKey(secret) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secret}:phoenix-gif`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
