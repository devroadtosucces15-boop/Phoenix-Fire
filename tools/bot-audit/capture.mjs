// Bot output audit, step 1: every slash command, button, select and modal, driven through the REAL Worker.
// Output: tools/bot-audit/out/captures.json. Run from the repo root: node tools/bot-audit/capture.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROOT, env, send, base, resetCalls } from './harness.mjs';
import * as H from './harness.mjs';
import { COMMANDS } from '../../bot/commanddefs.js';
import { seedBotSample } from '../../tests/botfeat-sample.mjs';
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
// ---- option sampling from the registered definitions ----
const players = JSON.parse(fs.readFileSync(ROOT + 'site/api/players.json', 'utf8')).filter((p) => p.home);
const SAMPLE = { gamertag: players[0]?.n, player1: players[0]?.n, player2: players[1]?.n, question: 'who has the most assists this season?', count: 3, reason: 'sample reason', message: 'Sample announcement text', text: 'Sample text', title: 'Sample title', minutes: 5, hours: 2, name: 'Sample', amount: 10, time: '20:00', when: 'in 2 hours', opponent: '1', channel: 'C1', role: 'R1', user: '222' };
const optionSets = (def) => {
  if (!def.options?.length) return [[]];
  const sub = def.options.filter((o) => o.type === 1 || o.type === 2);
  if (sub.length) return sub.flatMap((s) => optionSets(s).map((o) => [{ type: s.type, name: s.name, options: o }]));
  const base = def.options.filter((o) => o.required || o.choices || ['gamertag', 'player1', 'player2'].includes(o.name)).map((o) => ({ o, v: o.choices ? o.choices[0].value : (SAMPLE[o.name] ?? (o.type === 4 ? 1 : o.type === 5 ? true : o.type === 6 ? '222' : 'sample')) }));
  const sets = [base.map(({ o, v }) => ({ type: o.type, name: o.name, value: v }))];
  const multi = def.options.find((o) => o.choices?.length > 1); // one run per choice (cap 8) so every variant is seen
  if (multi) for (const c of multi.choices.slice(1, 8)) sets.push(base.map(({ o, v }) => ({ type: o.type, name: o.name, value: o === multi ? c.value : v })));
  return sets;
};

// ---- capture store ----
const captured = []; // { id, kind, trigger, via, initial, calls }
const seen = new Set();
const norm = (id) => String(id).replace(/\d{3,}/g, 'N');
const compFlat = (cs = [], out = []) => { for (const c of cs) { out.push(c); if (c.components) compFlat(c.components, out); if (c.accessory) out.push(c.accessory); } return out; };
async function fire(payload, meta) {
  resetCalls();
  const r = await send(payload);
  const rec = { ...meta, status: r.status, response: r.d, calls: H.calls.slice() };
  captured.push(rec);
  return rec;
}
async function crawl(rec, depth) { // click every button / pick the first option of every select found in a captured message
  if (depth > 2) return;
  const messages = [rec.response?.data, ...rec.calls.map((c) => c.body)].filter((m) => m?.components);
  for (const m of messages) {
    for (const c of compFlat(m.components)) {
      const id = c.custom_id; if (!id || c.disabled) continue;
      const key = norm(id) + (c.type === 3 ? '#sel' : '');
      if (seen.has(key)) continue; seen.add(key);
      const data = c.type === 3 || c.type === 2 ? { custom_id: id, component_type: c.type, ...(c.type === 3 ? { values: [c.options?.[0]?.value ?? 'x'] } : {}) } : null;
      if (!data) continue;
      const r2 = await fire({ ...base(), type: 3, data, message: { id: 'M0', channel_id: 'C1', flags: m.flags ?? 0, components: m.components, embeds: m.embeds ?? [], content: m.content ?? '' } }, { kind: 'component', trigger: `${c.type === 3 ? 'select' : 'button'} ${id}`, parent: rec.trigger, label: c.label ?? null });
      await crawl(r2, depth + 1);
    }
  }
  if (rec.response?.type === 9) { // modal: submit it with sample text
    const cid = rec.response.data?.custom_id;
    const rows = (rec.response.data?.components ?? []).map((r) => ({ type: 1, components: (r.components ?? []).map((c) => ({ type: 4, custom_id: c.custom_id, value: c.value ?? c.placeholder ?? 'Sample text' })) }));
    if (cid) await fire({ ...base(), type: 5, data: { custom_id: cid, components: rows } }, { kind: 'modal-submit', trigger: `modal ${cid}`, parent: rec.trigger });
  }
}

await seedBotSample().catch((e) => console.log('seed:', e.message));
for (const def of COMMANDS) {
  for (const options of optionSets(def)) {
    const label = '/' + def.name + options.map((o) => ' ' + o.name + (o.options ? ' ' + o.options.map((x) => x.name + '=' + x.value).join(' ') : '=' + o.value)).join('');
    const rec = await fire({ ...base(), type: 2, data: { id: '1', name: def.name, type: 1, options } }, { kind: 'slash', command: def.name, trigger: label });
    await crawl(rec, 0);
  }
}
fs.writeFileSync(OUT + 'captures.json', JSON.stringify(captured, null, 1));
console.log('captured', captured.length, 'interactions;', captured.filter((c) => c.response?.data?.components || c.response?.data?.embeds).length, 'with visible output');
