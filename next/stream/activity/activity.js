/* The watch Activity: the club's Twitch stream inside a Discord voice channel. Runs in Discord (its page proxy) and also in a plain browser for testing.
   Name, motto and channel come from overlay-brand.js and activity-config.js (config.json at build time). */
(function () {
  'use strict';
  var B = window.PF_BRAND || {}, C = window.PF_ACTIVITY || {}, Q = new URLSearchParams(location.search), $ = function (id) { return document.getElementById(id); };
  var channel = String(C.channel || Q.get('channel') || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25);
  var inDiscord = /\.discordsays\.com$/.test(location.hostname), sdk = null;
  var root = document.documentElement.style; if (B.accent) root.setProperty('--accent', B.accent); if (B.ink) root.setProperty('--ink', B.ink); if (B.goldTop) root.setProperty('--gold', B.goldTop);
  $('name').textContent = (B.name || 'Live') + ' · LIVE'; $('motto').textContent = B.motto || ''; if (B.crest) $('crest').src = B.crest;

  // Inside Discord only the mapped proxy works (/.proxy/twitch -> player.twitch.tv); Discord blocks direct outside addresses. A plain browser (testing) goes direct.
  // The line under the player says what the proxy answered, so a blank player can be told apart: mapping missing, Twitch refusing, or the player's own files not loading.
  var base = inDiscord ? '/.proxy/twitch/' : 'https://player.twitch.tv/';
  function status(t) { $('blocked').textContent = t; }
  if (inDiscord && window.matchMedia && matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('phone');
  if (!channel) { $('player').hidden = true; $('none').hidden = false; }
  else {
    var q = '?channel=' + encodeURIComponent(channel) + '&parent=' + encodeURIComponent(location.hostname) + '&autoplay=true&muted=true';
    var log = [], t0 = Date.now(); // every step is written on screen, so a blank player says how far it got (read the line in a screenshot)
    function note(s) { log.push(Math.round((Date.now() - t0) / 100) / 10 + 's ' + s); status(log.slice(-4).join(' · ')); }
    note('page ' + (inDiscord ? 'in Discord' : 'in a browser'));
    $('player').addEventListener('load', function () { note('player frame loaded'); });
    $('player').src = base + q;
    if (inDiscord && window.fetch) {
      note('asking the proxy');
      var ctl = window.AbortController ? new AbortController() : null, timer = setTimeout(function () { note('proxy gave no answer in 8s'); if (ctl) ctl.abort(); }, 8000);
      fetch(base + q, { credentials: 'omit', signal: ctl ? ctl.signal : undefined }).then(function (r) {
        clearTimeout(timer);
        return r.text().then(function (body) {
          var rel = (body.match(/(?:src|href)=["']\/(?!\/)/g) || []).length;
          note('proxy ' + r.status + ' ' + (r.headers.get('content-type') || '').split(';')[0] + ' ' + body.length + ' bytes' + (rel ? ', ' + rel + ' root-path files' : ''));
        });
      }).catch(function (e) { clearTimeout(timer); note('proxy error ' + String(e && e.message || e).slice(0, 40)); });
    }
    document.addEventListener('securitypolicyviolation', function (e) { note('Discord blocked ' + (e.effectiveDirective || e.violatedDirective || '') + ' ' + String(e.blockedURI || 'unknown').slice(0, 60)); });
  }

  function open(url) { if (sdk) sdk.commands.openExternalLink({ url: url }).catch(function () {}); else window.open(url, '_blank', 'noopener'); }
  $('open').onclick = function () { if (channel) open('https://www.twitch.tv/' + channel); };
  $('chat').onclick = function () { if (channel) open('https://www.twitch.tv/popout/' + channel + '/chat?popout='); };

  if (inDiscord && window.DiscordSDK) { // the Activity's id is the first part of its host name; ready() takes down Discord's loading screen
    try { sdk = new window.DiscordSDK(location.hostname.split('.')[0]); sdk.ready().catch(function () {}); } catch (e) { sdk = null; }
  }
})();
