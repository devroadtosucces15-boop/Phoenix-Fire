/* The watch Activity: the club's Twitch stream inside a Discord voice channel. Runs in Discord (its page proxy) and also in a plain browser for testing.
   Name, motto and channel come from overlay-brand.js and activity-config.js (config.json at build time). */
(function () {
  'use strict';
  var B = window.PF_BRAND || {}, C = window.PF_ACTIVITY || {}, Q = new URLSearchParams(location.search), $ = function (id) { return document.getElementById(id); };
  var channel = String(C.channel || Q.get('channel') || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25);
  var inDiscord = /\.discordsays\.com$/.test(location.hostname), sdk = null;
  var root = document.documentElement.style; if (B.accent) root.setProperty('--accent', B.accent); if (B.ink) root.setProperty('--ink', B.ink); if (B.goldTop) root.setProperty('--gold', B.goldTop);
  $('name').textContent = (B.name || 'Live') + ' · LIVE'; $('motto').textContent = B.motto || ''; if (B.crest) $('crest').src = B.crest;

  // Found with tools/activity-sim: Twitch's player page cannot run inside Discord. Its scripts load from assets.twitch.tv (Discord's proxy-only rule blocks that) and, with the rule off,
  // are refused by CORS because the page is not on twitch.tv. So inside Discord the stage shows Twitch's live preview image through the mapped proxy
  // (/.proxy/preview -> static-cdn.jtvnw.net), refreshed every minute, and "Open on Twitch" starts the real video. A plain browser (testing) keeps the real player.
  function status(t) { $('blocked').textContent = t; }
  var log = [], t0 = Date.now(); // every step is written on screen, so a blank stage says how far it got (read the line in a screenshot)
  function note(s) { log.push(Math.round((Date.now() - t0) / 100) / 10 + 's ' + s); status(log.slice(-4).join(' · ')); }
  if (inDiscord && window.matchMedia && matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('phone');
  document.addEventListener('securitypolicyviolation', function (e) { note('Discord blocked ' + (e.effectiveDirective || e.violatedDirective || '') + ' ' + String(e.blockedURI || 'unknown').slice(0, 60)); });
  if (!channel) { $('player').hidden = true; $('none').hidden = false; }
  else if (inDiscord) {
    var shot = $('shot'); $('player').hidden = true; shot.hidden = false; note('page in Discord');
    var refresh = function () { shot.src = '/.proxy/preview/previews-ttv/live_user_' + channel + '-1280x720.jpg?t=' + Math.floor(Date.now() / 60000); };
    shot.onload = function () { note('preview image ' + shot.naturalWidth + 'x' + shot.naturalHeight); $('hint').textContent = 'Live preview, refreshed every minute. Open on Twitch for the live video.'; };
    shot.onerror = function () { note('preview image did not load (stream offline, or the /preview mapping is missing)'); };
    refresh(); setInterval(refresh, 60000);
  } else {
    note('page in a browser'); $('player').addEventListener('load', function () { note('player frame loaded'); });
    $('player').src = 'https://player.twitch.tv/?channel=' + encodeURIComponent(channel) + '&parent=' + encodeURIComponent(location.hostname) + '&autoplay=true&muted=true';
  }

  function open(url) { if (sdk) sdk.commands.openExternalLink({ url: url }).catch(function () {}); else window.open(url, '_blank', 'noopener'); }
  $('open').onclick = function () { if (channel) open('https://www.twitch.tv/' + channel); };
  $('chat').onclick = function () { if (channel) open('https://www.twitch.tv/popout/' + channel + '/chat?popout='); };

  if (inDiscord && window.DiscordSDK) { // the Activity's id is the first part of its host name; ready() takes down Discord's loading screen
    try { sdk = new window.DiscordSDK(location.hostname.split('.')[0]); sdk.ready().catch(function () {}); } catch (e) { sdk = null; }
  }
})();
