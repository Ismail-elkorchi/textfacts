import { GC_CN_RANGES } from "./generated/general-category-cn.ts";
import { GC_MARK_RANGES } from "./generated/general-category-mark.ts";
import { GC_PF_RANGES } from "./generated/general-category-pf.ts";
import { GC_PI_RANGES } from "./generated/general-category-pi.ts";
import { GC_PROPERTY_IDS, GC_PROPERTY_NAMES, GC_RANGES } from "./generated/general-category.ts";
import { lookupProperty } from "./lookup.ts";

/**
 * GENERAL_CATEGORY_NAMES is an exported constant used by public APIs.
 */
export const GENERAL_CATEGORY_NAMES = GC_PROPERTY_NAMES;
/**
 * GENERAL_CATEGORY_IDS is an exported constant used by public APIs.
 */
export const GENERAL_CATEGORY_IDS = GC_PROPERTY_IDS;
/**
 * GeneralCategory defines an exported type contract.
 */
export type GeneralCategory = (typeof GENERAL_CATEGORY_NAMES)[number];

/**
 * General category id for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function generalCategoryIdAt(codePoint: number): number {
  return lookupProperty(GC_RANGES, codePoint);
}

/**
 * General category for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function generalCategoryAt(codePoint: number): GeneralCategory {
  const id = generalCategoryIdAt(codePoint);
  return GENERAL_CATEGORY_NAMES[id] ?? "Cn";
}

/**
 * Whether a Unicode scalar value is a Mark category.
 * Units: Unicode scalar values.
 */
export function isGeneralCategoryMark(codePoint: number): boolean {
  return lookupProperty(GC_MARK_RANGES, codePoint) === 1;
}

/**
 * Whether a Unicode scalar value is initial punctuation.
 * Units: Unicode scalar values.
 */
export function isInitialPunctuation(codePoint: number): boolean {
  return lookupProperty(GC_PI_RANGES, codePoint) === 1;
}

/**
 * Whether a Unicode scalar value is final punctuation.
 * Units: Unicode scalar values.
 */
export function isFinalPunctuation(codePoint: number): boolean {
  return lookupProperty(GC_PF_RANGES, codePoint) === 1;
}

/**
 * Whether a Unicode scalar value is unassigned (Cn).
 * Units: Unicode scalar values.
 */
export function isUnassigned(codePoint: number): boolean {
  return lookupProperty(GC_CN_RANGES, codePoint) === 1;
}
