import {
  BIDI_CONTROL_RANGES,
  DEFAULT_IGNORABLE_RANGES,
  JOIN_CONTROL_RANGES,
  NONCHARACTER_RANGES,
  VARIATION_SELECTOR_RANGES,
} from "./generated/integrity-properties.ts";
import { lookupProperty } from "./lookup.ts";

/**
 * Whether a Unicode scalar value is Default_Ignorable.
 * Units: Unicode scalar values.
 */
export function isDefaultIgnorable(codePoint: number): boolean {
  return lookupProperty(DEFAULT_IGNORABLE_RANGES, codePoint) === 1;
}

/**
 * Whether a Unicode scalar value is a bidi control.
 * Units: Unicode scalar values.
 */
export function isBidiControl(codePoint: number): boolean {
  return lookupProperty(BIDI_CONTROL_RANGES, codePoint) === 1;
}

/**
 * Whether a Unicode scalar value is a join control.
 * Units: Unicode scalar values.
 */
export function isJoinControl(codePoint: number): boolean {
  return lookupProperty(JOIN_CONTROL_RANGES, codePoint) === 1;
}

/**
 * Whether a Unicode scalar value is a variation selector.
 * Units: Unicode scalar values.
 */
export function isVariationSelector(codePoint: number): boolean {
  return lookupProperty(VARIATION_SELECTOR_RANGES, codePoint) === 1;
}

/**
 * Whether a Unicode scalar value is a noncharacter.
 * Units: Unicode scalar values.
 */
export function isNoncharacter(codePoint: number): boolean {
  return lookupProperty(NONCHARACTER_RANGES, codePoint) === 1;
}
