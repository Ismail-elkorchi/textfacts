import { BIDI_MIRRORING_CODEPOINTS, BIDI_MIRRORING_MAP } from "./generated/bidi-mirroring.ts";

function findMirroringIndex(codePoint: number): number {
  let lo = 0;
  let hi = BIDI_MIRRORING_CODEPOINTS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = BIDI_MIRRORING_CODEPOINTS[mid] ?? 0;
    if (codePoint < value) {
      hi = mid - 1;
    } else if (codePoint > value) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }
  return -1;
}

/**
 * Bidi mirroring mapping for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getBidiMirroring(codePoint: number): number {
  const index = findMirroringIndex(codePoint);
  if (index < 0) return codePoint;
  return BIDI_MIRRORING_MAP[index] ?? codePoint;
}
