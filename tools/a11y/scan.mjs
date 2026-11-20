// PF-030: a source scanner for the markup that the site builds in template strings.
// It finds controls without an accessible name, fields without a label, tables without a caption and
// a nav marked "on" without aria-current. Used by tests/a11y-labels.test.mjs.
import fs from 'node:fs';
import path from 'node:path';

const DIRS = ['next/pages', 'next/lib', 'next/static', 'web'];
export const sourceFiles = (root = '.') => DIRS.flatMap((d) => {
  const dir = path.join(root, d);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(m?js)$/.test(f)).map((f) => path.join(d, f)) : [];
});

// Replace every ${ ... } with one marker so attributes and text can be read as plain HTML. Markup that sits in a
// nested template literal inside the expression (a conditional, a .map) is kept, so it is scanned too. Strings and
// comments inside the expression are skipped, so a "}" in a string cannot end it early. Newlines are kept for line numbers.
const prevSig = (src, i) => { let j = i - 1; while (j >= 0 && /\s/.test(src[j])) j--; return j < 0 ? '(' : src[j]; };
function expr(src, i) { // i is just after "${"; returns [indexAfterClosingBrace, textKept]
  let depth = 1, kept = '';
  while (i < src.length && depth) {
    const c = src[i];
    if (c === "'" || c === '"') { const st = i; i++; while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++; } i++; const lit = src.slice(st + 1, i - 1); kept += lit.includes('<') ? ' ' + lit + ' ' : lit.replace(/[^\n]/g, ''); }
    else if (c === '/' && src[i + 1] !== '/' && src[i + 1] !== '*' && /[(,=:[!&|?{};]/.test(prevSig(src, i))) { // regex literal: skip it whole
      i++; let cls = false; while (i < src.length && (cls || src[i] !== '/') && src[i] !== '\n') { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; } i++;
    }
    else if (c === '`') { const [j, t] = tpl(src, i + 1); kept += ' ' + t + ' '; i = j; }
    else if (c === '/' && src[i + 1] === '/' && src[i - 1] !== '\\' && src[i - 1] !== ':' && src[i - 1] !== '/') { while (i < src.length && src[i] !== '\n') i++; }
    else { if (c === '{') depth++; else if (c === '}') depth--; if (c === '\n') kept += c; i++; }
  }
  return [i, kept];
}
function tpl(src, i) { // i is just after the opening backtick; returns [indexAfterClosingBacktick, maskedBody]
  let out = '';
  while (i < src.length && src[i] !== '`') {
    if (src[i] === '\\') { out += src.slice(i, i + 2).replace(/[^\n]/g, ''); i += 2; }
    else if (src[i] === '$' && src[i + 1] === '{') { const [j, k] = expr(src, i + 2); out += '\u0001' + k; i = j; }
    else out += src[i++];
  }
  return [i + 1, out];
}
export function mask(src) {
  let out = '', i = 0;
  while (i < src.length) {
    if (src[i] === '$' && src[i + 1] === '{') { const [j, k] = expr(src, i + 2); out += '\u0001' + k; i = j; }
    else out += src[i++];
  }
  return out;
}

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;
const hasAttr = (attrs, n) => new RegExp(`(^|\\s)${n}\\s*=`).test(attrs) || new RegExp(`(^|\\s)${n}(\\s|$|/)`).test(attrs);
// an attribute written as a bare marker ("\u0001") may hold anything, including a name: trust it
const dyn = (attrs, n) => new RegExp(`${n}\\s*=\\s*["']?\u0001`).test(attrs);

// text a screen reader reads from the inside of an element: tags and aria-hidden spans dropped, <img alt> kept
export function innerName(inner) {
  let s = inner.replace(/<(span|i|b|small|svg|em)\b[^>]*\baria-hidden\s*=\s*["']true["'][^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<img\b[^>]*\balt\s*=\s*["']([^"']+)["'][^>]*>/gi, ' $1 ').replace(/<[^>]+>/g, ' ');
  s = s.replace(/&[a-z#0-9]+;/gi, ' ');
  return s.replace(/\u0001/g, ' DYN ');
}
// a name is real when it has letters or digits (emoji, arrows, crosses and symbols alone are not a name)
export const isNamed = (text) => /[\p{L}\p{N}]/u.test(text.replace(/DYN/g, 'x'));

export function scan(file, root = '.') {
  const raw = fs.readFileSync(path.join(root, file), 'utf8');
  const src = mask(raw);
  const bad = { iconButtons: [], fields: [], tables: [], navOn: [] };

  // buttons, and links that act as buttons
  for (const m of src.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = m[1];
    if (hasAttr(attrs, 'aria-label') || hasAttr(attrs, 'aria-labelledby')) continue;
    const name = innerName(m[2]);
    if (isNamed(name)) continue;
    // an empty button whose content is only a placeholder marker is built elsewhere; judge it only when it has a literal icon or nothing
    if (/\u0001/.test(m[2]) && !/[^\s\u0001]/.test(m[2].replace(/<[^>]+>/g, ''))) { if (!hasAttr(attrs, 'title')) continue; }
    bad.iconButtons.push({ file, line: lineOf(src, m.index), tag: `<button${attrs.replace(/\u0001/g, '…').slice(0, 90)}>`, title: hasAttr(attrs, 'title') });
  }

  // fields
  for (const m of src.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = m[2];
    if (/type\s*=\s*["'](hidden|submit|button|reset|image)["']/.test(attrs)) continue;
    if (hasAttr(attrs, 'aria-label') || hasAttr(attrs, 'aria-labelledby')) continue;
    if (/\sfor\s*=/.test('') ) continue;
    const before = src.slice(0, m.index);
    const open = before.lastIndexOf('<label'), close = before.lastIndexOf('</label>');
    if (open > close && !/<\/(div|form|section|fieldset)>\s*$/.test(before.slice(open))) continue; // wrapped by a label
    const id = /\sid\s*=\s*["']([^"'\u0001]+)["']/.exec(attrs)?.[1];
    if (id && new RegExp(`<label[^>]*\\sfor\\s*=\\s*["']${id}["']`).test(src)) continue;
    if (dyn(attrs, 'id') && /<label[^>]*\sfor\s*=/.test(src)) continue;
    bad.fields.push({ file, line: lineOf(src, m.index), tag: `<${m[1]}${attrs.replace(/\u0001/g, '…').slice(0, 90)}>` });
  }

  // tables
  for (const m of src.matchAll(/<table\b[^>]*>([\s\S]{0,40})/g)) {
    if (/^\s*<caption\b/.test(m[1]) || /aria-label(ledby)?\s*=/.test(m[0])) continue;
    bad.tables.push({ file, line: lineOf(src, m.index), tag: m[0].slice(0, 60) });
  }

  // navigation marked "on" without aria-current
  for (const m of src.matchAll(/<a\b([^>]*)>/g)) {
    const a = m[1];
    if (/class\s*=\s*["'][^"']*\bon\b/.test(a) || /class\s*=\s*["']\u0001/.test(a) && /\bon\b/.test('')) {
      if (!/aria-current/.test(a) && /href/.test(a) && /data-g=|class="\u0001"/.test(a + '"\u0001"')) bad.navOn.push({ file, line: lineOf(src, m.index), tag: `<a${a.replace(/\u0001/g, '…').slice(0, 100)}>` });
    }
  }
  return bad;
}

export function scanAll(root = '.') {
  const all = { iconButtons: [], fields: [], tables: [], navOn: [] };
  for (const f of sourceFiles(root)) { const r = scan(f, root); for (const k of Object.keys(all)) all[k].push(...r[k]); }
  return all;
}

if (process.argv[1] && process.argv[1].endsWith('scan.mjs')) {
  const r = scanAll();
  for (const k of Object.keys(r)) { console.log(`\n== ${k}: ${r[k].length}`); for (const x of r[k]) console.log(`${x.file}:${x.line} ${x.tag}${x.title ? '  [title only]' : ''}`); }
}
