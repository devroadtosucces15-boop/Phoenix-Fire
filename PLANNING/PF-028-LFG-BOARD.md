# PF-028 – the live Rush board (LFG)

**What changed.** Availability for Rush now lives on ONE message, the live board, in a channel a manager picks. `/lfg now` and `/lfg cancel` only work while that board exists. The per-call posts of PF-027 are gone for new calls (they still work for calls made before).

## Owner steps (once)
1. In the Rush channel run `/lfg setup` (managers). It saves that channel as the Organization purpose **`rush_lfg`** (visible and editable in the Control Center → Organization → channels) and posts the board. `/lfg setup channel:#other` picks a different channel. Running it again moves or re-posts the board.
2. Give the Rush bot View Channel, Send Messages, Embed Links and Manage Messages (to delete the old copy it replaced) in that channel.

## How members use it
- **I'm in** (board button, or `/lfg now`) opens a private dropdown: Goalkeeper, Striker, Centre back, Winger, Any position. Pick one or several. The profile positions are not used. Picking again changes the positions of the same call.
- The board lists everyone available (name, positions, until when). A new call tags the Rush role (config `ping_rush`) once; changes edit the board quietly.
- **+1 hour**, **Take me off**, **Make a lobby** (asks everyone else on the list by DM; nobody is added unless they accept) and **Alert me** (🔔) are on the board.
- A member who is in a queue group cannot go available; muted members cannot.

## The @here announcement (PF-028b)
- A NEW call (not a change of positions) posts a second message right under the board: `@here **Name** is available to play Rush as **positions**. Send them an invite if you can.` plus `-# Also on the list with N others.` Only the newest player is named; everyone else is a count.
- Only one announcement exists: the next one deletes the previous. If the board has to move to the bottom the announcement comes back under it without the @here. It is removed when its player goes off the list or the call ends.
- The board stays the "last" message with the announcement under it: the 1-minute check accepts either as the newest. KV `lfg:ann:<channel>` = `{ id, at, uid, body }`. Code: `announcement()` and `refreshLfgBoard(..., { announce })` in `bot/lfgboard.js`. The bot needs Mention Everyone in the channel for @here to ping.

## How the board stays last
- The 1-minute job (`lfgTick` → `lfgBoardTick`) reads the channel's newest message id. If something was written under the board it is sent again at the bottom and the old copy is deleted (no ping). When the board is already newest it is only edited in place. A call that ends refreshes the list.
- KV `lfg:board:<channel>` = `{ id, at }` of the board message.

## Where it is in the code
`bot/lfgboard.js` (board, dropdown, refresh, tick), `bot/lfg.js` (`/lfg setup|now|cancel`, buttons, `goAvailable`, `takeDown`, `addHour`, `makeLobby(..., fromBoard)`), purpose `rush_lfg` in `bot/orgconsts.js` and `bot/orgconfig.js`, component ids `pf:lfg:board:in|off|plus|lobby` and `pf:lfg:pos:<minutes>` in `LFG_ID`. Tests: `tests/lfg-board.test.mjs`.

## Not done
- Alert me still uses the profile positions for the DM filter (it has no dropdown yet).
- Points for filling a lobby.
