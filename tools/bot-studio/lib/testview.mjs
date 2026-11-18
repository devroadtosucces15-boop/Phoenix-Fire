// PF-024 Item 25: the sample library behind /testview (bot/testview.js).
// ONE source of truth: the same captured messages the Bot Studio gallery and the registry already use (tools/bot-audit/out/captures.json and auto.json, through loadModel()).
// `node tools/bot-studio/studio.mjs testview` writes bot/testview.gen.js: for every registry key either a few sample variants (the message body, cleaned so it is safe to
// show again, plus its lint result) or the reason there is no offline preview. tests/testview.test.mjs fails when that file is stale or a registry key has neither.
import fs from 'node:fs';
import { loadModel, ROOT, flat, customIds } from './model.mjs';
import { buildRegistry } from './registry.mjs';
import { lintMessage, paletteFromUi } from './lint.mjs';
import { componentKey } from '../../../bot/controls.js';

export const TESTVIEW_FILE = ROOT + 'bot/testview.gen.js';
const MAX_VARIANTS = 6;
const IS_V2 = 1 << 15;
const NO_PREVIEW = {
  scheduled: 'A timer job, not a message. Its posts are listed as their own automated outputs: preview those.',
  setting: 'A settings area in the Control Center, not a message.',
  dj: 'The Phoenix DJ runs on the owner\'s PC and answers from the live music queue, so there is nothing to show offline.',
  site: 'A website section or feature switch, not a Discord message.',
};

/** a captured body made safe to show again: no files, no attachment pictures, no webhook identity, no pings. Returns { body, dropped } */
export function cleanBody(raw) {
  const b = JSON.parse(JSON.stringify(raw ?? {}));
  delete b.files; delete b.attachments; delete b.username; delete b.avatar_url; delete b.allowed_mentions; delete b.message_reference; delete b.tts;
  let dropped = 0;
  const isAttachment = (u) => /^attachment:\/\//.test(String(u ?? ''));
  const walk = (list) => {
    const out = [];
    for (const c of list ?? []) {
      if (!c) continue;
      if (c.type === 12) { const items = (c.items ?? []).filter((i) => !isAttachment(i.media?.url)); dropped += (c.items ?? []).length - items.length; if (items.length) out.push({ ...c, items }); continue; }
      if (c.type === 11 && isAttachment(c.media?.url)) { dropped++; continue; }
      if (c.type === 9 && c.accessory?.type === 11 && isAttachment(c.accessory.media?.url)) { dropped++; out.push({ type: 10, content: (c.components ?? []).map((t) => t.content).join('\n') }); continue; }
      out.push(c.components ? { ...c, components: walk(c.components) } : c);
    }
    return out;
  };
  if (b.components) b.components = walk(b.components);
  for (const e of b.embeds ?? []) for (const k of ['image', 'thumbnail']) if (isAttachment(e[k]?.url)) { delete e[k]; dropped++; }
  return { body: b, dropped };
}

const variantOf = (m, label, palette) => {
  const { body, dropped } = cleanBody(m.body);
  const kind = m.kind === 'private' ? 'private' : m.kind === 'modal' ? 'modal' : m.kind;
  const lint = lintMessage(m.body, { kind: kind === 'modal' ? 'modal' : kind, palette }).map((x) => ({ level: x.level, rule: x.rule, msg: x.msg }));
  return { label: String(label || m.label || 'default').replace(/\s+/g, ' ').slice(0, 80), kind: m.kind, via: m.via ?? '', dest: m.dest ?? null, v2: !!((body.flags ?? 0) & IS_V2), dropped, lint, body };
};

export function buildSamples() {
  const reg = buildRegistry(), model = loadModel(), palette = paletteFromUi();
  const byKey = new Map(); // registry key -> [{ entry, message }]
  const put = (key, e, m) => (byKey.get(key) ?? byKey.set(key, []).get(key)).push({ e, m });
  const compEntry = new Map(); // component registry key -> the entry that holds what pressing it shows
  for (const e of model.entries) {
    if (e.category === 'component' || e.category === 'form') compEntry.set(componentKey(e.id.replace(/^comp:/, '')), e);
    if (['slash', 'automated', 'dm'].includes(e.category)) for (const m of e.messages) put(e.control ?? e.id, e, m);
  }
  const out = {};
  for (const item of reg.items) {
    let list = byKey.get(item.key) ?? [];
    if (item.kind === 'component') {
      const ce = compEntry.get(item.key);
      list = ce ? ce.messages.map((m) => ({ e: ce, m })) : (byKey.get(item.parent) ?? []).slice(0, 1);
    }
    if (item.kind === 'scheduled' || item.kind === 'setting' || item.kind === 'dj' || item.kind === 'site') { out[item.key] = { why: NO_PREVIEW[item.kind] }; continue; }
    const seen = new Set(), variants = [];
    for (const { m } of list) {
      if (!m.body || (!m.body.components?.length && !m.body.embeds?.length && !m.body.content)) continue;
      const v = variantOf(m, m.label, palette), sig = JSON.stringify(v.body);
      if (seen.has(sig)) continue;
      seen.add(sig); variants.push(v);
      if (variants.length >= MAX_VARIANTS) break;
    }
    if (variants.length) { out[item.key] = { variants }; continue; }
    const uncaptured = model.entries.find((e) => (e.control ?? e.id) === item.key && e.uncaptured);
    out[item.key] = { why: uncaptured?.uncaptured ?? (item.kind === 'component' ? 'No captured result for this button yet: run node tools/bot-studio/studio.mjs capture.' : 'No offline capture of this output yet (it needs live Discord, a match feed or an AI model).') };
  }
  return out;
}

export const renderSamplesFile = (samples) => `// GENERATED by \`node tools/bot-studio/studio.mjs testview\` from the Bot Studio captures. Do not edit by hand; tests/testview.test.mjs fails when it is stale.
// What /testview (bot/testview.js) shows: for each Control Center output a few sample messages (cleaned: no files, no pings) with their lint result, or the reason there is no offline preview.
export const SAMPLES = ${JSON.stringify(samples)};
`;
export function writeSamples() { const s = buildSamples(); fs.writeFileSync(TESTVIEW_FILE, renderSamplesFile(s)); return s; }
