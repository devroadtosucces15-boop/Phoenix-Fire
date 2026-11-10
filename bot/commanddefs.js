// The bot's slash command definitions – one list shared by bot/register.mjs (deploy-time registration, a plain Node script)
// and the Worker (the Boardroom's "Sync to Discord" button, bot/botcommands.js). Keep them here, not in either of those.
const SUB = 1, STRING = 3, INTEGER = 4, BOOLEAN = 5, USER = 6, CHANNEL = 7, ROLE = 8, ATTACHMENT = 11;
import { CHANNEL_PURPOSES, PERMISSION_GROUPS } from './orgconsts.js';
const player = (name, description) => ({ type: STRING, name, description, required: true, autocomplete: true });
export const COMMANDS = [
  { name: 'club', description: 'Club record, division and form' },
  { name: 'last', description: 'The latest result' },
  { name: 'results', description: 'Recent results', options: [{ type: INTEGER, name: 'count', description: 'How many (max 10)', min_value: 1, max_value: 10 }] },
  { name: 'player', description: "A player's stats card", options: [player('gamertag', 'Start typing a gamertag')] },
  { name: 'compare', description: 'Compare two players', options: [player('player1', 'First player'), player('player2', 'Second player')] },
  { name: 'site', description: 'Link to the club website' },
  {
    name: 'ask', description: 'Ask the club chatbot a question about our stats (P11.11)',
    options: [{ type: STRING, name: 'question', description: 'e.g. who has the most assists this season?', required: true, max_length: 300 }],
  },
  {
    name: 'insight', description: "The club's latest stat insight (✨ BE9)",
    options: [{ type: STRING, name: 'stat', description: 'Which insight (default: club form)', choices: [
      { name: 'Club form', value: 'club' }, { name: 'Latest match', value: 'match' }, { name: 'Last 5 matches', value: 'last5' }, { name: 'Goals leaders', value: 'goals' },
      { name: 'Assists leaders', value: 'assists' }, { name: 'Rating leaders', value: 'rating' }, { name: 'MOTM leaders', value: 'motm' },
    ] }, { type: STRING, name: 'opponent', description: 'Head to head vs a club we have played', autocomplete: true }],
  },
  // P7.4 – commands that read the member database (bot/botcmds.js)
  { name: 'lineup', description: 'The lineup for the next event' },
  {
    name: 'rush', description: 'Rush results',
    options: [{ type: SUB, name: 'log', description: 'Log a Rush result – a manager confirms it', options: [
      { type: STRING, name: 'opponent', description: 'Opponent club', required: true, max_length: 60 },
      { type: INTEGER, name: 'for', description: 'Our goals', required: true, min_value: 0, max_value: 40 },
      { type: INTEGER, name: 'against', description: 'Their goals', required: true, min_value: 0, max_value: 40 },
      { type: INTEGER, name: 'goals', description: 'Your goals', min_value: 0, max_value: 40 },
      { type: INTEGER, name: 'assists', description: 'Your assists', min_value: 0, max_value: 40 },
      { type: STRING, name: 'date', description: 'YYYY-MM-DD (default: today)', min_length: 10, max_length: 10 },
    ] }],
  },
  { name: 'me', description: 'My verified player card (only you see it)' },
  {
    name: 'leaderboard', description: 'League or Rush leaderboards',
    options: [
      { type: STRING, name: 'mode', description: 'League (EA) or Rush (logged)', choices: ['league', 'rush'].map((v) => ({ name: v === 'league' ? 'League' : 'Rush', value: v })) },
      { type: STRING, name: 'stat', description: 'Which leaderboard', choices: ['goals', 'assists', 'ga', 'rating', 'motm', 'games'].map((v) => ({ name: v === 'ga' ? 'goals + assists' : v, value: v })) },
    ],
  },
  { name: 'profile', description: "A member's profile – player, positions, platforms", options: [{ type: USER, name: 'member', description: 'Whose profile (default: yours)' }] },
  { name: 'awards', description: "This week's award ballot and last week's winners" },
  { name: 'points', description: 'Your total points + breakdown by category (P11.3)' },
  {
    name: 'avatarcard', description: 'Upload your avatar for an AI-styled club background (P11.5)',
    options: [{ type: ATTACHMENT, name: 'image', description: 'Your avatar image (PNG/JPG/WEBP, 8 MB max)', required: true }],
  },
  // P2.5 – only shown to people with Discord's Manage Roles permission (server owner can widen it in Server Settings → Integrations).
  // Club Intelligence – same visibility as /syncroles; the Worker still checks the manager role + `insights` flag.
  { name: 'intel', description: 'Managers: Club Intelligence – server + club analysis with recommendations', default_member_permissions: String(1 << 28), contexts: [0] },
  {
    name: 'burner', description: 'Managers: track burner clubs – search EA, pick one, get stats after every game',
    default_member_permissions: String(1 << 28), contexts: [0],
    options: [
      { type: SUB, name: 'recent', description: 'Pick a burner from the clubs our players are also in – no typing' },
      { type: SUB, name: 'search', description: 'Search EA for a club by name or club ID (leave empty for clubs we played lately)', options: [{ type: STRING, name: 'club', description: 'Club name (or part of it) or club ID', required: false, min_length: 2, max_length: 40 }] },
      { type: SUB, name: 'track', description: 'Track a club right away by exact name or club ID', options: [{ type: STRING, name: 'club', description: 'Exact club name or club ID', required: true, min_length: 2, max_length: 40 }] },
      { type: SUB, name: 'list', description: 'The burner clubs being tracked, with their record' },
      { type: SUB, name: 'remove', description: 'Stop tracking a burner club' },
    ],
  },
  { name: 'syncroles', description: 'Managers: give/remove the ✅ Verified role for every player claim', default_member_permissions: String(1 << 28), contexts: [0] },
  {
    name: 'exportcontent', description: 'Owner: incremental channel history export to DMs',
    default_member_permissions: String(1 << 28), contexts: [0],
    options: [
      { type: CHANNEL, name: 'channel', description: 'Default: current channel' },
      { type: INTEGER, name: 'count', description: 'Messages to scan (max 250)', min_value: 1, max_value: 250 },
      { type: STRING, name: 'mode', description: 'Next older batch or reset', choices: [{name:'Next',value:'next'},{name:'Reset',value:'reset'}] },
      { type: STRING, name: 'type', description: 'Content type', choices: ['all','text','images','videos','audio','documents','attachments'].map(v=>({name:v,value:v})) },
      { type: STRING, name: 'extension', description: 'File extension e.g. pdf', max_length: 12 },
      { type: STRING, name: 'keyword', description: 'Filename keyword', max_length: 80 },
    ],
  },
  { name: 'aispike', description: 'Owner: one-off test of the Workers AI image + text models (P11.1)', default_member_permissions: String(1 << 28), contexts: [0] },
  {
    name: 'profanitysetup', description: 'Owner: create/update the AutoMod profanity rule + alert channel (P11.4)',
    default_member_permissions: String(1 << 28), contexts: [0],
    options: [{ type: CHANNEL, name: 'channel', description: 'Where AutoMod should send violation alerts', required: true }],
  },
  // P11.16 – quick wrappers around features that already exist in the Squad Hub
  {
    name: 'feedback', description: 'Send praise, a tip or a concern to a verified teammate (they never see who sent it)',
    options: [
      { type: USER, name: 'to', description: 'A verified teammate', required: true },
      { type: STRING, name: 'kind', description: 'What kind of message', required: true, choices: [['praise', 'Praise'], ['tip', 'Tip'], ['concern', 'Concern']].map(([value, name]) => ({ name, value })) },
      { type: STRING, name: 'text', description: 'Your message (10+ characters, kept clean)', required: true, min_length: 10, max_length: 500 },
    ],
  },
  {
    name: 'suggest', description: 'Drop an idea in the suggestion box',
    options: [
      { type: STRING, name: 'title', description: 'Short title for the idea', required: true, min_length: 4, max_length: 100 },
      { type: STRING, name: 'body', description: 'More detail (optional)', max_length: 1000 },
      { type: BOOLEAN, name: 'anon', description: "Hide your name from other members (managers still see it)" },
    ],
  },
  {
    name: 'announce', description: 'Managers: send an announcement to every member (Squad Hub bell + Discord DM)',
    default_member_permissions: String(1 << 28), contexts: [0],
    options: [
      { type: STRING, name: 'title', description: 'Announcement title', required: true, min_length: 3, max_length: 200 },
      { type: STRING, name: 'text', description: 'The message', max_length: 1000 },
      { type: BOOLEAN, name: 'ack', description: 'Require everyone to acknowledge it' },
      { type: STRING, name: 'audience', description: 'Who gets it (default: everyone)', choices: ['all', 'managers'].map((v) => ({ name: v === 'all' ? 'Everyone' : 'Managers only', value: v })) },
    ],
  },
  {
    name: 'trial', description: 'Managers: current trial cards, or search by gamertag',
    default_member_permissions: String(1 << 28), contexts: [0],
    options: [{ type: STRING, name: 'gamertag', description: 'Only cards matching this gamertag' }],
  },
  { name: 'motm', description: 'Current Man of the Match vote standing for the latest match' },
  { name: 'history', description: 'Our record against a past opponent', options: [{ type: STRING, name: 'opponent', description: "Opponent club name (or part of it)", required: true }] },
  // Fun for members (bot/fun.js)
  {
    name: 'jail', description: 'Lock a mate up for a daft offence (just for fun)',
    options: [
      { type: USER, name: 'member', description: 'Who is going down', required: true },
      { type: STRING, name: 'reason', description: 'The charge (leave empty for a random one)', max_length: 140 },
      { type: INTEGER, name: 'minutes', description: 'Sentence in minutes (default 30)', min_value: 1, max_value: 120 },
    ],
  },
  {
    name: 'wheel', description: 'Spin a wheel to pick one option',
    options: [
      { type: STRING, name: 'options', description: 'Separate with commas, e.g. Jez, Kruger, Davey', required: true, max_length: 400 },
      { type: STRING, name: 'question', description: 'What the wheel decides, e.g. Who plays GK tonight', max_length: 100 },
    ],
  },
  {
    name: 'share', description: 'Share something worth knowing with the club – a manager approves it first',
    options: [
      { type: STRING, name: 'title', description: 'A short headline', required: true, min_length: 4, max_length: 100 },
      { type: STRING, name: 'tip', description: 'What should we know?', required: true, min_length: 10, max_length: 600 },
      { type: STRING, name: 'link', description: 'A link to back it up (optional)', max_length: 300 },
    ],
  },
  { name: 'discoveries', description: 'Managers: shared tips waiting for approval', default_member_permissions: String(1 << 28), contexts: [0] },
  {
    name: 'watch', description: 'The watch list: latest Pro Clubs videos, and (managers) which creators it follows',
    options: [
      { type: SUB, name: 'latest', description: 'The latest videos the squad follows', options: [{ type: STRING, name: 'topic', description: 'Only one topic', choices: ['builds', 'tactics', 'tips', 'meta', 'news'].map((v) => ({ name: v, value: v })) }] },
      { type: SUB, name: 'add', description: 'Managers: follow a creator', options: [
        { type: STRING, name: 'channel', description: 'Their channel ID (starts with UC…) or channel link', required: true, max_length: 120 },
        { type: STRING, name: 'name', description: 'How to show their name', max_length: 60 },
      ] },
      { type: SUB, name: 'remove', description: 'Managers: stop following a creator', options: [{ type: STRING, name: 'channel', description: 'Channel ID or the name shown in /watch list', required: true, max_length: 120 }] },
      { type: SUB, name: 'list', description: 'Managers: who we follow' },
    ],
  },
  {
    name: 'streamalerts', description: 'Owner: stream and post alerts for the club channel or contributors', default_member_permissions: String(1 << 5), contexts: [0],
    options: [
      { type: SUB, name: 'add', description: 'Watch a channel – I post once when it goes live or uploads', options: [
        { type: STRING, name: 'source', description: 'Whose channel', required: true, choices: [{ name: 'Main club channel', value: 'main' }, { name: 'Contributor (member channel)', value: 'contributor' }] },
        { type: STRING, name: 'link', description: 'Paste the Twitch, YouTube or Kick channel link', required: true, max_length: 200 },
        { type: CHANNEL, name: 'channel', description: 'Where to post (default: the Alerts channel in Staff Tools)', channel_types: [0, 5] },
        { type: USER, name: 'member', description: 'The contributor (shown as credit, never pinged)' },
        { type: STRING, name: 'name', description: 'How to show the name', max_length: 40 },
        { type: STRING, name: 'what', description: 'What to announce (default: both)', choices: [{ name: 'Live streams and new posts', value: 'both' }, { name: 'Live streams only', value: 'live' }, { name: 'New videos and Shorts only (YouTube)', value: 'posts' }] },
      ] },
      { type: SUB, name: 'list', description: 'Everything being watched' },
      { type: SUB, name: 'remove', description: 'Stop watching a source', options: [{ type: INTEGER, name: 'id', description: 'The number from /streamalerts list', required: true, min_value: 1 }] },
      { type: SUB, name: 'push', description: 'Post the card now – the live card if they are on air, else the channel card', options: [{ type: INTEGER, name: 'id', description: 'The number from /streamalerts list', required: true, min_value: 1 }] },
      { type: SUB, name: 'test', description: 'Show me the alert card (only I see it)', options: [{ type: INTEGER, name: 'id', description: 'The number from /streamalerts list', required: true, min_value: 1 }] },
    ],
  },
  { name: 'trivia', description: 'A football trivia question – points for right answers', options: [{ type: SUB, name: 'play', description: 'Ask a question' }, { type: SUB, name: 'board', description: 'The trivia table' }] },
  // Server tools – the Miona / Carl-bot replacements (bot/servertools.js)
  {
    name: 'setup', description: 'Managers: channels, roles, leave/join alerts, welcome posts and the ping-role panel',
    default_member_permissions: String(1 << 28), contexts: [0],
    options: [
      { type: SUB, name: 'leavelog', description: 'Post leave and join alerts in a channel', options: [{ type: CHANNEL, name: 'channel', description: 'Managers-only channel for the alerts', required: true, channel_types: [0, 5] }] },
      { type: SUB, name: 'welcome', description: 'Welcome new members in a channel', options: [
        { type: CHANNEL, name: 'channel', description: 'Where to welcome them', required: true, channel_types: [0, 5] },
        { type: STRING, name: 'message', description: 'First line – {user} pings them, {name} is their name. Default: "Welcome to the crew, {user}! 👋"', max_length: 300 },
      ] },
      { type: SUB, name: 'pingroles', description: 'Post the 🔔 ping-role buttons (creates the roles if needed)', options: [{ type: CHANNEL, name: 'channel', description: 'Where to post the panel', required: true, channel_types: [0, 5] }] },
      { type: SUB, name: 'channel', description: 'Set which channel a feature posts in (same setting as Boardroom → Organization)', options: [
        { type: STRING, name: 'purpose', description: 'What the channel is for', required: true, choices: CHANNEL_PURPOSES.map((p) => ({ name: p.replaceAll('_', ' '), value: p })) },
        { type: CHANNEL, name: 'channel', description: 'The channel (default: this one)', channel_types: [0, 5] },
      ] },
      { type: SUB, name: 'role', description: 'Map a Discord role to a permission group (same setting as Boardroom → Organization)', options: [
        { type: STRING, name: 'group', description: 'Permission group', required: true, choices: PERMISSION_GROUPS.map((g) => ({ name: g.replaceAll('_', ' '), value: g })) },
        { type: ROLE, name: 'role', description: 'The Discord role', required: true },
      ] },
      { type: SUB, name: 'off', description: 'Switch leave/join alerts or welcome posts off', options: [{ type: STRING, name: 'feature', description: 'Which one', required: true, choices: [{ name: 'Leave/join alerts', value: 'leavelog' }, { name: 'Welcome posts', value: 'welcome' }] }] },
    ],
  },
  {
    name: 'purge', description: 'Managers: delete recent messages in this channel',
    default_member_permissions: String(1 << 28), contexts: [0],
    options: [
      { type: INTEGER, name: 'count', description: 'How many (1–100)', required: true, min_value: 1, max_value: 100 },
      { type: USER, name: 'member', description: 'Only messages from this member' },
    ],
  },
  {
    name: 'tag', description: 'Saved answers (rules, trial info…): post one, or managers keep the list', contexts: [0],
    options: [
      { type: SUB, name: 'post', description: 'Post a saved answer', options: [
        { type: STRING, name: 'name', description: 'Which tag', required: true, autocomplete: true, max_length: 32 },
        { type: USER, name: 'member', description: 'Ping someone with it' },
      ] },
      { type: SUB, name: 'list', description: 'Every saved tag' },
      { type: SUB, name: 'set', description: 'Managers: add or replace a tag', options: [
        { type: STRING, name: 'name', description: 'Short name, e.g. rules or trial-info', required: true, max_length: 32 },
        { type: STRING, name: 'text', description: 'What it says – type \\n for a new line', required: true, max_length: 4000 },
      ] },
      { type: SUB, name: 'delete', description: 'Managers: delete a tag', options: [{ type: STRING, name: 'name', description: 'Which tag', required: true, autocomplete: true, max_length: 32 }] },
    ],
  },
  {
    name: 'remind', description: 'Reminders: set one, or see and cancel the ones waiting', contexts: [0],
    options: [
      { type: SUB, name: 'add', description: 'Set a reminder – e.g. in: 2h, text: join league', options: [
        { type: STRING, name: 'in', description: 'When – 10m, 2h, 1h30m, 1d', required: true, max_length: 40 },
        { type: STRING, name: 'text', description: 'What to remind about', required: true, max_length: 1000 },
        { type: CHANNEL, name: 'channel', description: 'Managers: post it in another channel', channel_types: [0, 5] },
        { type: ROLE, name: 'role', description: 'Managers: ping a role with it' },
      ] },
      { type: SUB, name: 'list', description: 'Your waiting reminders – cancel any of them' },
    ],
  },
  // /panel – the manager panel: everything waiting for a decision, approve / reject in place (bot/panel.js)
  { name: 'panel', description: 'Managers: everything waiting for a decision – approve or reject right here', default_member_permissions: String(1 << 28), contexts: [0] },
  // /host – schedule + post a session or friendly in one go (bot/host.js); times show in everyone's own zone
  {
    name: 'host', description: 'Managers: schedule a League or Rush session or friendly – posted with sign-up buttons',
    default_member_permissions: String(1 << 28), contexts: [0],
    options: [
      { type: STRING, name: 'mode', description: 'League or Rush', required: true, choices: [{ value: 'league', name: '🏆 League' }, { value: 'rush', name: '⚡ Rush' }] },
      { type: STRING, name: 'kind', description: 'A session for us, or a friendly against another club', required: true, choices: [{ value: 'session', name: 'Session' }, { value: 'friendly', name: 'Friendly' }] },
      { type: STRING, name: 'when', description: 'tonight 9pm · tomorrow 20:30 · fri 8:30pm · oct 14 9pm · in 2h', required: true, max_length: 40 },
      { type: STRING, name: 'timezone', description: 'Your time zone (default: the one in your Squad Hub profile)', autocomplete: true, max_length: 64 },
      { type: INTEGER, name: 'players', description: 'Players needed (default 11 League, 5 Rush)', min_value: 1, max_value: 30 },
      { type: INTEGER, name: 'length', description: 'How long, in minutes (default 120 League, 90 Rush)', min_value: 15, max_value: 600 },
      { type: STRING, name: 'opponent', description: 'Friendly: the club we play', max_length: 60 },
      { type: STRING, name: 'notes', description: 'Lobby info, kit, anything else', max_length: 500 },
      { type: BOOLEAN, name: 'weekly', description: 'Repeat every week for 4 weeks' },
      { type: CHANNEL, name: 'channel', description: 'Where to post it (default: here)', channel_types: [0, 5] },
      { type: ROLE, name: 'ping', description: 'Role to ping (default: the Match night / Rush LFG ping role)' },
      { type: BOOLEAN, name: 'silent', description: 'Post without pinging anyone' },
    ],
  },
  // /matchday – the Phoenix Matchday app (bot/matchday.js). Dark until that app is configured (HELD below).
  {
    name: 'matchday', description: 'Match days: create one, check in, and see the schedule or who is in', contexts: [0],
    options: [
      { type: SUB, name: 'create', description: 'Managers: schedule a league night, playoffs, friendly, tournament or VPG match', options: [
        { type: STRING, name: 'kind', description: 'What kind of match day', required: true, choices: [{ value: 'league', name: '🏆 League' }, { value: 'playoffs', name: '🥇 Playoffs' }, { value: 'friendly', name: '🤝 Friendly' }, { value: 'tournament', name: '🏟️ Tournament' }, { value: 'vpg', name: '🎮 VPG' }] },
        { type: STRING, name: 'when', description: 'tonight 9pm · tomorrow 20:30 · fri 8:30pm · oct 14 9pm · in 2h', required: true, max_length: 40 },
        { type: STRING, name: 'timezone', description: 'Your time zone (default: the one in your Squad Hub profile)', autocomplete: true, max_length: 64 },
        { type: INTEGER, name: 'players', description: 'Players needed (default 11)', min_value: 1, max_value: 30 },
        { type: INTEGER, name: 'length', description: 'How long, in minutes (default 120)', min_value: 15, max_value: 600 },
        { type: STRING, name: 'opponent', description: 'The club we play', max_length: 60 },
        { type: STRING, name: 'notes', description: 'Lobby info, kit, anything else', max_length: 500 },
        { type: BOOLEAN, name: 'weekly', description: 'Repeat every week for 4 weeks' },
        { type: CHANNEL, name: 'channel', description: 'Where to post it (default: here)', channel_types: [0, 5] },
        { type: ROLE, name: 'ping', description: 'Role to ping (default: the Match night ping role)' },
        { type: BOOLEAN, name: 'silent', description: 'Post without pinging anyone' },
      ] },
      { type: SUB, name: 'checkin', description: 'Say you are on for tonight (opens an hour before the start)' },
      { type: SUB, name: 'status', description: 'Who is in for the next match day and which positions are missing' },
      { type: SUB, name: 'schedule', description: 'Upcoming match nights – answer ✅ ❔ ❌ right here' },
      { type: SUB, name: 'next', description: 'The single next match night – answer ✅ ❔ ❌ right here' },
      { type: SUB, name: 'who', description: "Who's in for the next event and which positions are missing" },
    ],
  },
  // /lfg – the Phoenix Rush app (bot/lfg.js). Dark until that app is configured (HELD below).
  {
    name: 'lfg', description: 'Looking for Rush players: say you are available, or see who is', contexts: [0],
    options: [
      { type: SUB, name: 'now', description: 'Post that you are available for Rush', options: [
        { type: INTEGER, name: 'minutes', description: 'How long you are around (default 60, max 180)', min_value: 15, max_value: 180 },
        { type: STRING, name: 'note', description: 'Position, mode, anything else', max_length: 80 },
      ] },
      { type: SUB, name: 'cancel', description: 'Take your availability down' },
      { type: SUB, name: 'list', description: 'Who is available for Rush right now' },
    ],
  },
  // /queue – the Rush queue manager (bot/rushqueue.js, PLANNING/RUSH-QUEUE.md). Members use the board's buttons; these are for the line and staff.
  {
    name: 'queue', description: 'The Rush queue: see the line, or (managers) post the board and set it up', contexts: [0],
    options: [
      { type: SUB, name: 'status', description: 'Who is searching and who is next' },
      { type: SUB, name: 'board', description: 'Managers: post a fresh board in the queue channel(s)' },
      { type: SUB, name: 'clear', description: 'Managers: empty the queue' },
      { type: SUB, name: 'remove', description: 'Managers: take a member out of the queue', options: [{ type: USER, name: 'member', description: 'Who', required: true }] },
      { type: SUB, name: 'settings', description: 'Managers: failed-match rule and the green-light timers', options: [
        { type: STRING, name: 'failed_policy', description: 'Where a failed match goes', choices: [{ name: 'Next in line (default)', value: 'next' }, { name: 'Back of the line', value: 'bottom' }] },
        { type: INTEGER, name: 'warn_minutes', description: 'Warn the group after this many minutes at the green light (default 1)', min_value: 1, max_value: 30 },
        { type: INTEGER, name: 'remove_minutes', description: 'Remove the group after this many minutes (default 2)', min_value: 2, max_value: 60 },
      ] },
    ],
  },
  // /board – Rush leaderboard photos for managers (bot/rushscan.js). Dark until the Phoenix Rush app is configured (HELD below).
  {
    name: 'rushladder', description: 'Club Rush ladder: scan a photo, or show the latest', contexts: [0],
    options: [
      { type: SUB, name: 'scan', description: 'Read a photo of the Rush leaderboard, save it and post the insights', options: [
        { type: ATTACHMENT, name: 'image', description: 'Photo or screenshot of the whole leaderboard table', required: true },
      ] },
      { type: SUB, name: 'latest', description: 'Show the last leaderboard post again' },
    ],
  },
  // /seasoncard – the member's end-of-season Rush stats screenshot (bot/rushscan.js). Same flag as the site page: seasonCards.
  {
    name: 'seasoncard', description: 'Your end-of-season Rush stats card: scan a screenshot, or see yours', contexts: [0],
    options: [
      { type: SUB, name: 'scan', description: 'Read your end-of-season Rush stats screenshot – you check it before it is saved', options: [
        { type: ATTACHMENT, name: 'image', description: 'Screenshot of your whole season stats screen', required: true },
      ] },
      { type: SUB, name: 'mine', description: 'Your saved season card and where you rank' },
    ],
  },
  // One help menu per bot (bot/help.js). Discord will not take five commands called /help, so each carries its bot's name.
  { name: 'corehelp', description: 'Help for the Core bot: setup, approvals, announcements, stream alerts', contexts: [0] },
  { name: 'statshelp', description: 'Help for the Stats bot: results, players, leaderboards, season cards', contexts: [0] },
  { name: 'toolshelp', description: 'Help for the Tools bot: feedback, tips, tags, reminders, watch list', contexts: [0] },
  { name: 'matchdayhelp', description: 'Help for the Matchday bot: schedule, sign-ups, check-in, lineup', contexts: [0] },
  { name: 'rushhelp', description: 'Help for the Rush bot: log results, find a game, the queue', contexts: [0] },
];

// ---------- which Discord app owns which command (bot/apps.js) ----------
// Every command in COMMANDS belongs to exactly one app (tests/apps.test.mjs checks). An app that is not configured yet
// lends its commands to core, so a command can sit in its target app before that app exists.
export const APP_COMMANDS = {
  // The five bots (PLANNING/BOT-SPLIT.md): Core = server, site and manager controls · Tools = helpers for members and managers ·
  // Stats = anything that reads numbers · Matchday = running a match night · Rush = 5v5. `fun` is only the old Fun app, kept empty
  // for the transition window (its commands moved to Tools / Stats; MOVED_FROM points people there).
  core: ['syncroles', 'aispike', 'panel', 'announce', 'trial', 'setup', 'purge', 'streamalerts', 'exportcontent', 'profanitysetup', 'corehelp'],
  stats: ['seasoncard', 'club', 'last', 'results', 'player', 'compare', 'leaderboard', 'history', 'insight', 'ask', 'me', 'profile', 'awards', 'points', 'motm', 'burner', 'rushladder', 'statshelp'],
  tools: ['intel', 'feedback', 'suggest', 'share', 'discoveries', 'watch', 'tag', 'remind', 'site', 'avatarcard', 'jail', 'wheel', 'trivia', 'toolshelp'],
  fun: [],
  matchday: ['host', 'lineup', 'matchday', 'matchdayhelp'],
  rush: ['rush', 'lfg', 'queue', 'rushhelp'],
};
// Where a moved command lives until its new app is configured, and for the transition window after (a one-line pointer).
export const MOVED_FROM = {
  host: 'tools', lineup: 'tools', remind: 'tools', rush: 'stats', matchday: 'tools',
  panel: 'tools', announce: 'tools', trial: 'tools', setup: 'tools', purge: 'tools', exportcontent: 'tools', profanitysetup: 'tools',
  site: 'core', awards: 'fun', points: 'fun', jail: 'fun', wheel: 'fun', trivia: 'fun', share: 'fun', discoveries: 'fun', watch: 'fun', avatarcard: 'fun',
};
// New commands that exist only once their app is configured (never lent to core).
export const HELD = new Set(['lfg', 'queue', 'rushladder']);
// Management commands: hidden from non-staff in Discord (Manage Roles bit) on top of the Worker's can() check.
export const STAFF_COMMANDS = ['intel', 'burner', 'syncroles', 'exportcontent', 'aispike', 'profanitysetup', 'announce', 'trial', 'discoveries', 'setup', 'purge', 'panel', 'host', 'rushladder'];

// ---------- per-command settings → what Discord is told ----------
// Who may use a command, as the owner sets it in Boardroom → Bot: guest (anyone in the server) · member · claimed (approved player
// claim) · manager · owner. Discord itself can only hide a command from people without a permission, so manager/owner commands
// get the manager bit (they vanish from members' menus); everything finer is enforced by the Worker when the command is used.
export const MIN_ROLES = ['guest', 'member', 'claimed', 'manager', 'owner'];
const MANAGER_BIT = String(1 << 28);
export const isStaffOnly = (c) => !!c.default_member_permissions;
export function buildRegistration(list, settings = {}) {
  return list
    .filter((c) => settings[c.name]?.enabled !== false)
    .map((c) => {
      const min = settings[c.name]?.min;
      if (STAFF_COMMANDS.includes(c.name) && !c.default_member_permissions) return { ...c, default_member_permissions: MANAGER_BIT, contexts: [0] };
      if (!min || min === 'guest' || min === 'member' || min === 'claimed') return c;
      return { ...c, default_member_permissions: MANAGER_BIT, contexts: [0] };
    });
}
