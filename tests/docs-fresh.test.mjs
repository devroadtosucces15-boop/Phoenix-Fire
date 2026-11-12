// Step 8: the docs that describe the apps and secrets match the code (so they cannot go stale silently).
import fs from 'node:fs';
import { APP_COMMANDS } from '../bot/commanddefs.js';
import { t, done } from './lib.mjs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const readme = read('bot/README.md'), reg = read('bot/SECRETS-REGISTRY.md'), toml = read('bot/wrangler.toml'), road = read('PLANNING/PHOENIX-ROADMAP.md');
t('the README says the fun app maps 0 commands, as the code does', APP_COMMANDS.fun.length === 0 && /maps \*\*0 commands\*\*/.test(readme));
t('the README lists the real Matchday and Rush commands', APP_COMMANDS.matchday.every((c) => readme.includes(`/${c}`)) && APP_COMMANDS.rush.every((c) => readme.includes(`/${c}`)) && !/\*Planned\.\*/.test(readme));
for (const app of Object.keys(APP_COMMANDS)) {
  const id = toml.match(new RegExp(app === 'core' ? 'DISCORD_APP_ID = "(\\d+)"' : `DISCORD_APP_ID_${app.toUpperCase()} = "(\\d+)"`))?.[1]; // core is the unsuffixed pair
  t(`the secrets registry names the ${app} app id and token`, !!id && reg.includes(id) && reg.includes(`DISCORD_BOT_TOKEN_${app.toUpperCase()}`));
}
t('the roadmap no longer lists MB6 or A9 as still to build', !/Still to build: MB6/.test(road) && /MB6 and A9 done/.test(road));
done();
