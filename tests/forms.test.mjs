// PF-037: forms (next/static/forms.js + forms.css). 44 px fields, leading icon, clear button on searches, helper and error text linked with aria-describedby.
import fs from 'node:fs';
import vm from 'node:vm';
import { t, done } from './lib.mjs';

const rd = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = rd('next/static/forms.js'), css = rd('next/static/forms.css'), ui = rd('next/lib/ui.mjs');
t('forms.js and forms.css are linked on every page head', ui.includes('src="forms.js"') && ui.includes('href="forms.css"'));
t('no NOREX name or colour in the forms files', !/norex|c8352c|080b11/i.test(src + css));
t('text fields and selects are 44 px, textareas 88 px', /min-height:44px/.test(css) && /min-height:88px/.test(css));
t('the clear button is a 44 px tap target', /\.ph-clear\{[^}]*width:44px;height:44px/.test(css));
t('no orange focus ring (owner did not tick it)', !/:focus[^{]*\{[^}]*(232,101,26|e8651a)/i.test(css) && !/:focus/.test(css));
t('error text is announced and the field says aria-invalid', src.includes("'role', 'alert'") && src.includes("'aria-invalid', 'true'") && src.includes('aria-describedby'));
t('the clear button has an accessible name', src.includes("'aria-label', 'Clear search'"));

const reg = {};
class El {
  constructor(tag) { this.tagName = tag; this.nodeType = 1; this.a = {}; this.textContent = ''; this.kids = []; this.parentNode = null; this.className = ''; this.classList = { contains: () => false }; this.validity = {}; }
  setAttribute(n, v) { this.a[n] = String(v); if (n === 'id') reg[v] = this; }
  getAttribute(n) { return n in this.a ? this.a[n] : null; }
  removeAttribute(n) { delete this.a[n]; }
  hasAttribute(n) { return n in this.a; }
  get id() { return this.a.id || ''; }
  set id(v) { this.setAttribute('id', v); }
  insertBefore(c, ref) { c.parentNode = this; const i = ref ? this.kids.indexOf(ref) : -1; if (i < 0) this.kids.push(c); else this.kids.splice(i, 0, c); if (c.a.id) reg[c.a.id] = c; return c; }
  removeChild(c) { this.kids = this.kids.filter((k) => k !== c); if (c.a.id) delete reg[c.a.id]; c.parentNode = null; }
  get nextSibling() { const i = this.parentNode.kids.indexOf(this); return this.parentNode.kids[i + 1] || null; }
  addEventListener() {}
  checkValidity() { return !Object.values(this.validity).some(Boolean); }
}
const document = { readyState: 'complete', createElement: (t) => new El(t.toUpperCase()), getElementById: (id) => reg[id] || null, addEventListener() {}, body: {} };
const ctx = { document, window: {}, getComputedStyle: () => ({ display: 'block' }), Event: class {}, MutationObserver: undefined };
ctx.window = ctx;
vm.runInNewContext(src, ctx);
const F = ctx.PhoenixForms;

const mk = (attrs = {}, validity = {}) => { const host = new El('DIV'), el = new El('INPUT'); host.insertBefore(el); Object.assign(el.a, attrs); el.validity = validity; el.type = attrs.type || 'text'; el.minLength = -1; return { host, el }; };
{
  const { host, el } = mk({ 'aria-label': 'Email…' }, { valueMissing: true }); el.required = true;
  F.validate(el);
  const err = el.a['aria-describedby'];
  t('a required empty field shows an error that names the field and is linked', el.a['aria-invalid'] === 'true' && !!err && reg[err].textContent === 'Email is required.' && reg[err].a.role === 'alert');
  el.validity = {}; F.validate(el);
  t('a fixed field loses its error and aria-invalid', !el.hasAttribute('aria-invalid') && !el.hasAttribute('aria-describedby') && host.kids.length === 1);
}
{
  const { el } = mk({ type: 'email' }, { typeMismatch: true }); el.type = 'email';
  t('a malformed email says what to enter', F.problem(el) === 'Enter a valid email address.');
  el.validity = { rangeUnderflow: true }; el.min = '1';
  t('number limits are spelled out', F.problem(el) === 'Must be 1 or more.');
}
{
  const { el } = mk();
  F.setHelp(el, 'Use your Discord name.'); F.setError(el, 'Too long.');
  const ids = el.a['aria-describedby'].split(' ');
  t('helper and error are both described, helper first', ids.length === 2 && reg[ids[0]].textContent === 'Use your Discord name.' && reg[ids[1]].textContent === 'Too long.');
  F.clearError(el);
  t('clearing the error keeps the helper', el.a['aria-describedby'].split(' ').length === 1);
  F.setHelp(el, '');
  t('empty helper text removes the message', !el.hasAttribute('aria-describedby'));
}
{
  const { el } = mk({ type: 'checkbox' });
  t('checkboxes and radios are not touched', F.enhance(el) === false);
  const { el: s } = mk({ 'data-no-form': '' });
  t('data-no-form opts a field out', F.enhance(s) === false);
}
done();
