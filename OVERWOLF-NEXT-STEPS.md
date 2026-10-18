# Overwolf live data

**Status 2026-10-18:** Overwolf approved the app and whitelisted it for Deadlock game events. The developer has a dev key (`OW_DEV_KEY`) and Developer Console access.

**Verified 2026-10-18 in a real match (dev mode):** status reached *connected*; enemy heroes, your hero, souls (rising as earned) and your purchased items filled in; enemy items stayed empty (they were still switched off then). Overwolf sends some heroes under old names ("VIPER" for Vyper); the app maps them by name, then the game's hero ID, then a short rename list.

## What live mode does

When the app runs on Overwolf's Electron runtime with valid credentials, `desktop/overwolf-live.cjs` connects Overwolf's game events package (GEP) to the advisor in the main process:

- **Live:** enemy heroes and **their item purchases**, your hero, your souls, **your own items**, match start/end and the match clock. They flow into the same keep-your-edits merge as the local feed.
- **Enemy items** have been on since 2026-10-18: the developer confirmed that Overwolf allows it, and Deadlock's scoreboard shows every player's items. To withhold them again, set `enemyInventoryForLiveAdvice` in `desktop/live-approval.cjs` to `false`.
- Items are matched to the catalog by the game's class name (for example `upgrade_rapid_rounds`), so a stale display name from Overwolf still counts toward the advice once the catalog is synced.
- The renderer only receives validated `EventState` snapshots, never the GEP API, Steam IDs or credentials. In-game player names are used for matching but not saved.
- The standard Electron build (the current installer and auto-updates) is unchanged; there, live mode reports itself unavailable.

## Test it on your PC (dev mode)

Dev mode only works when running from source; it can't activate in an installed build. These steps use `npm.cmd`, which works even when PowerShell's script policy blocks the plain `npm` command.

1. Open PowerShell in the project folder:
   ```bash
   cd "C:\Users\claut\OneDrive\Documents\GitHub\deadlockcounteradvisor"
   ```
2. Install dependencies (first time, or after pulling changes):
   ```bash
   npm.cmd ci
   ```
3. In the **same PowerShell window**, set your dev key for this session only. Replace `PASTE_YOUR_KEY_HERE` with the key itself: keep the single quotes, and add no angle brackets or spaces. Never commit the key or paste it into a chat or issue:
   ```bash
   $env:OW_DEV_KEY = 'PASTE_YOUR_KEY_HERE'
   ```
4. Start the Overwolf version (the first launch downloads Overwolf's runtime):
   ```bash
   npm.cmd run start:overwolf
   ```
5. In the app's Setup section, the live status should go **Overwolf: loading → waiting for a match**. Start a Deadlock match (a bot match is fine); it should change to **connected**, and the enemy lineup with their items, your hero, souls and owned items should fill in.

**Troubleshooting**

- *"Overwolf game events failed to load"*, or `invalid verification` in the terminal: the dev key wasn't set in that window, or is wrong (check for leftover angle brackets, spaces or a missing character).
- *`npm.ps1 cannot be loaded because running scripts is disabled`*: use `npm.cmd` as shown above.
- *"Deadlock is running as administrator"*: run the app as administrator too, or start Deadlock normally.
- *"Deadlock detected. Connecting to match data..."* for a while: the app retries registration for about 30 seconds; if it then shows an error, the message includes Overwolf's reason and the features it reported.
- *Stays on "waiting for a match"*: game events only start once Deadlock is detected; check the [game events status page](https://dev.overwolf.com/ow-electron/live-game-data-gep/game-events-status-health).

## Before shipping live mode to players

Packaged builds only load Overwolf packages when **both** signatures are present ([App Signing](https://dev.overwolf.com/ow-electron/guides/dev-tools/app-signing)):

1. **Overwolf signing:** build with `@overwolf/ow-electron-builder` (≥ 26.9.0) using `OW_CLI_EMAIL`, `OW_CLI_API_KEY` and `OW_BUILD_KEY` from the Developer Console, for the app's registered App UID. Store these as GitHub Actions secrets, never in the repository.
2. **Your own code-signing certificate** on the `.exe` (now required).

Then switch the release workflow from `electron-builder` to `ow-electron-builder`, confirm the GitHub auto-update flow still works with it, and do a QA submission (Overwolf signs the first one for QA only). The app runs on Overwolf's Electron 42.11 (Electron 44 is beta there), a small step back from the standard build's 44.8.

**Do not paste API keys, certificates, user authentication credentials, or signing secrets into a chat or public issue.**

Official docs:
- https://dev.overwolf.com/ow-electron/guides/dev-tools/dev-mode/
- https://dev.overwolf.com/ow-electron/guides/dev-tools/app-signing
- https://dev.overwolf.com/ow-electron/live-game-data-gep/supported-games/deadlock/
- https://dev.overwolf.com/ow-electron/reference/Overwolf-electron-APIs/gep/Overview/
