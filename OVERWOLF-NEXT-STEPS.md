# Overwolf live data

**Status 2026-10-18:** Overwolf approved the app and whitelisted it for Deadlock game events. The developer has a dev key (`OW_DEV_KEY`) and Developer Console access.

**Verified 2026-10-18 in a real match (dev mode):** status reached *connected*; enemy heroes, your hero, souls (rising as earned) and your purchased items filled in; enemy items stayed empty (they were still switched off then). Overwolf sends some heroes under old names ("VIPER" for Vyper); the app maps them by name, then the game's hero ID, then a short rename list.

**Seen in later matches (terminal log):**
- Enemy items arrived for all six opponents and matched the catalog by class name.
- Hero names arrive in capitals ("SHIV") and resolve regardless of case. Overwolf's `hero_id` matches the catalog's hero IDs (Vindicta 3, Yamato 27, Abrams 6, Viscous 35, Paige 67, Shiv 19). Deadman Danny came as `UNKNOWN` with ID 78 arriving after the name; heroes start as `UNKNOWN` with no ID during the intro and fill in as they load.
- Phases seen: `Init`, `MatchIntro`, `WaitForMapToLoad`, `PreGameWait`, `GameInProgress`, and after leaving `Init`, `HeroSelection`, `GameInProgress`. A new `match_id` arrives for each match, and `match_end` fires when you leave early as well as at a normal end. At match end the app clears the lineup, your items and souls.
- The terminal prints these boundaries (`Overwolf event: ...`) and each match's hero names and IDs (`Overwolf heroes ...`), never player names.

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

## Shipping live mode to players

Installed builds only load Overwolf's packages when **both** signatures are present: Overwolf's signature on the app package, and a code signature on the `.exe` ([App Signing](https://dev.overwolf.com/ow-electron/guides/dev-tools/app-signing)).

The **Overwolf edition build** workflow (`.github/workflows/overwolf-build.yml`) builds that edition with `@overwolf/ow-electron-builder` and `electron-builder.overwolf.cjs`. It only runs when you start it, uploads the installer (`Deadlock-Counter-Advisor-Overwolf-Setup-<version>.exe`) as a downloadable artifact, and never publishes a release. The standard release workflow and auto-updates are unchanged. Installing the Overwolf edition replaces a standard install on the same PC (same app ID).

### 1. QA submission (no keys needed)

1. On GitHub: **Actions → Overwolf edition build → Run workflow**, mode **qa**. Or from PowerShell in the project folder:
   ```bash
   gh workflow run overwolf-build.yml -f mode=qa
   ```
2. When it finishes, download the `deadlock-counter-advisor-overwolf-qa` artifact from the run's page.
3. Submit the installer inside it for QA in the Overwolf Developer Console. Overwolf signs this first build for QA testing only.

### 2. Add the signing credentials as repository secrets

| Secret | Where to find it |
|---|---|
| `OW_CLI_EMAIL` | Your Overwolf Console account email |
| `OW_CLI_API_KEY` | Overwolf Console → Profile → API Keys |
| `OW_BUILD_KEY` | Overwolf Console → Release management → App Keys |

Add each under **GitHub → Settings → Secrets and variables → Actions → New repository secret**, or from PowerShell in the project folder. Each command asks for the value, so it never lands in your command history or a chat:
```bash
gh secret set OW_CLI_EMAIL
```
```bash
gh secret set OW_CLI_API_KEY
```
```bash
gh secret set OW_BUILD_KEY
```
The App UID needs no setting: Overwolf's signing service identifies the app from the App Key.

### 3. Code-sign the `.exe`

- **Ask Overwolf first** whether this app is entitled to **Overwolf certificate signing**. If it is, the builder signs the app `.exe` with Overwolf's certificate (`enableOWCertSigning` is on in `electron-builder.overwolf.cjs`); if not, the build log says the app is not eligible. This covers the app `.exe`, not the installer, so Windows may still warn when the installer runs.
- **Otherwise**, or to sign the installer too, get your own certificate (Azure Artifact Signing or an OV certificate) and add its settings under `win` in `electron-builder.overwolf.cjs` (`azureSignOptions` or `signtoolOptions`), plus its secrets in the workflow. Your own certificate takes priority over Overwolf's.

### 4. Signed build

Run the workflow with mode **signed**. It checks the three secrets first, and the build stops if Overwolf signing fails (`requireSigning`), so no unusable build comes out. Install it on a PC without `OW_DEV_KEY` set and confirm live mode reaches *connected* in a match.

### 5. Switch releases (later)

The Overwolf edition has no update feed for now, so it can never auto-update itself to the standard build (which has no live data). Once signed builds work, the release workflow moves to `ow-electron-builder` with the GitHub update feed, and that edition becomes the one players download. It runs on Overwolf's Electron 42.11 (Electron 44 is beta there), a small step back from the standard build's 44.8.

**Building it on your own PC:** `npm run build:overwolf` (set `OW_QA_BUILD=1` for an unsigned QA build). Code signing needs electron-builder's signing tools, whose archive contains symbolic links; extracting them needs Windows Developer Mode or an administrator terminal. GitHub's Windows runners have this, so the workflow is unaffected.

**Do not paste API keys, certificates, user authentication credentials, or signing secrets into a chat or public issue.**

Official docs:
- https://dev.overwolf.com/ow-electron/guides/dev-tools/dev-mode/
- https://dev.overwolf.com/ow-electron/guides/dev-tools/app-signing
- https://dev.overwolf.com/ow-electron/live-game-data-gep/supported-games/deadlock/
- https://dev.overwolf.com/ow-electron/reference/Overwolf-electron-APIs/gep/Overview/
