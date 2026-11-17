# PF-022 step 8: before and after checklist

Written from the old `boardroom.js` (Switches, Health, Audit, Announce, Hall of Fame, Medals, Backup, Organization, Tools) and the old `tools.js` (Submissions, Reports, Game data, Bot, Awards) at commit eed2a4c, before anything was moved. Every row is ticked by `tests/cc-step8.test.mjs` (it fails if a row is missing from the new file, or if a row of this list is missing here).

## Where each old thing went

| Old page or tab | Now |
|---|---|
| Boardroom › Switches (`staff-switches.html`) | Control Center › Site access (retired, redirects) |
| Boardroom › Organization (`staff-organization.html`) | Control Center › Organization (retired, redirects) |
| Boardroom › Audit (`staff-audit.html`) | Control Center › Audit log; its Submissions and Reports views are the Submissions and Reports tools (retired, redirects) |
| Boardroom › Health, Announce, Hall of Fame, Medals, Backup | Control Center views (owner), same code, mounted once (`br:` modules) |
| Boardroom › Tools (the finder) | Control Center › Boardroom (one tile everywhere) |
| Tools › Submissions, Reports, Game data, Awards (`staff-tools.html`) | Control Center tools (`tl:` modules) |
| Tools › Bot (settings, routing, commands) | Control Center › Bot settings and Bot commands (new settings areas from PF-022a) |

Old addresses: every `staff-*.html` above is now a redirect page (meta refresh, a visible link, an inline script that maps the old anchor, e.g. `staff-boardroom.html#hof` to `staff-controlcenter.html#halloffame`). The Control Center itself also understands the old anchors (`#switches`, `#hof`, `#bot`), so a bookmark of either kind works.

## Checklist (all ticked by the test)

- [x] Switches: set a level per feature (off, owner, managers, members, public) → `next/static/controlcenter.js`
- [x] Switches: ask before a change, say who will see it → `next/static/controlcenter.js`
- [x] Switches: undo the last change → `next/static/controlcenter.js`
- [x] Switches: show a live override and go back to the committed level → `next/static/controlcenter.js`
- [x] Switches: count the live overrides → `next/static/controlcenter.js`
- [x] Switches: find a feature by name → `next/static/controlcenter.js`
- [x] Switches: grouped, collapsible, with counts → `next/static/controlcenter.js`
- [x] Switches: Go to where the feature lives → `next/static/controlcenter.js`
- [x] Switches: Show me as owner, member or guest (display only) → `next/static/controlcenter.js`
- [x] Switches: only the owner changes, managers see → `next/static/controlcenter.js`
- [x] Switches: the group list is the same one in the manifest → `next/lib/staffmanifest.mjs`
- [x] Organization: the shared panel (clubs, divisions, servers, channels, roles) → `next/static/controlcenter.js`
- [x] Audit: activity log, newest first → `next/static/ccsettings.js`
- [x] Audit: search the log → `next/static/ccsettings.js`
- [x] Audit: filter by kind (settings, activity, roles) → `next/static/ccsettings.js`
- [x] Audit: show more → `next/static/ccsettings.js`
- [x] Audit: icons per kind of entry → `next/static/ccsettings.js`
- [x] Audit › Submissions: the Submissions tool (type + search + CSV) → `next/static/tools.js`
- [x] Audit › Reports: the Reports tool (clear or remove) → `next/static/tools.js`
- [x] Boardroom Tools: finder over every staff tool, built from the manifest → `next/static/boardroom.js`
- [x] Boardroom Tools: links outside the site (Discord, Cloudflare, YouTube, Twitch) → `next/static/boardroom.js`
- [x] Boardroom Tools: jump to a feature by name → `next/static/boardroom.js`
- [x] Boardroom Health → `next/static/boardroom.js`
- [x] Boardroom Announce: preview then confirm → `next/static/boardroom.js`
- [x] Boardroom Announce: post a club doc to Discord → `next/static/boardroom.js`
- [x] Boardroom Hall of Fame: induct and remove → `next/static/boardroom.js`
- [x] Boardroom Medals: save, hide, reset, delete, award, revoke → `next/static/boardroom.js`
- [x] Boardroom Backup: download and restore medals → `next/static/boardroom.js`
- [x] Tools Submissions: type, search, CSV export → `next/static/tools.js`
- [x] Tools Reports: clear or remove a reported post, message or feedback → `next/static/tools.js`
- [x] Tools Game data: publish, dismiss, download → `next/static/tools.js`
- [x] Tools Awards: categories, close the week, results channel → `next/static/tools.js`
- [x] Tools Bot: embed colour, emoji, auto-posts, result and reminder channel, ping role → `next/static/ccsettings.js`
- [x] Tools Bot: notification routing table (add, remove, save, role and channel pickers) → `next/static/ccsettings.js`
- [x] Tools Bot: command rules (on, lowest level, reply, only in, post to) → `next/static/controlcenter.js`
- [x] Tools Bot: Sync to Discord → `next/static/controlcenter.js`
- [x] Bot settings (new): Rush queue, welcome and leave, ping roles, profanity alerts, stream sources, recruitment, match alert, stream links, fold in the old settings → `next/static/ccsettings.js`
- [x] Shell: every retired tool is a sidebar entry that mounts in place → `next/static/ccshell.js`
- [x] Shell: the page hosts the three mount points → `next/pages/hub.mjs (controlCenter)`

## Not carried over, on purpose

- The Boardroom "Audit › Submissions" and "Audit › Reports" sub-tabs: they were second copies of the Tools views, now the single Submissions and Reports tools.
- The Tools page's own Bot tab on `/api/bot/settings`, `/api/bot/commands` and `/api/bot/routes` (owner only; managers got an error): the Control Center reads `/api/controlcenter/settings` (managers and the owner, with the owner/manager split) and the command rules from the registry rows. The old routes still exist for the Discord bot and the owner.
