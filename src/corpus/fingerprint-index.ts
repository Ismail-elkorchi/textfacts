import { tokenizeForComparison } from "../compare/tokens.ts";
import { createProvenance } from "../core/provenance.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import { shingleHashes } from "../fingerprint/shingles.ts";
import { type WinnowingOptions, selectWinnowingIndexes } from "../fingerprint/winnowing.ts";
import { formatU64Hex } from "../hash64/fnv1a64.ts";

/**
 * FingerprintIndexOptions defines an exported structural contract.
 */
export interface FingerprintIndexOptions extends WinnowingOptions {
  maxDocs?: number;
  maxFingerprintsPerDoc?: number;
  maxIndexEntries?: number;
  verifyKgramOnMatch?: boolean;
}

export interface FingerprintIndexStats {
  collisionBuckets: number;
  totalBuckets: number;
}

/**
 * FingerprintIndex defines an exported structural contract.
 */
export interface FingerprintIndex {
  index: Record<string, string[]>;
  docFingerprints: Record<string, string[]>;
  kgramSequences?: Record<string, string[]>;
  stats?: FingerprintIndexStats;
  truncated?: boolean;
  provenance: ReturnType<typeof createProvenance>;
}

/**
 * buildFingerprintIndex executes a deterministic operation in this module.
 */
export function buildFingerprintIndex(
  docs: Iterable<{ id: string; text: string }>,
  options: FingerprintIndexOptions,
): FingerprintIndex {
  const maxDocs = options.maxDocs ?? Number.POSITIVE_INFINITY;
  const maxIndexEntries = options.maxIndexEntries ?? Number.POSITIVE_INFINITY;
  const verifyKgram = options.verifyKgramOnMatch ?? false;
  const kgramSequences = verifyKgram ? new Map<string, Set<string>>() : null;
  const index = new Map<string, string[]>();
  const docFingerprints: Record<string, string[]> = {};
  let docCount = 0;
  let truncated = false;

  const shingleSize = Math.max(1, Math.floor(options.k));
  const windowSize = Math.max(1, Math.floor(options.window));

  for (const doc of docs) {
    if (docCount >= maxDocs) {
      truncated = true;
      break;
    }
    docCount += 1;

    const maxFingerprints = options.maxFingerprintsPerDoc ?? options.maxFingerprints;
    const tokenOptions: {
      tokenizer: typeof options.tokenizer;
      canonicalKey: typeof options.canonicalKey;
      materialize: "none";
      hash?: typeof options.hash;
      maxTokens?: number;
    } = {
      tokenizer: options.tokenizer,
      canonicalKey: options.canonicalKey,
      materialize: "none",
    };
    if (options.hash) tokenOptions.hash = options.hash;
    if (options.maxTokens !== undefined) tokenOptions.maxTokens = options.maxTokens;

    const tokens = tokenizeForComparison(doc.text, tokenOptions);
    const shingles = shingleHashes(tokens, shingleSize);
    const selection = selectWinnowingIndexes(
      shingles,
      windowSize,
      options.dedupe ?? "by-hash",
      maxFingerprints ?? Number.POSITIVE_INFINITY,
    );

    const seen = new Set<string>();
    const hashes: string[] = [];

    for (const selectedIndex of selection.indexes) {
      const shingle = shingles[selectedIndex];
      if (!shingle) continue;
      const hashHex = formatU64Hex(shingle.hash);
      if (seen.has(hashHex)) continue;
      seen.add(hashHex);
      hashes.push(hashHex);

      let list = index.get(hashHex);
      if (!list) {
        if (index.size >= maxIndexEntries) {
          truncated = true;
          continue;
        }
        list = [];
        index.set(hashHex, list);
      }
      if (list[list.length - 1] !== doc.id) {
        list.push(doc.id);
      }

      if (verifyKgram && kgramSequences) {
        const kgram = tokens.slice(shingle.tokenIndex, shingle.tokenIndex + shingleSize);
        let key = "";
        for (const token of kgram) {
          key += formatU64Hex(token?.keyHash64 ?? 0n);
        }
        let bucket = kgramSequences.get(hashHex);
        if (!bucket) {
          bucket = new Set<string>();
          kgramSequences.set(hashHex, bucket);
        }
        bucket.add(key);
      }
    }

    docFingerprints[doc.id] = hashes;
  }

  const indexRecord: Record<string, string[]> = {};
  const sortedKeys = Array.from(index.keys()).sort();
  for (const key of sortedKeys) {
    const list = index.get(key) ?? [];
    indexRecord[key] = list.slice();
  }

  let stats: FingerprintIndexStats | undefined;
  let kgramRecord: Record<string, string[]> | undefined;
  if (verifyKgram && kgramSequences) {
    let collisionBuckets = 0;
    kgramRecord = {};
    for (const key of sortedKeys) {
      const bucket = kgramSequences.get(key);
      const entries = bucket ? Array.from(bucket.values()).sort() : [];
      if (entries.length > 1) collisionBuckets += 1;
      if (entries.length > 0) kgramRecord[key] = entries;
    }
    stats = { collisionBuckets, totalBuckets: sortedKeys.length };
  }

  const provenance = createProvenance(
    {
      name: "Corpus.FingerprintIndex",
      spec: "textfacts:corpus-fingerprint-index",
      revisionOrDate: "Winnowing",
      implementationId: IMPLEMENTATION_ID,
    },
    {
      tokenizer: options.tokenizer,
      canonicalKey: options.canonicalKey,
      k: shingleSize,
      window: windowSize,
      dedupe: options.dedupe ?? "by-hash",
      hash: options.hash ?? null,
      verifyKgramOnMatch: options.verifyKgramOnMatch ?? false,
      maxTokens: options.maxTokens ?? null,
      maxFingerprints: options.maxFingerprints ?? null,
      maxFingerprintsPerDoc: options.maxFingerprintsPerDoc ?? null,
      maxDocs: options.maxDocs ?? null,
      maxIndexEntries: options.maxIndexEntries ?? null,
    },
    {
      text: "utf16-code-unit",
      token: options.tokenizer,
    },
  );

  const result: FingerprintIndex = {
    index: indexRecord,
    docFingerprints,
    provenance,
  };
  if (kgramRecord) result.kgramSequences = kgramRecord;
  if (stats) result.stats = stats;
  if (truncated) result.truncated = true;
  return result;
}
