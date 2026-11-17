// Languages and tones the Translator offers (PF-024 Item 9). Plain data, so commanddefs.js and register.mjs can import it with no side effects.
// The picker list (Discord allows 25 choices). Owner decision: which languages to offer (PLANNING/PF-024-GO-LIVE.md).
export const LANGUAGES = [
  ['en', 'English'], ['es', 'Spanish'], ['pt', 'Portuguese'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['nl', 'Dutch'],
  ['pl', 'Polish'], ['tr', 'Turkish'], ['ar', 'Arabic'], ['ru', 'Russian'], ['sv', 'Swedish'], ['da', 'Danish'], ['ro', 'Romanian'],
];
export const LANG_NAME = Object.fromEntries(LANGUAGES);
export const DEFAULT_LANG = 'en';
export const TONES = {
  standard: 'natural and faithful to the original',
  professional: 'professional and polite, suitable for a formal message',
  casual: 'casual and colloquial, how friends chat',
  street: 'urban street slang, relaxed and punchy, still easy to read',
};
