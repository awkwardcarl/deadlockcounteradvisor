'use strict';
// Electron screen/display bounds are in device-independent pixels (DIP).
// Layout proportions deliberately use workArea, not physical monitor pixels,
// so the same behavior holds on 100% / 150% / 200% Windows display scaling.
const LAYOUT_REVISION = 2;
const MARGIN = 18;
const MIN_WIDTH = 680;
const MIN_HEIGHT = 480;
const round = Math.round;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function inArea(bounds, area) {
  return bounds.x >= area.x && bounds.y >= area.y &&
    bounds.x + bounds.width <= area.x + area.width &&
    bounds.y + bounds.height <= area.y + area.height;
}
function responsiveBounds(area, prior = null) {
  const maxW = Math.max(320, area.width - 2 * Math.min(MARGIN, area.width * .02));
  const maxH = Math.max(300, area.height - 2 * Math.min(MARGIN, area.height * .02));
  const fresh = !prior || prior.layoutRevision !== LAYOUT_REVISION;
  // On first run (or v0.6's legacy 1120px saved position), take up ~94% of
  // the current display instead of forcing a 1120px window on an ultrawide.
  const desiredW = fresh ? round(area.width * .94) : prior.width;
  const desiredH = fresh ? round(area.height * .91) : prior.height;
  const width = round(clamp(desiredW, Math.min(MIN_WIDTH, maxW), maxW));
  const height = round(clamp(desiredH, Math.min(MIN_HEIGHT, maxH), maxH));
  const x = fresh ? round(area.x + (area.width - width) / 2)
    : round(clamp(prior.x, area.x, area.x + area.width - width));
  const y = fresh ? round(area.y + (area.height - height) / 2)
    : round(clamp(prior.y, area.y, area.y + area.height - height));
  return { x, y, width, height };
}
function transferredBounds(sourceArea, targetArea, b) {
  // Preserve the *relative* window size when switching between unlike displays,
  // avoiding either a tiny ultrawide window or one too big for a smaller screen.
  const w = round(targetArea.width * Math.min(.96, b.width / Math.max(1, sourceArea.width)));
  const h = round(targetArea.height * Math.min(.96, b.height / Math.max(1, sourceArea.height)));
  const fitted = responsiveBounds(targetArea, {x:targetArea.x, y:targetArea.y, width:w, height:h, layoutRevision:LAYOUT_REVISION});
  return {...fitted,
    x:round(targetArea.x + (targetArea.width - fitted.width) / 2),
    y:round(targetArea.y + (targetArea.height - fitted.height) / 2)};
}
module.exports = {LAYOUT_REVISION, responsiveBounds, transferredBounds, inArea};
