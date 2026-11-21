// PF-037: forms (forms.js + forms.css). One place for the rules:
//  - text fields are 44 px (css); searches get a leading icon and a clear button;
//  - helper text (data-help) and error text sit under the field, linked with aria-describedby, and an invalid field says aria-invalid;
//  - a required or malformed field is checked when the user leaves it, and the message goes away as soon as they type.
// Labels are guarded by tests/a11y-labels.test.mjs. Add data-no-form to a field to leave it alone.
(function () {
  'use strict';
  var SKIP = /^(checkbox|radio|file|range|color|hidden|button|submit|reset|image)$/;
  var uid = 0;
  var isField = function (el) {
    if (!el || el.nodeType !== 1) return false;
    var t = el.tagName;
    if (t === 'SELECT' || t === 'TEXTAREA') return true;
    return t === 'INPUT' && !SKIP.test((el.getAttribute('type') || 'text').toLowerCase());
  };
  var idOf = function (el) { if (!el.id) el.id = 'phf' + (++uid); return el.id; };

  function msgEl(el, kind) {
    var id = idOf(el) + '-' + kind, m = document.getElementById(id);
    if (m) return m;
    m = document.createElement('span'); m.id = id; m.className = 'ph-msg' + (kind === 'err' ? ' err' : '');
    if (kind === 'err') m.setAttribute('role', 'alert');
    var host = el.parentNode && el.parentNode.classList && el.parentNode.classList.contains('ph-fw') ? el.parentNode : el;
    host.parentNode.insertBefore(m, host.nextSibling);
    return m;
  }
  function describe(el) {
    var ids = [];
    ['help', 'err'].forEach(function (k) { var m = document.getElementById(idOf(el) + '-' + k); if (m && m.textContent) ids.push(m.id); });
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
  }
  function setHelp(el, text) {
    var m = msgEl(el, 'help'); m.textContent = text || '';
    if (!text) m.parentNode && m.parentNode.removeChild(m);
    describe(el); return m;
  }
  function setError(el, text) {
    if (!text) return clearError(el);
    var m = msgEl(el, 'err'); m.textContent = text;
    el.setAttribute('aria-invalid', 'true'); describe(el); return m;
  }
  function clearError(el) {
    var m = document.getElementById(idOf(el) + '-err');
    if (m && m.parentNode) m.parentNode.removeChild(m);
    el.removeAttribute('aria-invalid'); describe(el);
  }
  // The text a field shows when its value is not acceptable (browser rules: required, type, pattern, min/max, length).
  function problem(el) {
    if (!el.checkValidity || el.checkValidity()) return '';
    var v = el.validity || {}, label = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || 'This field').replace(/[….]+$/, '');
    if (v.valueMissing) return label + ' is required.';
    if (v.typeMismatch) return 'Enter a valid ' + (el.type === 'email' ? 'email address' : el.type === 'url' ? 'web address' : 'value') + '.';
    if (v.patternMismatch) return el.getAttribute('data-pattern-msg') || 'That is not in the right format.';
    if (v.tooShort) return 'Use at least ' + el.minLength + ' characters.';
    if (v.tooLong) return 'Use at most ' + el.maxLength + ' characters.';
    if (v.rangeUnderflow) return 'Must be ' + el.min + ' or more.';
    if (v.rangeOverflow) return 'Must be ' + el.max + ' or less.';
    return el.validationMessage || 'Check this value.';
  }
  function validate(el) { var p = problem(el); if (p) setError(el, p); else clearError(el); return !p; }

  function wrap(el) {
    var p = el.parentNode;
    if (!p || (p.classList && p.classList.contains('ph-fw'))) return p;
    var w = document.createElement('span'); w.className = 'ph-fw';
    if (p.nodeType === 1 && /flex|grid/.test(getComputedStyle(p).display)) w.className += ' flex';
    p.insertBefore(w, el); w.appendChild(el); return w;
  }

  function enhance(el) {
    if (!isField(el) || el.hasAttribute('data-no-form') || el.getAttribute('data-form-ok')) return false;
    el.setAttribute('data-form-ok', '1');
    var type = (el.getAttribute('type') || 'text').toLowerCase(), search = type === 'search';
    var icon = el.getAttribute('data-icon') || (search ? '🔍' : '');
    if (el.tagName === 'INPUT' && (search || icon)) {
      var w = wrap(el);
      if (w && icon) { var i = document.createElement('span'); i.className = 'ph-ico'; i.setAttribute('aria-hidden', 'true'); i.textContent = icon; w.insertBefore(i, el); w.classList.add('has-icon'); }
      if (w && search) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'ph-clear'; b.textContent = '×'; b.setAttribute('aria-label', 'Clear search'); b.hidden = !el.value;
        w.appendChild(b); w.classList.add('has-clear');
        var sync = function () { b.hidden = !el.value; };
        el.addEventListener('input', sync);
        b.addEventListener('click', function () { el.value = ''; sync(); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); });
        el.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.value) { e.preventDefault(); b.click(); } });
      }
    }
    var help = el.getAttribute('data-help'); if (help) setHelp(el, help);
    if (el.tagName !== 'SELECT' && type !== 'search' && (el.required || el.pattern || el.minLength > 0 || type === 'email' || type === 'url')) {
      el.addEventListener('blur', function () { if (el.value || el.required) validate(el); });
      el.addEventListener('input', function () { if (el.getAttribute('aria-invalid')) validate(el); });
    }
    el.addEventListener('invalid', function (e) { e.preventDefault(); setError(el, problem(el)); });
    return true;
  }

  function scan(root) {
    root = root || document;
    if (root.nodeType === 1 && isField(root)) enhance(root);
    if (root.querySelectorAll) [].forEach.call(root.querySelectorAll('input,select,textarea'), enhance);
  }
  window.PhoenixForms = { enhance: enhance, scan: scan, setHelp: setHelp, setError: setError, clearError: clearError, validate: validate, problem: problem };

  var start = function () {
    scan(document);
    if (window.MutationObserver) new MutationObserver(function (ms) {
      ms.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1 && !(n.classList && (n.classList.contains('ph-fw') || n.classList.contains('ph-msg')))) scan(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
