// PF-016: usage intelligence. Pure functions on synthetic transcript records; the real transcripts are never needed.
import { t, done } from './lib.mjs';
import { analyzeSession, flagsFor, windowUse, byItem, lessons, lessonsMd, LIMITS } from '../tools/brain/intel.mjs';

const at = (min) => new Date(Date.UTC(2026, 10, 16, 9, 0) + min * 60000).toISOString();
const asst = (id, min, usage, content = []) => ({ type: 'assistant', timestamp: at(min), message: { id, usage, content } });
const use = (id, name, input = {}) => ({ type: 'tool_use', id, name, input });
const res = (id, text, extra = {}) => ({ type: 'user', timestamp: at(0), message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }], ...extra }] } });

const secret = 'SECRET-VALUE-xyz-do-not-store';
const recs = [
  { type: 'user', timestamp: at(0), gitBranch: 'ops-next-pf016', message: { content: `Start PF-016 ${secret}` } },
  asst('m1', 1, { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 1000 }, [use('t1', 'Bash', { command: 'git status --short' })]),
  asst('m1', 1, { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 1000 }), // same message id again: counted once
  res('t1', 'x'.repeat(LIMITS.bigResultChars + 1), { is_error: true }),
  asst('m2', 2, { input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 2000 }, [use('t2', 'Bash', { command: 'git status --short' })]),
  res('t2', 'boom', { is_error: true }),
  asst('m3', 3, { input_tokens: 5, output_tokens: 5 }, [use('t3', 'Bash', { command: 'git status --short' })]),
  res('t3', 'boom', { is_error: true }),
  asst('m4', 600, { input_tokens: 1, output_tokens: 1 }), // a ten-hour gap: not work time
];
const s = analyzeSession(recs, 'abc12345');
t('turns count each message once', s.turns === 4);
t('tokens add input, output and cache', s.tokens === 10 + 20 + 1000 + 5 + 5 + 2000 + 5 + 5 + 1 + 1);
t('peak context is the largest single turn', s.peakContext === 2005);
t('item comes from the first message', s.item === 'PF-016');
t('tool mix is counted', s.tools.Bash === 3);
t('a repeated failing command is found', s.repeatFail.length === 1 && s.repeatFail[0].n === 3);
t('a big result is counted', s.bigResults === 1);
t('long idle gaps are not active minutes', s.minutes === 3);
t('no message text is kept in the numbers', !JSON.stringify(s).includes(secret));
t('item falls back to the branch name', analyzeSession([{ type: 'user', timestamp: at(0), gitBranch: 'claude/pf-020', message: { content: 'hello' } }, asst('a', 1, {})]).item === 'PF-020');

const heavy = { id: 'h0000000', item: 'PF-002', turns: LIMITS.turns + 1, minutes: LIMITS.minutes + 1, peakContext: LIMITS.peakContext + 1, images: LIMITS.images + 1, bigResults: LIMITS.bigResults + 1, readShare: 0.9, repeatFail: [{ cmd: 'x', n: 4 }] };
t('every rule fires on a heavy session', ['long-session', 'long-running', 'big-context', 'many-images', 'big-results', 'read-heavy', 'repeat-fail'].every((c) => flagsFor(heavy).some((f) => f.code === c)));
t('a light session has no flags', flagsFor({ turns: 10, minutes: 20, peakContext: 5000, images: 0, bigResults: 0, readShare: 0.1, repeatFail: [] }).length === 0);
t('every flag carries a fix', flagsFor(heavy).every((f) => f.fix && f.why));

const hist = [{ fiveHour: 10, timestamp: at(0) }, { fiveHour: 14, timestamp: at(2) }];
t('window use is the rise across snapshots in the session', windowUse({ start: at(0), end: at(3) }, hist) === 4);
t('one snapshot is not enough to measure', windowUse({ start: at(0), end: at(3) }, [hist[0]]) === null);
t('a reset (drop) gives no number', windowUse({ start: at(0), end: at(3) }, [{ fiveHour: 90, timestamp: at(0) }, { fiveHour: 5, timestamp: at(2) }]) === null);

const a = { ...s, windowPercent: 4, flags: flagsFor(heavy) }; const b = { ...s, id: 'b2222222', item: 'PF-016', windowPercent: null, flags: flagsFor(heavy) };
t('items roll up with measured window only', (() => { const r = byItem([a, b]); const i = r.find((x) => x.item === 'PF-016'); return r.length === 1 && i.sessions === 2 && i.windowPercent === 4 && i.measured === 1; })());
t('a lesson needs a repeat across sessions', lessons([a, b]).length > 0 && lessons([a, { ...b, flags: [] }]).length === 0);
t('LESSONS.md is built from numbers and is Phoenix-neutral', (() => { const md = lessonsMd({ generated: '2026-11-16T00:00:00Z', sessions: [a, b], items: byItem([a, b]), lessons: lessons([a, b]), limits: LIMITS }); return /Lessons and improvement plans/.test(md) && !/NOREX/i.test(md) && !md.includes(secret); })());
done();
