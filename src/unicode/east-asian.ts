import { EAW_RANGES } from "./generated/east-asian-width.ts";
import { lookupProperty } from "./lookup.ts";

/**
 * Whether a Unicode scalar value is East_Asian_Width=Wide.
 * Units: Unicode scalar values.
 */
export function isEastAsianWide(codePoint: number): boolean {
  return lookupProperty(EAW_RANGES, codePoint) === 1;
}
