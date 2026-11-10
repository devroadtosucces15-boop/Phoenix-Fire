// 0053 docs seed (Phoenix): rebranded, no NOREX text, no invented club facts, nothing sent or pinned (release hold).
import fs from 'node:fs';
import { ROOT, sqlite } from './mock.mjs';
import { t, done } from './lib.mjs';

const q = (sql) => sqlite.prepare(sql).all();
const sql = fs.readFileSync(ROOT + 'bot/migrations/0053_club_docs_content.sql', 'utf8');
const rows = q("SELECT area, title, body, pinned, public, by_name FROM docs WHERE removed_at IS NULL AND area != 'playstyle'");
const text = rows.map((r) => `${r.title}\n${r.body}\n${r.by_name}`).join('\n');
const areas = new Set(rows.map((r) => r.area));

t('0053: seeds the four doc areas with at least 20 live docs', rows.length >= 20 && ['announce', 'rules', 'requirements', 'faq'].every((a) => areas.has(a)));
t('0053: no NOREX text in the seed file or the seeded docs', !/norex/i.test(sql) && !/norex/i.test(text));
t('0053: authored as Phoenix Fire, welcome + motto present', rows.every((r) => r.by_name === 'Phoenix Fire') && text.includes('Rise. Burn. Repeat.') && rows.some((r) => r.title === 'Welcome to Phoenix Fire'));
t('0053: no invented club facts (region, history, review period, founder voice)', !/North American|founder|one week|second or third/i.test(text));
t('0053: rules numbered 1..14 in order', JSON.stringify(rows.filter((r) => r.area === 'rules').map((r) => parseInt(r.title, 10))) === JSON.stringify(Array.from({ length: 14 }, (_, i) => i + 1)));
t('0053: on hold — nothing pinned or public, docs_release 0, rules version 0, no acknowledgements or notifications', rows.every((r) => !r.pinned && !r.public) && q("SELECT value FROM meta WHERE key = 'docs_release'")[0].value === '0' && q("SELECT value FROM meta WHERE key = 'rules_version'")[0].value === '0' && q('SELECT COUNT(*) n FROM doc_acks')[0].n === 0 && q('SELECT COUNT(*) n FROM notifications')[0].n === 0);
t('0053: seeded docs never claim a Discord post', q('SELECT COUNT(*) n FROM docs WHERE discord_msg IS NOT NULL')[0].n === 0);
t('0053: re-running the migration replaces rather than duplicates the live docs', (() => { sqlite.exec(sql); return q("SELECT COUNT(*) n FROM docs WHERE removed_at IS NULL AND area != 'playstyle'")[0].n === rows.length; })());
done();
