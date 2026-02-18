import {
  BIDI_BRACKET_CODEPOINTS,
  BIDI_BRACKET_PAIRED,
  BIDI_BRACKET_TYPES,
} from "./generated/bidi-brackets.ts";

/**
 * BidiBracketType is an exported API surface.
 */
export enum BidiBracketType {
  None = 0,
  Open = 1,
  Close = 2,
}

function findBracketIndex(codePoint: number): number {
  let lo = 0;
  let hi = BIDI_BRACKET_CODEPOINTS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = BIDI_BRACKET_CODEPOINTS[mid] ?? 0;
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
 * Bidi bracket type for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getBidiBracketType(codePoint: number): BidiBracketType {
  const index = findBracketIndex(codePoint);
  if (index < 0) return BidiBracketType.None;
  return (BIDI_BRACKET_TYPES[index] ?? 0) as BidiBracketType;
}

/**
 * Bidi bracket pair for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getBidiBracketPair(codePoint: number): number {
  const index = findBracketIndex(codePoint);
  if (index < 0) return -1;
  return BIDI_BRACKET_PAIRED[index] ?? -1;
}
