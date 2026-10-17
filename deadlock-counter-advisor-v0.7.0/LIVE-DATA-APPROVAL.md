# Requirements before enabling automatic live enemy inventories

This is an engineering checklist, **not** evidence of Valve or Overwolf permission.

## Source

Use only a documented provider integration with explicit permission for Deadlock live data. The promising route is Overwolf Electron GEP, which documents `match_info` roster and item fields, and `game_info` phase updates. Standard Electron does **not** have those APIs. Overwolf gaming packages require developer onboarding, its Electron runtime, and application signing for distribution. Do not assume another app's approval extends to this app.

- Docs: https://dev.overwolf.com/ow-electron/live-game-data-gep/supported-games/deadlock/
- GEP: https://dev.overwolf.com/ow-electron/live-game-data-gep/live-game-data-gep-intro/
- Signing: https://dev.overwolf.com/ow-electron/guides/dev-tools/app-signing/
- Supported environments: https://dev.overwolf.com/ow-electron/live-game-data-gep/supported-environment/

## Questions to resolve with Overwolf / Deadlock representatives

1. Can an independent second-monitor item recommendation app use Deadlock roster and `items_N` game events **during active competitive games**?
2. Does that feed include enemy inventories that are **not yet visible** through the game's normal scoreboard? If so, can it be restricted to visible items only? (We should exclude hidden information.)
3. Are real-time item purchase recommendations allowed if the program never injects, clicks or sends inputs?
4. Must the app be submitted to Overwolf for review, and must the developer obtain additional written approval from Valve?
5. Is Deadlock available in GEP's production environment for an approved Electron app? What game IDs and minimum GEP versions apply?
6. Which onboarding, signing, build credentials, and packaging are needed for developers and distribution?

## Implementation checklist when approval is in place

- Create a separate Overwolf Electron app variant rather than silently changing the working plain Electron Windows build.
- Use the official GEP lifecycle (game detected → activate GEP → register `game_info` and `match_info` → events, info updates and exit events). No `overlay` package is needed for the second-monitor interface.
- Pass **only approved and visible** item fields to the main-process event state model (`live/event-state.cjs`); never show unknown-team fields.
- Display source health, disconnections, event delay, and stale-data warnings.
- Verify with a developer test account and official testing guidance before distributing anything.
- Update README and release notes with exact data permissions and publish only after required reviews.

## Explicitly disallowed in this project

Memory reading, process handles into Deadlock, DLL injection, game file modifications, input automation, anti-cheat workarounds, reverse engineering private network protocols, or hidden-data inference.
