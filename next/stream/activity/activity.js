/* The watch Activity: the club's Twitch stream inside a Discord voice channel. Runs in Discord (its page proxy) and also in a plain browser for testing.
   Name, motto and channel come from overlay-brand.js and activity-config.js (config.json at build time). */
(function () {
  'use strict';
  var B = window.PF_BRAND || {}, C = window.PF_ACTIVITY || {}, Q = new URLSearchParams(location.search), $ = function (id) { return document.getElementById(id); };
  var channel = String(C.channel || Q.get('channel') || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25);
  var inDiscord = /\.discordsays\.com$/.test(location.hostname), sdk = null;
  var root = document.documentElement.style; if (B.accent) root.setProperty('--accent', B.accent); if (B.ink) root.setProperty('--ink', B.ink); if (B.goldTop) root.setProperty('--gold', B.goldTop);
  $('name').textContent = (B.name || 'Live') + ' · LIVE'; $('motto').textContent = B.motto || ''; if (B.crest) $('crest').src = B.crest;

  // Same player URL the club site uses (muted, so phones allow autoplay). Inside Discord it first goes through the mapped proxy (/.proxy/twitch -> player.twitch.tv);
  // "Try another way" switches to the direct address, and any address Discord blocks is named under the player so it can be mapped.
  var ways = inDiscord ? ['proxy', 'direct'] : ['direct'], way = 0;
  function load() {
    var q = '?channel=' + encodeURIComponent(channel) + '&parent=' + encodeURIComponent(location.hostname) + '&autoplay=true&muted=true';
    $('player').src = (ways[way] === 'proxy' ? '/.proxy/twitch/' : 'https://player.twitch.tv/') + q;
  }
  if (inDiscord && window.matchMedia && matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('phone');
  if (!channel) { $('player').hidden = true; $('none').hidden = false; }
  else {
    load();
    if (ways.length > 1) { $('retry').hidden = false; $('retry').onclick = function () { way = (way + 1) % ways.length; $('blocked').textContent = ''; load(); $('hint').textContent = 'Trying the ' + ways[way] + ' way…'; }; }
    document.addEventListener('securitypolicyviolation', function (e) { var t = e.blockedURI || e.violatedDirective; $('blocked').textContent = 'Blocked by Discord: ' + String(t).slice(0, 80); });
  }

  function open(url) { if (sdk) sdk.commands.openExternalLink({ url: url }).catch(function () {}); else window.open(url, '_blank', 'noopener'); }
  $('open').onclick = function () { if (channel) open('https://www.twitch.tv/' + channel); };
  $('chat').onclick = function () { if (channel) open('https://www.twitch.tv/popout/' + channel + '/chat?popout='); };

  if (inDiscord && window.DiscordSDK) { // the Activity's id is the first part of its host name; ready() takes down Discord's loading screen
    try { sdk = new window.DiscordSDK(location.hostname.split('.')[0]); sdk.ready().catch(function () {}); } catch (e) { sdk = null; }
  }
})();
