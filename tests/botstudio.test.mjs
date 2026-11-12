// Bot Studio (tools/bot-studio): the tool used to redesign and add Discord outputs must itself stay right.
// Guards: every command has a captured reply and a dependency map, the checks catch what Discord rejects and
// any NOREX leak, and the snapshot diff reports exactly the output that changed.
import fs from 'node:fs';
import { t, tt, done } from './lib.mjs';
import { COMMANDS } from '../bot/commanddefs.js';
import { CHANNEL_PURPOSES } from '../bot/orgconsts.js';
import { message, header, text, footer, buttons, ACCENT } from '../bot/ui.js';
import { ROOT } from '../tools/bot-studio/lib/model.mjs';
import { studioModel, buildGallery } from '../tools/bot-studio/lib/gallery.mjs';
import { lintMessage, lintRepo, paletteFromUi } from '../tools/bot-studio/lib/lint.mjs';
import { fingerprint, diffSnapshot, normalise } from '../tools/bot-studio/lib/snapshot.mjs';
import { sourceOfCommand, handlersOfId } from '../tools/bot-studio/lib/deps.mjs';

const model = studioModel(), byId = (id) => model.entries.find((e) => e.id === id);
const palette = paletteFromUi(), rules = (b, o) => lintMessage(b, { palette, ...o }).map((i) => i.rule);

// ---- coverage: nothing a member can run is missing from the gallery ----
const missing = COMMANDS.filter((c) => !byId(`slash:/${c.name}`)?.messages.length).map((c) => c.name);
t(`every slash command has a captured reply (missing: ${missing.join(', ') || 'none'} – run: node tools/bot-studio/studio.mjs capture)`, !missing.length);
t('no captured command says it is “not on this bot” (each one is answered by its home app)', !model.entries.some((e) => e.category === 'slash' && JSON.stringify(e.messages).includes('is not on this bot')));
t('automated posts, DMs and images are in the model', ['automated', 'dm', 'image', 'component'].every((c) => model.entries.some((e) => e.category === c)));
t('output IDs are unique', new Set(model.entries.map((e) => e.id)).size === model.entries.length);

// ---- dependency map ----
t('every output names a source file that exists', model.entries.every((e) => !e.deps.source || fs.existsSync(ROOT + e.deps.source)));
t('every listed dependency and test file exists', model.entries.every((e) => [...e.deps.files.map((f) => f.file), ...e.deps.tests].every((f) => fs.existsSync(ROOT + f))));
t('a command in a module command set resolves to that module', sourceOfCommand('jail') === 'bot/fun.js' && sourceOfCommand('corehelp') === 'bot/help.js');
t('a command routed by name resolves through the Worker import', sourceOfCommand('lfg') === 'bot/lfg.js' && sourceOfCommand('queue') === 'bot/rushqueue.js');
t('a button ID resolves to the module that answers it', handlersOfId('pf:rq:join').includes('bot/rushqueue.js') && handlersOfId('norex:fun:bail:1').includes('bot/fun.js'));
const jail = byId('slash:/jail').deps;
t('/jail lists its builder, definition, banner drawer and banner version', ['bot/fun.js', 'bot/commanddefs.js', 'scripts/cards.mjs', 'bot/ui.js'].every((f) => jail.files.some((x) => x.file === f)));
t('/jail checklist warns to keep custom_ids', jail.checklist.some((c) => /custom_id/.test(c)));
const board = byId('auto:rushqueue-busy');
t('the Rush queue board reads its channel by purpose, from the Organization config', board.deps.channels.includes('rush_queue') && CHANNEL_PURPOSES.includes('rush_queue') && board.deps.files.some((f) => f.file === 'bot/orgconfig.js'));
t('every slash output has a verify step in its checklist', model.entries.filter((e) => e.category === 'slash').every((e) => e.deps.checklist.some((c) => c.includes(`verify ${e.id}`))));

// ---- checks: Discord limits ----
const ok = message({ blocks: [header({ eyebrow: 'Phoenix Fire · Test', title: 'Title' }), text('Body'), footer('Small print'), buttons([{ label: 'Go', id: 'pf:x:go' }, { label: 'Site', url: 'https://example.com/' }])] });
t('a message built with bot/ui.js passes clean', lintMessage(ok, { kind: 'channel', palette }).length === 0);
t('text over 4000 characters is an error', rules(message({ blocks: [text('a'.repeat(3900)), text('b'.repeat(200))] })).includes('v2-text'));
t('six buttons in one row is an error', rules({ flags: 1 << 15, components: [{ type: 1, components: Array.from({ length: 6 }, (_, k) => ({ type: 2, style: 2, label: 'b', custom_id: 'pf:x:' + k })) }] }).includes('row-buttons'));
t('a duplicate custom_id is an error', rules({ flags: 1 << 15, components: [{ type: 1, components: [{ type: 2, style: 2, label: 'a', custom_id: 'pf:x:1' }, { type: 2, style: 2, label: 'b', custom_id: 'pf:x:1' }] }] }).includes('custom-id-dup'));
t('content next to a V2 panel is an error', rules({ ...ok, content: 'hello' }).includes('v2-mixed'));
t('a menu with 26 options is an error', rules({ flags: 1 << 15, components: [{ type: 1, components: [{ type: 3, custom_id: 'pf:x:s', options: Array.from({ length: 26 }, (_, k) => ({ label: 'o' + k, value: String(k) })) }] }] }).includes('select-options'));
t('a picture that is not http(s) or an attachment is an error', rules({ flags: 1 << 15, components: [{ type: 12, items: [{ media: { url: 'data:image/png;base64,x' } }] }] }).includes('media-url'));
t('a form title over 45 characters is an error', rules({ custom_id: 'pf:x:m', title: 't'.repeat(46), components: [] }, { kind: 'modal' }).includes('modal-title'));
// ---- checks: branding ----
t('a NOREX name in the text is an error', rules(message({ blocks: [text('Welcome to NOREX UNITED')] })).includes('norex-name'));
t('the norex: prefix inside a custom_id is not a leak (identifier)', !rules(message({ blocks: [text('**Done**'), buttons([{ label: 'Go', id: 'norex:fun:go' }])] })).includes('norex-name'));
t('the NOREX red as a stripe is an error', rules(message({ accent: 0xc8352c, blocks: [text('**x**')] })).some((r) => r === 'norex-colour' || r === 'accent'));
t('a stripe outside the palette is flagged', rules(message({ accent: 0x123456, blocks: [text('**x**')] })).includes('accent'));
t('the palette read from bot/ui.js is the ACCENT set', Object.values(ACCENT).every((c) => palette.includes(c)) && palette.includes(0xe8651a));
t('no captured output shows a NOREX name or colour', !model.entries.some((e) => e.issues.some((i) => /^norex-/.test(i.rule))));
// ---- checks: cross-file ----
const fake = lintRepo({ commands: [{ name: 'ghost', description: 'x' }], appCommands: { core: [], stats: ['other'] }, entries: [], cfg: { brand: { red: '#000000' } } }).map((i) => i.rule);
t('a command owned by no app, a ghost owner and an accent that differs from config are all caught', ['app-owner', 'app-ghost', 'accent-config'].every((r) => fake.includes(r)));
t('the real accent matches config.json brand.red', !model.repo.some((i) => i.rule === 'accent-config'));
t('every command is owned by exactly one app', !model.repo.some((i) => i.rule === 'app-owner' || i.rule === 'app-ghost'));

// ---- snapshot and diff ----
const sample = [{ id: 'a', messages: [{ kind: 'reply', body: ok }] }, { id: 'b', messages: [{ kind: 'reply', body: message({ blocks: [text(`**Kick-off** <t:${Math.floor(Date.now() / 1000)}:R>`)] }) }] }];
const snap = { at: new Date().toISOString(), outputs: fingerprint(sample) };
t('an unchanged set diffs clean', diffSnapshot(snap, structuredClone(sample)).changed.length === 0);
t('a moving clock does not count as a change', JSON.stringify(normalise({ c: '<t:1700000000:R>' })) === JSON.stringify(normalise({ c: '<t:1800000000:R>' })));
const edited = structuredClone(sample); edited[0].messages[0].body = message({ blocks: [header({ eyebrow: 'Phoenix Fire · Test', title: 'New title' }), text('Body'), footer('Small print')] });
const d = diffSnapshot(snap, edited);
t('an edit is reported for that output only', d.changed.length === 1 && d.changed[0].id === 'a' && d.same === 1);
t('the diff shows the old and the new line', d.changed[0].lines.some((l) => /- text: ## Title/.test(l)) && d.changed[0].lines.some((l) => /\+ text: ## New title/.test(l)));
t('new and removed outputs are reported', diffSnapshot(snap, [sample[0], { id: 'c', messages: sample[1].messages }]).added.includes('c') && diffSnapshot(snap, [sample[0]]).removed.includes('b'));

// ---- gallery ----
await tt('the gallery builds as one self-contained page under the 16 MB artifact limit', () => {
  const g = buildGallery({ model });
  return g.stats.entries === model.entries.length && g.fragment.length < 16e6 && !/<img[^>]+src="https?:/.test(g.fragment) && g.fragment.includes('<title>Phoenix Discord Gallery</title>');
});
done();
