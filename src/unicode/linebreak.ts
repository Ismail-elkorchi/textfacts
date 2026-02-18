import { LB_PROPERTY_IDS, LB_PROPERTY_NAMES, LB_RANGES } from "./generated/linebreak-break.ts";
import { lookupProperty } from "./lookup.ts";

/**
 * LineBreakClass is an exported API surface.
 */
export enum LineBreakClass {
  XX = 0,
  AI = 1,
  AK = 2,
  AL = 3,
  AP = 4,
  AS = 5,
  B2 = 6,
  BA = 7,
  BB = 8,
  BK = 9,
  CB = 10,
  CJ = 11,
  CL = 12,
  CM = 13,
  CP = 14,
  CR = 15,
  EB = 16,
  EM = 17,
  EX = 18,
  GL = 19,
  H2 = 20,
  H3 = 21,
  HH = 22,
  HL = 23,
  HY = 24,
  ID = 25,
  IN = 26,
  IS = 27,
  JL = 28,
  JT = 29,
  JV = 30,
  LF = 31,
  NL = 32,
  NS = 33,
  NU = 34,
  OP = 35,
  PO = 36,
  PR = 37,
  QU = 38,
  RI = 39,
  SA = 40,
  SG = 41,
  SP = 42,
  SY = 43,
  VF = 44,
  VI = 45,
  WJ = 46,
  ZW = 47,
  ZWJ = 48,
}

/**
 * LINE_BREAK_CLASS_NAMES is an exported constant used by public APIs.
 */
export const LINE_BREAK_CLASS_NAMES = LB_PROPERTY_NAMES;
/**
 * LINE_BREAK_CLASS_IDS is an exported constant used by public APIs.
 */
export const LINE_BREAK_CLASS_IDS = LB_PROPERTY_IDS;

/**
 * Line break class id for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function getLineBreakClassId(codePoint: number): LineBreakClass {
  return lookupProperty(LB_RANGES, codePoint) as LineBreakClass;
}

/**
 * Line break class for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function lineBreakClassAt(codePoint: number): LineBreakClass {
  return getLineBreakClassId(codePoint);
}
