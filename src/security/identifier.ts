import { lookupProperty } from "../unicode/lookup.ts";
import {
  IDENTIFIER_STATUS_NAMES,
  IDENTIFIER_STATUS_RANGES,
} from "./generated/identifier-status.ts";
import {
  IDENTIFIER_TYPE_DEFAULT_MASK,
  IDENTIFIER_TYPE_MASKS,
  IDENTIFIER_TYPE_NAMES,
  IDENTIFIER_TYPE_RANGES,
} from "./generated/identifier-type.ts";

/**
 * IdentifierStatus defines an exported type contract.
 */
export type IdentifierStatus = (typeof IDENTIFIER_STATUS_NAMES)[number];
/**
 * IdentifierType defines an exported type contract.
 */
export type IdentifierType = (typeof IDENTIFIER_TYPE_NAMES)[number];

const TYPE_NAME_ORDER = IDENTIFIER_TYPE_NAMES.map((name, index) => ({ name, bit: 1 << index }));

/**
 * Identifier status for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function identifierStatusAt(codePoint: number): IdentifierStatus {
  const id = lookupProperty(IDENTIFIER_STATUS_RANGES, codePoint);
  return IDENTIFIER_STATUS_NAMES[id] ?? "Restricted";
}

/**
 * Identifier type mask for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function identifierTypeMaskAt(codePoint: number): number {
  const mask = lookupProperty(IDENTIFIER_TYPE_RANGES, codePoint);
  return mask === 0 ? IDENTIFIER_TYPE_DEFAULT_MASK : mask;
}

/**
 * Identifier type list for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function identifierTypeListAt(codePoint: number): IdentifierType[] {
  const mask = identifierTypeMaskAt(codePoint);
  const values: IdentifierType[] = [];
  for (const entry of TYPE_NAME_ORDER) {
    if ((mask & entry.bit) !== 0) {
      values.push(entry.name as IdentifierType);
    }
  }
  return values;
}

/**
 * Identifier type name for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function identifierTypeAt(codePoint: number): string {
  const values = identifierTypeListAt(codePoint);
  if (values.length === 0) return IDENTIFIER_TYPE_NAMES[0] ?? "Not_Character";
  if (values.length === 1) return values[0] ?? "Not_Character";
  return values.join("|");
}

/**
 * IDENTIFIER_STATUS_IDS is an exported constant used by public APIs.
 */
export const IDENTIFIER_STATUS_IDS: Record<IdentifierStatus, number> =
  IDENTIFIER_STATUS_NAMES.reduce(
    (acc, name, index) => {
      acc[name as IdentifierStatus] = index;
      return acc;
    },
    {} as Record<IdentifierStatus, number>,
  );

/**
 * IDENTIFIER_TYPE_IDS is an exported constant used by public APIs.
 */
export const IDENTIFIER_TYPE_IDS: typeof IDENTIFIER_TYPE_MASKS = IDENTIFIER_TYPE_MASKS;
