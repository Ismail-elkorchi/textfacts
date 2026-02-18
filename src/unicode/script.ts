import {
  SCRIPT_EXT_RANGES,
  SCRIPT_EXT_SETS,
  SCRIPT_IDS,
  SCRIPT_NAMES,
  SCRIPT_RANGES,
  Script,
} from "./generated/script.ts";
import { lookupProperty } from "./lookup.ts";

const SCRIPT_SINGLETONS: readonly Script[][] = SCRIPT_NAMES.map((_, id) => [id as Script]);

export { Script, SCRIPT_NAMES, SCRIPT_IDS };

/**
 * Script id for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function scriptIdAt(codePoint: number): Script {
  return lookupProperty(SCRIPT_RANGES, codePoint) as Script;
}

/**
 * Script for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function scriptAt(codePoint: number): Script {
  return scriptIdAt(codePoint);
}

/**
 * Script name for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function scriptNameAt(codePoint: number): string {
  return SCRIPT_NAMES[scriptIdAt(codePoint)] ?? "Unknown";
}

/**
 * Script extensions for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function scriptExtAt(codePoint: number): readonly Script[] {
  const setIndex = lookupProperty(SCRIPT_EXT_RANGES, codePoint);
  if (setIndex > 0) {
    const set = SCRIPT_EXT_SETS[setIndex];
    if (set && set.length > 0) return set;
    return SCRIPT_SINGLETONS[scriptIdAt(codePoint)] ?? [Script.Unknown];
  }
  return SCRIPT_SINGLETONS[scriptIdAt(codePoint)] ?? [Script.Unknown];
}

/**
 * Whether a Unicode scalar value is Common or Inherited script.
 * Units: Unicode scalar values.
 */
export function isCommonOrInherited(codePoint: number): boolean {
  const script = scriptIdAt(codePoint);
  return script === Script.Common || script === Script.Inherited;
}
