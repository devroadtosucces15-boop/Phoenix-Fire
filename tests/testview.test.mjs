// PF-024 Item 25 – /testview (bot/testview.js): a manager sees a FAKE, private render of any registered output with the rules applied.
// Guardrails: every registry key either has samples or declares why not; the sample file is current; manager-only and flag-gated; the sandbox env is read-only (SELECT only, no R2/KV/AI,
// fake fetch); every control in a render is disabled and re-keyed; the reply is ephemeral V2 inside Discord's limits with no mentions; Phoenix branding (no NOREX name, colour or crest).
import { env, sqlite } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import { REGISTRY } from '../bot/registry.gen.js';
import { SAMPLES } from '../bot/testview.gen.js';
import { COMMANDS, APP_COMMANDS, STAFF_COMMANDS } from '../bot/commanddefs.js';
import { PERMS } from '../bot/roles.js';
import { plainText } from '../bot/ui.js';
import { sandboxEnv, inert, sampleBlocks, renderTestview, testviewCommand, testviewChoices, testviewButton, TESTVIEW_ID } from '../bot/testview.js';
import { buildSamples, renderSamplesFile, TESTVIEW_FILE } from '../tools/bot-studio/lib/testview.mjs';
import { lintMessage } from '../tools/bot-studio/lib/lint.mjs';
import fs from 'node:fs';

env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), testview: 'managers' });
const MGR = { u: '900', role: 'manager' }, MEMBER = { u: '500', role: 'member' };
const ia = (options) => ({ member: { user: { id: '900' }, roles: [] }, channel_id: 'c1', data: { name: 'testview', options } });
const flatC = (l, o = []) => { for (const c of l ?? []) { o.push(c); flatC(c.components, o); if (c.accessory) o.push(c.accessory); } return o; };
const count = (m) => flatC(m.components).length, chars = (m) => flatC(m.components).filter((c) => c.type === 10).reduce((n, c) => n + c.content.length, 0);

t('the sample file is current (run: node tools/bot-studio/studio.mjs testview)', fs.readFileSync(TESTVIEW_FILE, 'utf8') === renderSamplesFile(buildSamples()));
t('every registry key has samples or a declared reason', REGISTRY.items.every((i) => SAMPLES[i.key]?.variants?.length || (SAMPLES[i.key]?.why ?? '').length > 15));
t('commands, buttons and DMs are mostly previewable', REGISTRY.items.filter((i) => i.kind === 'command' && SAMPLES[i.key].variants).length >= 50);
t('/testview is registered, staff-only, owned by one app, with a permission and a registry entry', COMMANDS.some((c) => c.name === 'testview') && STAFF_COMMANDS.includes('testview') && Object.values(APP_COMMANDS).flat().filter((n) => n === 'testview').length === 1 && PERMS['testview.run'] === 'manager' && REGISTRY.items.some((i) => i.key === 'slash:/testview'));

// sandbox
const sb = sandboxEnv({ ...env, MEDIA: {}, KV: {}, AI: {}, DISCORD_BOT_TOKEN: 'x' });
t('sandbox: reads pass, every write is refused', !!sb.env.DB.prepare('SELECT 1') && ['INSERT INTO x VALUES (1)', 'UPDATE x SET a=1', 'DELETE FROM x', 'DROP TABLE x'].every((q) => { try { sb.env.DB.prepare(q); return false; } catch { return true; } }) && (() => { try { sb.env.DB.batch([]); return false; } catch { return true; } })());
t('sandbox: no storage, AI or token bindings; fetch is fake and records', !sb.env.MEDIA && !sb.env.KV && !sb.env.AI && !sb.env.DISCORD_BOT_TOKEN && (await sb.env.fetch('https://discord.com/api/x', { method: 'POST' })).ok && sb.calls.length === 1);

// controls are inert
const inertList = inert([{ type: 1, components: [{ type: 2, style: 3, label: 'Approve', custom_id: 'norex:emo:ok:5' }, { type: 2, style: 5, label: 'Site', url: 'https://x.test' }] }, { type: 1, components: [{ type: 3, custom_id: 'norex:wiki:1', options: [{ label: 'a', value: 'a' }] }] }]);
t('buttons and menus are disabled and re-keyed to norex:tv:', flatC(inertList).filter((c) => c.type === 2 || c.type === 3).every((c) => c.disabled) && flatC(inertList).filter((c) => c.custom_id).every((c) => TESTVIEW_ID.test(c.custom_id)));
t('a press that slips through only answers "test view"', /test view/i.test(plainText((await testviewButton()).data)));

// command
const base = { output: 'slash:/club' };
const o = (x) => Object.entries(x).map(([name, value]) => ({ name, value }));
await tt('flag off → not switched on; member → managers only', async () => {
  const off = await testviewCommand(ia(o(base)), { ...env, FEATURES: JSON.stringify({ testview: 'off' }) }, MGR);
  const mem = await testviewCommand(ia(o(base)), { ...env, FEATURES: JSON.stringify({ testview: 'members' }) }, MEMBER);
  return /Not switched on/.test(plainText(off.data)) && /Managers only/.test(plainText(mem.data));
});
const sent = [], real = globalThis.fetch; globalThis.fetch = async (u) => { sent.push(String(u)); return real(u); };
const before = JSON.stringify(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()), rows = (n) => sqlite.prepare(`SELECT COUNT(*) c FROM ${n}`).get().c;
const ctrlBefore = rows('output_controls');
let bad = [], rendered = 0;
for (const item of REGISTRY.items) {
  for (let v = 0; v < Math.max(1, SAMPLES[item.key].variants?.length ?? 1); v++) {
    const r = await testviewCommand(ia(o({ output: item.key, variant: String(v) })), env, MGR), m = r.data;
    rendered++;
    const all = JSON.stringify(m.components).replace(/"custom_id":"[^"]*"/g, '');
    const ok = (m.flags & 64) && (m.flags & (1 << 15)) && !m.content && !m.embeds && count(m) <= 40 && chars(m) <= 4000 && m.allowed_mentions?.parse?.length === 0
      && flatC(m.components).filter((c) => c.type === 2 || c.type === 3).every((c) => c.disabled) && flatC(m.components).filter((c) => c.custom_id).every((c) => TESTVIEW_ID.test(c.custom_id))
      && !/norex/i.test(all.replace(/norexunited\.workers\.dev/g, '')) && !/c8352c|080b11/i.test(all) && !/"accent_color":13121836|"accent_color":525073/.test(all);
    if (!ok) bad.push(`${item.key}#${v}`);
  }
}
t(`all ${rendered} renders are ephemeral V2, inside limits, mention-free, inert and Phoenix-branded${bad.length ? ': ' + bad.slice(0, 5) : ''}`, bad.length === 0);
t('rendering wrote nothing and called nothing', rows('output_controls') === ctrlBefore && JSON.stringify(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) === before && !sent.some((u) => /discord\.com/.test(u)));
globalThis.fetch = real;

// content
const head = plainText((await testviewCommand(ia(o({ output: 'slash:/club' })), env, MGR)).data);
t('header says what is simulated, the rules, the blocked check and the footer', /Test view/.test(head) && /Simulating/.test(head) && /Who gets it/.test(head) && /Blocked\?/.test(head) && /Checks/.test(head) && /nothing posted/i.test(head));
t('an output with no sample says "No offline preview" and why', /No offline preview/.test(plainText((await testviewCommand(ia(o({ output: 'job:mediaCron' })), env, MGR)).data)) || /No offline preview/.test(plainText((await testviewCommand(ia(o({ output: REGISTRY.items.find((i) => SAMPLES[i.key].why).key })), env, MGR)).data)));
await tt('a switched-off output shows blocked with the reason', async () => {
  sqlite.prepare("INSERT OR REPLACE INTO output_controls (key, enabled, rules, updated_at, updated_by) VALUES ('slash:/club', 0, '{}', 1, 'x')").run();
  const { resetControlsCache } = await import('../bot/controls.js'); resetControlsCache();
  const txt = plainText((await testviewCommand(ia(o({ output: 'slash:/club' })), env, MGR)).data);
  sqlite.prepare("DELETE FROM output_controls WHERE key = 'slash:/club'").run(); resetControlsCache();
  return /Blocked\?\*\* Yes/.test(txt) && /switched off/.test(txt);
});
t('"as member" shows what that role would get', /Member/.test(plainText((await testviewCommand(ia(o({ output: 'slash:/club', as: 'member' })), env, MGR)).data)));
t('autocomplete lists outputs, and the variants of the chosen one', testviewChoices({ data: { options: [{ name: 'output', value: 'club', focused: true }] } }).length > 0 && testviewChoices({ data: { options: [{ name: 'output', value: Object.keys(SAMPLES).find((k) => SAMPLES[k].variants?.length > 1) }, { name: 'variant', value: '', focused: true }] } }).length > 1);
await tt('a long sample is trimmed to fit one message', async () => {
  const key = Object.keys(SAMPLES).sort((a, b) => JSON.stringify(SAMPLES[b]).length - JSON.stringify(SAMPLES[a]).length)[0];
  const m = await renderTestview(env, REGISTRY.items.find((i) => i.key === key), {});
  return count(m) <= 40 && chars(m) <= 4000;
});
t('classic embeds are redrawn as panels, forms listed as text', sampleBlocks({ kind: 'channel', body: { embeds: [{ title: 'T', description: 'D', color: 15230234 }] } })[0].type === 17 && /Form/.test(plainText({ components: sampleBlocks({ kind: 'modal', body: { title: 'F', components: [{ components: [{ label: 'Name' }] }] } }) })));
t('the generated samples carry no files and no attachment pictures', !/attachment:\/\//.test(fs.readFileSync(TESTVIEW_FILE, 'utf8')));
t('the render lints clean of NOREX leaks', lintMessage((await testviewCommand(ia(o({ output: 'slash:/club' })), env, MGR)).data, { kind: 'private' }).every((x) => !/norex/.test(x.rule)));
done();
