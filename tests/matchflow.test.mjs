// CR-07 / CR-08 / CR-01 (Matchday part): the match-night timeline, /matchday as one command, /lineup in step with /host,
// the six re-homed commands, and the Phoenix theme on every output the flow produces.
import fs from 'node:fs';
import { env } from './mock.mjs';
import { t, done } from './lib.mjs';
import { phaseOf, checkinOpen, canPostLineup, nudgeDue, unconfirmed, inLineup, lineupOpensAt, checkinClosesAt, timelineLine, whyNotOpen, LINEUP_OPEN_MIN, CHECKIN_CLOSE_MIN, MIN } from '../bot/matchflow.js';
import { COMMANDS, APP_COMMANDS, MOVED_FROM } from '../bot/commanddefs.js';
import { appOf, homeOf } from '../bot/apps.js';
import { CHANNEL_PURPOSES } from '../bot/orgconsts.js';
import { CHANNEL_PURPOSE_INFO } from '../bot/orgconfig.js';
import { MATCHDAY_ALIASES } from '../bot/matchday.js';
import { eventMessage, lineupEmbed, checkinMessage } from '../bot/events.js';
import { plainText } from '../bot/ui.js';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const START = Date.parse('2026-12-01T20:00:00Z');
const ev = (over = {}) => ({ id: 7, type: 'league', status: 'scheduled', start: START, duration: 120, formation: '4-3-3', lineup: '{"500":"ST","501":"GK"}', lineup_at: null, ...over });
const at = (minutesBefore) => START - minutesBefore * MIN;

// ---------- the timing windows ----------
t('the window opens 60 minutes before the start and check-in closes 30 minutes before it', LINEUP_OPEN_MIN === 60 && CHECKIN_CLOSE_MIN === 30 && lineupOpensAt(ev()) === at(60) && checkinClosesAt(ev()) === at(30));
t('before −60 the event is waiting; at −60 the lineup window is open', phaseOf(ev(), at(61)) === 'waiting' && phaseOf(ev(), at(60)) === 'lineup' && phaseOf(ev(), at(59)) === 'lineup');
t('a lineup cannot be posted before the window opens, but can from −60', !canPostLineup(ev(), at(61)).ok && canPostLineup(ev(), at(60)).ok && canPostLineup(ev(), at(45)).ok);
t('a lineup posted after −30 is allowed but marked as late for check-in', canPostLineup(ev(), at(20)).ok && canPostLineup(ev(), at(20)).lateForCheckin === true && canPostLineup(ev(), at(45)).lateForCheckin === false);
t('check-in is closed while the lineup window is open and nothing is posted', !checkinOpen(ev(), at(50)));
const posted = ev({ lineup_at: at(50) });
t('check-in starts after the lineup is posted', !checkinOpen(posted, at(55)) && checkinOpen(posted, at(50)) && checkinOpen(posted, at(31)) && phaseOf(posted, at(40)) === 'checkin');
t('check-in closes at the latest 30 minutes before the start', !checkinOpen(posted, at(30)) && phaseOf(posted, at(30)) === 'closed' && phaseOf(posted, at(10)) === 'closed');
t('a lineup posted at −20 never gets a check-in', !checkinOpen(ev({ lineup_at: at(20) }), at(20)) && !checkinOpen(ev({ lineup_at: at(20) }), at(10)));
t('after the start it is live, after the end it is over, a cancelled one is over', phaseOf(posted, START + MIN) === 'live' && phaseOf(posted, START + 121 * MIN) === 'over' && phaseOf(ev({ status: 'cancelled' }), at(40)) === 'over');
t('even a lineup posted before −60 (older data) opens check-in only from −60', !checkinOpen(ev({ lineup_at: at(300) }), at(90)) && checkinOpen(ev({ lineup_at: at(300) }), at(59)));
t('check-in is for the players in the lineup', inLineup(posted, '500') && inLineup(posted, 501) && !inLineup(posted, '999'));
t('who has not confirmed: lineup players with no check-in, in lineup order', unconfirmed(posted, [{ user_id: '500' }]).join() === '501' && unconfirmed(posted, [{ user_id: '999' }]).join() === '500,501' && unconfirmed(posted, [{ user_id: '500' }, { user_id: '501' }]).length === 0);
t('the reminder is due in the last 10 minutes before check-in closes, never before or after', !nudgeDue(posted, at(41)) && nudgeDue(posted, at(40)) && nudgeDue(posted, at(31)) && !nudgeDue(posted, at(30)));
t('the timeline line and the refusal text say the same thing in each phase', /Lineup window opens/.test(timelineLine(ev(), at(90))) && /Check-in is open/.test(timelineLine(posted, at(40))) && /closed/i.test(timelineLine(posted, at(20))) && /lineup has not been posted/.test(whyNotOpen(ev(), at(50))) && /closes 30 minutes before/.test(whyNotOpen(posted, at(20))) && whyNotOpen(posted, at(40)) === null);

// ---------- one command: /matchday, with the old names still working ----------
const md = COMMANDS.find((c) => c.name === 'matchday');
t('/matchday lists create, schedule, who, checkin and lineup', md.options.map((o) => o.name).join() === 'create,schedule,who,checkin,lineup');
t('the old names stay as aliases (status, next, availability, nextevent)', MATCHDAY_ALIASES.status === 'who' && MATCHDAY_ALIASES.next === 'schedule' && MATCHDAY_ALIASES.availability === 'who' && MATCHDAY_ALIASES.nextevent === 'schedule');
t('/host and /lineup stay on the Matchday bot beside /matchday and /matchdayhelp, and nothing else is there', APP_COMMANDS.matchday.join() === 'host,lineup,matchday,matchdayhelp');
t('the botcmds dispatch sends schedule and lineup to the same views as /schedule and /lineup', /MATCHDAY_ALIASES\[sub\?\.name\]/.test(read('bot/botcmds.js')) && /subName === 'schedule' \|\| subName === 'lineup'/.test(read('bot/botcmds.js')));

// ---------- the six commands that moved out of Matchday ----------
t('/absence, /highlight and /birthday are Tools commands', ['absence', 'highlight', 'birthday'].every((n) => appOf(n) === 'tools'));
t('/emoji, /gif and /arcade are Fun commands', ['emoji', 'gif', 'arcade'].every((n) => appOf(n) === 'fun'));
t('each of them remembers Matchday as its old home, so the transition pointer works', ['absence', 'highlight', 'birthday', 'emoji', 'gif', 'arcade'].every((n) => MOVED_FROM[n] === 'matchday'));
const funLive = { ...env, DISCORD_APP_ID_FUN: '1', DISCORD_PUBLIC_KEY_FUN: 'aa', DISCORD_APP_ID_TOOLS: '2', DISCORD_PUBLIC_KEY_TOOLS: 'bb' };
t('once Fun and Tools are configured they answer these commands; before that Matchday or core keeps answering', homeOf(funLive, 'gif') === 'fun' && homeOf(funLive, 'absence') === 'tools');
t('every command is still owned by exactly one app', COMMANDS.every((c) => Object.values(APP_COMMANDS).flat().filter((n) => n === c.name).length === 1));
t('the buttons and cron jobs of the moved commands are keyed by command, not by app, so they still resolve', !/matchday/.test(JSON.stringify(read('bot/absence.js').match(/custom_id|norex:abs[^'"`]*/g) ?? [])));
t('Fun credentials are only named, never written: the secrets registry lists the Fun token by name', /DISCORD_BOT_TOKEN_FUN/.test(read('bot/SECRETS-REGISTRY.md')) && !/DISCORD_BOT_TOKEN_FUN\s*=\s*["'][^"']{20,}/.test(read('LIBRARY/CREDENTIALS.md')));

// ---------- channels come from the Organization config ----------
t('lineup posts and check-in reminders are channel purposes with a description (site and /setup channel both read this list)', CHANNEL_PURPOSES.includes('lineup_posts') && CHANNEL_PURPOSES.includes('checkin_reminders') && /lineup/i.test(CHANNEL_PURPOSE_INFO.lineup_posts) && /confirm/i.test(CHANNEL_PURPOSE_INFO.checkin_reminders));
const events = read('bot/events.js');
t('events.js reads both channels from config and names no channel id', /channelFor\(env, 'lineup_posts'\)/.test(events) && /channelFor\(env, 'checkin_reminders'\)/.test(events) && !/\b\d{17,20}\b/.test(events));
t('a feature with no reminder channel says so to managers', /No check-in reminders channel is set/.test(read('bot/botcmds.js')));
t('matchflow.js hardcodes no channel or role', !/\b\d{17,20}\b/.test(read('bot/matchflow.js')) && !/channel_id|role_id/.test(read('bot/matchflow.js')));

// ---------- the Phoenix theme on every output ----------
const rsvps = [{ status: 'yes', name: 'Player One', user_id: '500' }, { status: 'maybe', name: 'Player Two', user_id: '501' }, { status: 'no', name: 'Player Three', user_id: '502' }];
const post = eventMessage(env, ev({ lineup: null, needs: '{"players":11}' }), rsvps, '', { who: true });
const txt = plainText(post), json = JSON.stringify(post);
t('the /host post uses the match-day layout: PHOENIX FIRE eyebrow, In / Maybe / Out, still needed and the timeline', /PHOENIX FIRE · MATCH DAY/i.test(txt) && /✅ In \(1\)/.test(txt) && /❔ Maybe \(1\)/.test(txt) && /❌ Out \(1\)/.test(txt) && /Still needed/.test(txt) && /Lineup window opens/.test(txt));
t('the /host post names no NOREX and uses the Phoenix accent', !/norex/i.test(txt) && post.components.some((c) => c.accent_color === 0xe8651a) && !/c8352c|200,\s*53|13120556/i.test(json));
const names = new Map([['500', 'Player One'], ['501', 'Player Two']]);
const lineupPost = lineupEmbed(env, ev({ lineup_at: at(50) }), { 500: 'ST', 501: 'GK' }, names, { suggested: false });
t('the lineup post is Phoenix themed and shows the check-in line', /PHOENIX FIRE/.test(plainText(lineupPost)) && /Check-in is/.test(plainText(lineupPost)) && !/norex/i.test(plainText(lineupPost)));
const ci = checkinMessage(env, posted, rsvps, [{ user_id: '500', name: 'Player One' }]);
t('the check-in post lists only the lineup players and says who is not confirmed', /NOT CONFIRMED/.test(plainText(ci)) && !/Player Three/.test(plainText(ci)) && /PHOENIX FIRE/.test(plainText(ci)));
const helpSrc = read('bot/help.js'), hostSrc = read('bot/host.js'), mfSrc = read('bot/matchflow.js');
t('help, host and matchflow carry no NOREX name or red', [helpSrc, hostSrc, mfSrc].every((s) => !/c8352c/i.test(s) && !/NOREX UNITED/i.test(s)));
t('/matchdayhelp teaches the timed flow, the new subcommands and where the moved commands went', /lineup window/i.test(helpSrc) && /\/matchday schedule/.test(helpSrc) && /absence:/.test(helpSrc) && /birthday:/.test(helpSrc));

// ---------- /host confirms the plan ----------
t('/host tells the manager when the lineup window opens and check-in closes', /Lineup window opens/.test(hostSrc) && /closes \$\{flow/.test(hostSrc));

done();
