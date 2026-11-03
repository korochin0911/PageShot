export function repetitionBands(imageHeight, viewportHeight, contentHeight, offsetDelta = 0) {
  const offset = Math.round(viewportHeight * imageHeight / contentHeight) + offsetDelta;
  const height = Math.min(offset, imageHeight - offset);
  // A second viewport can be only partially present. Require enough matching
  // rows for evidence, rather than almost two complete viewports.
  if (!Number.isFinite(offset) || offset <= 0 || !Number.isFinite(height) ||
      height < Math.max(32, Math.ceil(offset * 0.2))) return null;
  return { offset, height };
}

export function repetitionOffsets(imageHeight, viewportHeight, contentHeight) {
  const estimated = Math.round(viewportHeight * imageHeight / contentHeight);
  if (!Number.isFinite(estimated) || estimated <= 0) return [];
  const radius = Math.max(12, Math.ceil(estimated * 0.15));
  const offsets = [];
  for (let distance = 0; distance <= radius; distance++) {
    for (const offset of distance === 0 ? [estimated] : [estimated - distance, estimated + distance]) {
      if (repetitionBands(imageHeight, viewportHeight, contentHeight, offset - estimated)) offsets.push(offset);
    }
  }
  return offsets;
}

export function bandsAreRepeated(first, second) {
  if (!(first instanceof Uint8ClampedArray) || first.length !== second?.length || first.length === 0) {
    return false;
  }

  let samePixels = 0;
  let difference = 0;
  const pixels = first.length / 4;
  for (let index = 0; index < first.length; index += 4) {
    const red = Math.abs(first[index] - second[index]);
    const green = Math.abs(first[index + 1] - second[index + 1]);
    const blue = Math.abs(first[index + 2] - second[index + 2]);
    const alpha = Math.abs(first[index + 3] - second[index + 3]);
    const largest = Math.max(red, green, blue, alpha);
    if (largest <= 8) samePixels += 1;
    difference += red + green + blue + alpha;
  }

  const sameRatio = samePixels / pixels;
  const meanDifference = difference / (pixels * 4);
  return sameRatio >= 0.985 && meanDifference <= 2;
}
