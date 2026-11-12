// Per-bot help menus: /corehelp /statshelp /toolshelp /matchdayhelp /rushhelp. Each bot has its own help command (Discord will
// not take five commands called /help), and each opens the same private, button-driven menu for that bot:
//   ◀ Back · ▶ Next · 📖 Contents · 🪜 Step by step · 🤖 Other bots, plus a "Jump to…" list with a page for every command.
// The command pages are built from the live command definitions (bot/commanddefs.js), so they cannot drift from what Discord
// shows; only the tips and the step-by-step guides below are written by hand.
// Buttons carry norex:help:<bot>:<page>; the list carries norex:help:<bot>:j. Every app answers them (buttons are not filtered by app).
import { COMMANDS, APP_COMMANDS } from './commanddefs.js';
import { message, header, text, sep, footer, button, buttons, cards, bannerUrl } from './ui.js';

export const HELP_BUTTON = /^norex:help:(core|stats|tools|matchday|rush|hub):(\d+|j)(?::[a-z])?$/;
export const HELP_COMMANDS = { corehelp: 'core', statshelp: 'stats', toolshelp: 'tools', matchdayhelp: 'matchday', rushhelp: 'rush' };

const BOTS = {
  core: {
    label: 'Phoenix Core', icon: '🛠️', who: 'Managers and the owner',
    blurb: 'Runs the server and the site: channels and roles, approvals, announcements, stream alerts.',
    flows: [
      { title: 'Set the server up (managers)', steps: [
        ['/setup channel', 'Pick a purpose (announcements, results, reminders…) and the channel it uses.'],
        ['/setup role', 'Say which Discord role is which group (managers, players…).'],
        ['/setup welcome · leavelog', 'Optional: a welcome post, and a log of people leaving.'],
        ['/setup pingroles', 'Posts the ping-role panel so members pick what they get pinged for.'],
        ['/syncroles', 'Gives the ✅ Verified role to every player with an approved claim.'],
      ] },
      { title: 'Stream and post alerts (owner)', steps: [
        ['/streamalerts add', 'Choose the platform, paste the channel link, pick the Discord channel (or a member).'],
        ['/streamalerts test', 'Shows you, privately, what the alert will look like. Nothing is posted.'],
        ['/streamalerts list', 'Shows every source with its number.'],
        ['/streamalerts push', 'Posts right now: the live card if they are on air, otherwise the channel card.'],
        ['/streamalerts remove', 'Stops a source for good. Use the number from the list.'],
      ] },
      { title: 'Clear what is waiting (managers)', steps: [
        ['/panel', 'Everything waiting for a decision. Approve or reject right in the message.'],
        ['/trial', 'Look at current trial cards, or search one by gamertag.'],
      ] },
    ],
    tips: {
      syncroles: 'Run it after players claim their gamertag. It is safe to repeat.',
      panel: 'Only you see it. Decisions apply straight away.',
      announce: 'Reaches the Squad Hub bell and each member by DM. `ack` asks people to confirm they read it.',
      setup: 'Start with `channel`, then `role`. Anything you do not set simply stays off.',
      purge: 'Deletes the most recent messages in the channel you run it in. Pick `member` to only remove theirs.',
      streamalerts: 'Owner only. Use `test` before the first `push`, so you know what members will see.',
      exportcontent: 'Owner only. Sends channel history to your DMs a batch at a time.',
      profanitysetup: 'Owner only. Run it again any time to change the alert channel.',
      aispike: 'Owner only. A one-off check that the AI models answer.',
    },
  },
  stats: {
    label: 'Phoenix Stats', icon: '📊', who: 'Everyone (managers for a few)',
    blurb: 'Everything that reads numbers: results, players, leaderboards, awards, points and the Rush photo scans.',
    flows: [
      { title: 'Your end-of-season Rush card', steps: [
        ['/seasoncard scan', 'Attach a screenshot of your Rush season stats.'],
        ['Check the reading', 'The bot shows what it read. Wrong numbers? Press Edit on the site instead.'],
        ['Save my card', 'Saves it and posts it in the season channel. You have 15 minutes, or press Discard.'],
        ['/seasoncard mine', 'Shows your saved card and where you rank.'],
      ] },
      { title: 'The club Rush ladder (managers)', steps: [
        ['/rushladder scan', 'Attach a photo of the Rush leaderboard.'],
        ['It reads and saves', 'If the photo is clear it saves and posts. If not, it says what to fix and sends you to the site.'],
        ['/rushladder latest', 'Shows the most recent ladder.'],
      ] },
      { title: 'Find a player', steps: [
        ['/player', 'Start typing a gamertag, pick it, get the stats card.'],
        ['/compare', 'Put two players side by side.'],
        ['/profile', 'A member’s positions, platforms and claim.'],
      ] },
      { title: 'Awards and points', steps: [
        ['/awards', 'This week’s ballot and last week’s winners.'],
        ['/motm', 'The Man of the Match vote for the latest game.'],
        ['/points', 'Your total and where it came from.'],
      ] },
      { title: 'Track a burner club (managers)', steps: [
        ['/burner recent', 'Pick from clubs our players also play in, no typing.'],
        ['/burner search', 'Or search EA by name or club ID.'],
        ['/burner track', 'Start tracking, stats arrive after every game.'],
        ['/burner list · remove', 'See what you track, or stop.'],
      ] },
    ],
    tips: {
      leaderboard: '`mode:league` (default) is EA club stats. `mode:rush` is Rush results that managers confirmed.',
      seasoncard: 'Members scan their own card. It is saved only when you press Save.',
      rushladder: 'Managers only. A clear screenshot with every row visible reads best.',
      insight: 'Add an `opponent` to get the head-to-head against a club we have played.',
      ask: 'Ask in plain words, like “who has the most assists?”. It answers from our stats only.',
      me: 'Only you see it.',
      burner: 'Managers only. Burners are tracked separately and never count as official results.',
    },
  },
  tools: {
    label: 'Phoenix Tools', icon: '🧰', who: 'Everyone (managers for a few)',
    blurb: 'Helpers: feedback, tips, saved answers, reminders, the watch list, plus a few fun ones.',
    flows: [
      { title: 'Share something useful', steps: [
        ['/share', 'Give it a title, the tip and an optional link.'],
        ['/discoveries', 'A manager reviews what is waiting and approves it.'],
        ['Approved', 'It shows up for the whole club.'],
      ] },
      { title: 'Saved answers (rules, trial info…)', steps: [
        ['/tag set', 'Managers save an answer under a short name.'],
        ['/tag post', 'Anyone posts it, and can aim it at a member.'],
        ['/tag list · delete', 'Managers see and tidy the list.'],
      ] },
      { title: 'Reminders', steps: [
        ['/remind add', 'Say when (in how long), what, and optionally where and who to ping.'],
        ['/remind list', 'See the ones waiting and cancel any.'],
      ] },
      { title: 'The watch list', steps: [
        ['/watch add', 'Managers add a YouTube channel to follow.'],
        ['/watch latest', 'Anyone sees the newest videos, newest first. Filter by topic.'],
        ['/watch list · remove', 'Managers see who is followed, or drop one.'],
      ] },
    ],
    tips: {
      intel: 'Managers only. Takes a moment, then a private report with recommendations.',
      feedback: 'The teammate never sees who sent it.',
      suggest: 'Tick `anon` to hide your name from the board.',
      avatarcard: 'Attach your avatar and you get an AI-styled club background.',
      jail: 'Just for fun. Nothing happens in the real server.',
      trivia: '`play` for a question, `board` for the scores.',
      wheel: 'Put the options in one line, separated by commas.',
    },
  },
  matchday: {
    label: 'Phoenix Matchday', icon: '📅', who: 'Everyone (managers to create)',
    blurb: 'Running a match night: schedule, sign-ups, check-in and the lineup.',
    flows: [
      { title: 'Run a match night (managers)', steps: [
        ['/matchday create', 'Pick the kind (league, playoffs, friendly, tournament, VPG) and when. It posts with sign-up buttons. For a League or Rush session with a mode, use /host.'],
        ['Players answer', 'Everyone presses ✅ ❔ ❌ on the post, and can add a preferred position.'],
        ['/matchday who', 'See who is in, maybe or out, and which positions are missing.'],
        ['/lineup', 'The lineup for the next event, with a suggested read.'],
        ['/matchday checkin', 'On the night players check in. Managers see who showed.'],
      ] },
      { title: 'As a player', steps: [
        ['/matchday next', 'The next match night, with your answer buttons right there.'],
        ['/matchday schedule', 'The ones after that.'],
        ['/matchday checkin', 'Check in when the window opens.'],
        ['/lineup', 'See where you are playing.'],
      ] },
    ],
    tips: {
      host: 'Managers only. Times show in everyone’s own time zone. Choose League or Rush as the mode.',
      lineup: 'Shows the lineup for the next event.',
      matchday: 'Six parts: `create` and `checkin` run the night, `status` is the quick view, `schedule`, `next` and `who` answer the “when” and “who” questions.',
    },
  },
  rush: {
    label: 'Phoenix Rush', icon: '⚡', who: 'Everyone (managers for a few)',
    blurb: 'Five-v-five: log results, find a game, and run the queue.',
    flows: [
      { title: 'Log a Rush result', steps: [
        ['/rush log', 'Opponent and score. Optional goals, assists and date.'],
        ['A manager confirms', 'Managers’ own logs count straight away; everyone else waits for a manager.'],
        ['Add detail in the Squad Hub', 'Teammates, ratings and a screenshot go on the site.'],
        ['/leaderboard mode:rush', 'Confirmed results feed the Rush leaderboard (Stats bot).'],
      ] },
      { title: 'Find a game', steps: [
        ['/lfg now', 'Say you are free, for how long, with an optional note.'],
        ['/lfg list', 'See who else is looking.'],
        ['/lfg cancel', 'Take yourself off when you are done.'],
      ] },
      { title: 'Run the queue (managers)', steps: [
        ['/queue settings', 'Set what happens to players who fail to show.'],
        ['/queue board', 'Posts the live queue board in the configured channel.'],
        ['/queue status', 'Anyone can see the line.'],
        ['/queue remove · clear', 'Take one player off, or empty the queue.'],
      ] },
    ],
    tips: {
      rush: 'Today the command has `log`. Season scans live in the Stats bot (/seasoncard, /rushladder).',
      lfg: 'Your answer expires. Use `cancel` to leave sooner.',
      queue: 'Everyone can use `status`. The rest is for managers.',
    },
  },
};

// ---------- building the pages for one bot ----------
const defOf = (name) => COMMANDS.find((c) => c.name === name);
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
const who = (c) => (/^Owner:/.test(c.description) ? 'Owner only' : /^Managers?:/.test(c.description) ? 'Managers' : 'Everyone');
const plain = (d) => String(d ?? '').replace(/^(Managers?|Owner):\s*/, '').replace(/\s*\(P\d+\.\d+\)|\s*\(✨ BE9\)/g, '');
const optLine = (o) => `\`${o.name}\`${o.required ? ' (needed)' : ''} – ${plain(o.description)}`;

// What the help poster (scripts/cards.mjs, banner names help-<key>) draws: the app's commands from the live definitions, or the five bots for the hub.
export const HELP_POSTER_KEYS = ['hub', ...Object.keys(BOTS)];
export const HELP_ICON = { hub: 'flame', core: 'gear', stats: 'chart', tools: 'board', matchday: 'calendar', rush: 'bolt' };
export function helpPosterModel(key) {
  if (key === 'hub') return { key, label: 'Which bot do you need?', blurb: 'Phoenix is five bots. Each has its own help command.', who: '', cmds: Object.entries(BOTS).map(([k, b]) => ({ name: `/${Object.keys(HELP_COMMANDS).find((c) => HELP_COMMANDS[c] === k)}`, desc: clip(`${b.label} · ${b.blurb}`, 84), who: b.who })) };
  const bot = BOTS[key];
  return { key, label: bot.label, blurb: bot.blurb, who: bot.who, cmds: APP_COMMANDS[key].filter((n) => !(n in HELP_COMMANDS) && defOf(n)).map((n) => ({ name: `/${n}`, desc: clip(plain(defOf(n).description), 64), who: who(defOf(n)) })) };
}

export function pagesFor(key) {
  if (key === 'hub') return [{ id: 'hub', title: 'Which bot do you need?', kind: 'hub' }];
  const bot = BOTS[key];
  const own = APP_COMMANDS[key].filter((n) => !(n in HELP_COMMANDS));
  const pages = [{ id: 'contents', title: 'Contents', kind: 'contents' }];
  if (bot.flows.length) pages.push({ id: 'flows', title: 'Step by step', kind: 'flows' });
  for (const n of own) if (defOf(n)) pages.push({ id: n, title: `/${n}`, kind: 'command', name: n });
  return pages;
}

function commandBlocks(key, c) {
  const bot = BOTS[key];
  const subs = (c.options ?? []).filter((o) => o.type === 1);
  const opts = (c.options ?? []).filter((o) => o.type !== 1);
  const blocks = [header({ eyebrow: `${bot.label} · help`, title: `/${c.name}`, sub: `${who(c)} · ${plain(c.description)}` })];
  if (subs.length) {
    blocks.push(text(`**Choose one**\n${subs.map((s) => `• \`/${c.name} ${s.name}\` – ${plain(s.description)}${(s.options ?? []).length ? `\n   ${s.options.map(optLine).join('\n   ')}` : ''}`).join('\n')}`));
  } else if (opts.length) {
    blocks.push(text(`**What you can fill in**\n${opts.map((o) => `• ${optLine(o)}`).join('\n')}`));
  } else blocks.push(text('Just run it, there is nothing to fill in.'));
  const inFlow = bot.flows.filter((f) => f.steps.some(([cmd]) => cmd.startsWith(`/${c.name}`) || cmd.startsWith(c.name)));
  if (bot.tips[c.name]) blocks.push(sep(), text(`**Good to know**\n${bot.tips[c.name]}`));
  if (inFlow.length) blocks.push(footer(`Part of: ${inFlow.map((f) => f.title).join(' · ')} (🪜 Step by step)`));
  return blocks;
}

function flowBlocks(key) {
  const bot = BOTS[key];
  const blocks = [header({ eyebrow: `${bot.label} · help`, title: 'Step by step', sub: 'Some jobs need more than one command. Do them in this order.' })];
  bot.flows.forEach((f, k) => {
    if (k) blocks.push(sep());
    blocks.push(text(`**${f.title}**\n${f.steps.map(([cmd, what], n) => `**${n + 1}.** \`${cmd}\` – ${what}`).join('\n')}`));
  });
  return blocks;
}

function contentsBlocks(key, pages) {
  const bot = BOTS[key];
  const cmds = pages.filter((p) => p.kind === 'command');
  const lines = cmds.map((p) => { const c = defOf(p.name); return `\`/${p.name}\` – ${clip(plain(c.description), 70)}${who(c) === 'Everyone' ? '' : ` *(${who(c).toLowerCase()})*`}`; });
  return [
    header({ eyebrow: `${bot.label} · help`, title: `${bot.icon} How ${bot.label} works`, sub: bot.blurb }),
    text('**Getting around**\n◀ ▶ turn the pages in order · 🪜 shows which command comes first · “Jump to…” goes straight to a command · 🤖 switches to another bot’s help. Only you can see this menu.'),
    sep(),
    text(`**Commands**\n${lines.join('\n')}`),
  ];
}

function hubBlocks() {
  return [
    header({ eyebrow: 'Phoenix help', title: '🤖 Which bot do you need?', sub: 'Phoenix is five bots. Each has its own help command, and you can open any of them here.' }),
    text(Object.entries(BOTS).map(([k, b]) => `${b.icon} **${b.label}** – ${b.blurb}\n   \`/${Object.keys(HELP_COMMANDS).find((c) => HELP_COMMANDS[c] === k)}\``).join('\n')),
  ];
}

// ---------- the message ----------
const id = (key, n, tag = '') => `norex:help:${key}:${Math.max(0, n)}${tag ? `:${tag}` : ''}`; // custom ids must be unique in a message, so each button has its own tag

export function helpMessage(key, index = 0, env = null) {
  const pages = pagesFor(key);
  const i = Math.min(Math.max(Number(index) || 0, 0), pages.length - 1);
  const page = pages[i];
  let blocks;
  if (page.kind === 'hub') blocks = hubBlocks();
  else if (page.kind === 'flows') blocks = flowBlocks(key);
  else if (page.kind === 'command') blocks = commandBlocks(key, defOf(page.name));
  else blocks = contentsBlocks(key, pages);
  if (page.kind === 'hub' || page.kind === 'contents') { // the drawn poster of this bot's commands sits under the title; every other page gets the plain help banner
    const poster = cards(bannerUrl(env, `help-${key}`) && { url: bannerUrl(env, `help-${key}`), alt: `${key === 'hub' ? 'The Phoenix bots' : BOTS[key].label}: every command at a glance` });
    if (poster) blocks = [blocks[0], poster, ...blocks.slice(1)];
  }

  const rows = [];
  if (key === 'hub') {
    rows.push(...buttons(Object.entries(BOTS).map(([k, b]) => ({ label: b.label.replace('Phoenix ', ''), emoji: b.icon, id: id(k, 0) }))));
  } else {
    const flowAt = pages.findIndex((p) => p.kind === 'flows');
    rows.push(...buttons([
      button({ label: 'Back', emoji: '◀', id: id(key, i - 1, 'b'), disabled: i === 0 }),
      button({ label: 'Next', emoji: '▶', id: id(key, i + 1, 'n'), disabled: i === pages.length - 1, style: 'brand' }),
      button({ label: 'Contents', emoji: '📖', id: id(key, 0, 'c'), disabled: i === 0 }),
      flowAt >= 0 ? button({ label: 'Step by step', emoji: '🪜', id: id(key, flowAt, 'f'), disabled: i === flowAt }) : null,
      button({ label: 'Other bots', emoji: '🤖', id: id('hub', 0, 'o') }),
    ].filter(Boolean)));
    const options = pages.slice(0, 25).map((p, n) => ({
      label: p.kind === 'contents' ? '📖 Contents' : p.kind === 'flows' ? '🪜 Step by step' : p.title,
      value: String(n),
      description: p.kind === 'command' ? clip(plain(defOf(p.name).description), 90) : undefined,
      default: n === i,
    }));
    rows.push({ type: 1, components: [{ type: 3, custom_id: `norex:help:${key}:j`, placeholder: 'Jump to a command…', options }] });
  }
  const m = message({ accent: 'steel', ephemeral: true, blocks: [...blocks, sep(), footer(key === 'hub' ? 'Pick a bot' : `Page ${i + 1} of ${pages.length} · ${BOTS[key].who} can use these`), ...rows] });
  return m;
}

// /corehelp and friends → a private message. A button or the list → the same message, updated in place.
export function helpCommand(name, env = null) {
  const key = HELP_COMMANDS[name];
  return key ? { type: 4, data: helpMessage(key, 0, env) } : null;
}
export function helpButton(i, env = null) {
  const m = String(i.data?.custom_id ?? '').match(HELP_BUTTON);
  if (!m) return null;
  const key = m[1];
  const n = m[2] === 'j' ? Number(i.data?.values?.[0]) : Number(m[2]);
  return { type: 7, data: helpMessage(key, n, env) };
}
