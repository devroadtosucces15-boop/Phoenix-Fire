// One banner picture for every kind of message the bots send. A plain data module (no Worker or Node imports) shared by
// scripts/cards.mjs (draws each banner once at build time: banner-<name>.png), bot/ui.js (withBanner puts the picture in the panel)
// and the places every message passes through (interaction replies, DMs, channel posts).
//
// Every message has the same shape: stripe, header (eyebrow, title, detail), picture, facts, footer, buttons. A message that
// carries no picture of its own (a score card, a field view, a drawn player) gets the banner of its family, so nothing goes out as
// bare text. Pictures that show data (scripts/cards.mjs score, picture, review, box, player, compare, top-*, club, results) always win.
//
// Wording: eyebrow = site name (config), title = the family, sub = one line on what it is. Names, numbers and times stay in the
// message text, never in a fixed picture.

// icon = a key of ICONS in scripts/cards.mjs.
export const BANNER_SPEC = {
  general: { icon: 'flame', title: 'Phoenix Fire', sub: 'Rise. Burn. Repeat.' },
  club: { icon: 'shield', title: 'The club', sub: 'Record, form and results' },
  stats: { icon: 'chart', title: 'Stats', sub: 'The numbers behind the squad' },
  player: { icon: 'player', title: 'Player', sub: 'Form, ratings and history' },
  match: { icon: 'ball', title: 'Match centre', sub: 'Result, ratings and report' },
  rush: { icon: 'bolt', title: 'Rush', sub: '5v5 · the fast lane' },
  queue: { icon: 'people', title: 'Rush queue', sub: 'One lobby searches at a time' },
  lfg: { icon: 'hand', title: 'Need a player', sub: 'Someone is free to play' },
  season: { icon: 'trophy', title: 'Season card', sub: 'The end-of-season stats' },
  event: { icon: 'calendar', title: 'Match night', sub: 'Sessions, answers and line-ups' },
  lineup: { icon: 'pitch', title: 'Line-up', sub: 'Who starts, who is on the bench' },
  trial: { icon: 'search', title: 'Trials', sub: 'Scouting and trial stages' },
  claim: { icon: 'id', title: 'Player claim', sub: 'Link your player to your account' },
  award: { icon: 'trophy', title: 'Awards', sub: 'Honours for the week' },
  badge: { icon: 'medal', title: 'Badges', sub: 'Achievements earned' },
  insight: { icon: 'spark', title: 'Insights', sub: 'What the numbers say' },
  ask: { icon: 'spark', title: 'Ask Phoenix', sub: 'Answers from the club data' },
  help: { icon: 'book', title: 'Help', sub: 'Every command, one menu' },
  staff: { icon: 'gear', title: 'Staff', sub: 'Managers only' },
  setup: { icon: 'gear', title: 'Server setup', sub: 'Channels, roles and switches' },
  remind: { icon: 'bell', title: 'Reminder', sub: 'Something is waiting for you' },
  announce: { icon: 'horn', title: 'Announcement', sub: 'From the managers' },
  feedback: { icon: 'chat', title: 'Feedback', sub: 'Honest, anonymous, useful' },
  idea: { icon: 'bulb', title: 'Ideas', sub: 'Suggestions and replies' },
  request: { icon: 'inbox', title: 'Requests', sub: 'Club and privacy requests' },
  predict: { icon: 'crystal', title: 'Predictions', sub: 'Call it, earn the points' },
  game: { icon: 'pad', title: 'Game update', sub: 'New level, new rules' },
  social: { icon: 'chat', title: 'Messages', sub: 'Mentions, replies and waves' },
  storage: { icon: 'disk', title: 'Storage', sub: 'Media clean-ups' },
  moderation: { icon: 'shield', title: 'Moderation', sub: 'Warnings and mutes' },
  play: { icon: 'board', title: 'Plays', sub: 'Tactics assigned to you' },
  card: { icon: 'id', title: 'Card Studio', sub: 'Your player card' },
  live: { icon: 'antenna', title: 'Live', sub: 'The club is on air' },
  health: { icon: 'pulse', title: 'Bot status', sub: 'Uptime and health' },
  hype: { icon: 'flame', title: 'Hype', sub: 'Get loud, get ready' },
  birthday: { icon: 'cake', title: 'Birthday', sub: 'One of ours' },
  welcome: { icon: 'door', title: 'Welcome', sub: 'New to Phoenix Fire' },
  voice: { icon: 'mic', title: 'Voice recap', sub: 'The session, in a minute' },
  patch: { icon: 'doc', title: 'Patch notes', sub: 'What changed in the game' },
  media: { icon: 'film', title: 'Media', sub: 'Clips, photos and guards' },
  fun: { icon: 'dice', title: 'Phoenix Fun', sub: 'Just for fun' },
  music: { icon: 'note', title: 'Music', sub: 'Now playing' },
  burner: { icon: 'flame', title: 'Burner report', sub: 'Who we are up against' },
  // Alert pictures (drawn by scripts/cards.mjs alertPicture; the title is the picture's alt text).
  matchalert: { icon: 'flame', title: 'Match alert', sub: 'We need to change something' },
  'uptime-down': { icon: 'flame', title: 'Bot is down', sub: 'Something stopped answering' },
  'uptime-up': { icon: 'flame', title: 'Back to normal', sub: 'Everything is answering again' },
  eventcancelled: { icon: 'flame', title: 'Cancelled', sub: 'This session is off' },
  eventsoon: { icon: 'flame', title: 'Starts in 30', sub: 'Get ready · check in now' },
  trialstage: { icon: 'flame', title: 'Trial update', sub: 'A trial moved to a new stage' },
  caution: { icon: 'flame', title: 'Caution', sub: 'A player needs a second look' },
  // Private-reply pictures (drawn by scripts/cards.mjs privatePicture; the title is the picture's alt text).
  'insight-club': { icon: 'spark', title: 'Club form', sub: 'What the numbers say' },
  'insight-match': { icon: 'spark', title: 'Latest match', sub: 'The one that just finished' },
  'insight-last5': { icon: 'spark', title: 'Last five', sub: 'How the run is going' },
  'insight-goals': { icon: 'spark', title: 'Goal leaders', sub: 'Who is putting them away' },
  'insight-assists': { icon: 'spark', title: 'Assist leaders', sub: 'Who is setting them up' },
  'insight-rating': { icon: 'spark', title: 'Top rated', sub: 'Form on the pitch' },
  'insight-motm': { icon: 'spark', title: 'Man of the match', sub: 'Who keeps winning it' },
  'me-claim': { icon: 'id', title: 'Claim your player', sub: 'Link your card to the squad' },
  'me-hidden': { icon: 'id', title: 'Card not found', sub: 'Waiting for the next data refresh' },
  intel: { icon: 'crystal', title: 'Club Intelligence', sub: 'Server, site and team' },
  // Automated-post pictures (drawn by scripts/cards.mjs postPicture; the title is the picture's alt text).
  'post-live': { icon: 'antenna', title: 'We are live', sub: 'The club is on air right now' },
  'post-memberlive': { icon: 'antenna', title: 'Member live', sub: 'One of ours just went on air' },
  'post-hype': { icon: 'flame', title: 'Match hype', sub: 'The result, the scorers, the moment' },
  'post-awards': { icon: 'trophy', title: 'Weekly awards', sub: 'Voted by the squad' },
  'post-hotw': { icon: 'film', title: 'Highlight of the week', sub: 'The clip the squad voted for' },
  'post-birthday': { icon: 'cake', title: 'Happy birthday', sub: 'From everyone at the club' },
  'post-welcome': { icon: 'door', title: 'Welcome', sub: 'Glad you are here' },
  'post-patch': { icon: 'doc', title: 'Patch notes', sub: 'What changed in the game' },
  'post-media': { icon: 'disk', title: 'Storage guard', sub: 'Old feed files were cleared' },
  'post-voice': { icon: 'mic', title: 'Quote of the match', sub: 'Best line from voice chat' },
  'post-burner': { icon: 'flame', title: 'Burner report', sub: 'Who we are up against' },
  'post-play': { icon: 'board', title: 'New play', sub: 'Learn it, then run it' },
  'post-squad': { icon: 'people', title: 'Rush squads', sub: 'Who plays with who' },
  'post-doc': { icon: 'horn', title: 'Club announcement', sub: 'Read it, then get on with it' },
  // Slash-reply pictures (drawn by scripts/cards.mjs slashPicture; the title is the picture's alt text).
  'cmd-locked': { icon: 'shield', title: 'Not available', sub: 'Switched off, or not for your role' },
  'cmd-problem': { icon: 'pulse', title: 'Check and try again', sub: 'Nothing was changed' },
  'cmd-empty': { icon: 'inbox', title: 'Nothing here yet', sub: 'It will show up when there is something' },
  'cmd-lineup': { icon: 'pitch', title: 'Line-up', sub: 'Who starts, who is on the bench' },
  'cmd-lineup-none': { icon: 'pitch', title: 'No line-up yet', sub: 'Managers publish it before kick-off' },
  'cmd-host-done': { icon: 'calendar', title: 'Session scheduled', sub: 'Posted with sign-up buttons' },
  'cmd-host-ask': { icon: 'calendar', title: 'One thing to fix', sub: 'The time, the zone or the channel' },
  'cmd-matchday-create': { icon: 'calendar', title: 'Match day set up', sub: 'Sign-ups are open' },
  'cmd-matchday-in': { icon: 'ball', title: 'You are on', sub: 'Checked in for match day' },
  'cmd-matchday-none': { icon: 'calendar', title: 'Nothing scheduled', sub: 'No match day is set yet' },
  'cmd-lfg-post': { icon: 'hand', title: 'Available for Rush', sub: 'Tap I\u2019m in to join' },
  'cmd-lfg-list': { icon: 'people', title: 'Who is free', sub: 'Open Rush calls right now' },
  'cmd-lfg-off': { icon: 'hand', title: 'Call taken down', sub: 'Your availability is off' },
  'cmd-trial': { icon: 'search', title: 'Trial cards', sub: 'Open cards, newest first' },
  'cmd-feedback-sent': { icon: 'chat', title: 'Sent anonymously', sub: 'They will never see who sent it' },
  'cmd-suggest-sent': { icon: 'bulb', title: 'On the board', sub: 'Vote it up in the Squad Hub' },
  'cmd-share-sent': { icon: 'spark', title: 'Sent to the managers', sub: 'It shows up once approved' },
  'cmd-discoveries': { icon: 'spark', title: 'Waiting for you', sub: 'Approve or reject each one' },
  'cmd-wheel-error': { icon: 'dice', title: 'Wheel not ready', sub: 'Give it at least two options' },
  'cmd-tag-post': { icon: 'book', title: 'Saved answer', sub: 'The club\u2019s ready-made reply' },
  'cmd-tag-list': { icon: 'book', title: 'Saved answers', sub: 'Post one with /tag' },
  'cmd-tag-saved': { icon: 'book', title: 'Tag saved', sub: 'Anyone can post it now' },
  'cmd-remind-set': { icon: 'bell', title: 'Reminder set', sub: 'We will ping you when it is due' },
  'cmd-remind-list': { icon: 'bell', title: 'Your reminders', sub: 'Waiting to go off' },
  'cmd-setup-done': { icon: 'gear', title: 'Setup saved', sub: 'Same setting as the Boardroom' },
  'cmd-announce-sent': { icon: 'horn', title: 'Announcement sent', sub: 'Squad Hub bell and Discord DM' },
};

// Slash command → family.
export const BANNER_BY_COMMAND = {
  club: 'club', last: 'match', results: 'club', player: 'player', compare: 'stats', leaderboard: 'stats', history: 'stats', profile: 'player', me: 'player',
  points: 'predict', motm: 'award', awards: 'award', insight: 'insight', ask: 'ask', burner: 'burner', seasoncard: 'season', rushladder: 'rush',
  rush: 'rush', queue: 'queue', lfg: 'lfg', host: 'event', lineup: 'lineup', matchday: 'event', intel: 'stats',
  feedback: 'feedback', suggest: 'idea', share: 'fun', discoveries: 'fun', watch: 'live', tag: 'setup', remind: 'remind', site: 'general', avatarcard: 'card',
  jail: 'fun', wheel: 'fun', trivia: 'fun', panel: 'staff', announce: 'announce', trial: 'trial', setup: 'setup', purge: 'staff', streamalerts: 'live',
  exportcontent: 'staff', profanitysetup: 'moderation', syncroles: 'staff', aispike: 'insight',
  corehelp: 'help', statshelp: 'help', toolshelp: 'help', matchdayhelp: 'help', rushhelp: 'help',
};
// Button / menu custom_id → family (first match wins).
export const BANNER_BY_COMPONENT = [
  [/^norex:help:/, 'help'], [/^norex:(mm|mme|box):/, 'match'], [/^pf:rq/, 'queue'], [/^pf:lfg/, 'lfg'], [/^norex:fun:/, 'fun'], [/^norex:dc:/, 'fun'],
  [/^norex:wl:/, 'live'], [/^norex:sc:/, 'season'], [/^norex:ev:/, 'event'], [/^norex:play:/, 'play'], [/^norex:bn:/, 'burner'], [/^pf:pos/, 'event'],
  [/^norex:mp:q:cards/, 'card'], [/^norex:mp:q:rush/, 'rush'], [/^norex:mp:q:requests/, 'request'], [/^norex:mp:[ar]:claims/, 'claim'],
  [/^norex:mp:[ar]:ideas/, 'idea'], [/^norex:mp:/, 'staff'], [/^norex:pr:/, 'predict'], [/^norex:rm:/, 'remind'],
];
// Direct message (notification type, bot/notify.js TYPES) → family.
export const BANNER_BY_DM = {
  announce: 'announce', claim: 'claim', trial: 'trial', trialstage: 'trialstage', rush: 'rush', lfg: 'lfg', badge: 'badge', request: 'request', idea: 'idea', event: 'event',
  award: 'award', feedback: 'feedback', predict: 'predict', game: 'game', mention: 'social', message: 'social', feed: 'social', storage: 'post-media', queue: 'staff',
  moderation: 'moderation', play: 'play', card: 'card', wave: 'social', remind: 'remind', caution: 'caution', live: 'live', test: 'general',
};
// Automated posts have no command or button: the header's small label (eyebrow) says what they are.
const BY_EYEBROW = [
  [/rush queue|queue/i, 'queue'], [/rush ladder|season/i, 'season'], [/rush|lfg|need a player/i, 'rush'], [/match review|insight/i, 'insight'],
  [/match night|session|event|reminder.*match|check-?in/i, 'event'], [/line-?up/i, 'lineup'], [/match centre|result|match/i, 'match'], [/award|hotw|player of the week/i, 'award'],
  [/live|stream|on air|twitch|youtube/i, 'live'], [/uptime|health|status/i, 'health'], [/birthday/i, 'birthday'], [/welcome|joined|left/i, 'welcome'],
  [/voice|recap/i, 'voice'], [/patch|update notes/i, 'patch'], [/burner/i, 'burner'], [/hype|countdown/i, 'hype'], [/trial/i, 'trial'], [/announce/i, 'announce'],
  [/reminder/i, 'remind'], [/media|clip|photo/i, 'media'], [/profanity|moderation|automod/i, 'moderation'], [/music|dj|now playing/i, 'music'],
  [/feedback/i, 'feedback'], [/idea|suggest/i, 'idea'], [/card/i, 'card'], [/play/i, 'play'], [/help/i, 'help'], [/stat|leaderboard|compare/i, 'stats'], [/club/i, 'club'],
];
export const bannerFromEyebrow = (s) => BY_EYEBROW.find(([re]) => re.test(String(s ?? '')))?.[1] ?? 'general';
export const bannerForCommand = (name) => BANNER_BY_COMMAND[name] ?? 'general';
export const bannerForComponent = (id) => BANNER_BY_COMPONENT.find(([re]) => re.test(String(id ?? '')))?.[1] ?? 'general';
export const bannerForDm = (type) => BANNER_BY_DM[type] ?? 'general';
