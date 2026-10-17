# Deadlock Counter Advisor v0.7.0 — GitHub release update groundwork

**What's new:** Prepared the existing second-screen app for an installed Windows edition with GitHub Release update checks. Updates are checked on launch but **not downloaded or installed** without your explicit permission. There is no forced in-game restart, no new game telemetry, and no change to the manual recommendation engine. The existing responsive layout remains.

**Repository:** https://github.com/awkwardcarl/deadlockcounteradvisor

**Start here:** Read [`SETUP-GITHUB-UPDATES.md`](SETUP-GITHUB-UPDATES.md) before publishing anything. It walks through pushing the source to your new repository, running a Windows test installer build on GitHub Actions, and publishing a reviewable *draft* release when you're ready.

**Important:** The older `Build-EXE-Folder.cmd` still works as a desktop application, but **does not support auto-updates**. Only the NSIS installer from `Build-Installer.cmd` or the GitHub Windows Release workflow includes update metadata. The Windows NSIS build and actual update download cannot be run and verified in this environment; source logic and browser views have been tested.

**Signing:** v0.7 is an integration-ready source package, not a production signed release. Obtain a publisher identity/certificate before wide distribution, and independently verify packaged update and uninstall flows on Windows. Do not embed GitHub tokens in the application.

---

# v0.6.2 — readability and ultrawide refinement

This update keeps the v0.6.1 feature set, catalog, saved matches, read-only process detection, and isolated event-feed testing. It improves the existing screen instead of replacing it.

- **Text size** menu in the top-right toolbar: Auto (responsive), Standard, Comfortable, or Large. The preference is saved locally.
- The three quick purchase choices show actual public item artwork (where available), larger names, clear purchase affordability and prices, and concise reasons.
- On ultrawide displays (3000 CSS pixels and wider), game status, catalog, and build context share one row with the enemy lineup below, eliminating the old empty grid cell.
- Narrower displays remain responsive, and all recommendations stay manual until there is a separately authorized data source.
- Build method: **Build-EXE-Folder.cmd** (the method previously confirmed working on Windows).

**No new game-memory access, overlay, automation, or unapproved live telemetry has been added.**

---

# Deadlock Counter Advisor — Windows Desktop v0.6.2

**Free, second-monitor companion · public community prototype · no affiliation with Valve or Overwolf**

## What changed in v0.6.2

### Automatic monitor sizing and full-width layout

- Removes the former fixed 1660px dashboard width. The interface now uses the full Windows app viewport on ultrawide, 4K, and standard displays, and readjusts as the window is resized.
- **Ultrawide**: form controls can use a two-column grid while full explanations adapt to the width available on the right. **1080p/1440p**: balanced two-panel layout. **Narrow display**: panels stack, with the recommendation strip adapting to its container size.
- First launch on the new version migrates v0.6-era saved fixed-size windows to roughly 94% of the monitor work area. After that, user resizing and placement are respected. Fullscreen/maximized state persists.
- Toolbar shows active display number, approximate physical resolution, and Windows scaling percentage. Moving to another display proportionally resizes the window to fit its new work area; display unplugging or resolution changes clamp it onscreen.
- Screen resolution is read through Electron screen APIs in device-independent pixels (which account for Windows scaling); CSS responds to **window width**, not a hard-coded monitor profile. No game access is involved.

## Previously added in v0.6

### 1. Stronger, explainable recommendations

- Multiple entries of the same item on one enemy no longer inflate recommendations. Similar enemy threats have diminishing influence rather than multiplying without limit.
- Recommends only items with **reviewed counter mappings**. Unknown shop items remain in the public catalog without invented counter effects.
- Better weighs different opponent coverage and general hero fit, with explicit warnings when a hero profile or enemy item is not understood.
- Incorporates the **component credit** for upgrades when current public item data lists a component you already own. The price shown for those upgrades is the *remaining souls to pay*; the full original price remains visible in the detailed card. Double-check against the in-game shop.
- Choose one of four situational emphasis modes: **Balanced**, **Survive damage**, **Escape / disables**, or **Stop sustain**.

**Important:** Ranking numbers are ordinal *heuristics*, not win probabilities, expected damage, or verified hero-ability simulations. The game is changing rapidly and source mechanics require review with every patch. Item slots, cooldowns, positioning, team coordination, and map state are not modeled.

### 2. Faster second-monitor interface

- A high-visibility **three next-item options** strip separates items you can afford now from longer-term save targets.
- A compact evidence quality indicator discloses missing hero/item recognition and an incomplete starter catalog.
- Full explanations are below the quick picks, collapsed to four cards by default with **Show all suggestions** for the rest.
- No overlays or input control, and your familiar hero, inventory, enemy, catalog-sync and second-monitor controls remain.

### 3. Official Overwolf integration readiness (still approval-gated)

- `live/overwolf-gep-adapter.cjs` is a **separate, simulated and testable integration module** based on the documented Deadlock event shapes.
- It listens for game detection, match roster updates and inventory changes in mocked tests, resets on game exit/match boundaries, and withholds enemy inventory without a separate affirmative permission flag.
- The module is **not imported into the Electron main process, preload or renderer**, and this release **does not** connect to Overwolf, Steam or Deadlock to read live inventory.
- Your Overwolf application idea has been submitted. Do not use live GEP to advise players until Overwolf has granted whitelisting and appropriate publisher/fair-play permission.

See `OVERWOLF-NEXT-STEPS.md` for precise technical and approval steps.

## Build and run on Windows

1. Keep your existing working v0.6.1 build. Extract this ZIP to a **different folder**.
2. Double-click **`Build-EXE-Folder.cmd`** (the build method that succeeded on your Windows PC). An internet connection is needed for the *first* Node/Electron dependency install; Node.js must be installed to **build**, not to **run** the resulting app.
3. Once the build reports success, open `release\Deadlock Counter Advisor-win32-x64\`.
4. Launch **`Deadlock Counter Advisor.exe`**. Keep the adjacent files and folders with the EXE. A shortcut to the EXE can be placed on your desktop.
5. Click **Sync items & heroes** for the latest public metadata, then use **Load example match** to try the quick-buy cards and priorities. Sync is opt-in and cached.

The single-file `Build-Portable-EXE.cmd` is included for completeness but **is not recommended** on your PC because previous attempts failed. The existing EXE-folder builder is unchanged.

## Data and safety boundaries

- The only permitted public metadata sync uses fixed `https://deadlock.io/api/v1/items.json` and `.../heroes.json` endpoints; image requests are allowlisted by host and path. Actual catalog data is not bundled because it is fetched on demand. No arbitrary network requests are accepted from the UI.
- The optional game detector checks the names reported by Windows `tasklist.exe`; that can establish only whether the game *process* is running, not whether a match is active.
- The optional JSON Lines feed is **development/offline replay only** unless an approved provider is available. `live/EXAMPLE-LIVE-FEED.jsonl` contains simulated game data.
- No read/process memory, drivers, injection, overlays, hidden information access, input automation or automatic purchases.
- No guarantee against game bans can be made by this or any third-party app. The ability to technically access a field is **not** evidence that a competitive use is permitted.

## Developer tests

Requires Node.js, but not Electron to execute the tests:

```
npm test
```

Tests cover legacy logic, source and icon checks, upgrade and threat-scoring behavior, mocked Overwolf events, and monitor geometry for six display sizes and 36 display transfers. Browser layout checked at 3440×1440, 1920×1080, 1366×768, and compact 800px viewports; **the native Windows executable build and actual GEP SDK have not been run in this environment**.

## References

- Overwolf Deadlock event definitions: https://dev.overwolf.com/ow-electron/live-game-data-gep/supported-games/deadlock/
- Overwolf Electron GEP introduction: https://dev.overwolf.com/ow-electron/live-game-data-gep/live-game-data-gep-intro/
- Community item/hero API: https://api.deadlock-api.com/docs
- Deadlock Wiki item mechanics and component discounts: https://deadlock.wiki/Items
