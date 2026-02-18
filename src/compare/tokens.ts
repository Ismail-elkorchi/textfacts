import { nfkcCaseFold } from "../casefold/casefold.ts";
import { sliceBySpan } from "../core/span.ts";
import type { Span } from "../core/types.ts";
import { hash64SpanUtf8, hash64SpanUtf16, hash64Text } from "../hash64/hash64.ts";
import type { Hash64AlgoId } from "../hash64/types.ts";
import { normalize } from "../normalize/normalize.ts";
import { confusableSkeleton } from "../security/confusables.ts";
import { segmentGraphemes } from "../segment/grapheme.ts";
import { segmentWordsUAX29 } from "../segment/word.ts";

/**
 * TokenizerId defines an exported type contract.
 */
export type TokenizerId = "uax29-word" | "uax29-grapheme" | "codePoint";

/**
 * CanonicalKeyId defines an exported type contract.
 */
export type CanonicalKeyId = "raw" | "nfc" | "nfkc" | "nfkcCaseFold" | "skeleton";

/**
 * Materialize defines an exported type contract.
 */
export type Materialize = "none" | "raw" | "raw+key";

/**
 * Token defines an exported structural contract.
 */
export interface Token {
  span: Span;
  raw?: string;
  key?: string;
  keyHash64: bigint;
}

/**
 * TokenizeOptions defines an exported structural contract.
 */
export interface TokenizeOptions {
  tokenizer: TokenizerId;
  canonicalKey: CanonicalKeyId;
  materialize?: Materialize;
  hash?: { algo: Hash64AlgoId };
  maxTokens?: number;
}

const DEFAULT_SKELETON_OPTIONS = { normalization: "NFKD" as const, caseFold: true };
const DEFAULT_HASH: Hash64AlgoId = "xxh64-utf8";

/**
 * Iterate token spans using the selected tokenizer.
 * Units: UTF-16 code units.
 */
export function* iterTokenSpans(text: string, tokenizer: TokenizerId): Iterable<Span> {
  if (tokenizer === "uax29-word") {
    yield* segmentWordsUAX29(text);
    return;
  }
  if (tokenizer === "uax29-grapheme") {
    yield* segmentGraphemes(text);
    return;
  }
  let cu = 0;
  while (cu < text.length) {
    const cp = text.codePointAt(cu) ?? 0;
    const next = cu + (cp > 0xffff ? 2 : 1);
    yield { startCU: cu, endCU: next };
    cu = next;
  }
}

function canonicalize(raw: string, canonicalKey: CanonicalKeyId): string {
  switch (canonicalKey) {
    case "nfc":
      return normalize(raw, "NFC");
    case "nfkc":
      return normalize(raw, "NFKC");
    case "nfkcCaseFold":
      return nfkcCaseFold(raw);
    case "skeleton":
      return confusableSkeleton(raw, DEFAULT_SKELETON_OPTIONS);
    default:
      return raw;
  }
}

/**
 * Tokenize text for comparison.
 * Units: UTF-16 code units.
 */
export function tokenizeForComparison(text: string, options: TokenizeOptions): Token[] {
  const maxTokens = options.maxTokens ?? Number.POSITIVE_INFINITY;
  const materialize = options.materialize ?? "none";
  const hashAlgo = options.hash?.algo ?? DEFAULT_HASH;
  const tokens: Token[] = [];
  let count = 0;
  for (const span of iterTokenSpans(text, options.tokenizer)) {
    if (count >= maxTokens) break;
    let raw: string | undefined;
    let key: string | undefined;

    if (materialize !== "none" || options.canonicalKey !== "raw") {
      raw = sliceBySpan(text, span);
    }

    if (options.canonicalKey === "raw") {
      key = raw;
    } else if (raw !== undefined) {
      // TODO(CQ-002): hash-while-transforming to avoid intermediate string allocations.
      key = canonicalize(raw, options.canonicalKey);
    }

    let keyHash64: bigint;
    if (options.canonicalKey === "raw") {
      if (hashAlgo === "fnv1a64-utf16le") {
        keyHash64 = hash64SpanUtf16(text, span, { algo: "fnv1a64-utf16le" });
      } else {
        keyHash64 = hash64SpanUtf8(text, span, {
          algo: hashAlgo === "fnv1a64-utf8" ? "fnv1a64-utf8" : "xxh64-utf8",
        });
      }
    } else {
      const keyText = key ?? "";
      keyHash64 = hash64Text(keyText, { algo: hashAlgo });
    }

    const token: Token = { span, keyHash64 };
    if (materialize === "raw" || materialize === "raw+key") {
      token.raw = raw ?? "";
    }
    if (materialize === "raw+key") {
      token.key = key ?? raw ?? "";
    }
    tokens.push(token);
    count += 1;
  }
  return tokens;
}
