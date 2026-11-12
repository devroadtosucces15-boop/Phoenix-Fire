// Draft: __NAME__. Shape the message here, draw it with
//   node tools/bot-studio/studio.mjs render tools/bot-studio/drafts/__NAME__.mjs
// and only move it into a bot module once the look is right. Nothing in drafts/ is deployed.
//
// Rules of the Phoenix bot design system (bot/ui.js):
//   · one panel per message: header (eyebrow · title · detail line), body blocks split by sep(), footer, buttons last
//   · stripe colour says what kind of message it is: red (Phoenix orange, default) · gold (honours) · win · loss · steel (staff, private, errors)
//   · grey buttons for normal actions, green only approves, red only rejects or deletes, link buttons last
//   · brand values come from config (orgName(env), config.json), never typed into the module
import { message, header, text, facts, sep, footer, buttons } from '../../../bot/ui.js';

export const meta = { name: '__NAME__', summary: 'One line on what this message is for.', app: 'core', trigger: 'what makes the bot send it', destination: 'announcements' };

const org = 'PHOENIX FIRE'; // in bot code: orgName(env)

export default {
  'main post': message({
    accent: 'red',
    blocks: [
      header({ eyebrow: `${org} · Section`, title: '🔥 Title of the post', sub: 'One grey line of context' }),
      sep(),
      facts([['First fact', 'value'], ['Second fact', 'value']]),
      text('A short paragraph. Keep the whole message well under 4000 characters.'),
      sep(),
      footer('Small print: where the numbers come from, or what to do next'),
      buttons([{ label: 'Do the thing', id: 'pf:__NAME__:go', style: 'ok' }, { label: 'Open on the site', url: 'https://example.com/' }]),
    ],
  }),
  'private confirmation': message({ accent: 'steel', ephemeral: true, blocks: [text('**Done**\nOne line on what happened.')] }),
};
