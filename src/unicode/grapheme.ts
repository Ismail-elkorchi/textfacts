import { GCB_PROPERTY_IDS, GCB_PROPERTY_NAMES, GCB_RANGES } from "./generated/grapheme-break.ts";
import { lookupProperty } from "./lookup.ts";

/**
 * GraphemeBreakProperty defines an exported type contract.
 */
export type GraphemeBreakProperty = (typeof GCB_PROPERTY_NAMES)[number];
/**
 * GraphemeBreakPropertyId is an exported constant used by public APIs.
 */
export const GraphemeBreakPropertyId = GCB_PROPERTY_IDS;

/**
 * Grapheme break property id for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getGraphemeBreakPropertyId(codePoint: number): number {
  return lookupProperty(GCB_RANGES, codePoint);
}

/**
 * Grapheme break property for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getGraphemeBreakProperty(codePoint: number): GraphemeBreakProperty {
  return GCB_PROPERTY_NAMES[getGraphemeBreakPropertyId(codePoint)] ?? "Other";
}
