// PF-024 Item 25 – /testview (tools app): a manager picks any output from the Control Center registry and sees a FAKE render of it, only for them.
//   - the picture comes from bot/testview.gen.js, the same captured samples the Bot Studio gallery shows (tools/bot-studio/lib/testview.mjs), so command and editor agree;
//   - a header says what is simulated, the rules applied (switch, who gets it, where it goes, whether it would be blocked and why) and the lint warnings;
//   - an output with no sample says "no offline preview" and why (the generator declares a reason for every registry key; tests/testview.test.mjs checks it).
// It NEVER posts to a real channel, DMs a real user, writes a row or spends AI quota: the sample is static data, the rules are read through a read-only sandbox env
// (SELECT only, no R2/KV/AI bindings, a fake fetch that records instead of calling Discord), every button and menu in the render is disabled and re-keyed so pressing it does nothing,
// and the reply is ephemeral with no mentions. Switch: flag `testview` (owner first), permission `testview.run` (manager).
import { can, flagOn, ROLES, ROLE_LABEL } from './roles.js';
import { message, notice, reply, header, text, sep, footer, ACCENT } from './ui.js';
import { REGISTRY } from './registry.gen.js';
import { SAMPLES } from './testview.gen.js';
import { loadControls, decide, normalizeRules, postChannels } from './controls.js';
import { outputChoices } from './controlcenter.js';
import { orgName } from './orgconfig.js';
import { eventMessage, lineupEmbed, checkinMessage } from './events.js';
import { positionPickerMessage, rescheduleMessage } from './hostflow.js';

export const TESTVIEW_COMMANDS = new Set(['testview']);
export const TESTVIEW_ID = /^norex:tv:/;
export const TESTVIEW_FLAG = 'testview';
const IS_V2 = 1 << 15, EPHEMERAL = 64;
const MAX_COMPONENTS = 40, MAX_CHARS = 3900;
const WHY = {
  off: 'the output is switched off in the Control Center', 'denied-member': 'you are on its deny list', 'denied-role': 'one of your roles (or your level) is on its deny list',
  'not-allowed': 'it only goes to the roles and members its allow list names, and you are not one of them', 'denied-channel': 'this channel is on its deny list',
  'wrong-channel': 'it is limited to other channels', 'outside-window': 'it is outside the allowed time window',
};
const KIND_LABEL = { command: 'slash command', component: 'button or menu', automated: 'automated post', scheduled: 'scheduled job', dm: 'direct message', setting: 'setting', dj: 'DJ command', site: 'site section' };
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
const label = (name) => String(name).replace(/\s*\(norex:[^)]*\)/g, ''); // a button's registry name carries its internal id shape: never shown
const userOf = (i) => i.member?.user?.id ?? i.user?.id ?? '';

/** The read-only world a test view runs in: SELECT only, no storage or AI bindings, and a fetch that records the call and never reaches Discord. */
export function sandboxEnv(env) {
  const calls = [];
  const readOnly = (db) => db && {
    prepare(sql) { if (!/^\s*(select|with)\b/i.test(String(sql))) throw new Error('test view sandbox: read-only'); return db.prepare(sql); },
    batch() { throw new Error('test view sandbox: read-only'); }, exec() { throw new Error('test view sandbox: read-only'); }, dump() { throw new Error('test view sandbox: read-only'); },
  };
  const fakeFetch = async (url, init = {}) => { calls.push({ url: String(url), method: init.method ?? 'GET' }); return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }; };
  const safe = { ...env, DB: readOnly(env?.DB), fetch: fakeFetch };
  for (const k of ['MEDIA', 'KV', 'PHOENIX_KV', 'NOREX_KV', 'AI', 'BROWSER', 'DISCORD_BOT_TOKEN', 'DISCORD_TOKEN', 'GITHUB_TOKEN']) delete safe[k];
  return { env: safe, calls };
}

const count = (list) => { let n = 0; for (const c of list ?? []) { if (!c) continue; n += 1 + count(c.components) + (c.accessory ? 1 : 0); } return n; };
const charsOf = (list) => { let n = 0; for (const c of list ?? []) { if (!c) continue; if (c.type === 10) n += (c.content ?? '').length; n += charsOf(c.components) + charsOf(c.accessory ? [c.accessory] : []); } return n; };

/** buttons and menus stay visible but do nothing: disabled and given a harmless id, so a press can never reach a real handler */
export function inert(list, ctr = { n: 0 }) {
  return (list ?? []).filter(Boolean).map((c) => {
    const o = { ...c };
    if (o.type === 2 || o.type === 3 || o.type === 5 || o.type === 6 || o.type === 7 || o.type === 8) { o.disabled = true; if (o.style !== 5) o.custom_id = `norex:tv:x${ctr.n++}`; }
    if (o.components) o.components = inert(o.components, ctr);
    if (o.accessory) o.accessory = inert([o.accessory], ctr)[0];
    return o;
  });
}

const embedToPanel = (e) => {
  const parts = [e.author?.name && `-# ${String(e.author.name).toUpperCase()}`, e.title && `### ${e.title}`, e.description, ...(e.fields ?? []).map((f) => `**${f.name}**\n${f.value}`), e.footer?.text && `-# ${e.footer.text}`].filter(Boolean);
  const blocks = [text(parts.join('\n\n') || '​')];
  const img = e.image?.url ?? e.thumbnail?.url;
  if (img && /^https?:\/\//.test(img)) blocks.push({ type: 12, items: [{ media: { url: img } }] });
  return { type: 17, accent_color: e.color, components: blocks };
};
/** a stored sample body → top-level Components V2 blocks (classic embeds and plain content are redrawn as a panel; a form is listed as text) */
export function sampleBlocks(variant) {
  const b = variant.body ?? {};
  if (variant.kind === 'modal') {
    const fields = (b.components ?? []).flatMap((r) => r.components ?? []).map((f) => `• ${f.label ?? f.custom_id}${f.required === false ? ' (optional)' : ''}`);
    return [{ type: 17, accent_color: undefined, components: [text(`### 📝 Form: ${b.title ?? ''}\n${fields.join('\n') || 'No fields'}`)] }];
  }
  if ((b.flags ?? 0) & IS_V2) return inert(b.components);
  const out = [];
  if (b.content) out.push({ type: 17, components: [text(b.content)] });
  for (const e of b.embeds ?? []) out.push(embedToPanel(e));
  return [...out, ...inert(b.components)];
}
/** keeps the whole reply inside Discord's limits (40 components, 4000 characters of text): drops sample blocks from the end and says so. → { blocks, trimmed } */
export function fit(blocks, reserved) {
  const out = [...blocks]; let trimmed = false;
  while (out.length > 1 && (count(out) + reserved.count > MAX_COMPONENTS || charsOf(out) + reserved.chars > MAX_CHARS)) { out.pop(); trimmed = true; }
  return { blocks: out, trimmed };
}

const describeRules = (r) => {
  const bits = [];
  const n = (a, w) => a.length && bits.push(`${w}: ${a.length}`);
  n(r.allow_roles, 'allowed roles'); n(r.allow_members, 'allowed members'); n(r.allow_levels, 'allowed levels'); n(r.deny_roles, 'denied roles'); n(r.deny_members, 'denied members'); n(r.deny_levels, 'denied levels');
  n(r.allow_channels, 'only in channels'); n(r.deny_channels, 'not in channels');
  if (r.min) bits.push(`lowest site role: ${r.min}`);
  if (r.windows?.length) bits.push(`${r.windows.length} time window${r.windows.length > 1 ? 's' : ''}`);
  return bits.length ? bits.join(' · ') : 'default rules (the feature\'s own permission check decides)';
};

/** the rules applied to this output for this caller: pure reads. → { lines, blocked } */
export async function rulesFor(env, item, control, ctx) {
  const rules = control?.rules ?? normalizeRules({}), lines = [];
  const decided = decide(control, ctx);
  lines.push(`🎚️ **Switch** ${control && control.enabled === false ? 'off in the Control Center' : 'on'}${control ? ' · set in the Control Center' : ' · default (no row)'}`);
  if (item.flag) lines.push(`🏁 **Feature flag** \`${item.flag}\` at **${item.level ?? 'unknown'}** · ${flagOn(env, { role: ctx.level }, item.flag) ? `${ROLE_LABEL[ctx.level] ?? ctx.level} would be let in` : `${ROLE_LABEL[ctx.level] ?? ctx.level} would be turned away`}`);
  lines.push(`👥 **Who gets it** ${describeRules(rules)}${item.recipients ? ` · ${item.recipients}` : ''}`);
  if (item.kind === 'command' || item.kind === 'component') lines.push(`💬 **Reply** ${rules.reply === 'public' ? 'public, in the channel' : rules.reply === 'private' ? 'private (only the person who ran it)' : 'as the command is built (private unless it says otherwise)'}`);
  if (item.kind === 'automated' || item.kind === 'component') {
    const chans = item.purposes?.length ? await postChannels(env, item.key, item.purposes).catch(() => []) : [];
    lines.push(`📍 **Posts to** ${rules.post_channels?.length ? `${rules.post_channels.length} channel(s) set in the Control Center` : chans.length ? `${chans.length} channel(s) from the Organization config (${item.purposes.join(', ')})` : item.purposes?.length ? `nowhere yet: no channel set for ${item.purposes.join(', ')}. The feature says so instead of guessing` : 'where it was triggered'}`);
  }
  if (item.kind === 'dm') {
    const on = Object.entries(rules.methods ?? {}).filter(([, v]) => v).map(([k]) => k);
    lines.push(`📬 **Delivery** ${on.length ? on.join(', ') : 'every method is off'}${rules.windows?.length ? ' · only inside its time windows' : ''}`);
  }
  lines.push(decided.ok ? `✅ **Blocked?** No: ${ROLE_LABEL[ctx.level] ?? ctx.level} passes the rules` : `⛔ **Blocked?** Yes: ${WHY[decided.why] ?? decided.why}`);
  return { lines, blocked: !decided.ok };
}

const lintLines = (lint) => {
  const errs = lint.filter((x) => x.level === 'error'), warns = lint.filter((x) => x.level === 'warn');
  if (!lint.length) return ['🧹 **Checks** clean: inside Discord\'s limits and on the Phoenix design system'];
  return [`🧹 **Checks** ${errs.length} error${errs.length === 1 ? '' : 's'}, ${warns.length} warning${warns.length === 1 ? '' : 's'}`, ...lint.slice(0, 6).map((x) => `${x.level === 'error' ? '⛔' : '⚠️'} ${clip(x.msg, 180)}`), ...(lint.length > 6 ? [`-# …and ${lint.length - 6} more (node tools/bot-studio/studio.mjs check)`] : [])];
};

/** the whole reply for one output (a Components V2 ephemeral message) */

// Live Pro Telemetry Matchday previews for /testview (read-only, zero side effects).
function telemetryVariantsFor(key, env = {}) {
  const eEnv = { ...env, SITE_URL: env?.SITE_URL || 'https://devroadtosucces15-boop.github.io/Phoenix-Fire/', FEATURES: JSON.stringify({ discordRsvp: 'members' }) };
  const start = Date.now() + 7200e3;
  const rsvps = [
    { user_id: '1', name: 'Mateo', status: 'yes', pref_pos: '["LS","RS","CAM"]', signed_in_at: start - 3600e3 },
    { user_id: '2', name: 'Diego', status: 'yes', pref_pos: '["LS","RS"]', signed_in_at: start - 3200e3 },
    { user_id: '3', name: 'Carlos', status: 'yes', pref_pos: '["CAM","LM"]', signed_in_at: start - 2800e3 },
    { user_id: '4', name: 'Julian', status: 'yes', pref_pos: '["GK"]', signed_in_at: start - 2000e3 },
    { user_id: '5', name: 'Alex', status: 'maybe', pref_pos: null },
    { user_id: '6', name: 'Jay', status: 'no', pref_pos: null },
  ];
  const baseEv = { id: 99, type: 'league', start, duration: 240, formation: '3-5-2 (CAM)', status: 'scheduled' };
  const lineup = { '1': 'LS', '2': 'RS', '3': 'CAM', '4': 'GK' };
  const names = new Map(rsvps.map((r) => [r.user_id, r.name]));
  if (key === 'slash:/host') {
    return [
      { label: 'Pro Telemetry · Roll Call (3-5-2 CAM)', kind: 'message', lint: [], body: eventMessage(eEnv, baseEv, rsvps) },
      { label: 'Pro Telemetry · Sign-Ups Closed', kind: 'message', lint: [], body: eventMessage(eEnv, { ...baseEv, signup_closed_at: Date.now() }, rsvps) },
      { label: 'Pro Telemetry · Position Picker (3-5-2 CAM)', kind: 'message', lint: [], body: positionPickerMessage(99, '3-5-2 (CAM)', ['LS', 'CAM']) },
      { label: 'Pro Telemetry · Incremental Reschedule', kind: 'message', lint: [], body: rescheduleMessage(99, start) },
    ];
  }
  if (key === 'slash:/lineup') {
    return [
      { label: 'Pro Telemetry · Provisional Lineup Call', kind: 'message', lint: [], body: lineupEmbed(eEnv, baseEv, lineup, names, { suggested: true, bench: [{ rank: 5, name: 'Alex', status: 'maybe' }] }) },
      { label: 'Pro Telemetry · Official Final XI', kind: 'message', lint: [], body: lineupEmbed(eEnv, baseEv, lineup, names, { suggested: false, bench: [] }) },
    ];
  }
  if (key === 'slash:/matchday') {
    return [
      { label: 'Pro Telemetry · Lobby Check-In', kind: 'message', lint: [], body: checkinMessage(eEnv, baseEv, rsvps, [{ user_id: '1', name: 'Mateo', state: 'ready' }, { user_id: '3', name: 'Carlos', state: 'late' }], { soon: true }) },
    ];
  }
  return [];
}

export async function renderTestview(env, item, { variant = 0, role = 'manager', userId = '', roleIds = [], channelId = '' } = {}) {
  const sb = sandboxEnv(env), safe = sb.env;
  const control = (await loadControls(safe).catch(() => new Map())).get(item.key) ?? null;
  const ctx = { userId, roleIds, level: role, channelId };
  const extraVars = telemetryVariantsFor(item.key, env);
  const sample = extraVars.length ? { ...(SAMPLES[item.key] ?? {}), variants: [...extraVars, ...(SAMPLES[item.key]?.variants ?? [])] } : SAMPLES[item.key];
  const { lines, blocked } = await rulesFor(safe, item, control, ctx);
  const v = sample?.variants?.[Math.min(Math.max(Number(variant) || 0, 0), (sample?.variants?.length ?? 1) - 1)];
  const sim = `${KIND_LABEL[item.kind] ?? item.kind} · ${label(item.name)}${v ? ` · sample “${v.label}”` : ''} · as ${ROLE_LABEL[role] ?? role}`;
  const head = [
    header({ eyebrow: `${orgName(env)} · Test view`, title: `🧪 ${clip(label(item.name), 80)}`, sub: 'Nothing was sent, saved or spent: this is a fake render only you can see', size: 3 }),
    text(`🎭 **Simulating** ${sim}`), sep(), text(lines.join('\n')),
  ];
  if (!v) {
    head.push(sep(), text(`🚫 **No offline preview** ${clip(sample?.why ?? 'This output has no sample.', 600)}`), footer('Test view · nothing posted, no DM, nothing saved, no AI used'));
    return message({ accent: 'red', ephemeral: true, blocks: head });
  }
  head.push(sep(), text(lintLines(v.lint).join('\n')));
  if (v.dropped) head.push(text(`-# ${v.dropped} picture${v.dropped > 1 ? 's' : ''} drawn by the card studio ${v.dropped > 1 ? 'are' : 'is'} left out of the preview`));
  if (blocked) head.push(text('-# The render below is shown anyway so you can see what a member would get when the rules let them in'));
  head.push(sep(), text(`-# SAMPLE · buttons and menus are switched off · ${sample.variants.length > 1 ? `variant ${sample.variants.indexOf(v) + 1} of ${sample.variants.length} (pick another with the variant option)` : 'the only variant'}`));
  const panel = { type: 17, accent_color: ACCENT.red, components: head.filter(Boolean) };
  const reserved = { count: count([panel]) + 2, chars: charsOf([panel]) + 160 };
  const { blocks, trimmed } = fit(sampleBlocks(v), reserved);
  const tail = text(`-# Test view · fake render, nothing posted, no DM, nothing saved, no AI used${trimmed ? ' · the sample was shortened to fit one message' : ''}`);
  return { flags: IS_V2 | EPHEMERAL, components: [panel, ...blocks, tail], allowed_mentions: { parse: [] } };
}

/** autocomplete: the output (reuses the /setup picker over the registry) or the variants of the chosen output */
export function testviewChoices(i) {
  const opts = i.data?.options ?? [], focused = opts.find((o) => o.focused);
  if (focused?.name === 'variant') {
    const key = opts.find((o) => o.name === 'output')?.value, extra = telemetryVariantsFor(key), allVars = [...extra, ...(SAMPLES[key]?.variants ?? [])];
    return allVars.map((v, k) => ({ name: clip(`${k + 1}. ${v.label}`, 100), value: String(k) }));
  }
  return outputChoices(focused?.value);
}

export async function testviewCommand(i, env, who) {
  if (!flagOn(env, who, TESTVIEW_FLAG)) return reply(notice('Not switched on yet', 'The test view is being tried by the owner first.'));
  if (!can(who, 'testview.run')) return reply(notice('Managers only', 'The test view is for managers.'));
  const o = Object.fromEntries((i.data?.options ?? []).map((x) => [x.name, x.value]));
  const item = REGISTRY.items.find((x) => x.key === o.output);
  if (!item) return reply(notice('Pick an output from the list', 'Start typing in the output box and choose one of the suggestions.'));
  const role = ROLES.includes(o.as) ? o.as : (who?.role ?? 'manager');
  const m = await renderTestview(env, item, { variant: o.variant, role, userId: userOf(i), roleIds: i.member?.roles ?? [], channelId: i.channel_id ?? '' });
  return reply(m);
}
/** a press on anything in a render: they are all switched off, this only answers if one slips through */
export async function testviewButton() { return reply(notice('This is a test view', 'Buttons here do nothing. Run the real command to use them.')); }
