'use strict';
/** Approval switches for Overwolf live game data (read by desktop/overwolf-live.cjs).
 *
 * overwolfWhitelist / gameComplianceConfirmed: Overwolf approved the app and
 * whitelisted it for Deadlock game events (2026-10-18). Without both, the
 * GEP adapter refuses to start.
 *
 * enemyInventoryForLiveAdvice: ON (2026-10-18). The developer confirmed that
 * Overwolf allows live use of enemy item purchases. Deadlock's in-game
 * scoreboard shows every player's items, so this is information players can
 * already see. Set to false to withhold enemy items again (heroes, roster and
 * your own items still flow). See LIVE-DATA-APPROVAL.md. */
module.exports=Object.freeze({
  overwolfWhitelist:true,
  gameComplianceConfirmed:true,
  enemyInventoryForLiveAdvice:true
});
