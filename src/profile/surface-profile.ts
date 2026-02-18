import type { UcaOptions } from "../collation/types.ts";
import { ucaCompare } from "../collation/uca.ts";
import { compareByCodePoint } from "../core/compare.ts";
import { normalizeInput } from "../core/input.ts";
import { createProvenance } from "../core/provenance.ts";
import type { Provenance, TextInput } from "../core/types.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import { normalize } from "../normalize/normalize.ts";
import { segmentGraphemes } from "../segment/grapheme.ts";
import { segmentSentencesUAX29 } from "../segment/sentence.ts";
import { segmentWordsUAX29 } from "../segment/word.ts";
import { GENERAL_CATEGORY_NAMES, generalCategoryIdAt } from "../unicode/general-category.ts";
import { SCRIPT_NAMES, scriptIdAt } from "../unicode/script.ts";
import { WordBreakPropertyId, getWordBreakPropertyId } from "../unicode/word.ts";

/**
 * LengthHistogramBin defines an exported structural contract.
 */
export interface LengthHistogramBin {
  max: number;
  count: number;
}

/**
 * LengthHistogram defines an exported structural contract.
 */
export interface LengthHistogram {
  bins: LengthHistogramBin[];
  overflow: number;
}

/**
 * SurfaceProfileOptions defines an exported structural contract.
 */
export interface SurfaceProfileOptions {
  ngrams?: {
    sizes: number[];
    topK?: number;
  };
  lengthBins?: number[];
  wordFilter?: "all" | "word-like";
  sortOrder?: "codepoint" | "uca";
  collationOptions?: UcaOptions;
}

/**
 * ScriptCount defines an exported structural contract.
 */
export interface ScriptCount {
  script: string;
  count: number;
}

/**
 * CategoryCount defines an exported structural contract.
 */
export interface CategoryCount {
  category: string;
  count: number;
}

/**
 * NgramCount defines an exported structural contract.
 */
export interface NgramCount {
  gram: string;
  count: number;
}

/**
 * NgramProfile defines an exported structural contract.
 */
export interface NgramProfile {
  n: number;
  total: number;
  items: NgramCount[];
  truncated?: boolean;
}

/**
 * SurfaceProfile defines an exported structural contract.
 */
export interface SurfaceProfile {
  summary: {
    codeUnits: number;
    codePoints: number;
    bytes: number;
  };
  unicode: {
    generalCategories: CategoryCount[];
    scripts: ScriptCount[];
    normalization: {
      nfcChanged: boolean;
      nfdChanged: boolean;
      nfkcChanged: boolean;
      nfkdChanged: boolean;
    };
    bidiControls: number;
  };
  segmentation: {
    graphemes: number;
    words: number;
    sentences: number;
    wordLengthHistogram?: LengthHistogram;
    sentenceLengthHistogram?: LengthHistogram;
  };
  punctuationWhitespace: {
    punctuation: number;
    whitespace: number;
  };
  ngrams?: {
    charNgrams: NgramProfile[];
  };
  provenance: Provenance;
}

export interface SurfaceProfileBuilder {
  update(chunk: TextInput): void;
  finalize(): SurfaceProfile;
}

const DEFAULT_ALGORITHM_REVISION = "Unicode 17.0.0";
const PROFILE_SPEC = "textfacts:profile";

const WORDLIKE_PROPS = new Set<number>([
  WordBreakPropertyId.ALetter,
  WordBreakPropertyId.Hebrew_Letter,
  WordBreakPropertyId.Numeric,
  WordBreakPropertyId.Katakana,
  WordBreakPropertyId.ExtendNumLet,
]);

const PUNCTUATION_CATEGORIES = new Set(["Pc", "Pd", "Ps", "Pe", "Pi", "Pf", "Po"]);

const WHITESPACE_CATEGORIES = new Set(["Zs", "Zl", "Zp"]);

const BIDI_CONTROLS = new Set([
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f, 0x061c,
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

function buildHistogram(lengths: number[], bins: number[]): LengthHistogram {
  const sortedBins = [...bins].sort((leftBound, rightBound) => leftBound - rightBound);
  const counts = new Array(sortedBins.length).fill(0);
  let overflow = 0;
  for (const length of lengths) {
    let placed = false;
    for (let index = 0; index < sortedBins.length; index += 1) {
      const max = sortedBins[index] ?? Number.POSITIVE_INFINITY;
      if (length <= max) {
        counts[index] += 1;
        placed = true;
        break;
      }
    }
    if (!placed) overflow += 1;
  }
  const binsOut = sortedBins.map((max, index) => ({ max, count: counts[index] ?? 0 }));
  return { bins: binsOut, overflow };
}

function computeNgrams(
  codePoints: number[],
  sizes: number[],
  topK: number,
  compareTokens: (leftToken: string, rightToken: string) => number,
): NgramProfile[] {
  const profiles: NgramProfile[] = [];
  for (const size of sizes) {
    const ngramSize = Math.max(1, Math.floor(size));
    const counts = new Map<string, number>();
    let total = 0;
    for (let index = 0; index + ngramSize <= codePoints.length; index += 1) {
      const slice = codePoints.slice(index, index + ngramSize);
      const gram = String.fromCodePoint(...slice);
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
      total += 1;
    }
    const items = Array.from(counts.entries()).map(([gram, count]) => ({ gram, count }));
    items.sort((leftItem, rightItem) => {
      if (leftItem.count !== rightItem.count) return rightItem.count - leftItem.count;
      return compareTokens(leftItem.gram, rightItem.gram);
    });
    const truncated = topK < items.length;
    const profile: NgramProfile = {
      n: ngramSize,
      total,
      items: items.slice(0, topK),
    };
    if (truncated) profile.truncated = true;
    profiles.push(profile);
  }
  profiles.sort((leftProfile, rightProfile) => leftProfile.n - rightProfile.n);
  return profiles;
}

function buildProvenance(options: SurfaceProfileOptions): Provenance {
  return createProvenance(
    {
      name: "Facts.SurfaceProfile",
      spec: PROFILE_SPEC,
      revisionOrDate: DEFAULT_ALGORITHM_REVISION,
      implementationId: IMPLEMENTATION_ID,
    },
    options,
    {
      text: "utf16-code-unit",
      token: "unicode-code-point",
      word: "uax29-word",
      sentence: "uax29-sentence",
      grapheme: "uax29-grapheme",
    },
  );
}

/**
 * Compute a surface profile summary for text.
 * Units: bytes (UTF-8).
 * Units: UTF-16 code units.
 * Units: Unicode scalar values.
 */
export function surfaceProfile(
  input: TextInput,
  options: SurfaceProfileOptions = {},
): SurfaceProfile {
  const { text } = normalizeInput(input);
  const wordFilter = options.wordFilter ?? "word-like";
  const codePoints: number[] = [];
  const categoryCounts = new Map<string, number>();
  const scriptCounts = new Map<string, number>();
  let bidiControls = 0;

  for (let codeUnitIndex = 0; codeUnitIndex < text.length; ) {
    const codePoint = text.codePointAt(codeUnitIndex) ?? 0;
    codePoints.push(codePoint);
    const categoryId = generalCategoryIdAt(codePoint);
    const category = GENERAL_CATEGORY_NAMES[categoryId] ?? "Cn";
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    const script = SCRIPT_NAMES[scriptIdAt(codePoint)] ?? "Unknown";
    scriptCounts.set(script, (scriptCounts.get(script) ?? 0) + 1);
    if (BIDI_CONTROLS.has(codePoint)) bidiControls += 1;
    codeUnitIndex += codePoint > 0xffff ? 2 : 1;
  }

  const categoryList: CategoryCount[] = Array.from(categoryCounts.entries()).map(
    ([category, count]) => ({
      category,
      count,
    }),
  );
  categoryList.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return compareByCodePoint(a.category, b.category);
  });

  const scriptList: ScriptCount[] = Array.from(scriptCounts.entries()).map(([script, count]) => ({
    script,
    count,
  }));
  scriptList.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return compareByCodePoint(a.script, b.script);
  });

  const nfc = normalize(text, "NFC");
  const nfd = normalize(text, "NFD");
  const nfkc = normalize(text, "NFKC");
  const nfkd = normalize(text, "NFKD");

  let punctuation = 0;
  let whitespace = 0;
  for (const entry of categoryList) {
    if (PUNCTUATION_CATEGORIES.has(entry.category)) punctuation += entry.count;
    if (WHITESPACE_CATEGORIES.has(entry.category)) whitespace += entry.count;
  }

  let graphemeCount = 0;
  for (const _ of segmentGraphemes(text)) graphemeCount += 1;
  let wordCount = 0;
  const wordLengths: number[] = [];
  for (const span of segmentWordsUAX29(text)) {
    const token = text.slice(span.startCU, span.endCU);
    if (wordFilter === "word-like" && !isWordLikeToken(token)) continue;
    wordCount += 1;
    wordLengths.push(token.length);
  }
  let sentenceCount = 0;
  const sentenceLengths: number[] = [];
  for (const span of segmentSentencesUAX29(text)) {
    sentenceCount += 1;
    sentenceLengths.push(span.endCU - span.startCU);
  }

  const compareTokens =
    (options.sortOrder ?? "codepoint") === "uca"
      ? (leftToken: string, rightToken: string) =>
          ucaCompare(leftToken, rightToken, options.collationOptions)
      : compareByCodePoint;
  const ngrams = options.ngrams
    ? computeNgrams(codePoints, options.ngrams.sizes, options.ngrams.topK ?? 50, compareTokens)
    : undefined;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(text).length;

  const segmentation: SurfaceProfile["segmentation"] = {
    graphemes: graphemeCount,
    words: wordCount,
    sentences: sentenceCount,
  };
  if (options.lengthBins) {
    segmentation.wordLengthHistogram = buildHistogram(wordLengths, options.lengthBins);
    segmentation.sentenceLengthHistogram = buildHistogram(sentenceLengths, options.lengthBins);
  }

  const profile: SurfaceProfile = {
    summary: {
      codeUnits: text.length,
      codePoints: codePoints.length,
      bytes,
    },
    unicode: {
      generalCategories: categoryList,
      scripts: scriptList,
      normalization: {
        nfcChanged: nfc !== text,
        nfdChanged: nfd !== text,
        nfkcChanged: nfkc !== text,
        nfkdChanged: nfkd !== text,
      },
      bidiControls,
    },
    segmentation,
    punctuationWhitespace: {
      punctuation,
      whitespace,
    },
    provenance: buildProvenance(options),
  };
  if (ngrams) {
    profile.ngrams = { charNgrams: ngrams };
  }
  return profile;
}

/**
 * surfaceProfileBuilder executes a deterministic operation in this module.
 */
export function surfaceProfileBuilder(options: SurfaceProfileOptions = {}): SurfaceProfileBuilder {
  const chunks: string[] = [];
  return {
    update(chunk: TextInput) {
      const { text } = normalizeInput(chunk);
      if (text.length > 0) chunks.push(text);
    },
    finalize(): SurfaceProfile {
      const text = chunks.join("");
      return surfaceProfile(text, options);
    },
  };
}
