// The one place every Workers AI TEXT call goes through. Cloudflare retires models on a schedule: `@cf/meta/llama-3.1-8b-instruct` went on
// 2026-05-30 and `@cf/meta/llama-3.1-8b-instruct-fp8` on 2026-11-20, which silently broke /enhance, /translate, /ask, mascot, hype, recaps and
// server intelligence at once. Models are listed here and nowhere else; the first that answers wins, each call has a time limit, and the answer is
// read from either response shape (`{ response }` or the OpenAI-style `choices[0].message.content`), so a catalog change needs one edit.
// Check the list against https://developers.cloudflare.com/workers-ai/changelog/ when a feature starts failing.
export const TEXT_MODELS = ['@cf/google/gemma-4-26b-a4b-it', '@cf/qwen/qwen3.8-27b'];
export const AI_TIMEOUT_MS = 12000;

// Any model response → the answer text ('' when there is none).
export function answerOf(out) {
  if (typeof out === 'string') return out.trim();
  const r = out?.response ?? out?.result?.response ?? out?.choices?.[0]?.message?.content ?? out?.choices?.[0]?.text;
  if (typeof r === 'string') return r.trim();
  if (Array.isArray(r)) return r.map((p) => p?.text ?? '').join('').trim();
  return '';
}

// Runs `{ messages, max_tokens }` on the first model that answers. Returns `{ response, model }`; throws the last error when every model fails.
// Out-of-budget errors (4006) are rethrown at once: another model draws from the same free pool.
export async function runText(env, input, { models = TEXT_MODELS, timeoutMs = AI_TIMEOUT_MS } = {}) {
  let last = new Error('The AI sent back nothing.');
  for (const model of models) {
    let timer;
    try {
      // These models think before they answer; with our short limits the thinking can use every token and leave the answer empty, so it is off.
      const call = env.AI.run(model, { chat_template_kwargs: { enable_thinking: false }, ...input });
      const out = await Promise.race([call, new Promise((_, no) => { timer = setTimeout(() => no(new Error('The AI took too long to answer.')), timeoutMs); })]);
      const response = answerOf(out);
      if (response) return { response, model };
      last = new Error('The AI sent back nothing.');
    } catch (e) {
      last = e;
      if (/\b4006\b|daily free allocation|neurons/i.test(String(e?.message))) throw e;
      console.log('text model failed', model, String(e?.message).slice(0, 160));
    } finally { clearTimeout(timer); }
  }
  throw last;
}
