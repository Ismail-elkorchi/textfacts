import { SB_PROPERTY_IDS, SB_PROPERTY_NAMES, SB_RANGES } from "./generated/sentence-break.ts";
import { lookupProperty } from "./lookup.ts";

/**
 * SentenceBreakProperty defines an exported type contract.
 */
export type SentenceBreakProperty = (typeof SB_PROPERTY_NAMES)[number];
/**
 * SentenceBreakPropertyId is an exported constant used by public APIs.
 */
export const SentenceBreakPropertyId = SB_PROPERTY_IDS;

/**
 * Sentence break property id for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getSentenceBreakPropertyId(codePoint: number): number {
  return lookupProperty(SB_RANGES, codePoint);
}

/**
 * Sentence break property for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getSentenceBreakProperty(codePoint: number): SentenceBreakProperty {
  return SB_PROPERTY_NAMES[getSentenceBreakPropertyId(codePoint)] ?? "Other";
}
