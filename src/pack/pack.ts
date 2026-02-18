import { resolveBidi } from "../bidi/bidi.ts";
import { canonicalModelStringify } from "../core/canonical.ts";
import { compareByCodePoint } from "../core/compare.ts";
import { normalizeInput } from "../core/input.ts";
import { createProvenance } from "../core/provenance.ts";
import { sliceBySpan } from "../core/span.ts";
import type { Provenance, Span, TextInput } from "../core/types.ts";
import { IMPLEMENTATION_ID, LIBRARY_VERSION } from "../core/version.ts";
import { buildFingerprintIndex } from "../corpus/fingerprint-index.ts";
import type {
  WordCooccurrenceItem,
  WordFrequencyItem,
  WordNgramItem,
  WordTokenFilter,
} from "../facts/word.ts";
import {
  type Fingerprint,
  type WinnowingOptions,
  winnowingFingerprints,
} from "../fingerprint/winnowing.ts";
import { lineBreakOpportunities } from "../linebreak/linebreak.ts";
import {
  type SurfaceProfile,
  type SurfaceProfileOptions,
  surfaceProfile,
} from "../profile/surface-profile.ts";
import { segmentGraphemes } from "../segment/grapheme.ts";
import { segmentSentencesUAX29 } from "../segment/sentence.ts";
import { segmentWordsUAX29 } from "../segment/word.ts";
import { WordBreakPropertyId, getWordBreakPropertyId } from "../unicode/word.ts";
import {
  type VariantIndex,
  type VariantIndexOptions,
  buildVariantIndex,
} from "../variants/variant-index.ts";

/**
 * PackOptions defines an exported structural contract.
 */
export interface PackOptions {
  filter?: WordTokenFilter;
  topK?: number;
  includeAllFrequencies?: boolean;
  mode?: "lean" | "full";
  fullModeInputLimit?: number;
  allowUnsafeFullMode?: boolean;
  ngrams?: {
    n: number;
    minCount?: number;
    topK?: number;
  };
  cooccurrence?: {
    windowSize: number;
    minCount?: number;
    maxPairs?: number;
  };
  maxPositions?: number;
  maxOutputBytes?: number;
  includeBoundaries?: boolean;
  representation?: "json" | "map";
  algorithmRevision?: string;
  variants?: VariantIndexOptions;
  profile?: SurfaceProfileOptions;
  fingerprint?: WinnowingOptions;
  includeRepetition?: boolean;
  includeDuplicateSentences?: boolean;
}

/**
 * PackSizeInfo defines an exported structural contract.
 */
export interface PackSizeInfo {
  estimatedBytes: number;
  maxOutputBytes?: number;
  exceedsMax?: boolean;
}

/**
 * SegmentationSummary defines an exported structural contract.
 */
export interface SegmentationSummary {
  count: number;
  spans?: Span[];
  spansTruncated?: boolean;
}

/**
 * LineBreakFacts defines an exported structural contract.
 */
export interface LineBreakFacts {
  count: number;
  mandatory: number;
  positions?: number[];
  positionsTruncated?: boolean;
  provenance: Provenance;
}

/**
 * BidiRunSummary defines an exported structural contract.
 */
export interface BidiRunSummary {
  level: number;
  startCU: number;
  endCU: number;
}

/**
 * BidiDisplayFacts defines an exported structural contract.
 */
export interface BidiDisplayFacts {
  paragraphLevel?: 0 | 1;
  paragraphLevels?: { ltr: number; rtl: number };
  runCount: number;
  runs?: BidiRunSummary[];
  runsTruncated?: boolean;
  visualOrder?: number[];
  visualOrderTruncated?: boolean;
  provenance: Provenance;
}

/**
 * DisplayFacts defines an exported structural contract.
 */
export interface DisplayFacts {
  lineBreaks: LineBreakFacts;
  bidi: BidiDisplayFacts;
}

/**
 * SecurityFacts defines an exported structural contract.
 */
export interface SecurityFacts {
  hasBidiControls: boolean;
  bidiControlCount: number;
  bidiControlSpans?: Span[];
  bidiControlsTruncated?: boolean;
  mixedDirection: boolean;
  mixedDirectionDocs?: number;
  provenance: Provenance;
}

/**
 * FrequencyTableJson defines an exported structural contract.
 */
export interface FrequencyTableJson {
  representation: "json";
  items: WordFrequencyItem[];
  totalTokens: number;
  allItems?: WordFrequencyItem[];
}

/**
 * FrequencyTableMap defines an exported structural contract.
 */
export interface FrequencyTableMap {
  representation: "map";
  map: Map<string, number>;
  totalTokens: number;
}

/**
 * FrequencyTable defines an exported type contract.
 */
export type FrequencyTable = FrequencyTableJson | FrequencyTableMap;

/**
 * NgramTableJson defines an exported structural contract.
 */
export interface NgramTableJson {
  representation: "json";
  items: WordNgramItem[];
  totalNgrams: number;
}

/**
 * NgramTableMap defines an exported structural contract.
 */
export interface NgramTableMap {
  representation: "map";
  map: Map<string, number>;
  totalNgrams: number;
}

/**
 * NgramTable defines an exported type contract.
 */
export type NgramTable = NgramTableJson | NgramTableMap;

/**
 * CooccurrenceTableJson defines an exported structural contract.
 */
export interface CooccurrenceTableJson {
  representation: "json";
  items: WordCooccurrenceItem[];
  totalWindows: number;
}

/**
 * CooccurrenceTableMap defines an exported structural contract.
 */
export interface CooccurrenceTableMap {
  representation: "map";
  map: Map<string, number>;
  totalWindows: number;
}

/**
 * CooccurrenceTable defines an exported type contract.
 */
export type CooccurrenceTable = CooccurrenceTableJson | CooccurrenceTableMap;

/**
 * RepetitionItem defines an exported structural contract.
 */
export interface RepetitionItem {
  tokens: string[];
  count: number;
}

/**
 * DuplicateSpanItem defines an exported structural contract.
 */
export interface DuplicateSpanItem {
  text: string;
  count: number;
  spans: Span[];
}

/**
 * DuplicateSentenceCorpusItem defines an exported structural contract.
 */
export interface DuplicateSentenceCorpusItem {
  text: string;
  count: number;
}

interface TokenizationStats {
  totalTokens: number;
  tokenFrequency: Map<string, number>;
  ngramTotal: number;
  ngramCounts: Map<string, { tokens: string[]; count: number }> | undefined;
  cooccurrenceTotal: number;
  cooccurrenceCounts: Map<string, { tokens: [string, string]; count: number }> | undefined;
}

/**
 * FactPack defines an exported structural contract.
 */
export interface FactPack {
  summary: {
    codeUnits: number;
    codePoints: number;
    graphemes: SegmentationSummary;
    words: SegmentationSummary;
    sentences: SegmentationSummary;
    bytes?: number;
  };
  frequencies: {
    words: FrequencyTable;
  };
  ngrams?: {
    words: NgramTable;
  };
  cooccurrence?: {
    words: CooccurrenceTable;
  };
  repetition?: {
    wordNgrams?: {
      items: RepetitionItem[];
      totalRepeated: number;
    };
    duplicateSentences?: {
      items: DuplicateSpanItem[];
      totalDuplicates: number;
    };
  };
  display: DisplayFacts;
  security: SecurityFacts;
  safety: {
    unpairedSurrogates: number;
    controlChars: number;
    invisibleChars: number;
  };
  variants?: VariantIndex;
  profile?: SurfaceProfile;
  fingerprint?: FingerprintFacts;
  size: PackSizeInfo;
  provenance: Provenance;
}

/**
 * CorpusPack defines an exported structural contract.
 */
export interface CorpusPack {
  summary: FactPack["summary"] & { documents: number };
  frequencies: FactPack["frequencies"];
  ngrams?: FactPack["ngrams"];
  cooccurrence?: FactPack["cooccurrence"];
  repetition?: {
    wordNgrams?: {
      items: RepetitionItem[];
      totalRepeated: number;
    };
    duplicateSentences?: {
      items: DuplicateSentenceCorpusItem[];
      totalDuplicates: number;
    };
  };
  display: DisplayFacts;
  security: SecurityFacts;
  safety: FactPack["safety"];
  variants?: VariantIndex;
  profile?: SurfaceProfile;
  fingerprint?: FingerprintFacts;
  size: PackSizeInfo;
  provenance: Provenance;
}

/**
 * FingerprintFacts defines an exported structural contract.
 */
export interface FingerprintFacts {
  k: number;
  window: number;
  fingerprintCount: number;
  fingerprints?: Fingerprint[];
  truncated?: boolean;
  provenance: Provenance;
}

const DEFAULT_TOP_K = 50;
const DEFAULT_MAX_POSITIONS = 200;
const DEFAULT_ALGORITHM_REVISION = "Unicode 17.0.0";
const DEFAULT_FULL_MODE_INPUT_LIMIT = 8_000_000;
const DEFAULT_CORPUS_FILTER = "word-like";
const PACK_SPEC = "textfacts:pack";
const INVISIBLE_CODEPOINTS = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
const WORDLIKE_PROPS = new Set<number>([
  WordBreakPropertyId.ALetter,
  WordBreakPropertyId.Hebrew_Letter,
  WordBreakPropertyId.Numeric,
  WordBreakPropertyId.Katakana,
  WordBreakPropertyId.ExtendNumLet,
]);

function isWordLikeToken(token: string): boolean {
  for (let codeUnitIndex = 0; codeUnitIndex < token.length; ) {
    const codePoint = token.codePointAt(codeUnitIndex) ?? 0;
    const wordBreakPropertyId = getWordBreakPropertyId(codePoint);
    if (WORDLIKE_PROPS.has(wordBreakPropertyId)) return true;
    codeUnitIndex += codePoint > 0xffff ? 2 : 1;
  }
  return false;
}

function shouldIncludeToken(token: string, filter: WordTokenFilter): boolean {
  if (filter === "all") return true;
  return isWordLikeToken(token);
}

function createPackProvenance(
  name: "Pack.AnalyzeText" | "Pack.AnalyzeCorpus",
  options: NormalizedPackOptions,
): Provenance {
  return createProvenance(
    {
      name,
      spec: PACK_SPEC,
      revisionOrDate: LIBRARY_VERSION,
      implementationId: IMPLEMENTATION_ID,
    },
    options,
    {
      text: "utf16-code-unit",
      token: "uax29-word",
      word: "uax29-word",
      sentence: "uax29-sentence",
      grapheme: "uax29-grapheme",
    },
  );
}

type NormalizedPackOptions = Required<
  Omit<PackOptions, "variants" | "profile" | "fingerprint" | "ngrams" | "cooccurrence">
> & {
  variants?: VariantIndexOptions;
  profile?: SurfaceProfileOptions;
  fingerprint?: WinnowingOptions;
  ngrams?: PackOptions["ngrams"];
  cooccurrence?: PackOptions["cooccurrence"];
  includeRepetition: boolean;
  includeDuplicateSentences: boolean;
};

type FullModeGuardInput = {
  codeUnits: number;
  limit: number;
  allowUnsafeFullMode: boolean;
  mode: "lean" | "full";
  context: string;
};

type FullModeCorpusGuardInput = FullModeGuardInput & {
  docId: string;
  cumulativeCodeUnits?: number;
};

function assertFullModeGuard(input: FullModeGuardInput): void {
  if (input.mode !== "full" || input.allowUnsafeFullMode) return;
  if (input.codeUnits <= input.limit) return;
  throw new RangeError(
    `Full-mode guard blocked ${input.context}: ${input.codeUnits} code units exceeds fullModeInputLimit=${input.limit}`,
  );
}

function assertFullModeCorpusGuard(input: FullModeCorpusGuardInput): void {
  if (input.mode !== "full" || input.allowUnsafeFullMode) return;
  if (input.cumulativeCodeUnits === undefined) return;
  if (input.cumulativeCodeUnits > input.limit) {
    throw new RangeError(
      `Full-mode guard blocked analyzeCorpus cumulative text for ${input.docId}: ${input.cumulativeCodeUnits} code units exceeds fullModeInputLimit=${input.limit}`,
    );
  }
}

function normalizePackOptions(options: PackOptions): NormalizedPackOptions {
  const topK = Math.max(1, Math.floor(options.topK ?? DEFAULT_TOP_K));
  const maxPositions = Math.max(1, Math.floor(options.maxPositions ?? DEFAULT_MAX_POSITIONS));
  const mode = options.mode ?? "lean";
  const fullModeInputLimitRaw = options.fullModeInputLimit ?? DEFAULT_FULL_MODE_INPUT_LIMIT;
  const fullModeInputLimit = Number.isFinite(fullModeInputLimitRaw)
    ? Math.max(0, Math.floor(fullModeInputLimitRaw))
    : DEFAULT_FULL_MODE_INPUT_LIMIT;
  const includeNgrams =
    options.ngrams !== undefined || mode === "full" || options.includeRepetition === true;
  const includeCooccurrence = options.cooccurrence !== undefined || mode === "full";
  const includeRepetition = options.includeRepetition ?? mode === "full";
  const includeDuplicateSentences = options.includeDuplicateSentences ?? mode === "full";
  const includeAllFrequencies = options.includeAllFrequencies ?? false;

  const ngramN = Math.max(1, Math.floor(options.ngrams?.n ?? 2));
  const cooccurrenceWindowSize = Math.max(2, Math.floor(options.cooccurrence?.windowSize ?? 2));
  const ngramTopK =
    options.ngrams?.topK === undefined ? undefined : Math.max(1, Math.floor(options.ngrams.topK));
  const cooccurrenceMaxPairs =
    options.cooccurrence?.maxPairs === undefined
      ? undefined
      : Math.max(1, Math.floor(options.cooccurrence.maxPairs));
  const ngrams: PackOptions["ngrams"] | undefined = includeNgrams ? { n: ngramN } : undefined;
  if (ngrams && options.ngrams?.minCount !== undefined) ngrams.minCount = options.ngrams.minCount;
  if (ngrams && ngramTopK !== undefined) ngrams.topK = ngramTopK;
  const cooccurrence: PackOptions["cooccurrence"] | undefined = includeCooccurrence
    ? { windowSize: cooccurrenceWindowSize }
    : undefined;
  if (cooccurrence && options.cooccurrence?.minCount !== undefined) {
    cooccurrence.minCount = options.cooccurrence.minCount;
  }
  if (cooccurrence && cooccurrenceMaxPairs !== undefined) {
    cooccurrence.maxPairs = cooccurrenceMaxPairs;
  }

  const normalized: NormalizedPackOptions = {
    filter: options.filter ?? "all",
    topK,
    includeAllFrequencies,
    mode,
    ngrams,
    cooccurrence,
    includeRepetition,
    includeDuplicateSentences,
    maxPositions,
    maxOutputBytes: options.maxOutputBytes ?? 0,
    includeBoundaries: options.includeBoundaries ?? false,
    representation: options.representation ?? "json",
    algorithmRevision: options.algorithmRevision ?? DEFAULT_ALGORITHM_REVISION,
    fullModeInputLimit,
    allowUnsafeFullMode: options.allowUnsafeFullMode ?? false,
  };
  if (options.variants) normalized.variants = options.variants;
  if (options.profile) normalized.profile = options.profile;
  if (options.fingerprint) normalized.fingerprint = options.fingerprint;
  return normalized;
}

function countCodePoints(text: string): number {
  let count = 0;
  for (let codeUnitIndex = 0; codeUnitIndex < text.length; ) {
    const codePoint = text.codePointAt(codeUnitIndex) ?? 0;
    count += 1;
    codeUnitIndex += codePoint > 0xffff ? 2 : 1;
  }
  return count;
}

function collectSpans(
  iterable: Iterable<Span>,
  include: boolean,
  maxPositions: number,
): SegmentationSummary {
  if (!include) {
    let count = 0;
    for (const _ignoredSpan of iterable) count += 1;
    return { count };
  }
  const spans: Span[] = [];
  let count = 0;
  let truncated = false;
  for (const span of iterable) {
    count += 1;
    if (spans.length < maxPositions) {
      spans.push(span);
    } else {
      truncated = true;
    }
  }
  const summary: SegmentationSummary = { count, spans };
  if (truncated) summary.spansTruncated = true;
  return summary;
}

function collectWordTokenStats(
  text: string,
  options: Pick<NormalizedPackOptions, "filter" | "algorithmRevision" | "ngrams" | "cooccurrence">,
): TokenizationStats {
  const tokenFrequency = new Map<string, number>();
  const ngramCounts = options.ngrams
    ? new Map<string, { tokens: string[]; count: number }>()
    : undefined;
  const cooccurrenceCounts = options.cooccurrence
    ? new Map<string, { tokens: [string, string]; count: number }>()
    : undefined;
  let ngramTotal = 0;
  let cooccurrenceTotal = 0;
  const ngramSize = options.ngrams?.n ?? 0;
  const windowSize = options.cooccurrence?.windowSize ?? 0;
  const ngramWindow: string[] = [];
  const cooccurrenceWindow: string[] = [];
  let totalTokens = 0;

  for (const span of segmentWordsUAX29(text, { algorithmRevision: options.algorithmRevision })) {
    const token = sliceBySpan(text, span);
    if (!shouldIncludeToken(token, options.filter)) continue;
    totalTokens += 1;
    tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);

    if (ngramCounts && ngramSize > 0) {
      ngramWindow.push(token);
      if (ngramWindow.length >= ngramSize) {
        const tokens = ngramWindow.slice(0, ngramSize);
        const key = JSON.stringify(tokens);
        const entry = ngramCounts.get(key);
        if (entry) {
          entry.count += 1;
        } else {
          ngramCounts.set(key, { tokens, count: 1 });
        }
        ngramTotal += 1;
      }
      ngramWindow.shift();
    }

    if (cooccurrenceCounts && windowSize >= 2) {
      cooccurrenceWindow.push(token);
      if (cooccurrenceWindow.length >= windowSize) {
        for (let leftIndex = 0; leftIndex < cooccurrenceWindow.length; leftIndex += 1) {
          for (
            let rightIndex = leftIndex + 1;
            rightIndex < cooccurrenceWindow.length;
            rightIndex += 1
          ) {
            const leftToken = cooccurrenceWindow[leftIndex] ?? "";
            const rightToken = cooccurrenceWindow[rightIndex] ?? "";
            const orderedPair: [string, string] =
              compareByCodePoint(leftToken, rightToken) <= 0
                ? [leftToken, rightToken]
                : [rightToken, leftToken];
            const key = JSON.stringify(orderedPair);
            const entry = cooccurrenceCounts.get(key);
            if (entry) {
              entry.count += 1;
            } else {
              cooccurrenceCounts.set(key, { tokens: orderedPair, count: 1 });
            }
          }
        }
        cooccurrenceWindow.shift();
        cooccurrenceTotal += 1;
      }
    }
  }

  return {
    totalTokens,
    tokenFrequency,
    ngramTotal,
    ngramCounts,
    cooccurrenceTotal,
    cooccurrenceCounts,
  };
}

function mapToFrequencyItems(wordFrequency: Map<string, number>): WordFrequencyItem[] {
  const items = Array.from(wordFrequency.entries()).map(([token, count]) => ({ token, count }));
  items.sort((leftItem, rightItem) => {
    if (leftItem.count !== rightItem.count) return rightItem.count - leftItem.count;
    return compareByCodePoint(leftItem.token, rightItem.token);
  });
  return items;
}

function compareTokenLists(leftTokens: string[], rightTokens: string[]): number {
  const tokenCount = Math.min(leftTokens.length, rightTokens.length);
  for (let index = 0; index < tokenCount; index += 1) {
    const tokenCompare = compareByCodePoint(leftTokens[index] ?? "", rightTokens[index] ?? "");
    if (tokenCompare !== 0) return tokenCompare;
  }
  return leftTokens.length - rightTokens.length;
}

function mapToNgramItems(
  ngramMap: Map<string, { tokens: string[]; count: number }> | undefined,
): WordNgramItem[] {
  const items = ngramMap ? Array.from(ngramMap.values()) : [];
  items.sort((leftItem, rightItem) => {
    if (leftItem.count !== rightItem.count) return rightItem.count - leftItem.count;
    return compareTokenLists(leftItem.tokens, rightItem.tokens);
  });
  return items;
}

function mapToCooccurrenceItems(
  cooccurrenceMap: Map<string, { tokens: [string, string]; count: number }> | undefined,
): WordCooccurrenceItem[] {
  const items = cooccurrenceMap ? Array.from(cooccurrenceMap.values()) : [];
  items.sort((leftItem, rightItem) => {
    if (leftItem.count !== rightItem.count) return rightItem.count - leftItem.count;
    const tokenCompare = compareByCodePoint(leftItem.tokens[0], rightItem.tokens[0]);
    if (tokenCompare !== 0) return tokenCompare;
    return compareByCodePoint(leftItem.tokens[1], rightItem.tokens[1]);
  });
  return items;
}

function combineNgramMaps(
  target: Map<string, { tokens: string[]; count: number }>,
  source: Map<string, { tokens: string[]; count: number }>,
  factor = 1,
): void {
  for (const item of source.values()) {
    const entry = target.get(JSON.stringify(item.tokens));
    if (entry) {
      entry.count += item.count * factor;
    } else {
      target.set(JSON.stringify(item.tokens), {
        tokens: item.tokens,
        count: item.count * factor,
      });
    }
  }
}

function combineCooccurrenceMaps(
  target: Map<string, { tokens: [string, string]; count: number }>,
  source: Map<string, { tokens: [string, string]; count: number }>,
  factor = 1,
): void {
  for (const item of source.values()) {
    const key = JSON.stringify(item.tokens);
    const entry = target.get(key);
    if (entry) {
      entry.count += item.count * factor;
    } else {
      target.set(key, { tokens: item.tokens, count: item.count * factor });
    }
  }
}

function combineFrequencyMaps(
  target: Map<string, number>,
  source: Map<string, number>,
  factor = 1,
): void {
  for (const [token, count] of source.entries()) {
    target.set(token, (target.get(token) ?? 0) + count * factor);
  }
}

function collectLineBreakFacts(
  text: string,
  includePositions: boolean,
  maxPositions: number,
): LineBreakFacts {
  const iterable = lineBreakOpportunities(text);
  let count = 0;
  let mandatory = 0;
  const positions: number[] = [];
  let truncated = false;
  for (const opportunity of iterable) {
    if (opportunity.kind === "prohibited") continue;
    count += 1;
    if (opportunity.kind === "mandatory") mandatory += 1;
    if (includePositions) {
      if (positions.length < maxPositions) {
        positions.push(opportunity.posCU);
      } else {
        truncated = true;
      }
    }
  }
  const facts: LineBreakFacts = {
    count,
    mandatory,
    provenance: iterable.provenance,
  };
  if (includePositions) {
    facts.positions = positions;
    if (truncated) facts.positionsTruncated = true;
  }
  return facts;
}

function isMixedDirection(levels: Uint8Array): boolean {
  let hasEven = false;
  let hasOdd = false;
  for (const level of levels) {
    if (level === 0xff) continue;
    if (level % 2 === 0) {
      hasEven = true;
    } else {
      hasOdd = true;
    }
    if (hasEven && hasOdd) return true;
  }
  return false;
}

function collectBidiFacts(
  text: string,
  includePositions: boolean,
  maxPositions: number,
): { display: BidiDisplayFacts; security: SecurityFacts } {
  const result = resolveBidi(text);
  const runCount = result.runs.length;
  const runs = includePositions
    ? result.runs.slice(0, maxPositions).map((run) => ({
        level: run.level,
        startCU: run.startCU,
        endCU: run.endCU,
      }))
    : undefined;
  const runsTruncated = includePositions && runCount > maxPositions;

  const visualOrder = includePositions
    ? Array.from(result.visualOrder.slice(0, maxPositions))
    : undefined;
  const visualOrderTruncated = includePositions && result.visualOrder.length > maxPositions;

  const display: BidiDisplayFacts = {
    paragraphLevel: result.paragraphLevel,
    runCount,
    provenance: result.provenance,
  };
  if (runs) display.runs = runs;
  if (runsTruncated) display.runsTruncated = true;
  if (visualOrder) display.visualOrder = visualOrder;
  if (visualOrderTruncated) display.visualOrderTruncated = true;

  const mixedDirection = isMixedDirection(result.levels);
  const bidiControlCount = result.bidiControlSpans.length;
  const controlSpans = includePositions
    ? result.bidiControlSpans.slice(0, maxPositions)
    : undefined;
  const bidiControlsTruncated = includePositions && bidiControlCount > maxPositions;

  const security: SecurityFacts = {
    hasBidiControls: result.hasBidiControls,
    bidiControlCount,
    mixedDirection,
    provenance: result.provenance,
  };
  if (controlSpans) security.bidiControlSpans = controlSpans;
  if (bidiControlsTruncated) security.bidiControlsTruncated = true;

  return { display, security };
}

function buildFrequencyTable(
  items: WordFrequencyItem[],
  totalTokens: number,
  options: NormalizedPackOptions,
): FrequencyTable {
  if (options.representation === "map") {
    const map = new Map<string, number>();
    const limited = items.slice(0, options.topK);
    for (const item of limited) {
      map.set(item.token, item.count);
    }
    return { representation: "map", map, totalTokens };
  }
  const limited = items.slice(0, options.topK);
  const result: FrequencyTableJson = { representation: "json", items: limited, totalTokens };
  if (options.includeAllFrequencies) result.allItems = items;
  return result;
}

function buildNgramTable(
  items: WordNgramItem[],
  totalNgrams: number,
  options: NormalizedPackOptions,
  topK: number,
): NgramTable {
  const limited = items.slice(0, topK);
  if (options.representation === "map") {
    const map = new Map<string, number>();
    for (const item of limited) {
      map.set(JSON.stringify(item.tokens), item.count);
    }
    return { representation: "map", map, totalNgrams };
  }
  return { representation: "json", items: limited, totalNgrams };
}

function buildCooccurrenceTable(
  items: WordCooccurrenceItem[],
  totalWindows: number,
  options: NormalizedPackOptions,
  maxPairs: number,
): CooccurrenceTable {
  const limited = items.slice(0, maxPairs);
  if (options.representation === "map") {
    const map = new Map<string, number>();
    for (const item of limited) {
      map.set(JSON.stringify(item.tokens), item.count);
    }
    return { representation: "map", map, totalWindows };
  }
  return { representation: "json", items: limited, totalWindows };
}

function buildRepetition(
  items: WordNgramItem[],
  minCount: number,
  topK: number,
): {
  items: RepetitionItem[];
  totalRepeated: number;
} {
  const repeated = items.filter((item) => item.count >= minCount);
  const limited = repeated
    .slice(0, topK)
    .map((item) => ({ tokens: item.tokens, count: item.count }));
  return { items: limited, totalRepeated: repeated.length };
}

function buildDuplicateSentences(
  text: string,
  options: NormalizedPackOptions,
): { items: DuplicateSpanItem[]; totalDuplicates: number } {
  const map = new Map<string, { count: number; spans: Span[] }>();
  for (const span of segmentSentencesUAX29(text, {
    algorithmRevision: options.algorithmRevision,
  })) {
    const sentence = text.slice(span.startCU, span.endCU);
    const entry = map.get(sentence);
    if (entry) {
      entry.count += 1;
      if (entry.spans.length < options.maxPositions) {
        entry.spans.push(span);
      }
    } else {
      map.set(sentence, { count: 1, spans: [span] });
    }
  }
  const duplicates: DuplicateSpanItem[] = [];
  for (const [sentence, entry] of map.entries()) {
    if (entry.count > 1) {
      duplicates.push({ text: sentence, count: entry.count, spans: entry.spans });
    }
  }
  duplicates.sort((leftItem, rightItem) => {
    if (leftItem.count !== rightItem.count) return rightItem.count - leftItem.count;
    return compareByCodePoint(leftItem.text, rightItem.text);
  });
  return { items: duplicates.slice(0, options.topK), totalDuplicates: duplicates.length };
}

function scanSafety(text: string): FactPack["safety"] {
  let unpairedSurrogates = 0;
  for (let codeUnitIndex = 0; codeUnitIndex < text.length; codeUnitIndex += 1) {
    const codeUnit = text.charCodeAt(codeUnitIndex);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = text.charCodeAt(codeUnitIndex + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        codeUnitIndex += 1;
      } else {
        unpairedSurrogates += 1;
      }
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      unpairedSurrogates += 1;
    }
  }

  let controlChars = 0;
  let invisibleChars = 0;
  for (let codeUnitIndex = 0; codeUnitIndex < text.length; ) {
    const codePoint = text.codePointAt(codeUnitIndex) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      controlChars += 1;
    }
    if (INVISIBLE_CODEPOINTS.has(codePoint)) {
      invisibleChars += 1;
    }
    codeUnitIndex += codePoint > 0xffff ? 2 : 1;
  }
  return { unpairedSurrogates, controlChars, invisibleChars };
}

function sizeInfo(pack: unknown, maxOutputBytes: number): PackSizeInfo {
  let estimatedBytes = 0;
  if (maxOutputBytes > 0) {
    try {
      estimatedBytes = canonicalModelStringify(pack).length;
    } catch (_error) {
      estimatedBytes = Number.MAX_SAFE_INTEGER;
    }
  } else {
    try {
      estimatedBytes = canonicalModelStringify(pack).length;
    } catch (_error) {
      estimatedBytes = Number.MAX_SAFE_INTEGER;
    }
  }
  const info: PackSizeInfo = { estimatedBytes };
  if (maxOutputBytes > 0) {
    info.maxOutputBytes = maxOutputBytes;
    info.exceedsMax = estimatedBytes > maxOutputBytes;
  }
  return info;
}

/**
 * Analyze a single text input into a FactPack.
 * Units: bytes (UTF-8).
 * Units: UTF-16 code units.
 * Units: Unicode scalar values.
 */
export function analyzeText(input: TextInput, options: PackOptions = {}): FactPack {
  const normalizedOptions = normalizePackOptions(options);
  const { text, inputType, byteLength } = normalizeInput(input);
  const allowUnsafeFullMode = options.allowUnsafeFullMode === true;
  assertFullModeGuard({
    codeUnits: text.length,
    limit: normalizedOptions.fullModeInputLimit,
    allowUnsafeFullMode,
    mode: normalizedOptions.mode,
    context: "analyzeText",
  });
  const tokenStats = collectWordTokenStats(text, {
    filter: normalizedOptions.filter,
    algorithmRevision: normalizedOptions.algorithmRevision,
    ngrams: normalizedOptions.ngrams,
    cooccurrence: normalizedOptions.cooccurrence,
  });
  const frequencies = mapToFrequencyItems(tokenStats.tokenFrequency);
  const frequencyTable = buildFrequencyTable(
    frequencies,
    tokenStats.totalTokens,
    normalizedOptions,
  );
  const ngramItems = mapToNgramItems(tokenStats.ngramCounts);
  const ngramMinCount = normalizedOptions.ngrams?.minCount ?? 1;
  const ngramFiltered = ngramItems.filter((item) => item.count >= ngramMinCount);
  const ngramTopK = normalizedOptions.ngrams?.topK ?? normalizedOptions.topK;
  const cooccurrenceItems = mapToCooccurrenceItems(tokenStats.cooccurrenceCounts);
  const cooccurrenceMinCount = normalizedOptions.cooccurrence?.minCount ?? 1;
  const cooccurrenceFiltered = cooccurrenceItems.filter(
    (item) => item.count >= cooccurrenceMinCount,
  );
  const cooccurrenceTopPairs = normalizedOptions.cooccurrence?.maxPairs ?? normalizedOptions.topK;

  const summary: FactPack["summary"] = {
    codeUnits: text.length,
    codePoints: countCodePoints(text),
    graphemes: collectSpans(
      segmentGraphemes(text, { algorithmRevision: normalizedOptions.algorithmRevision }),
      normalizedOptions.includeBoundaries,
      normalizedOptions.maxPositions,
    ),
    words: normalizedOptions.includeBoundaries
      ? collectSpans(
          segmentWordsUAX29(text, { algorithmRevision: normalizedOptions.algorithmRevision }),
          true,
          normalizedOptions.maxPositions,
        )
      : { count: tokenStats.totalTokens },
    sentences: collectSpans(
      segmentSentencesUAX29(text, { algorithmRevision: normalizedOptions.algorithmRevision }),
      normalizedOptions.includeBoundaries,
      normalizedOptions.maxPositions,
    ),
  };
  if (inputType === "utf8" && byteLength !== undefined) {
    summary.bytes = byteLength;
  }

  const ngramTable = normalizedOptions.ngrams
    ? buildNgramTable(ngramFiltered, tokenStats.ngramTotal, normalizedOptions, ngramTopK)
    : undefined;
  const cooccurrenceTable = normalizedOptions.cooccurrence
    ? buildCooccurrenceTable(
        cooccurrenceFiltered,
        tokenStats.cooccurrenceTotal,
        normalizedOptions,
        cooccurrenceTopPairs,
      )
    : undefined;
  const repetition = normalizedOptions.includeRepetition
    ? buildRepetition(ngramFiltered, 2, normalizedOptions.topK)
    : undefined;
  const duplicateSentences = normalizedOptions.includeDuplicateSentences
    ? buildDuplicateSentences(text, normalizedOptions)
    : undefined;
  const lineBreaks = collectLineBreakFacts(
    text,
    normalizedOptions.includeBoundaries,
    normalizedOptions.maxPositions,
  );
  const bidiFacts = collectBidiFacts(
    text,
    normalizedOptions.includeBoundaries,
    normalizedOptions.maxPositions,
  );
  const variants = normalizedOptions.variants
    ? buildVariantIndex(text, normalizedOptions.variants)
    : undefined;
  const profile = normalizedOptions.profile
    ? surfaceProfile(text, normalizedOptions.profile)
    : undefined;
  const fingerprintResult = normalizedOptions.fingerprint
    ? winnowingFingerprints(text, normalizedOptions.fingerprint)
    : undefined;
  let fingerprintFacts: FingerprintFacts | undefined;
  if (fingerprintResult && normalizedOptions.fingerprint) {
    fingerprintFacts = {
      k: Math.max(1, Math.floor(normalizedOptions.fingerprint.k)),
      window: Math.max(1, Math.floor(normalizedOptions.fingerprint.window)),
      fingerprintCount: fingerprintResult.fingerprints.length,
      fingerprints: fingerprintResult.fingerprints,
      provenance: fingerprintResult.algo,
    };
    if (fingerprintResult.truncated) fingerprintFacts.truncated = true;
  }

  const pack: FactPack = {
    summary,
    frequencies: { words: frequencyTable },
    display: {
      lineBreaks,
      bidi: bidiFacts.display,
    },
    security: bidiFacts.security,
    safety: scanSafety(text),
    size: { estimatedBytes: 0 },
    provenance: createPackProvenance("Pack.AnalyzeText", normalizedOptions),
  };
  if (ngramTable) pack.ngrams = { words: ngramTable };
  if (cooccurrenceTable) pack.cooccurrence = { words: cooccurrenceTable };
  if (repetition || duplicateSentences) {
    pack.repetition = {};
    if (repetition) pack.repetition.wordNgrams = repetition;
    if (duplicateSentences) pack.repetition.duplicateSentences = duplicateSentences;
  }
  if (variants) pack.variants = variants;
  if (profile) pack.profile = profile;
  if (fingerprintFacts) pack.fingerprint = fingerprintFacts;
  pack.size = sizeInfo(pack, normalizedOptions.maxOutputBytes);
  return pack;
}

/**
 * Analyze multiple inputs into a corpus FactPack.
 * Units: bytes (UTF-8).
 * Units: UTF-16 code units.
 * Units: Unicode scalar values.
 */
export function analyzeCorpus(
  docs: Iterable<TextInput | { id?: string; text: TextInput }>,
  options: PackOptions = {},
): CorpusPack {
  const normalizedOptions = normalizePackOptions({
    ...options,
    filter: options.filter ?? DEFAULT_CORPUS_FILTER,
  });
  const allowUnsafeFullMode = options.allowUnsafeFullMode === true;
  const frequencyMap = new Map<string, number>();
  const includeNgrams = normalizedOptions.ngrams !== undefined;
  const includeCooccurrence = normalizedOptions.cooccurrence !== undefined;
  const includeDuplicateSentences = normalizedOptions.includeDuplicateSentences;
  const ngramMap = includeNgrams
    ? new Map<string, { tokens: string[]; count: number }>()
    : undefined;
  const cooccurrenceMap = includeCooccurrence
    ? new Map<string, { tokens: [string, string]; count: number }>()
    : undefined;
  const duplicateSentenceMap = new Map<string, number>();
  const corpusDocs: Array<{ id: string; text: string }> = [];
  const seenDocIds = new Set<string>();
  let documentCounter = 0;

  let totalTokens = 0;
  let totalNgrams = 0;
  let totalWindows = 0;
  let documents = 0;

  let totalCodeUnits = 0;
  let totalCodePoints = 0;
  let totalGraphemes = 0;
  let totalWords = 0;
  let totalSentences = 0;
  let totalBytes = 0;
  let sawBytes = false;

  let safety = { unpairedSurrogates: 0, controlChars: 0, invisibleChars: 0 };
  let totalLineBreaks = 0;
  let totalLineBreaksMandatory = 0;
  let totalBidiRuns = 0;
  const bidiLevels = { ltr: 0, rtl: 0 };
  let bidiControlCount = 0;
  let hasAnyBidiControls = false;
  let mixedDirectionDocs = 0;

  const emptyLineBreak = collectLineBreakFacts("", false, normalizedOptions.maxPositions);
  const emptyBidi = collectBidiFacts("", false, normalizedOptions.maxPositions);
  let lineBreakProvenance = emptyLineBreak.provenance;
  let bidiProvenance = emptyBidi.display.provenance;
  let securityProvenance = emptyBidi.security.provenance;

  for (const doc of docs) {
    documentCounter += 1;
    const input = typeof doc === "string" || doc instanceof Uint8Array ? doc : doc.text;
    const sourceId =
      typeof doc === "string" || doc instanceof Uint8Array
        ? `doc-${documentCounter}`
        : doc.id && doc.id.trim().length > 0
          ? doc.id
          : `doc-${documentCounter}`;
    let docId = sourceId;
    let duplicateSuffix = 1;
    while (seenDocIds.has(docId)) {
      duplicateSuffix += 1;
      docId = `${sourceId}#${duplicateSuffix}`;
    }
    seenDocIds.add(docId);
    const { text, inputType, byteLength } = normalizeInput(input);
    assertFullModeCorpusGuard({
      codeUnits: text.length,
      limit: normalizedOptions.fullModeInputLimit,
      allowUnsafeFullMode,
      mode: normalizedOptions.mode,
      context: `analyzeCorpus(${docId})`,
      docId,
      cumulativeCodeUnits: totalCodeUnits + text.length,
    });
    const tokenStats = collectWordTokenStats(text, {
      filter: normalizedOptions.filter,
      algorithmRevision: normalizedOptions.algorithmRevision,
      ngrams: normalizedOptions.ngrams,
      cooccurrence: normalizedOptions.cooccurrence,
    });
    combineFrequencyMaps(frequencyMap, tokenStats.tokenFrequency);
    if (includeNgrams && ngramMap && tokenStats.ngramCounts) {
      combineNgramMaps(ngramMap, tokenStats.ngramCounts);
    }
    if (includeCooccurrence && cooccurrenceMap && tokenStats.cooccurrenceCounts) {
      combineCooccurrenceMaps(cooccurrenceMap, tokenStats.cooccurrenceCounts);
    }
    totalTokens += tokenStats.totalTokens;
    if (includeNgrams) totalNgrams += tokenStats.ngramTotal;
    if (includeCooccurrence) totalWindows += tokenStats.cooccurrenceTotal;

    documents += 1;
    corpusDocs.push({ id: docId, text });
    totalCodeUnits += text.length;
    totalCodePoints += countCodePoints(text);
    totalGraphemes += collectSpans(
      segmentGraphemes(text, { algorithmRevision: normalizedOptions.algorithmRevision }),
      false,
      normalizedOptions.maxPositions,
    ).count;
    totalWords += tokenStats.totalTokens;
    if (includeDuplicateSentences) {
      for (const span of segmentSentencesUAX29(text, {
        algorithmRevision: normalizedOptions.algorithmRevision,
      })) {
        const sentence = text.slice(span.startCU, span.endCU);
        duplicateSentenceMap.set(sentence, (duplicateSentenceMap.get(sentence) ?? 0) + 1);
        totalSentences += 1;
      }
    } else {
      totalSentences += collectSpans(
        segmentSentencesUAX29(text, { algorithmRevision: normalizedOptions.algorithmRevision }),
        false,
        normalizedOptions.maxPositions,
      ).count;
    }
    if (inputType === "utf8") {
      totalBytes += byteLength ?? 0;
      sawBytes = true;
    }

    const scan = scanSafety(text);
    safety = {
      unpairedSurrogates: safety.unpairedSurrogates + scan.unpairedSurrogates,
      controlChars: safety.controlChars + scan.controlChars,
      invisibleChars: safety.invisibleChars + scan.invisibleChars,
    };

    const lineBreakFacts = collectLineBreakFacts(text, false, normalizedOptions.maxPositions);
    totalLineBreaks += lineBreakFacts.count;
    totalLineBreaksMandatory += lineBreakFacts.mandatory;
    lineBreakProvenance = lineBreakFacts.provenance;

    const bidiFacts = collectBidiFacts(text, false, normalizedOptions.maxPositions);
    totalBidiRuns += bidiFacts.display.runCount;
    if (bidiFacts.display.paragraphLevel === 0) {
      bidiLevels.ltr += 1;
    } else {
      bidiLevels.rtl += 1;
    }
    if (bidiFacts.security.hasBidiControls) hasAnyBidiControls = true;
    bidiControlCount += bidiFacts.security.bidiControlCount;
    if (bidiFacts.security.mixedDirection) mixedDirectionDocs += 1;
    bidiProvenance = bidiFacts.display.provenance;
    securityProvenance = bidiFacts.security.provenance;
  }

  const frequencyItems = mapToFrequencyItems(frequencyMap);
  const ngramItems = includeNgrams ? mapToNgramItems(ngramMap) : [];
  const cooccurrenceItems = includeCooccurrence ? mapToCooccurrenceItems(cooccurrenceMap) : [];
  const ngramFiltered = ngramItems.filter(
    (item) => item.count >= (normalizedOptions.ngrams?.minCount ?? 1),
  );
  const cooccurrenceFiltered = cooccurrenceItems.filter(
    (item) => item.count >= (normalizedOptions.cooccurrence?.minCount ?? 1),
  );

  const duplicateItems: DuplicateSentenceCorpusItem[] = [];
  if (includeDuplicateSentences) {
    for (const [sentence, count] of duplicateSentenceMap.entries()) {
      if (count > 1) {
        duplicateItems.push({ text: sentence, count });
      }
    }
    duplicateItems.sort((leftItem, rightItem) => {
      if (leftItem.count !== rightItem.count) return rightItem.count - leftItem.count;
      return compareByCodePoint(leftItem.text, rightItem.text);
    });
  }

  const summary: CorpusPack["summary"] = {
    codeUnits: totalCodeUnits,
    codePoints: totalCodePoints,
    graphemes: { count: totalGraphemes },
    words: { count: totalWords },
    sentences: { count: totalSentences },
    documents,
  };
  if (sawBytes) summary.bytes = totalBytes;

  const pack: CorpusPack = {
    summary,
    frequencies: {
      words: buildFrequencyTable(frequencyItems, totalTokens, normalizedOptions),
    },
    display: {
      lineBreaks: {
        count: totalLineBreaks,
        mandatory: totalLineBreaksMandatory,
        provenance: lineBreakProvenance,
      },
      bidi: {
        paragraphLevels: { ltr: bidiLevels.ltr, rtl: bidiLevels.rtl },
        runCount: totalBidiRuns,
        provenance: bidiProvenance,
      },
    },
    security: {
      hasBidiControls: hasAnyBidiControls,
      bidiControlCount,
      mixedDirection: mixedDirectionDocs > 0,
      mixedDirectionDocs,
      provenance: securityProvenance,
    },
    safety,
    size: { estimatedBytes: 0 },
    provenance: createPackProvenance("Pack.AnalyzeCorpus", normalizedOptions),
  };
  if (includeNgrams) {
    pack.ngrams = {
      words: buildNgramTable(
        ngramFiltered,
        totalNgrams,
        normalizedOptions,
        normalizedOptions.ngrams?.topK ?? normalizedOptions.topK,
      ),
    };
  }
  if (includeCooccurrence) {
    pack.cooccurrence = {
      words: buildCooccurrenceTable(
        cooccurrenceFiltered,
        totalWindows,
        normalizedOptions,
        normalizedOptions.cooccurrence?.maxPairs ?? normalizedOptions.topK,
      ),
    };
  }
  if (normalizedOptions.includeRepetition && includeNgrams) {
    pack.repetition = {
      wordNgrams: buildRepetition(ngramFiltered, 2, normalizedOptions.topK),
    };
  }
  if (includeDuplicateSentences) {
    pack.repetition ??= {};
    pack.repetition.duplicateSentences = {
      items: duplicateItems.slice(0, normalizedOptions.topK),
      totalDuplicates: duplicateItems.length,
    };
  }
  if (normalizedOptions.fingerprint) {
    const fingerprintIndex = buildFingerprintIndex(corpusDocs, {
      ...normalizedOptions.fingerprint,
      maxFingerprints: normalizedOptions.fingerprint.maxFingerprints ?? Number.POSITIVE_INFINITY,
    });
    let fingerprintCount = 0;
    for (const fingerprints of Object.values(fingerprintIndex.docFingerprints)) {
      fingerprintCount += fingerprints.length;
    }
    const fingerprintFacts: FingerprintFacts = {
      k: Math.max(1, Math.floor(normalizedOptions.fingerprint.k)),
      window: Math.max(1, Math.floor(normalizedOptions.fingerprint.window)),
      fingerprintCount,
      provenance: fingerprintIndex.provenance,
    };
    if (fingerprintIndex.truncated) fingerprintFacts.truncated = true;
    pack.fingerprint = fingerprintFacts;
  }
  pack.size = sizeInfo(pack, normalizedOptions.maxOutputBytes);
  return pack;
}
