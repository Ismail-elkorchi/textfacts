import { type CanonicalKeyId, type TokenizerId, tokenizeForComparison } from "../compare/tokens.ts";
import { compareByCodePoint } from "../core/compare.ts";
import { createProvenance } from "../core/provenance.ts";
import type { Span } from "../core/types.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import { formatU64Hex } from "../hash64/fnv1a64.ts";
import type { Hash64AlgoId } from "../hash64/types.ts";
import { shingleHashes } from "./shingles.ts";

/**
 * Fingerprint defines an exported structural contract.
 */
export interface Fingerprint {
  hash64Hex: string;
  tokenIndex: number;
  span: Span;
}

/**
 * WinnowingDedupe defines an exported type contract.
 */
export type WinnowingDedupe = "by-position" | "by-hash";

/**
 * WinnowingOptions defines an exported structural contract.
 */
export interface WinnowingOptions {
  tokenizer: TokenizerId;
  canonicalKey: CanonicalKeyId;
  k: number;
  window: number;
  dedupe?: WinnowingDedupe;
  hash?: { algo: Hash64AlgoId };
  maxTokens?: number;
  maxFingerprints?: number;
}

/**
 * WinnowingResult defines an exported structural contract.
 */
export interface WinnowingResult {
  fingerprints: Fingerprint[];
  algo: ReturnType<typeof createProvenance>;
  truncated?: boolean;
}

const WINNOWING_SPEC = "textfacts:winnowing";
const WINNOWING_REVISION = "Schleimer 2003";

function compareFingerprint(leftFingerprint: Fingerprint, rightFingerprint: Fingerprint): number {
  if (leftFingerprint.tokenIndex !== rightFingerprint.tokenIndex) {
    return leftFingerprint.tokenIndex - rightFingerprint.tokenIndex;
  }
  return compareByCodePoint(leftFingerprint.hash64Hex, rightFingerprint.hash64Hex);
}

export function selectWinnowingIndexes(
  shingles: ReturnType<typeof shingleHashes>,
  window: number,
  dedupe: WinnowingDedupe,
  maxFingerprints: number,
): { indexes: number[]; truncated: boolean } {
  const indexes: number[] = [];
  const deque: number[] = [];
  let truncated = false;
  let lastHash: bigint | null = null;
  let lastTokenIndex = -1;

  const maybeSelect = (selectedIndex: number, windowStart: number, windowEnd: number) => {
    const shingle = shingles[selectedIndex];
    if (!shingle) return;

    if (dedupe === "by-hash" && lastHash !== null && shingle.hash === lastHash) {
      if (lastTokenIndex >= windowStart && lastTokenIndex <= windowEnd) {
        return;
      }
    } else if (dedupe === "by-position" && lastHash !== null) {
      if (shingle.hash === lastHash && shingle.tokenIndex === lastTokenIndex) {
        return;
      }
    }

    if (indexes.length < maxFingerprints) {
      indexes.push(selectedIndex);
      lastHash = shingle.hash;
      lastTokenIndex = shingle.tokenIndex;
    } else {
      truncated = true;
    }
  };

  for (let index = 0; index < shingles.length; index += 1) {
    const current = shingles[index];
    if (!current) continue;

    while (deque.length > 0) {
      const lastIndex = deque[deque.length - 1] as number;
      const last = shingles[lastIndex] as typeof current;
      if (last.hash > current.hash || last.hash === current.hash) {
        deque.pop();
      } else {
        break;
      }
    }
    deque.push(index);

    const windowStart = index - window + 1;
    while (deque.length > 0 && (deque[0] as number) < windowStart) {
      deque.shift();
    }

    if (index >= window - 1 && deque.length > 0) {
      maybeSelect(deque[0] as number, windowStart, index);
      if (indexes.length >= maxFingerprints) {
        truncated = true;
        break;
      }
    }
  }

  return { indexes, truncated };
}

/**
 * Compute winnowing fingerprints over token spans.
 * Units: UTF-16 code units.
 */
export function winnowingFingerprints(text: string, options: WinnowingOptions): WinnowingResult {
  const shingleSize = Math.max(1, Math.floor(options.k));
  const windowSize = Math.max(1, Math.floor(options.window));
  const dedupe = options.dedupe ?? "by-hash";
  const tokenOptions: {
    tokenizer: TokenizerId;
    canonicalKey: CanonicalKeyId;
    materialize?: "none";
    hash?: { algo: Hash64AlgoId };
    maxTokens?: number;
  } = {
    tokenizer: options.tokenizer,
    canonicalKey: options.canonicalKey,
    materialize: "none",
  };
  if (options.hash) tokenOptions.hash = options.hash;
  if (options.maxTokens !== undefined) tokenOptions.maxTokens = options.maxTokens;
  const tokens = tokenizeForComparison(text, tokenOptions);
  const shingles = shingleHashes(tokens, shingleSize);
  const maxFingerprints = options.maxFingerprints ?? Number.POSITIVE_INFINITY;
  const fingerprints: Fingerprint[] = [];

  if (shingles.length === 0) {
    return {
      fingerprints,
      algo: createProvenance(
        {
          name: "Fingerprint.Winnowing",
          spec: WINNOWING_SPEC,
          revisionOrDate: WINNOWING_REVISION,
          implementationId: IMPLEMENTATION_ID,
        },
        { ...options, k: shingleSize, window: windowSize, dedupe },
        { text: "utf16-code-unit", token: options.tokenizer },
      ),
    };
  }

  const selection = selectWinnowingIndexes(shingles, windowSize, dedupe, maxFingerprints);
  for (const idx of selection.indexes) {
    const shingle = shingles[idx];
    if (!shingle) continue;
    fingerprints.push({
      hash64Hex: formatU64Hex(shingle.hash),
      tokenIndex: shingle.tokenIndex,
      span: shingle.span,
    });
  }

  fingerprints.sort(compareFingerprint);

  const algo = createProvenance(
    {
      name: "Fingerprint.Winnowing",
      spec: WINNOWING_SPEC,
      revisionOrDate: WINNOWING_REVISION,
      implementationId: IMPLEMENTATION_ID,
    },
    { ...options, k: shingleSize, window: windowSize, dedupe },
    { text: "utf16-code-unit", token: options.tokenizer },
  );

  const result: WinnowingResult = { fingerprints, algo };
  if (selection.truncated) result.truncated = true;
  return result;
}

/**
 * fingerprintSet executes a deterministic operation in this module.
 */
export function fingerprintSet(text: string, options: WinnowingOptions): Set<string> {
  const result = winnowingFingerprints(text, options);
  return new Set(result.fingerprints.map((fp) => fp.hash64Hex));
}
