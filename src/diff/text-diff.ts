import {
  type CanonicalKeyId,
  type Token,
  type TokenizerId,
  tokenizeForComparison,
} from "../compare/tokens.ts";
import { compareByCodePoint } from "../core/compare.ts";
import { createProvenance } from "../core/provenance.ts";
import type { Span } from "../core/types.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import { containment, jaccard, overlapCount } from "../fingerprint/metrics.ts";
import { type WinnowingOptions, winnowingFingerprints } from "../fingerprint/winnowing.ts";
import { type DiffOptions, diffSequence } from "./myers.ts";
import type { Edit, TextDiff, TokenEdit } from "./types.ts";

/**
 * TextDiffOptions defines an exported structural contract.
 */
export interface TextDiffOptions extends DiffOptions {
  tokenizer: TokenizerId;
  canonicalKey: CanonicalKeyId;
  maxTokens?: number;
}

/**
 * CompareTextsOptions defines an exported structural contract.
 */
export interface CompareTextsOptions {
  tokenizer: TokenizerId;
  canonicalKey: CanonicalKeyId;
  fingerprint?: WinnowingOptions;
  diff?: boolean;
  maxTokens?: number;
  maxD?: number;
  prefer?: "delete" | "insert";
}

/**
 * CompareTextsResult defines an exported structural contract.
 */
export interface CompareTextsResult {
  fingerprints: {
    a: string[];
    b: string[];
    jaccard: { num: string; den: string };
    containmentAinB: { num: string; den: string };
    containmentBinA: { num: string; den: string };
    overlapCount: string;
  };
  diff?: TextDiff;
  provenance: ReturnType<typeof createProvenance>;
}

const TEXT_DIFF_SPEC = "textfacts:diff-text";
const TEXT_DIFF_REVISION = "Myers 1986";

function spansFromTokens(tokens: Token[], start: number, end: number): Span[] {
  const spans: Span[] = [];
  for (let index = start; index < end; index += 1) {
    const span = tokens[index]?.span;
    if (span) spans.push(span);
  }
  return spans;
}

function buildTokenEdits(edits: Edit[], tokensA: Token[], tokensB: Token[]): TokenEdit[] {
  const result: TokenEdit[] = [];
  for (const edit of edits) {
    if (edit.op === "equal") {
      result.push({
        ...edit,
        aSpans: spansFromTokens(tokensA, edit.a0, edit.a1),
        bSpans: spansFromTokens(tokensB, edit.b0, edit.b1),
      });
    } else if (edit.op === "delete") {
      result.push({
        ...edit,
        aSpans: spansFromTokens(tokensA, edit.a0, edit.a1),
      });
    } else {
      result.push({
        ...edit,
        bSpans: spansFromTokens(tokensB, edit.b0, edit.b1),
      });
    }
  }
  return result;
}

function summarize(edits: Edit[]): {
  insertedTokens: number;
  deletedTokens: number;
  equalTokens: number;
} {
  let inserted = 0;
  let deleted = 0;
  let equal = 0;
  for (const edit of edits) {
    if (edit.op === "equal") equal += edit.a1 - edit.a0;
    else if (edit.op === "delete") deleted += edit.a1 - edit.a0;
    else inserted += edit.b1 - edit.b0;
  }
  return { insertedTokens: inserted, deletedTokens: deleted, equalTokens: equal };
}

/**
 * Compute a token diff between two strings.
 * Units: UTF-16 code units.
 */
export function diffText(
  sourceText: string,
  targetText: string,
  options: TextDiffOptions,
): TextDiff {
  const tokenOptions: {
    tokenizer: TokenizerId;
    canonicalKey: CanonicalKeyId;
    materialize: "raw+key";
    maxTokens?: number;
  } = {
    tokenizer: options.tokenizer,
    canonicalKey: options.canonicalKey,
    materialize: "raw+key",
  };
  if (options.maxTokens !== undefined) tokenOptions.maxTokens = options.maxTokens;

  const sourceTokens = tokenizeForComparison(sourceText, tokenOptions);
  const targetTokens = tokenizeForComparison(targetText, tokenOptions);

  const diffOptions: DiffOptions = {};
  if (options.maxD !== undefined) diffOptions.maxD = options.maxD;
  if (options.prefer !== undefined) diffOptions.prefer = options.prefer;

  const script = diffSequence(
    sourceTokens,
    targetTokens,
    (leftToken, rightToken) => leftToken.key === rightToken.key,
    diffOptions,
  );

  const edits = buildTokenEdits(script.edits, sourceTokens, targetTokens);
  const summary = summarize(script.edits);
  const tokenLimit = options.maxTokens;
  const truncated =
    script.truncated ||
    (tokenLimit !== undefined &&
      (sourceTokens.length >= tokenLimit || targetTokens.length >= tokenLimit));

  const provenance = createProvenance(
    {
      name: "Diff.Text",
      spec: TEXT_DIFF_SPEC,
      revisionOrDate: TEXT_DIFF_REVISION,
      implementationId: IMPLEMENTATION_ID,
    },
    {
      tokenizer: options.tokenizer,
      canonicalKey: options.canonicalKey,
      maxTokens: options.maxTokens ?? null,
      maxD: options.maxD ?? null,
      prefer: options.prefer ?? "delete",
    },
    {
      text: "utf16-code-unit",
      token: options.tokenizer,
    },
  );

  const result: TextDiff = {
    edits,
    summary,
    aTokens: sourceTokens.length,
    bTokens: targetTokens.length,
    provenance,
  };
  if (truncated) result.truncated = true;
  return result;
}

/**
 * Compare two strings with detailed diff output.
 * Units: UTF-16 code units.
 */
export function compareTextsDetailed(
  sourceText: string,
  targetText: string,
  options: CompareTextsOptions,
): CompareTextsResult {
  const fingerprintOptions: WinnowingOptions = {
    tokenizer: options.tokenizer,
    canonicalKey: options.canonicalKey,
    k: options.fingerprint?.k ?? 5,
    window: options.fingerprint?.window ?? 4,
  };
  if (options.fingerprint?.dedupe) fingerprintOptions.dedupe = options.fingerprint.dedupe;
  if (options.fingerprint?.hash) fingerprintOptions.hash = options.fingerprint.hash;
  if (options.maxTokens !== undefined) fingerprintOptions.maxTokens = options.maxTokens;
  if (options.fingerprint?.maxFingerprints !== undefined) {
    fingerprintOptions.maxFingerprints = options.fingerprint.maxFingerprints;
  }
  const sourceFingerprints = winnowingFingerprints(sourceText, fingerprintOptions);
  const targetFingerprints = winnowingFingerprints(targetText, fingerprintOptions);
  const sourceSet = new Set(
    sourceFingerprints.fingerprints.map((fingerprint) => fingerprint.hash64Hex),
  );
  const targetSet = new Set(
    targetFingerprints.fingerprints.map((fingerprint) => fingerprint.hash64Hex),
  );

  const jaccardRatio = jaccard(sourceSet, targetSet);
  const sourceInTarget = containment(sourceSet, targetSet);
  const targetInSource = containment(targetSet, sourceSet);
  const overlap = overlapCount(sourceSet, targetSet);

  let diffResult: TextDiff | undefined;
  if (options.diff) {
    const diffOptions: TextDiffOptions = {
      tokenizer: options.tokenizer,
      canonicalKey: options.canonicalKey,
    };
    if (options.maxTokens !== undefined) diffOptions.maxTokens = options.maxTokens;
    if (options.maxD !== undefined) diffOptions.maxD = options.maxD;
    if (options.prefer !== undefined) diffOptions.prefer = options.prefer;
    diffResult = diffText(sourceText, targetText, diffOptions);
  }

  const provenance = createProvenance(
    {
      name: "Compare.Texts",
      spec: "textfacts:compare-texts",
      revisionOrDate: "Winnowing+Myers",
      implementationId: IMPLEMENTATION_ID,
    },
    {
      tokenizer: options.tokenizer,
      canonicalKey: options.canonicalKey,
      fingerprint: fingerprintOptions,
      diff: options.diff ?? false,
      maxTokens: options.maxTokens ?? null,
      maxD: options.maxD ?? null,
      prefer: options.prefer ?? "delete",
    },
    {
      text: "utf16-code-unit",
      token: options.tokenizer,
    },
  );

  const sourceSortedFingerprints = Array.from(sourceSet.values()).sort(compareByCodePoint);
  const targetSortedFingerprints = Array.from(targetSet.values()).sort(compareByCodePoint);

  const result: CompareTextsResult = {
    fingerprints: {
      a: sourceSortedFingerprints,
      b: targetSortedFingerprints,
      jaccard: jaccardRatio,
      containmentAinB: sourceInTarget,
      containmentBinA: targetInSource,
      overlapCount: overlap,
    },
    provenance,
  };
  if (diffResult) result.diff = diffResult;
  return result;
}
