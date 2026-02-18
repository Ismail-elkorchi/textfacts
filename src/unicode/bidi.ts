import { BIDI_PROPERTY_IDS, BIDI_PROPERTY_NAMES, BIDI_RANGES } from "./generated/bidi-class.ts";
import { lookupProperty } from "./lookup.ts";

/**
 * BidiClass is an exported API surface.
 */
export enum BidiClass {
  L = 0,
  R = 1,
  AL = 2,
  EN = 3,
  ES = 4,
  ET = 5,
  AN = 6,
  CS = 7,
  NSM = 8,
  BN = 9,
  B = 10,
  S = 11,
  WS = 12,
  ON = 13,
  LRE = 14,
  RLE = 15,
  LRO = 16,
  RLO = 17,
  PDF = 18,
  LRI = 19,
  RLI = 20,
  FSI = 21,
  PDI = 22,
}

/**
 * BIDI_CLASS_NAMES is an exported constant used by public APIs.
 */
export const BIDI_CLASS_NAMES = BIDI_PROPERTY_NAMES;
/**
 * BIDI_CLASS_IDS is an exported constant used by public APIs.
 */
export const BIDI_CLASS_IDS = BIDI_PROPERTY_IDS;

/**
 * Bidi class id for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getBidiClassId(codePoint: number): BidiClass {
  return lookupProperty(BIDI_RANGES, codePoint) as BidiClass;
}

/**
 * Bidi class for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function bidiClassAt(codePoint: number): BidiClass {
  return getBidiClassId(codePoint);
}
