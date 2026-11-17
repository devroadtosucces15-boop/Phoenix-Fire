// PF-024 Item 8: duplicate-post fix. once() claims, alert/DM/routing posts happen once, and the alert keeps the Phoenix brand.
import { env, sqlite } from './mock.mjs';
import { t, done } from './lib.mjs';
import { once, unclaim } from '../bot/once.js';
import { matchAlertMessage } from '../bot/matchalert.js';
import { readFileSync } from 'node:fs';

t('once: first claim wins, second loses', (await once(env, 'test:a')) === true && (await once(env, 'test:a')) === false);
await unclaim(env, 'test:a');
t('unclaim: the key can be claimed again', (await once(env, 'test:a')) === true);

const src = (f) => readFileSync(new URL(`../bot/${f}`, import.meta.url), 'utf8');
t('events reminders claim remind24/remind2 and skip fresh events', /once\(env, `\$\{soon \? 'remind2' : 'remind24'\}:\$\{e\.id\}`\)/.test(src('events.js')) && /now - \(e\.at \|\| 0\) < 24 \* HOUR/.test(src('events.js')));
t('DM delivery claims rows with a compare-and-set', /SET dm = 'sending' WHERE id = \? AND dm = 'queued'/.test(src('notify.js')));
t('routing posts once per channel', /posted\.has\(channel\)/.test(src('routing.js')));
t('match alert claims per match and channel; channel from config', /once\(env, key\)/.test(src('matchalert.js')) && /channelsFor\(env, 'match_results'\)/.test(src('matchalert.js')));
t('hotw claims the week', /once\(env, `hotw:\$\{w\.week\}`\)/.test(src('hotw.js')));

const msg = JSON.stringify(matchAlertMessage(env, { opponent: 'X', us: 0, them: 4, line: 'Heavy defeat 0–4' }));
t('alert output carries no NOREX name or red', !/norex|c8352c|080b11/i.test(msg));
done();
