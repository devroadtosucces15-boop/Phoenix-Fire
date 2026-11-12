// Step 6: the "no channel set" replies come from channelNotice (Organization config), not from hand-written strings.
import fs from 'node:fs';
import { t, done } from './lib.mjs';

const src = (f) => fs.readFileSync(new URL(`../bot/${f}`, import.meta.url), 'utf8');
const rq = src('rushqueue.js'), sa = src('streamalerts.js');
t('rushqueue imports and calls channelNotice for the queue and the report channels', /channelNotice/.test(rq) && /noChannel\(env, 'rush_queue'\)/.test(rq) && /noChannel\(env, 'rush_queue_reports'\)/.test(rq));
t('rushqueue holds no hand-written "no channel" text any more', !/NO_CHANNEL|No queue channel is set|No staff channel is set/.test(rq));
t('stream alerts ask channelNotice for live_alerts', /channelNotice\(env, 'live_alerts'\)/.test(sa) && !/Pick a channel', 'Choose a channel/.test(sa));
done();
