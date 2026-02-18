import { EP_RANGES } from "./generated/emoji-extended-pictographic.ts";
import { lookupProperty } from "./lookup.ts";

/**
 * Whether a Unicode scalar value is Extended_Pictographic.
 * Units: Unicode scalar values.
 */
export function isExtendedPictographic(codePoint: number): boolean {
  return lookupProperty(EP_RANGES, codePoint) === 1;
}
