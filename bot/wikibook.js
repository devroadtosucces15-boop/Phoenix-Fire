// PF-024 Item 13 – the Phoenix wiki book: ONE helper for all five bots (/wiki), shown as a book. Interactions only.
//   • A spread = two text pages in one private message: the LEFT page says what a thing is and where it fits (purpose, who can use it,
//     step-by-step guides), the RIGHT page says how to use it (choices, fields, tips, related questions). ◀ ▶ turn the pages.
//   • Nothing is written twice: the pages come from bot/help.js (hand-written guides and tips, kept in one place) and the live command
//     definitions (bot/commanddefs.js, the same source the registry and Discord use), and the Q&A reuses the server navigator's wiki
//     (wikiEntries in bot/navigator.js), so a renamed command or channel cannot drift from the book.
//   • The setup helper (the 🧩 button on a command page): pick a subcommand and the fields you want; the book builds the command line the
//     way Discord needs it, ready to copy. Discord cannot fill the command box for you, so the line is shown, not sent.
//   • /corehelp /statshelp /toolshelp /matchdayhelp /rushhelp open this book on their own bot once the flag is on (bot/worker.js).
// Component ids: norex:wiki:<bot|hub>:<page|j>[:<tag>[:<sub>]]  – j = the jump list, tags b n c f s p h u o.
import { can, flagOn } from './roles.js';
import { message, header, text, sep, footer, button, buttons, cards, notice, reply, bannerUrl } from './ui.js';
import { orgName } from './orgconfig.js';
import { BOTS, defOf, who as whoCan, plain, clip, pagesFor, HELP_COMMANDS } from './help.js';
import { wikiEntries, askWiki, loadMap } from './navigator.js';

export const WIKI_COMMANDS = new Set(['wiki']);
export const WIKI_ID = /^norex:wiki:(hub|core|stats|tools|matchday|rush):(\d+|j)(?::([a-z]))?(?::(\d+|-))?$/;
export const BOT_KEYS = Object.keys(BOTS);
const HELP_OF = Object.fromEntries(Object.entries(HELP_COMMANDS).map(([c, k]) => [k, c]));
const HALF = 1500; // each page of the spread; Discord allows 4000 text characters in the whole message

const id = (key, n, tag = '', sub = '') => `norex:wiki:${key}:${Math.max(0, n)}${tag ? `:${tag}` : ''}${sub !== '' ? `:${sub}` : ''}`;
const page = (label, body) => text(`-# ${label}\n${clip(body, HALF)}`);

// ---------- what the book knows ----------
// Guided jobs from the hand-written step-by-step lists, as questions the Q&A can match.
export function flowEntries() {
  return BOT_KEYS.flatMap((k) => BOTS[k].flows.map((f) => ({
    q: `How do I: ${f.title.replace(/\s*\(.*\)$/, '').toLowerCase()}?`,
    a: f.steps.map(([cmd, what], n) => `${n + 1}. \`${cmd}\` – ${what}`).join('\n'),
    k: `${BOTS[k].label} ${f.title} ${f.steps.map(([c]) => c).join(' ')}`,
  })));
}
export async function bookEntries(env, i = null, who = null) {
  let map = null;
  try { map = env.DB ? await loadMap(env) : null; } catch { map = null; }
  const viewer = { staff: !!who && can(who, 'navigator.manage'), roleIds: i?.member?.roles ?? [] };
  return [...flowEntries(), ...wikiEntries(map, viewer)];
}

// Subcommands the setup helper can offer. A group's subcommands are flattened as "group sub".
export function subsOf(c) {
  const out = [];
  for (const o of c.options ?? []) {
    if (o.type === 1) out.push({ name: o.name, description: o.description, options: o.options ?? [] });
    else if (o.type === 2) for (const s of o.options ?? []) out.push({ name: `${o.name} ${s.name}`, description: s.description, options: s.options ?? [] });
  }
  return out;
}
const fieldsOf = (c, sub) => (sub ? sub.options : (c.options ?? []).filter((o) => o.type !== 1 && o.type !== 2));
const hasSetup = (c) => subsOf(c).length > 0 || fieldsOf(c, null).length > 0;
const placeholder = (o) => (o.choices?.length ? `‹${o.choices.map((x) => x.name).join('|').slice(0, 40)}›` : o.type === 6 ? '‹@person›' : o.type === 7 ? '‹#channel›' : o.type === 8 ? '‹@role›' : o.type === 4 || o.type === 10 ? '‹number›' : o.type === 5 ? '‹true|false›' : '‹value›');
// The command line the member would type: required fields always, optional ones when picked.
export function composeCommand(c, sub = null, picks = []) {
  const fields = fieldsOf(c, sub);
  const used = fields.filter((o) => o.required || picks.includes(o.name));
  return `/${c.name}${sub ? ` ${sub.name}` : ''}${used.map((o) => ` ${o.name}:${placeholder(o)}`).join('')}`;
}

// ---------- the pages of a spread ----------
const flowsFor = (key, name) => BOTS[key].flows.filter((f) => f.steps.some(([cmd]) => cmd.startsWith(`/${name}`) || cmd.startsWith(name)));
function faqFor(name, entries) {
  const own = `What does /${name} do?`;
  return askWiki(entries, `${name} ${plain(defOf(name)?.description)}`, 4).filter((e) => e.q !== own).slice(0, 2);
}

function spreadFor(key, p, entries) {
  const bot = BOTS[key];
  if (p.kind === 'contents') {
    const cmds = pagesFor(key).filter((x) => x.kind === 'command');
    return {
      title: `${bot.icon} ${bot.label}`, sub: bot.blurb,
      left: `**What this bot is for**\n${bot.blurb}\n\n**Who it is for**\n${bot.who}\n\n**How to read this book**\nThe left page says what something is and where it fits. The right page says how to use it. ◀ ▶ turn the pages, the list jumps to any command, 🧩 builds a command for you.`,
      right: `**Commands**\n${cmds.map((x) => { const c = defOf(x.name); return `\`/${x.name}\` – ${clip(plain(c.description), 60)}${whoCan(c) === 'Everyone' ? '' : ` *(${whoCan(c).toLowerCase()})*`}`; }).join('\n')}`,
    };
  }
  if (p.kind === 'flows') {
    const flows = bot.flows.map((f) => `**${f.title}**\n${f.steps.map(([cmd, what], n) => `**${n + 1}.** \`${cmd}\` – ${what}`).join('\n')}`);
    const cut = Math.ceil(flows.length / 2);
    return { title: 'Step by step', sub: 'Some jobs need more than one command. Do them in this order.', left: flows.slice(0, cut).join('\n\n'), right: flows.slice(cut).join('\n\n') || '**Good to know**\nEach step names the command to run. Open that command in the book for every choice it has.' };
  }
  const c = defOf(p.name);
  const subs = (c.options ?? []).filter((o) => o.type === 1 || o.type === 2);
  const fields = (c.options ?? []).filter((o) => o.type !== 1 && o.type !== 2);
  const flows = flowsFor(key, p.name);
  const faq = faqFor(p.name, entries);
  return {
    title: `/${c.name}`, sub: `${whoCan(c)} · ${plain(c.description)}`,
    left: [`**What it is**\n${plain(c.description)}`, `**Who can use it**\n${whoCan(c)}`, flows.length ? `**Where it fits**\n${flows.map((f) => `${f.title}\n${f.steps.map(([cmd, what], n) => `${n + 1}. \`${cmd}\` – ${clip(what, 70)}`).join('\n')}`).join('\n\n')}` : null].filter(Boolean).join('\n\n'),
    right: [
      subs.length ? `**Choose one**\n${subs.map((s) => `• \`/${c.name} ${s.name}\` – ${plain(s.description)}`).join('\n')}` : fields.length ? `**What you can fill in**\n${fields.map((o) => `• \`${o.name}\`${o.required ? ' (needed)' : ''} – ${plain(o.description)}`).join('\n')}` : 'Just run it, there is nothing to fill in.',
      bot.tips[p.name] ? `**Good to know**\n${bot.tips[p.name]}` : null,
      faq.length ? `**Related questions**\n${faq.map((e) => `**${e.q}**\n${clip(e.a, 160)}`).join('\n')}` : null,
    ].filter(Boolean).join('\n\n'),
  };
}

// ---------- the setup helper ----------
function setupSpread(c, sub, picks) {
  const subs = subsOf(c), fields = fieldsOf(c, sub);
  const line = composeCommand(c, sub, picks);
  const need = fields.filter((o) => o.required);
  return {
    title: `🧩 Setup helper · /${c.name}`, sub: 'Pick what you want. The book builds the command line.',
    left: [
      subs.length ? `**1. Choose one**\n${sub ? `You picked \`${sub.name}\` – ${plain(sub.description)}` : 'Pick what you want to do from the first list.'}` : '**What you can fill in**',
      fields.length ? `**${subs.length ? '2. ' : ''}Fields**\n${fields.map((o) => `• \`${o.name}\`${o.required ? ' (needed, already included)' : ''} – ${plain(o.description)}`).join('\n')}` : subs.length && !sub ? null : 'This one has nothing to fill in.',
    ].filter(Boolean).join('\n\n'),
    right: `**Your command**\n\`\`\`\n${line}\n\`\`\`\nType it in the message box, then swap each ‹…› for your own value. Discord fills in the choices as you type.${need.length ? `\n\n**Needed:** ${need.map((o) => `\`${o.name}\``).join(', ')}` : ''}`,
  };
}

const select = (custom_id, placeholderText, options, extra = {}) => ({ type: 1, components: [{ type: 3, custom_id, placeholder: placeholderText, options: options.slice(0, 25), ...extra }] });

// ---------- the message ----------
// view: 'p' (the page) or 's' (the setup helper for a command page). sub = index into subsOf(c) or null; picks = chosen optional field names.
export function bookMessage(env, key, index = 0, { view = 'p', sub = null, picks = [], entries = [] } = {}) {
  if (key === 'hub') {
    return message({ accent: 'steel', ephemeral: true, blocks: [
      cards(bannerUrl(env, 'wiki')),
      header({ eyebrow: `${orgName(env)} · Phoenix wiki`, title: '📖 Which bot do you need?', sub: 'One book for all five bots. Open a bot, then turn the pages, or ask a question with /wiki question:', size: 3 }),
      page('◀ LEFT PAGE', BOT_KEYS.map((k) => `${BOTS[k].icon} **${BOTS[k].label}**\n${clip(BOTS[k].blurb, 110)}`).join('\n\n')),
      page('RIGHT PAGE ▶', `**How it works**\nEach bot is a chapter. A chapter starts with a contents page, then step-by-step guides, then one spread for every command.\n\n**Fast ways in**\n• Pick a bot below.\n• \`/wiki question:\` – ask in your own words, for example “how do I log a Rush game”.\n• \`/${HELP_OF.core}\` and the other help commands open the same book.`),
      sep(), footer('Only you can see this book'),
      ...buttons(BOT_KEYS.map((k) => ({ label: BOTS[k].label.replace('Phoenix ', ''), emoji: BOTS[k].icon, id: id(k, 0, 'h') }))),
    ] });
  }
  const pages = pagesFor(key);
  const i = Math.min(Math.max(Number(index) || 0, 0), pages.length - 1), p = pages[i];
  const c = p.kind === 'command' ? defOf(p.name) : null;
  const subs = c ? subsOf(c) : [];
  const setup = view === 's' && c && hasSetup(c);
  const chosen = setup && sub != null && subs[sub] ? subs[sub] : null;
  const s = setup ? setupSpread(c, chosen, picks) : spreadFor(key, p, entries);
  const flowAt = pages.findIndex((x) => x.kind === 'flows');
  const rows = [
    ...buttons([
      button({ label: 'Back', emoji: '◀', id: id(key, i - 1, 'b'), disabled: i === 0 }),
      button({ label: 'Next', emoji: '▶', id: id(key, i + 1, 'n'), disabled: i === pages.length - 1, style: 'brand' }),
      button({ label: 'Contents', emoji: '📖', id: id(key, 0, 'c'), disabled: i === 0 }),
      c && hasSetup(c) ? (setup ? button({ label: 'Back to the page', emoji: '📄', id: id(key, i, 'p') }) : button({ label: 'Setup helper', emoji: '🧩', id: id(key, i, 's') })) : null,
      flowAt >= 0 && !c ? button({ label: 'Step by step', emoji: '🪜', id: id(key, flowAt, 'f'), disabled: i === flowAt }) : null,
      button({ label: 'Other bots', emoji: '🤖', id: id('hub', 0, 'h') }),
    ].filter(Boolean)),
    select(`norex:wiki:${key}:j`, 'Jump to a page…', pages.slice(0, 25).map((x, n) => ({
      label: x.kind === 'contents' ? '📖 Contents' : x.kind === 'flows' ? '🪜 Step by step' : x.title, value: String(n),
      description: x.kind === 'command' ? clip(plain(defOf(x.name).description), 90) : undefined, default: n === i,
    }))),
  ];
  if (setup) {
    if (subs.length) rows.push(select(id(key, i, 'u'), 'What do you want to do?', subs.map((x, n) => ({ label: clip(`${c.name} ${x.name}`, 90), value: String(n), description: clip(plain(x.description), 90), default: n === sub }))));
    const fields = fieldsOf(c, chosen).filter((o) => !o.required);
    if ((!subs.length || chosen) && fields.length) rows.push(select(id(key, i, 'o', sub ?? '-'), 'Add optional fields…', fields.map((o) => ({ label: clip(o.name, 90), value: o.name, description: clip(plain(o.description), 90), default: picks.includes(o.name) })), { min_values: 0, max_values: Math.min(fields.length, 25) }));
  }
  return message({ accent: 'steel', ephemeral: true, blocks: [
    cards(bannerUrl(env, 'wiki')),
    header({ eyebrow: `${orgName(env)} · ${BOTS[key].label} · wiki`, title: s.title, sub: s.sub, size: 3 }),
    page('◀ LEFT PAGE', s.left), page('RIGHT PAGE ▶', s.right),
    sep(), footer(`Page ${i + 1} of ${pages.length} · ${BOTS[key].who} can use these · only you can see this book`),
    ...rows,
  ] });
}

export function answerMessage(env, question, entries) {
  const hits = askWiki(entries, question, 3);
  return message({ accent: 'steel', ephemeral: true, blocks: [
    cards(bannerUrl(env, 'wiki')),
    header({ eyebrow: `${orgName(env)} · Phoenix wiki`, title: 'Your question', sub: clip(question, 90), size: 3 }),
    text(hits.length ? hits.map((e) => `**${e.q}**\n${clip(e.a, 600)}`).join('\n\n') : "I couldn't find that. Open a bot below and look through its pages, or ask a manager."),
    sep(), footer('Answers come from the same command list and server map the bots use'),
    ...buttons([{ label: 'Open the book', emoji: '📖', id: id('hub', 0, 'h') }]),
  ] });
}

// ---------- entry points ----------
const off = (title = 'Not switched on yet', body = 'The Phoenix wiki book is being tested.') => reply(notice(title, body));
export const bookOn = (env, who) => flagOn(env, who, 'wiki');

export async function wikiCommand(i, env, who) {
  if (!bookOn(env, who)) return off();
  const opts = i.data?.options ?? [], bot = opts.find((o) => o.name === 'bot')?.value, q = opts.find((o) => o.name === 'question')?.value;
  if (q) return reply(answerMessage(env, String(q).slice(0, 200), await bookEntries(env, i, who)));
  return reply(bookMessage(env, BOT_KEYS.includes(bot) ? bot : 'hub', 0, { entries: await bookEntries(env, i, who) }));
}
// The five help commands open the book on their own bot when the flag is on.
export async function helpBook(name, i, env, who) {
  const key = HELP_COMMANDS[name];
  return key ? reply(bookMessage(env, key, 0, { entries: await bookEntries(env, i, who) })) : null;
}
export async function wikiButton(i, env, who) {
  if (!bookOn(env, who)) return off('Not switched on yet');
  const m = String(i.data?.custom_id ?? '').match(WIKI_ID);
  if (!m) return null;
  const key = m[1], tag = m[3] ?? '', val = i.data?.values ?? [];
  const n = m[2] === 'j' ? Number(val[0]) : Number(m[2]);
  const entries = await bookEntries(env, i, who);
  let data;
  if (tag === 's') data = bookMessage(env, key, n, { view: 's', entries });
  else if (tag === 'u') data = bookMessage(env, key, n, { view: 's', sub: Number(val[0]), entries });
  else if (tag === 'o') data = bookMessage(env, key, n, { view: 's', sub: m[4] === '-' || m[4] == null ? null : Number(m[4]), picks: val, entries });
  else data = bookMessage(env, key, n, { entries });
  return { type: 7, data };
}
