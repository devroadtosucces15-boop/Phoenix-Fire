// The Workers AI text model: one list, no retired model anywhere, both response shapes read, the second model tried.
// /enhance and /translate broke on 2026-11-25 because Cloudflare had retired both model ids the code named.
import fs from 'node:fs';
import { t, done } from './lib.mjs';
import { runText, answerOf, TEXT_MODELS } from '../bot/aitext.js';

// From https://developers.cloudflare.com/workers-ai/changelog/ (deprecations of 2026-05-30 and 2026-11-20)
const RETIRED = ['@cf/meta/llama-3.1-8b-instruct-fp8', '@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.1-8b-instruct-awq', '@cf/meta/llama-3-8b-instruct', '@cf/meta/llama-3.2-1b-instruct', '@cf/meta/llama-3.2-3b-instruct', '@cf/qwen/qwen3-30b-a3b-fp8'];
const dir = new URL('../bot/', import.meta.url);
const code = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.gen.js'))
  .map((f) => [f, fs.readFileSync(new URL(f, dir), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')]);
const bad = code.flatMap(([f, s]) => RETIRED.filter((m) => new RegExp(`['"\`]${m}['"\`]`).test(s)).map((m) => `${f}: ${m}`));
t('no bot module calls a retired model', bad.length === 0 || (console.log(bad), false));
t('the text models offered are not retired, and there are at least two', TEXT_MODELS.length >= 2 && TEXT_MODELS.every((m) => !RETIRED.includes(m)));
t('both response shapes are read', answerOf({ response: ' a ' }) === 'a' && answerOf({ choices: [{ message: { content: 'b' } }] }) === 'b' && answerOf({ result: { response: 'c' } }) === 'c' && answerOf({}) === '');
const seen = [];
const env = { AI: { run: async (m) => { seen.push(m); if (seen.length === 1) throw new Error('5007: No such model'); return { choices: [{ message: { content: 'ok' } }] }; } } };
const r = await runText(env, { messages: [] });
t('a retired first model falls through to the second', r.response === 'ok' && r.model === TEXT_MODELS[1] && seen.join() === TEXT_MODELS.join());
let sent = null;
await runText({ AI: { run: async (m, input) => { sent = input; return { response: 'x' }; } } }, { messages: [], max_tokens: 5 });
t('reasoning is switched off so a short limit still leaves an answer', sent.chat_template_kwargs.enable_thinking === false && sent.max_tokens === 5);
let err = null;
const budget = []; try { await runText({ AI: { run: async (m) => { budget.push(m); throw new Error('4006: daily free allocation used up'); } } }, { messages: [] }); } catch (e) { err = e; }
t('out of daily budget does not try a second model', budget.length === 1 && /4006/.test(err.message));
done();
