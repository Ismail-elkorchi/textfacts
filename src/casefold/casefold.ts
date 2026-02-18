import { normalizeInput } from "../core/input.ts";
import type { TextInput } from "../core/types.ts";
import { normalize } from "../normalize/normalize.ts";
import { CASEFOLD_CODEPOINTS, CASEFOLD_DATA, CASEFOLD_OFFSETS } from "./generated/casefold.ts";

function findCaseFoldIndex(codePoint: number): number {
  let lo = 0;
  let hi = CASEFOLD_CODEPOINTS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = CASEFOLD_CODEPOINTS[mid] ?? 0;
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
 * Case fold a Unicode scalar value to code points.
 * Units: Unicode scalar values.
 */
export function caseFoldCodePoint(codePoint: number): number[] {
  const index = findCaseFoldIndex(codePoint);
  if (index < 0) return [codePoint];
  const start = CASEFOLD_OFFSETS[index] ?? 0;
  const end = CASEFOLD_OFFSETS[index + 1] ?? start;
  if (end <= start) return [codePoint];
  return Array.from(CASEFOLD_DATA.slice(start, end));
}

/**
 * Case fold text (full case folding).
 * Units: bytes (UTF-8).
 */
export function caseFold(input: TextInput): string {
  const { text } = normalizeInput(input);
  if (text.length === 0) return "";
  const output: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) ?? 0;
    const mapping = caseFoldCodePoint(cp);
    for (const mapped of mapping) {
      output.push(mapped);
    }
    i += cp > 0xffff ? 2 : 1;
  }
  return codePointsToString(output);
}

/**
 * NFKC case fold text.
 * Units: bytes (UTF-8).
 */
export function nfkcCaseFold(input: TextInput): string {
  const normalized = normalize(input, "NFKC");
  return caseFold(normalized);
}
