import { WB_PROPERTY_IDS, WB_PROPERTY_NAMES, WB_RANGES } from "./generated/word-break.ts";
import { lookupProperty } from "./lookup.ts";

/**
 * WordBreakProperty defines an exported type contract.
 */
export type WordBreakProperty = (typeof WB_PROPERTY_NAMES)[number];
/**
 * WordBreakPropertyId is an exported constant used by public APIs.
 */
export const WordBreakPropertyId = WB_PROPERTY_IDS;

/**
 * Word break property id for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getWordBreakPropertyId(codePoint: number): number {
  return lookupProperty(WB_RANGES, codePoint);
}

/**
 * Word break property for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getWordBreakProperty(codePoint: number): WordBreakProperty {
  return WB_PROPERTY_NAMES[getWordBreakPropertyId(codePoint)] ?? "Other";
}
