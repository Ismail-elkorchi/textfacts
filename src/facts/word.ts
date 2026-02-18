import { compareByCodePoint } from "../core/compare.ts";
import { normalizeInput } from "../core/input.ts";
import { createProvenance } from "../core/provenance.ts";
import { sliceBySpan } from "../core/span.ts";
import type { Provenance, TextInput } from "../core/types.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import { segmentWordsUAX29 } from "../segment/word.ts";
import { WordBreakPropertyId, getWordBreakPropertyId } from "../unicode/word.ts";

/**
 * WordTokenFilter defines an exported type contract.
 */
export type WordTokenFilter = "all" | "word-like";

/**
 * WordFrequencyOptions defines an exported structural contract.
 */
export interface WordFrequencyOptions {
  filter?: WordTokenFilter;
  algorithmRevision?: string;
}

/**
 * WordFrequencyItem defines an exported structural contract.
 */
export interface WordFrequencyItem {
  token: string;
  count: number;
}

/**
 * WordFrequencyResult defines an exported structural contract.
 */
export interface WordFrequencyResult {
  items: WordFrequencyItem[];
  totalTokens: number;
  provenance: Provenance;
}

/**
 * WordNgramOptions defines an exported structural contract.
 */
export interface WordNgramOptions {
  n: number;
  filter?: WordTokenFilter;
  algorithmRevision?: string;
}

/**
 * WordNgramItem defines an exported structural contract.
 */
export interface WordNgramItem {
  tokens: string[];
  count: number;
}

/**
 * WordNgramResult defines an exported structural contract.
 */
export interface WordNgramResult {
  items: WordNgramItem[];
  totalNgrams: number;
  provenance: Provenance;
}

/**
 * WordCooccurrenceOptions defines an exported structural contract.
 */
export interface WordCooccurrenceOptions {
  windowSize: number;
  filter?: WordTokenFilter;
  algorithmRevision?: string;
}

/**
 * WordCooccurrenceItem defines an exported structural contract.
 */
export interface WordCooccurrenceItem {
  tokens: [string, string];
  count: number;
}

/**
 * WordCooccurrenceResult defines an exported structural contract.
 */
export interface WordCooccurrenceResult {
  items: WordCooccurrenceItem[];
  totalWindows: number;
  provenance: Provenance;
}

const DEFAULT_ALGORITHM_REVISION = "Unicode 17.0.0";
const UAX29_SPEC = "https://unicode.org/reports/tr29/";

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

function compareTokensLex(leftTokens: string[], rightTokens: string[]): number {
  const tokenCount = Math.min(leftTokens.length, rightTokens.length);
  for (let index = 0; index < tokenCount; index += 1) {
    const tokenCompare = compareByCodePoint(leftTokens[index] ?? "", rightTokens[index] ?? "");
    if (tokenCompare !== 0) return tokenCompare;
  }
  return leftTokens.length - rightTokens.length;
}

function shouldInclude(token: string, filter: WordTokenFilter): boolean {
  if (filter === "all") return true;
  return isWordLikeToken(token);
}

function buildProvenance(name: string, options: unknown): Provenance {
  return createProvenance(
    {
      name,
      spec: UAX29_SPEC,
      revisionOrDate:
        (options as { algorithmRevision?: string })?.algorithmRevision ??
        DEFAULT_ALGORITHM_REVISION,
      implementationId: IMPLEMENTATION_ID,
    },
    options,
    {
      text: "utf16-code-unit",
      token: "uax29-word",
      word: "uax29-word",
    },
  );
}

/**
 * Word frequency counts using UAX #29 segmentation.
 * Units: bytes (UTF-8).
 */
export function wordFrequencies(
  input: TextInput,
  options: WordFrequencyOptions = {},
): WordFrequencyResult {
  const filter = options.filter ?? "all";
  const counts = new Map<string, number>();
  let totalTokens = 0;
  const { text } = normalizeInput(input);
  const segmentOptions = options.algorithmRevision
    ? { algorithmRevision: options.algorithmRevision }
    : {};
  const normalizedOptions = {
    filter,
    algorithmRevision: options.algorithmRevision ?? DEFAULT_ALGORITHM_REVISION,
  };

  for (const span of segmentWordsUAX29(text, segmentOptions)) {
    const token = sliceBySpan(text, span);
    if (!shouldInclude(token, filter)) continue;
    totalTokens += 1;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const items = Array.from(counts.entries()).map(([token, count]) => ({ token, count }));
  items.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return compareByCodePoint(a.token, b.token);
  });

  return {
    items,
    totalTokens,
    provenance: buildProvenance("Facts.WordFrequency", normalizedOptions),
  };
}

/**
 * Word n-gram counts using UAX #29 segmentation.
 * Units: bytes (UTF-8).
 */
export function wordNgrams(input: TextInput, options: WordNgramOptions): WordNgramResult {
  const filter = options.filter ?? "all";
  const ngramSize = Math.max(1, Math.floor(options.n));
  const counts = new Map<string, { tokens: string[]; count: number }>();
  const window: string[] = [];
  let totalNgrams = 0;
  const { text } = normalizeInput(input);
  const segmentOptions = options.algorithmRevision
    ? { algorithmRevision: options.algorithmRevision }
    : {};
  const normalizedOptions = {
    n: ngramSize,
    filter,
    algorithmRevision: options.algorithmRevision ?? DEFAULT_ALGORITHM_REVISION,
  };

  for (const span of segmentWordsUAX29(text, segmentOptions)) {
    const token = sliceBySpan(text, span);
    if (!shouldInclude(token, filter)) continue;
    window.push(token);
    if (window.length < ngramSize) continue;

    const tokens = window.slice(0, ngramSize);
    const key = JSON.stringify(tokens);
    const entry = counts.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      counts.set(key, { tokens, count: 1 });
    }
    totalNgrams += 1;
    window.shift();
  }

  const items = Array.from(counts.values());
  items.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return compareTokensLex(a.tokens, b.tokens);
  });

  return {
    items,
    totalNgrams,
    provenance: buildProvenance("Facts.WordNgrams", normalizedOptions),
  };
}

/**
 * Word co-occurrence counts using UAX #29 segmentation.
 * Units: bytes (UTF-8).
 */
export function wordCooccurrence(
  input: TextInput,
  options: WordCooccurrenceOptions,
): WordCooccurrenceResult {
  const filter = options.filter ?? "all";
  const windowSize = Math.max(2, Math.floor(options.windowSize));
  const counts = new Map<string, { tokens: [string, string]; count: number }>();
  const window: string[] = [];
  let totalWindows = 0;
  const { text } = normalizeInput(input);
  const segmentOptions = options.algorithmRevision
    ? { algorithmRevision: options.algorithmRevision }
    : {};
  const normalizedOptions = {
    windowSize,
    filter,
    algorithmRevision: options.algorithmRevision ?? DEFAULT_ALGORITHM_REVISION,
  };

  for (const span of segmentWordsUAX29(text, segmentOptions)) {
    const token = sliceBySpan(text, span);
    if (!shouldInclude(token, filter)) continue;
    window.push(token);
    if (window.length < windowSize) continue;

    for (let leftIndex = 0; leftIndex < window.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < window.length; rightIndex += 1) {
        const leftToken = window[leftIndex] ?? "";
        const rightToken = window[rightIndex] ?? "";
        const orderedPair: [string, string] =
          compareByCodePoint(leftToken, rightToken) <= 0
            ? [leftToken, rightToken]
            : [rightToken, leftToken];
        const key = JSON.stringify(orderedPair);
        const entry = counts.get(key);
        if (entry) {
          entry.count += 1;
        } else {
          counts.set(key, { tokens: orderedPair, count: 1 });
        }
      }
    }

    totalWindows += 1;
    window.shift();
  }

  const items = Array.from(counts.values());
  items.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    const cmp = compareByCodePoint(a.tokens[0], b.tokens[0]);
    if (cmp !== 0) return cmp;
    return compareByCodePoint(a.tokens[1], b.tokens[1]);
  });

  return {
    items,
    totalWindows,
    provenance: buildProvenance("Facts.WordCooccurrence", normalizedOptions),
  };
}
