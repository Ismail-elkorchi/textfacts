import { caseFold } from "../casefold/casefold.ts";
import { normalizeInput } from "../core/input.ts";
import type { TextInput } from "../core/types.ts";
import { normalize } from "../normalize/normalize.ts";
import {
  CONFUSABLES_CODEPOINTS,
  CONFUSABLES_DATA,
  CONFUSABLES_OFFSETS,
} from "./generated/confusables.ts";

/**
 * ConfusableOptions defines an exported structural contract.
 */
export interface ConfusableOptions {
  normalization?: "NFD" | "NFKD" | "none";
  caseFold?: boolean;
}

const DEFAULT_OPTIONS: Required<ConfusableOptions> = {
  normalization: "NFKD",
  caseFold: true,
};

function findConfusableIndex(codePoint: number): number {
  let lo = 0;
  let hi = CONFUSABLES_CODEPOINTS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = CONFUSABLES_CODEPOINTS[mid] ?? 0;
    if (codePoint < value) {
      hi = mid - 1;
    } else if (codePoint > value) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }
  return -1;
}

function codePointsToString(codePoints: number[]): string {
  if (codePoints.length === 0) return "";
  const chunks: string[] = [];
  const chunkSize = 2048;
  for (let i = 0; i < codePoints.length; i += chunkSize) {
    const slice = codePoints.slice(i, i + chunkSize);
    chunks.push(String.fromCodePoint(...slice));
  }
  return chunks.join("");
}

/**
 * Confusable mapping for a Unicode scalar value.
 * Units: Unicode scalar values.
 */
export function confusableMappingAt(codePoint: number): number[] {
  const index = findConfusableIndex(codePoint);
  if (index < 0) return [codePoint];
  const start = CONFUSABLES_OFFSETS[index] ?? 0;
  const end = CONFUSABLES_OFFSETS[index + 1] ?? start;
  if (end <= start) return [codePoint];
  return Array.from(CONFUSABLES_DATA.slice(start, end));
}

/**
 * Compute the confusable skeleton of text.
 * Units: bytes (UTF-8).
 */
export function confusableSkeleton(input: TextInput, options: ConfusableOptions = {}): string {
  const { text } = normalizeInput(input);
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let working = text;
  if (opts.normalization !== "none") {
    working = normalize(working, opts.normalization);
  }
  if (opts.caseFold) {
    working = caseFold(working);
  }
  const output: number[] = [];
  for (let i = 0; i < working.length; ) {
    const cp = working.codePointAt(i) ?? 0;
    const mapping = confusableMappingAt(cp);
    for (const mapped of mapping) {
      output.push(mapped);
    }
    i += cp > 0xffff ? 2 : 1;
  }
  return codePointsToString(output);
}

/**
 * Compare confusable skeletons for equality.
 * Units: bytes (UTF-8).
 */
export function isConfusable(a: TextInput, b: TextInput, options: ConfusableOptions = {}): boolean {
  return confusableSkeleton(a, options) === confusableSkeleton(b, options);
}
