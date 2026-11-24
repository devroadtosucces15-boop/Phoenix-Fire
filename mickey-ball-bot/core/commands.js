import { SlashCommandBuilder } from 'discord.js';
import { BOARD_LIST } from './boards.js';

const lookup = (o) => o.setName('club').setDescription('Club name or EA club ID').setRequired(true);
const tracked = (o) => o.setName('club').setDescription('Tracked club (default: this server\'s club)').setAutocomplete(true);
const stat = (name, desc) => (o) => o.setName(name).setDescription(desc).setRequired(true).setAutocomplete(true);

export const commands = [
  new SlashCommandBuilder().setName('match').setDescription('Find clubs, post match stats, track clubs')
    .addSubcommand((s) => s.setName('search').setDescription('Find clubs by name (or see opponents from its latest matches)').addStringOption(lookup)
      .addBooleanOption((o) => o.setName('opponents').setDescription('List opponents from the latest matches instead')))
    .addSubcommand((s) => s.setName('stats').setDescription('Post a match with Box Score / Club Stats / Players buttons').addStringOption(lookup)
      .addIntegerOption((o) => o.setName('game').setDescription('1 = latest, 2 = the one before, …').setMinValue(1).setMaxValue(10)))
    .addSubcommand((s) => s.setName('track').setDescription('Track a club: its new matches auto-post in a channel (you can track several)').addStringOption(lookup)
      .addChannelOption((o) => o.setName('channel').setDescription('Where its matches post (default: this channel)').addChannelTypes(0, 5)))
    .addSubcommand((s) => s.setName('main').setDescription('Choose which tracked club the stat commands use when you leave club empty').addStringOption(tracked))
    .addSubcommand((s) => s.setName('untrack').setDescription('Stop tracking a club').addStringOption(tracked))
    .addSubcommand((s) => s.setName('list').setDescription('Clubs tracked in this server')),
  new SlashCommandBuilder().setName('club').setDescription('Club record, form and streak').addStringOption(tracked),
  new SlashCommandBuilder().setName('last').setDescription('The latest match with Box Score / Club Stats / Players').addStringOption(tracked),
  new SlashCommandBuilder().setName('results').setDescription('Recent results').addStringOption(tracked)
    .addIntegerOption((o) => o.setName('count').setDescription('How many (max 10)').setMinValue(1).setMaxValue(10)),
  new SlashCommandBuilder().setName('player').setDescription('A player\'s stats card').addStringOption(stat('gamertag', 'Start typing a gamertag')).addStringOption(tracked),
  new SlashCommandBuilder().setName('compare').setDescription('Compare two players')
    .addStringOption(stat('player1', 'First player')).addStringOption(stat('player2', 'Second player')).addStringOption(tracked),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Player leaderboards – any stat, including EA event counters').addStringOption(tracked)
    .addStringOption((o) => o.setName('stat').setDescription('Which leaderboard (you can switch under the board too)').addChoices(...BOARD_LIST.map((b) => ({ name: b.label, value: b.key })))),
  new SlashCommandBuilder().setName('history').setDescription('Record against an opponent').addStringOption(stat('opponent', 'Opponent club name (or part of it)')).addStringOption(tracked),
  new SlashCommandBuilder().setName('insight').setDescription('Form, last 5 or streaks').addStringOption(tracked)
    .addStringOption((o) => o.setName('type').setDescription('Which insight').addChoices(
      { name: 'Club form', value: 'form' }, { name: 'Last 5 matches', value: 'last5' }, { name: 'Streaks', value: 'streaks' })),
  new SlashCommandBuilder().setName('help').setDescription('What this bot can do'),
];

// ---- match days (managers schedule, everyone signs up) ----
const zone = (o) => o.setName('timezone').setDescription('Your time zone, e.g. America/New_York (remembered after the first time)').setAutocomplete(true);
const when = (o) => o.setName('when').setDescription('tonight 9pm · tomorrow 20:30 · fri 8:30pm · oct 14 9pm · in 2h').setRequired(true).setMaxLength(40);
const schedule = (b) => b.addStringOption(when).addStringOption(zone)
  .addIntegerOption((o) => o.setName('players').setDescription('Players needed (default 11)').setMinValue(1).setMaxValue(30))
  .addIntegerOption((o) => o.setName('length').setDescription('Minutes (default 120)').setMinValue(15).setMaxValue(600))
  .addStringOption((o) => o.setName('opponent').setDescription('The club we play').setMaxLength(60))
  .addStringOption((o) => o.setName('notes').setDescription('Lobby info, kit, anything else').setMaxLength(500))
  .addBooleanOption((o) => o.setName('weekly').setDescription('Repeat every week for 4 weeks'))
  .addChannelOption((o) => o.setName('channel').setDescription('Where to post it (default: here)').addChannelTypes(0, 5))
  .addRoleOption((o) => o.setName('ping').setDescription('Role to ping'))
  .addBooleanOption((o) => o.setName('silent').setDescription('Post without pinging anyone'));
const KIND_CHOICES = [{ name: 'League', value: 'league' }, { name: 'Playoffs', value: 'playoffs' }, { name: 'Friendly', value: 'friendly' }, { name: 'Tournament', value: 'tournament' }, { name: 'VPG', value: 'vpg' }];
commands.push(
  schedule(new SlashCommandBuilder().setName('host').setDescription('Schedule a session or friendly, posted with sign-up buttons (who can: /setup)').setDMPermission(false)
    .addStringOption((o) => o.setName('kind').setDescription('A session for us, or a friendly').setRequired(true).addChoices({ name: 'Session', value: 'session' }, { name: 'Friendly', value: 'friendly' }))),
  new SlashCommandBuilder().setName('lineup').setDescription('The lineup for the next match day').setDMPermission(false),
  new SlashCommandBuilder().setName('setlineup').setDescription('Set the lineup for the next match day: pick a formation, then a player for each position').setDMPermission(false),
  new SlashCommandBuilder().setName('suggestlineup').setDescription('A suggested lineup from the sign-ups: their positions first, then match stats').setDMPermission(false),
  new SlashCommandBuilder().setName('link').setDescription('Link your gamertag so the lineup suggester can use your stats').setDMPermission(false).addStringOption(stat('gamertag', 'Start typing your gamertag')),
  new SlashCommandBuilder().setName('setup').setDescription('Roles & permissions: choose which role can run which commands').setDMPermission(false),
  new SlashCommandBuilder().setName('matchday').setDescription('Match days: create one, check in, see the schedule or who is in').setDMPermission(false)
    .addSubcommand((s) => schedule(s.setName('create').setDescription('Schedule a league night, playoffs, friendly, tournament or VPG match')
      .addStringOption((o) => o.setName('kind').setDescription('What kind of match day').setRequired(true).addChoices(...KIND_CHOICES))))
    .addSubcommand((s) => s.setName('checkin').setDescription('Say you are on for the next match day (opens an hour before the start)'))
    .addSubcommand((s) => s.setName('next').setDescription('The next match day – answer ✅ ❔ ❌ right here'))
    .addSubcommand((s) => s.setName('schedule').setDescription('Upcoming match days – answer ✅ ❔ ❌ right here'))
    .addSubcommand((s) => s.setName('who').setDescription('Who is in for the next match day and what is still missing'))
    .addSubcommand((s) => s.setName('cancel').setDescription('Cancel the next match day')),
);

export const commandJson = () => commands.map((c) => c.toJSON());
