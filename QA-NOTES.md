# Overwolf QA notes: Deadlock Counter Advisor v0.13.0

Text for the first QA submission in the Overwolf Developer Console. The part under **For the QA team** can be pasted into the submission's notes. The checklist before it is for us.

## Before submitting (for us)

- [ ] **Merge this PR, then re-run the QA build.** On GitHub, go to **Actions → Overwolf edition build → Run workflow** with mode **qa**. The installer should be named `Deadlock-Counter-Advisor-Overwolf-Setup-0.13.0.exe`.
- [ ] **Scan the installer at [virustotal.com](https://www.virustotal.com).** Overwolf won't test an installer that VirusTotal flags.
- [ ] **Check the installed QA build, without live data.** The QA installer is unsigned. Overwolf's game events only load in an installed build that Overwolf has signed, and Overwolf signs this one for its QA testers only. So on your PC the badge reads "Overwolf game events failed to load", and that's expected. Your dev key doesn't help either: dev mode never works in an installed app.
  - **Clean first run:** close the app and rename `%APPDATA%\Deadlock Counter Advisor`.
  - **Install and first run:** accept the policies, then go through the intro and the consent step.
  - **Theme:** the Dusk fonts, the tome icon in the header, and the taskbar icon. These are new files, and packaging is the step dev mode skips.
  - **Manual mode:** pick enemy heroes and add items, and the picks update.
  - **Controls:** glance view (**G**), the **Ctrl+Shift+F12** hotkey and **↗ Move display**.
  - **Closing:** close the app and confirm no process is left in Task Manager.
- [ ] **Check live data in dev mode from source.** Set your dev key, then run `npm.cmd run start:overwolf`.
  - Play one match through to the end. Check the gold live dot, enemy purchases, your souls and items, and glance view.
  - Then run `npm.cmd run start:overwolf:test-ads` and check that a test ad shows in the ad box.
- [ ] **Regenerate the dev key** in the Developer Console. The old one was pasted into a chat.
- [ ] **Update the console listing.**
  - Icons: upload the tome icon and the gray icon. Both are in the design kit (`icon/png/`, `icon/icon-gray.ico`); check Overwolf's current icon sizes.
  - Screenshots: take them from the Dusk UI, covering the live view, glance view and Settings.
  - Description: say "Not affiliated with or endorsed by Valve."
- [ ] **Decide on game art.** Hero portraits and item icons load from deadlock.io at runtime. The design kit says to check Valve's content rules before publishing.
- [ ] **Policy URLs** for the submission:
  - https://awkwardcarl.github.io/deadlockcounteradvisor/privacy.html
  - https://awkwardcarl.github.io/deadlockcounteradvisor/terms.html

---

## For the QA team

**What it is.** A second-screen companion for Deadlock that suggests which items to buy next. It reads the enemy team, their item purchases, your hero, your souls and the match phase from Overwolf's Deadlock game events. It never touches the game: it doesn't read memory, inject anything, automate input or show an in-game overlay. The window is a normal desktop window, meant for a second monitor.

**What you need.** Deadlock on Windows. A bot match is enough: live data starts once the match loads. A second monitor helps but isn't required.

### How to test

1. **Install.** The installer shows the Terms of Use and Privacy Policy and asks you to accept them.
2. **First launch.** A short intro explains the app. In regions where Overwolf requires consent, it offers Overwolf's consent step.
3. **Without the game.** The status reads **Live source: disconnected**. Manual mode works: under **Enemy lineup**, pick enemy heroes and add items, and the three picks update.
4. **In a match.**
   - The top badge turns to **Live: Overwolf connected** with a gold dot.
   - The left panel shows the enemy team with portraits. The strip above the picks shows the match clock, your hero, souls, net worth and your investment bonuses.
   - Enemy purchases appear as they happen; new ones are ringed in gold for about 20 seconds.
   - Picks update as you earn souls and buy items. Items built into something you own are not suggested again.
5. **Glance view.** Press **G**, or click **Glance mode**. You get the three picks in large type plus every enemy's items; press **Esc** to leave.
6. **Show and hide.** **Ctrl+Shift+F12** shows or hides the window from inside the game. The shortcut is listed under **Settings → Shortcuts**.
7. **Second monitor.** **↗ Move display** moves the window to the next screen, which the app remembers.
8. **End of match.** Leaving or finishing the match clears the lineup, your items and souls. Closing the window ends every process.
9. **Offline.** Recommendations keep working. A notice explains that sync, the debrief and update checks need a connection.
10. **Post-match debrief** (optional). Enter a finished match's ID to compare what you bought with what would have countered the enemy team. It needs internet. The community service it uses limits how many new matches can be loaded per hour.

### Ad box

- One 400×300 container sits at the bottom of the left column in the live and manual views. The left column narrows to fit the box (the picks get the rest of the width), stays in place beside the picks, and its cards scroll above the box, so the box is always fully visible and never moves.
- On windows under 900 px tall (1366×680, 1366×728, 1536×824) the left column's box is a 400×60 banner, and enemy rows show item icons on one line (names on hover), so the whole team fits above the box.
- In glance view the left column is hidden, so that box closes. A second box opens under the enemy rows if the window has room for all of it without scrolling (about 1920×1040 and up); otherwise glance view has no ad.
- An ad view is created only while its box is fully on screen with no dialog open. **Hide inputs**, the post-match debrief, an open dialog or a window too narrow for the side column close it; it reopens in the same place afterwards.
- To preview ad behavior locally, start the app with `--test-ad` (`npm run start:overwolf:test-ads`).

### Settings → Privacy

- **Manage:** opens Overwolf's privacy settings.
- **Use community builds and match stats:** on by default; sends only hero IDs.
- **Update game data automatically:** on by default; downloads public item and hero lists after game patches.
- Both toggles can be turned off; the advice still works without them.

### Data and network

- **Game events.** Overwolf's Deadlock events, features `game_info` and `match_info` only. Player names are used only to match items to players; they are never saved or sent.
- **Network calls**, all for public data and never with account IDs:
  - [deadlock.io](https://deadlock.io): the item and hero catalog, plus artwork.
  - [deadlock-api.com](https://deadlock-api.com): the hero and item list, community builds and item statistics (requested by hero ID), and the match record for a debrief (by the match ID you enter).
- **Ads.** One 400×300 Overwolf ad box (`owadview`) at a time: at the bottom of the left column (cid `dca_400x300_main_lb`; a 400×60 banner, cid `dca_400x60_main_lb`, on windows under 900 px tall), or in glance view under the enemy rows when the window is tall enough (cid `dca_400x300_glance`). Ads are not enabled for our app ID yet, so it shows our background. Nothing we hold is passed to Overwolf or advertisers.
- **Nothing else.** No accounts and no analytics of our own.

### Known limitations

- During the match intro, Overwolf reports some heroes as `UNKNOWN`; they fill in as the match loads.
- Enemy items appear only once an enemy has bought something.
- After a game patch, a new hero shows as "new hero" until we ship a profile for them. Their purchases still count.
- The picks are heuristics from item categories, enemy purchases and community data. They don't simulate combat.

**Contact:** https://github.com/awkwardcarl/deadlockcounteradvisor/issues
