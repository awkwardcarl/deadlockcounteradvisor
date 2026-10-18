'use strict';
/** Approval switches for Overwolf live game data (read by desktop/overwolf-live.cjs).
 *
 * overwolfWhitelist / gameComplianceConfirmed: Overwolf approved the app and
 * whitelisted it for Deadlock game events (2026-10-18). Without both, the
 * GEP adapter refuses to start.
 *
 * enemyInventoryForLiveAdvice: OFF. Overwolf's approval did not address using
 * enemy item purchases for live recommendations, so enemy items from the feed
 * are withheld (heroes, roster and your own items still flow). Turn this on
 * only after written confirmation that live use of enemy purchases is allowed
 * and limited to information players can legitimately see. */
module.exports=Object.freeze({
  overwolfWhitelist:true,
  gameComplianceConfirmed:true,
  enemyInventoryForLiveAdvice:false
});
