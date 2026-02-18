import type { Span } from "./types.ts";

/**
 * Slice text by a UTF-16 code unit span.
 * Units: UTF-16 code units.
 */
export function sliceBySpan(text: string, span: Span): string {
  return text.slice(span.startCU, span.endCU);
}

/**
 * toArray executes a deterministic operation in this module.
 */
export function toArray<T>(iterable: Iterable<T>): T[] {
  return Array.from(iterable);
}
