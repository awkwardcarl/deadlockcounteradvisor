# Overwolf approval and integration handoff

**Status 2026-10-16: application idea submitted by project owner; Overwolf approval / app whitelisting not yet confirmed.**

We will ship a standard independent Electron build until the following are confirmed in writing:

1. Overwolf has approved the public app concept and enabled developer whitelisting for the relevant Deadlock gaming package.
2. The developer and publisher's fair-play rules expressly permit using `roster_N` and `items_N` **for real-time recommendations on enemy purchases**; approval for use of public or post-game stats alone is not enough.
3. We can determine when enemy inventories are visible/legitimately available to the player. If visibility is restricted or ambiguous, turn off live enemy inventory collection and recommend using manual/shop/post-game data only.
4. Review data retention, privacy, developer API credentials, signing certificate management, and Overwolf's Electron runtime/build requirements.

## Code already prepared

- `live/event-state.cjs` converts documented roster, item, match ID and match boundaries to validated state while withholding enemy labels when local team identification fails.
- `live/overwolf-gep-adapter.cjs` is a deliberately **disconnected** API integration concept, copied from the approval kit. Constructor accepts a GEP client (the tests supply a mock). Activation checks approval flags, subscribes to `game-detected`, `new-info-update`, `new-game-event`, and cleans up on stop. If `enemyInventoryForLiveAdvice` is false, inventory payloads are stripped.
- `tests/adapter-tests.cjs` exercises that isolation with a fake provider. Tests are **not** proof of SDK or ban-policy approval.

## After permission

- Replace the stock `electron` module with the supported `@overwolf/ow-electron` runtime and packaging/signing infrastructure in a **separate branch**, then verify API signatures against the installed SDK.
- Route approved GEP events to the **main process** and `EventState`, exposing only minimal validated match snapshots via a restricted IPC path. Don't expose the entire provider API, raw Steam IDs or authentication secrets to the renderer.
- Feature-gate live enemy item collection **separately** from detection or roster collection, and fail closed when permission is missing, GEP status is degraded, local team identity is unverified, events are stale or match IDs change.
- Keep the second-monitor window; no in-game overlay or game-control mechanism is required.
- Use an approval-controlled public beta and verify behavior against actual Windows runtime events only after receiving permission. Document availability and disable telemetry features promptly if rules or event support change.

**Do not paste API keys, certificates, user authentication credentials, or signing secrets into a ChatGPT conversation or public issue.**

Official docs:
- https://dev.overwolf.com/ow-electron/reference/Overwolf-electron-APIs/gep/Overview/
- https://dev.overwolf.com/ow-electron/live-game-data-gep/supported-games/deadlock/
- https://dev.overwolf.com/ow-electron/getting-started/develop-your-idea/
