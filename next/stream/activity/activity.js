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
    $('player').src = base + q;
    if (inDiscord && window.fetch) fetch(base + q, { credentials: 'omit' }).then(function (r) {
      return r.text().then(function (body) {
        var rel = (body.match(/(?:src|href)=["']\/(?!\/)/g) || []).length;
        status('Proxy answered ' + r.status + (rel ? ' · the player asks for ' + rel + ' files by root path (they resolve on this Activity, not Twitch)' : ''));
      });
    }).catch(function (e) { status('Proxy could not be reached: ' + String(e && e.message || e).slice(0, 60)); });
    document.addEventListener('securitypolicyviolation', function (e) { status('Blocked by Discord: ' + (e.effectiveDirective || e.violatedDirective || '') + ' ' + String(e.blockedURI || 'unknown address').slice(0, 70)); });
  }

  function open(url) { if (sdk) sdk.commands.openExternalLink({ url: url }).catch(function () {}); else window.open(url, '_blank', 'noopener'); }
  $('open').onclick = function () { if (channel) open('https://www.twitch.tv/' + channel); };
  $('chat').onclick = function () { if (channel) open('https://www.twitch.tv/popout/' + channel + '/chat?popout='); };

  if (inDiscord && window.DiscordSDK) { // the Activity's id is the first part of its host name; ready() takes down Discord's loading screen
    try { sdk = new window.DiscordSDK(location.hostname.split('.')[0]); sdk.ready().catch(function () {}); } catch (e) { sdk = null; }
  }
})();
