import { TextfactsError } from "../core/error.ts";
import type { Span } from "../core/types.ts";
import { utf8Bytes, utf8BytesFromSpan } from "./encoding.ts";
import { fnv1a64Bytes, fnv1a64Utf16Span } from "./fnv1a64.ts";
import type { Hash64AlgoId, Hash64BytesAlgoId } from "./types.ts";
import { xxh64Bytes } from "./xxh64.ts";

function unsupportedAlgo(algo: string): never {
  throw new TextfactsError("HASH64_UNSUPPORTED_ALGO", "Unsupported hash64 algorithm", { algo });
}

/**
 * hash64Text executes a deterministic operation in this module.
 */
export function hash64Text(text: string, opts: { algo: Hash64AlgoId }): bigint {
  switch (opts.algo) {
    case "fnv1a64-utf16le":
      return fnv1a64Utf16Span(text, 0, text.length);
    case "fnv1a64-utf8":
      return fnv1a64Bytes(utf8Bytes(text));
    case "xxh64-utf8":
      return xxh64Bytes(utf8Bytes(text));
    default:
      return unsupportedAlgo(opts.algo);
  }
}

/**
 * Hash raw bytes with the selected 64-bit algorithm.
 * Units: bytes (binary).
 */
export function hash64Bytes(
  bytes: Uint8Array,
  opts: { algo: Hash64BytesAlgoId; seed?: bigint },
): bigint {
  switch (opts.algo) {
    case "fnv1a64-bytes":
      if (opts.seed && opts.seed !== 0n) {
        throw new TextfactsError(
          "HASH64_UNSUPPORTED_SEED",
          "FNV-1a does not support custom seeds",
          {
            algo: opts.algo,
          },
        );
      }
      return fnv1a64Bytes(bytes);
    case "xxh64-bytes":
      return xxh64Bytes(bytes, opts.seed ?? 0n);
    default:
      return unsupportedAlgo(opts.algo);
  }
}

/**
 * Hash a UTF-16 code unit span with a 64-bit algorithm.
 * Units: UTF-16 code units.
 */
export function hash64SpanUtf16(
  text: string,
  span: Span,
  opts: { algo: "fnv1a64-utf16le" },
): bigint {
  if (opts.algo !== "fnv1a64-utf16le") {
    return unsupportedAlgo(opts.algo);
  }
  return fnv1a64Utf16Span(text, span.startCU, span.endCU);
}

/**
 * Hash a UTF-16 code unit span as UTF-8 bytes with a 64-bit algorithm.
 * Units: UTF-16 code units.
 */
export function hash64SpanUtf8(
  text: string,
  span: Span,
  opts: { algo: "fnv1a64-utf8" | "xxh64-utf8" },
): bigint {
  const bytes = utf8BytesFromSpan(text, span.startCU, span.endCU);
  if (opts.algo === "fnv1a64-utf8") {
    return fnv1a64Bytes(bytes);
  }
  if (opts.algo === "xxh64-utf8") {
    return xxh64Bytes(bytes);
  }
  return unsupportedAlgo(opts.algo);
}
