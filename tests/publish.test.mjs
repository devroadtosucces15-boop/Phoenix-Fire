// The hosted phone snapshot (tools/brain/publish.mjs): no Credentials tab, no secret-shaped string, no server hooks, build time stated, Phoenix branding.
import fs from 'node:fs';
import { t, done } from './lib.mjs';
import { buildSnapshot, checkSnapshot, CAPABILITIES, COLLECTION } from '../tools/brain/publish.mjs';
import { importPhoneNotes } from '../tools/brain/phone-notes.mjs';
import * as inbox from '../tools/brain/inbox.mjs';

const r = buildSnapshot({ now: new Date('2026-11-16T12:00:00Z') });
const h = r.html;
t('snapshot passes its own checks', checkSnapshot(h).length === 0);
t('snapshot is one self-contained file under 2 MB', r.bytes < 2e6 && !/<link[^>]+href=["']\//.test(h) && !/src=["']\/(?!\/)/.test(h));
t('tabs: the seven wanted, no Credentials', ['Roadmap', 'Maps', 'Inputs and outputs', 'Brainstorm', 'Usage', 'Libraries', 'References'].every((n) => h.includes(`'${n}'`)) && !h.includes("'Credentials'") && !/"credentials":/.test(h));
t('no secret names table or registry rows ship (values or not)', !/DISCORD_BOT_TOKEN_CORE/.test(h) || /DISCORD_BOT_TOKEN_CORE/.test(fs.readFileSync(new URL('../LIBRARY/ASSETS.md', import.meta.url), 'utf8') + fs.readFileSync(new URL('../LIBRARY/BOT.md', import.meta.url), 'utf8')));
t('no token-shaped value, long hex id or snowflake anywhere', !/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/.test(h) && !/\b[0-9a-f]{32,}\b/.test(h.replace(/base64,[A-Za-z0-9+/=]+/, '')) && !/\b\d{17,20}\b/.test(h));
t('states its build time and that it only updates on republish', /Snapshot built/.test(h) && /republishes/.test(h) && r.generated === '2026-11-16T12:00:00.000Z' && h.includes('2026-11-16T12:00:00.000Z'));
t('no live server hooks (EventSource, /api, local fetch)', !/new EventSource|fetch\('\/|bsPost/.test(h));
t('page contract: title, side-cover meta, no skeleton tags', /<title>Phoenix Fire Brain<\/title>/.test(h) && /claude:viewport-fit-sides/.test(h) && !/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(h) && /max\(16px,env\(safe-area-inset-right/.test(h));
const chrome = h.split('\n').filter((l) => !l.startsWith('const SNAPSHOT=')).join('\n').replace(/base64,[A-Za-z0-9+/=]+/, '');
t('Phoenix branding: crest embedded, ink and orange tokens, no NOREX name, colour or crest path in the page chrome', /data:image\/png;base64,/.test(h) && /--acc:#e8651a/.test(h) && /--ink:#0a0705/.test(h) && !/norex/i.test(chrome) && !/#c8352c|0xc8352c|#080b11/i.test(chrome));
t('phone notes use the db and dictation capabilities, collection phone-notes', CAPABILITIES.db && CAPABILITIES.dictation && COLLECTION === 'phone-notes' && /claude\.use|cl\.use/.test(h) && h.includes("PN='phone-notes'"));
t('phone note form refuses a secret-shaped value before saving', /SECRETRE/.test(h) && /looks like a secret value/.test(h));
// Importer: only open rows, secrets refused, source kept.
const before = new Set(inbox.listNotes().map((n) => n.id));
const out = importPhoneNotes([{ id: 'a', text: 'phone test idea alpha', source: 'dictated', status: 'open' }, { id: 'b', text: 'dropped idea', status: 'dropped' }, { id: 'c', text: 'token: abcdefghijklmnop1234', status: 'open' }]);
const made = inbox.listNotes().filter((n) => !before.has(n.id));
t('importer takes open rows only and refuses a secret-shaped note', out.imported.length === 1 && out.skipped.length === 2 && made.length === 1 && made[0].source === 'dictated');
for (const n of made) fs.rmSync(inbox.INBOX + n.id + '.md', { force: true });
done();
