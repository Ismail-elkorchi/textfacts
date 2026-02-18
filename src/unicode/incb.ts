import { INCB_PROPERTY_IDS, INCB_PROPERTY_NAMES, INCB_RANGES } from "./generated/incb.ts";
import { lookupProperty } from "./lookup.ts";

/**
 * IncbProperty defines an exported type contract.
 */
export type IncbProperty = (typeof INCB_PROPERTY_NAMES)[number];
/**
 * IncbPropertyId is an exported constant used by public APIs.
 */
export const IncbPropertyId = INCB_PROPERTY_IDS;

/**
 * Indic Conjunct Break property id for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getIncbPropertyId(codePoint: number): number {
  return lookupProperty(INCB_RANGES, codePoint);
}

/**
 * Indic Conjunct Break property for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getIncbProperty(codePoint: number): IncbProperty {
  return INCB_PROPERTY_NAMES[getIncbPropertyId(codePoint)] ?? "None";
}
