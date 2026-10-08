// Pure helpers for the profile photo crop editor. The draw math is extracted
// here so it can be unit-tested without a canvas; the PhotoCropEditor
// component applies these values to a real <canvas> for both the live
// WYSIWYG preview and the final JPEG export.
//
// The core invariant: the image always COVERS the square canvas — zoom can
// only increase from the minimum cover scale, never decrease — so the crop
// never produces empty borders, at any rotation step.

// Minimum scale that makes the image COVER a square canvas of `canvasSize`
// at the given 90°-step rotation. For a square canvas the cover scale is
// identical for 0/180 and 90/270 (the dimensions swap but max() is
// symmetric), so a single formula works for every rotation step.
export function minCoverScale(imgW, imgH, canvasSize, rotation) {
  if (!imgW || !imgH || !canvasSize) return 1;
  const rot = ((rotation % 360) + 360) % 360;
  // After a 90/270 rotation the effective dimensions swap.
  const effW = rot === 90 || rot === 270 ? imgH : imgW;
  const effH = rot === 90 || rot === 270 ? imgW : imgH;
  return Math.max(canvasSize / effW, canvasSize / effH);
}

// The actual draw scale = minCoverScale * zoom. zoom is clamped to >= 1 so the
// image never shrinks below cover and never leaves empty borders.
export function drawScale(imgW, imgH, canvasSize, rotation, zoom) {
  return minCoverScale(imgW, imgH, canvasSize, rotation) * Math.max(1, zoom);
}

// The drawn image dimensions (after scale) at a given rotation. Always >= the
// canvas size when zoom >= 1, proving the cover invariant.
export function drawnSize(imgW, imgH, canvasSize, rotation, zoom) {
  const scale = drawScale(imgW, imgH, canvasSize, rotation, zoom);
  const rot = ((rotation % 360) + 360) % 360;
  const effW = rot === 90 || rot === 270 ? imgH : imgW;
  const effH = rot === 90 || rot === 270 ? imgW : imgH;
  return { w: effW * scale, h: effH * scale };
}

// Validate a user-selected photo file. Returns null when valid, or an error
// code string the caller maps to a localized message.
export function validatePhotoFile(file, maxBytes = 15 * 1024 * 1024) {
  if (!file) return 'no_file';
  if (!file.type || !file.type.startsWith('image/')) return 'invalid_type';
  if (file.size > maxBytes) return 'too_large';
  return null;
}