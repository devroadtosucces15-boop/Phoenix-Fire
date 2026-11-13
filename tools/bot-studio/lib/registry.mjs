// Control Center registry: one list of EVERY output the system can produce, generated from the live code so it cannot go stale.
//   slash commands     bot/commanddefs.js COMMANDS (every app)                      key  slash:/name
//   buttons and menus  the studio model's captured components                        key  comp:<custom id shape>
//   automated posts    the studio model (capture-auto + UNCAPTURED) and its `control` groups   key  auto:<id>
//   scheduled jobs     the Worker's scheduled() handler, one per ctx.waitUntil       key  job:<function>
//   DMs/notifications  bot/notify.js TYPES                                          key  dm:notify:<type>
//   website sections   config.json features (the site access switches)              key  site:<flag>
// `node tools/bot-studio/studio.mjs registry` writes bot/registry.gen.js; tests/controlcenter.test.mjs fails when that file is stale or when
// something exists in code without an entry. Adding an output = add it where it lives (command def, notify type, capture-auto, a job, a flag),
// run `studio.mjs capture` and `studio.mjs registry`; nothing is typed into this file.
import fs from 'node:fs';
import { loadModel, ROOT, config, customIds, flat } from './model.mjs';
import { componentKey } from '../../../bot/controls.js';
import { COMMANDS, APP_COMMANDS } from '../../../bot/commanddefs.js';
import { TYPES } from '../../../bot/notify.js';
import { CHANNEL_PURPOSES } from '../../../bot/orgconsts.js';
import { APP_LABEL } from '../../../bot/apps.js';

export const REGISTRY_FILE = ROOT + 'bot/registry.gen.js';
// Outputs whose switch, audience and channels the code already reads from the Control Center row (bot/controls.js). Everything else is
// switched by its command gate, its job switch or the notification router (see `applies`); the rest of the row fields are stored and shown,
// and a module adopts them by calling postChannels()/audienceOf() with its key (a one-line change, listed in PLANNING/CONTROL-CENTER.md).
const ADOPTED = { 'auto:rush-board': ['switch', 'channels'], 'auto:rush-need': ['switch', 'audience', 'channels'] };

const appOfCommand = (name) => Object.entries(APP_COMMANDS).find(([, l]) => l.includes(name))?.[0] ?? 'core';
const purposesIn = (list) => [...new Set((list ?? []).flatMap((d) => String(d).split(/[\s(),;]+/)).filter((w) => CHANNEL_PURPOSES.includes(w)))];

// The Worker's background jobs: every job('name', …) in scheduled() (a bare ctx.waitUntil there is a test failure: it would have no switch). Parsed from the source so a new job shows up by itself.
export function jobsFromWorker() {
  const src = fs.readFileSync(ROOT + 'bot/worker.js', 'utf8');
  const start = src.indexOf('async scheduled('), end = src.indexOf('async fetch(', start);
  const body = src.slice(start, end), jobs = [];
  let every = 'every 10 min';
  for (const line of body.split('\n')) {
    if (/event\?\.cron === '\* \* \* \* \*'/.test(line)) every = 'every minute';
    const m = /\bjob\('(\w+)'/.exec(line);
    if (!m) { if (/^\s*return;/.test(line) && every === 'every minute') every = 'every 10 min'; continue; }
    const fn = m[1], flag = /flagOn\(env, \{ role: 'owner' \}, '(\w+)'\)/.exec(line)?.[1] ?? null, note = /\/\/\s*(.+)$/.exec(line)?.[1]?.trim() ?? '';
    jobs.push({ fn, flag, note, schedule: every });
    if (/^\s*return;/.test(line)) every = 'every 10 min';
  }
  if (/actions\/workflows\/update\.yml\/dispatches/.test(body)) jobs.push({ fn: 'siteUpdate', flag: null, note: 'asks GitHub Actions to rebuild the site data (update.yml)', schedule: 'every 10 min' });
  return jobs;
}

export function buildRegistry() {
  const cfg = config(), model = loadModel(), items = [];
  const flagOf = (flag) => (flag && cfg.features?.[flag]) || null;
  const add = (i) => items.push({ app: 'core', summary: '', trigger: '', schedule: '', flag: null, level: null, status: 'live', source: null, purposes: [], applies: [], ...i });

  // ---- slash commands (live from COMMANDS) ----
  for (const c of COMMANDS) {
    const m = model.entries.find((e) => e.id === `slash:/${c.name}`);
    add({ key: `slash:/${c.name}`, kind: 'command', app: appOfCommand(c.name), name: `/${c.name}`, summary: c.description ?? '', trigger: `/${c.name}`, schedule: 'when someone runs it', flag: m?.flag ?? null, level: m?.level ?? null, status: m?.status ?? 'live', source: m?.source ?? 'bot/commanddefs.js', applies: ['switch', 'audience', 'channels', 'reply'] });
  }
  // ---- buttons, menus, forms: every custom id found in any captured message (replies, automated posts, DMs), folded the way the Worker folds them ----
  const comps = new Map();
  for (const e of model.entries.filter((x) => ['slash', 'component', 'automated', 'dm'].includes(x.category))) {
    for (const m of e.messages ?? []) for (const id of customIds(m.body)) {
      const key = componentKey(id), c = flat(m.body?.components).find((x) => x.custom_id === id);
      if (!comps.has(key)) comps.set(key, { key, app: e.app, name: c?.label ?? c?.placeholder ?? (c?.type === 3 || c?.type === 5 ? 'Menu' : 'Button'), parent: e.control ?? e.id, trigger: `press under ${e.name}` });
    }
  }
  for (const c of [...comps.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    add({ key: c.key, kind: 'component', app: c.app, name: `${c.name} (${c.key.slice(5)})`, summary: '', trigger: c.trigger, schedule: 'on click', applies: ['switch', 'audience', 'channels'], parent: c.parent });
  }
  // ---- automated posts: model entries, grouped by their Control Center key ----
  const groups = new Map();
  for (const e of model.entries.filter((x) => x.category === 'automated')) {
    const key = e.control ?? e.id;
    if (!groups.has(key)) groups.set(key, { ...e, key, variants: [] });
    groups.get(key).variants.push(e.id);
  }
  for (const g of groups.values()) {
    const wired = ADOPTED[g.key];
    add({ key: g.key, kind: 'automated', app: g.app, name: g.name.replace(/: (groups in line|empty)$/, ''), summary: g.summary ?? '', trigger: g.trigger, schedule: g.schedule, flag: g.flag ?? null, level: g.level, status: g.status, source: g.source ?? null, purposes: purposesIn(g.destinations), applies: wired ?? ['via-job'], variants: g.variants.length > 1 ? g.variants.sort() : undefined });
  }
  // ---- scheduled jobs (live from the Worker) ----
  for (const j of jobsFromWorker()) {
    add({ key: `job:${j.fn}`, kind: 'scheduled', app: 'core', name: j.fn, summary: j.note, trigger: 'timer', schedule: j.schedule, flag: j.flag, level: flagOf(j.flag), source: 'bot/worker.js scheduled()', applies: ['switch'] });
  }
  // ---- DMs and notification types (live from notify.js) ----
  for (const [type, t] of Object.entries(TYPES)) {
    if (t.hidden) continue;
    const m = model.entries.find((e) => e.id === `dm:notify:${type}`);
    add({ key: `dm:notify:${type}`, kind: 'dm', app: m?.app ?? 'core', name: t.label, summary: `${t.icon} Notification type "${type}": the site bell, a Discord DM and a browser push`, trigger: m?.trigger ?? `notify type "${type}"`, schedule: 'when it happens', flag: 'notifications', level: m?.level ?? null, status: m?.status ?? 'live', source: 'bot/notify.js', applies: ['switch', 'audience', 'methods', 'windows'], recipients: t.role ? `${t.role}s and up only` : 'everyone', type });
  }
  // ---- website sections (the site access switches) ----
  for (const [flag, level] of Object.entries(cfg.features ?? {})) {
    add({ key: `site:${flag}`, kind: 'site', app: 'site', name: flag, summary: 'Website section or feature switch', trigger: 'page or feature', schedule: '', flag, level, source: 'config.json features', applies: ['level'] });
  }
  const order = { command: 0, component: 1, automated: 2, scheduled: 3, dm: 4, site: 5 };
  items.sort((a, b) => order[a.kind] - order[b.kind] || a.key.localeCompare(b.key));
  return { version: 1, apps: APP_LABEL, purposes: CHANNEL_PURPOSES, items };
}

export const renderRegistryFile = (reg) => `// GENERATED by \`node tools/bot-studio/studio.mjs registry\` from the live code. Do not edit by hand; tests/controlcenter.test.mjs fails when it is stale.
// Every output of the system (commands, buttons, automated posts, jobs, DMs, site sections) and what the Control Center can do with it.
export const REGISTRY = {
 "version": ${reg.version},
 "apps": ${JSON.stringify(reg.apps)},
 "purposes": ${JSON.stringify(reg.purposes)},
 "items": [
${reg.items.map((i) => '  ' + JSON.stringify(i)).join(',\n')}
 ]
};
export const REGISTRY_KEYS = new Set(REGISTRY.items.map((i) => i.key));
`;
export function writeRegistry() { const reg = buildRegistry(); fs.writeFileSync(REGISTRY_FILE, renderRegistryFile(reg)); return reg; }
