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
  award: 'award', feedback: 'feedback', predict: 'predict', game: 'game', mention: 'social', message: 'social', feed: 'social', storage: 'storage', queue: 'staff',
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
