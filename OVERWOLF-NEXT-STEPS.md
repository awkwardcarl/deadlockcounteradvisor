# Overwolf live data

**Status 2026-10-18:** Overwolf approved the app and whitelisted it for Deadlock game events. The developer has a dev key (`OW_DEV_KEY`) and Developer Console access.

## What live mode does

When the app runs on Overwolf's Electron runtime with valid credentials, `desktop/overwolf-live.cjs` connects Overwolf's game events package (GEP) to the advisor in the main process:

- **Live:** enemy heroes, your hero, your souls, **your own items**, match start/end and the match clock. They flow into the same keep-your-edits merge as the local feed.
- **Withheld:** enemy item purchases. Overwolf's approval did not address using them for live recommendations, so `enemyInventoryForLiveAdvice` in `desktop/live-approval.cjs` is `false`. Turn it on only after **written** confirmation that live use of enemy purchases is allowed and limited to information players can legitimately see.
- The renderer only receives validated `EventState` snapshots, never the GEP API, Steam IDs or credentials. In-game player names are used for matching but not saved.
- The standard Electron build (the current installer and auto-updates) is unchanged; there, live mode reports itself unavailable.

## Test it on your PC (dev mode)

Dev mode only works when running from source; it can't activate in an installed build.

1. In the project folder, install dependencies (first time, or after pulling this change):
   ```bash
   npm ci
   ```
2. In the **same PowerShell window**, set your dev key for this session only. Never commit it or paste it anywhere else:
   ```bash
   $env:OW_DEV_KEY = '<your dev key>'
   ```
3. Start the Overwolf version:
   ```bash
   npm run start:overwolf
   ```
4. In the app's Setup section, the live status should go **Overwolf: loading → waiting for a match**. Start a Deadlock match (a bot match is fine); it should change to **connected**, and the enemy lineup, your hero, souls and owned items should fill in.

**Troubleshooting**

- *"Overwolf game events failed to load"*: the dev key wasn't set in that window, or is wrong.
- *"Deadlock is running as administrator"*: run the app as administrator too, or start Deadlock normally.
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
