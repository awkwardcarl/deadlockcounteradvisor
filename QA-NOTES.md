# Overwolf QA notes: Deadlock Counter Advisor v0.13.0

Text for the first QA submission in the Overwolf Developer Console. The part under **For the QA team** can be pasted into the submission's notes. The checklist before it is for us.

## Before submitting (for us)

- [ ] **Merge this PR, then re-run the QA build.** On GitHub, go to **Actions → Overwolf edition build → Run workflow** with mode **qa**. The installer should be named `Deadlock-Counter-Advisor-Overwolf-Setup-0.13.0.exe`.
- [ ] **Scan the installer at [virustotal.com](https://www.virustotal.com).** Overwolf won't test an installer that VirusTotal flags.
- [ ] **Do one full run on the installed build, not dev mode.**
  - Close the app and rename `%APPDATA%\Deadlock Counter Advisor` so the first run is clean.
  - Install, accept the policies, go through the intro and the consent step, and play one match through to the end.
  - Check that the fonts, the tome icon and the gold live dot show. They are new files, and packaging is the step dev mode skips.
  - Close the app and confirm no process is left in Task Manager.
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
- **Nothing else.** No accounts, no ads and no analytics of our own.

### Known limitations

- During the match intro, Overwolf reports some heroes as `UNKNOWN`; they fill in as the match loads.
- Enemy items appear only once an enemy has bought something.
- After a game patch, a new hero shows as "new hero" until we ship a profile for them. Their purchases still count.
- The picks are heuristics from item categories, enemy purchases and community data. They don't simulate combat.

**Contact:** https://github.com/awkwardcarl/deadlockcounteradvisor/issues
