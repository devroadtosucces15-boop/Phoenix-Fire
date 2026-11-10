// Cron-made fun posts (the daily birthday panel) go out through the fun app's token when it is configured, so the
// buttons come back to fun; without it they stay on core.
import { env, sqlite } from './mock.mjs';
import worker from '../bot/worker.js';
import { t, done } from './lib.mjs';

env.DISCORD_BOT_TOKEN = 'core-tok';
env.DISCORD_GUILD_ID = '9000000001';
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES || '{}'), fun: 'members' });
sqlite.prepare("INSERT INTO meta (key, value) VALUES ('announce_channel', '42420') ON CONFLICT (key) DO UPDATE SET value = excluded.value").run();
const realNow = Date.now, noon = new Date(); noon.setUTCHours(10, 0, 0, 0);
Date.now = () => noon.getTime(); // the cron only posts after 08:00 UTC
const d = noon, md = `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
sqlite.prepare("INSERT INTO users (id, name, first_at, last_at) VALUES ('600', 'Bday', 1, 1)").run();
sqlite.prepare('INSERT INTO profiles (user_id, birthday, updated) VALUES (?, ?, 1)').run('600', md);

const realFetch = globalThis.fetch;
const auths = [];
globalThis.fetch = async (url, init = {}) => {
  if (/discord\.com\/api\/v\d+\/channels\/42420\/messages/.test(String(url))) { auths.push(init.headers?.Authorization); return new Response('{"id":"1"}', { status: 200 }); }
  return realFetch(url, init).catch(() => new Response('{}', { status: 500 }));
};
const run = async (e) => { const p = []; await worker.scheduled({ cron: '*/10 * * * *' }, e, { waitUntil: (x) => p.push(x) }); await Promise.allSettled(p); };
const reset = () => sqlite.prepare("DELETE FROM meta WHERE key = 'fun_birthday_day'").run();

{
  await run(env);
  t('fun app not configured: the birthday post comes from core', auths.join() === 'Bot core-tok');
  reset(); auths.length = 0;
  await run({ ...env, DISCORD_APP_ID_FUN: '300', DISCORD_PUBLIC_KEY_FUN: 'cc' });
  t('fun configured but no token yet: still core', auths.join() === 'Bot core-tok');
  reset(); auths.length = 0;
  await run({ ...env, DISCORD_APP_ID_FUN: '300', DISCORD_PUBLIC_KEY_FUN: 'cc', DISCORD_BOT_TOKEN_FUN: 'fun-tok' });
  t('fun configured with a token: the post comes from fun', auths.join() === 'Bot fun-tok');
}
globalThis.fetch = realFetch; Date.now = realNow;
done();
