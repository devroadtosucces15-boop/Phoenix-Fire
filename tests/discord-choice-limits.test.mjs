// Discord rejects a slash command option with more than 25 fixed choices (HTTP 400 on PUT /commands, which fails the whole bot deploy).
// This walks every registered command in every app and fails on any option over the cap, and checks the /setup purpose picker is typed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APPS, commandsFor, tomlVars } from '../bot/apps.js';
import { buildRegistration } from '../bot/commanddefs.js';
import { CHANNEL_PURPOSES, purposeChoices } from '../bot/orgconsts.js';

let n = 0; const t = (name, ok) => { assert.ok(ok, name); n++; console.log('ok', name); };
const env = tomlVars(fs.readFileSync(new URL('../bot/wrangler.toml', import.meta.url), 'utf8'));
const over = [];
for (const app of APPS) for (const c of buildRegistration(commandsFor(env, app), {})) (function walk(x, path) {
  for (const o of x.options || []) { if ((o.choices || []).length > 25) over.push(`${app}:${path}/${o.name} (${o.choices.length})`); walk(o, `${path}/${o.name}`); }
})(c, c.name);
t('no option has more than 25 fixed choices: ' + over.join(', '), over.length === 0);
t('purposeChoices returns at most 25 and finds a purpose by words', purposeChoices('').length === 25 && purposeChoices('member bios').some((c) => c.value === 'member_bios'));
t('every purpose is reachable by typing its own name', CHANNEL_PURPOSES.every((p) => purposeChoices(p).some((c) => c.value === p)));
console.log(`${n} passed`);
