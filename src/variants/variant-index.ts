import { nfkcCaseFold } from "../casefold/casefold.ts";
import type { UcaOptions } from "../collation/types.ts";
import { ucaCompare } from "../collation/uca.ts";
import { compareByCodePoint } from "../core/compare.ts";
import { normalizeInput } from "../core/input.ts";
import { createProvenance } from "../core/provenance.ts";
import { sliceBySpan } from "../core/span.ts";
import type { Provenance, Span, TextInput } from "../core/types.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import { confusableSkeleton } from "../security/confusables.ts";
import { segmentGraphemes } from "../segment/grapheme.ts";
import { segmentWordsUAX29 } from "../segment/word.ts";
import { SCRIPT_NAMES, Script, scriptExtAt, scriptIdAt } from "../unicode/script.ts";
import { WordBreakPropertyId, getWordBreakPropertyId } from "../unicode/word.ts";

/**
 * VariantTokenizer defines an exported type contract.
 */
export type VariantTokenizer = "uax29-word" | "uax29-grapheme" | "codePoint" | "custom";
/**
 * VariantCanonicalKey defines an exported type contract.
 */
export type VariantCanonicalKey = "nfkcCaseFold" | "skeleton" | "raw";

/**
 * VariantIndexOptions defines an exported structural contract.
 */
export interface VariantIndexOptions {
  tokenizer: VariantTokenizer;
  canonicalKey: VariantCanonicalKey;
  wordFilter?: "all" | "word-like";
  customTokenizer?: (text: string) => Iterable<Span>;
  maxExamplesPerVariant?: number;
  maxVariants?: number;
  sortOrder?: "codepoint" | "uca";
  collationOptions?: UcaOptions;
}

/**
 * VariantFormEntry defines an exported structural contract.
 */
export interface VariantFormEntry {
  form: string;
  count: number;
  firstSpanCU: Span;
  exampleSpansCU: Span[];
}

/**
 * VariantScriptSummary defines an exported structural contract.
 */
export interface VariantScriptSummary {
  script: string;
  count: number;
}

/**
 * VariantEntry defines an exported structural contract.
 */
export interface VariantEntry {
  key: string;
  totalCount: number;
  distinctForms: number;
  forms: VariantFormEntry[];
  scriptsSummary: VariantScriptSummary[];
  hasMixedScriptAny: boolean;
}

/**
 * VariantIndex defines an exported structural contract.
 */
export interface VariantIndex {
  variants: VariantEntry[];
  totalTokens: number;
  truncated?: boolean;
  provenance: Provenance;
}

interface VariantFormAccumulator {
  form: string;
  count: number;
  firstSpanCU: Span;
  exampleSpansCU: Span[];
}

interface VariantAccumulator {
  key: string;
  totalCount: number;
  forms: Map<string, VariantFormAccumulator>;
  scriptCounts: Map<number, number>;
  hasMixedScriptAny: boolean;
}

const DEFAULT_ALGORITHM_REVISION = "Unicode 17.0.0";
const VARIANT_SPEC = "textfacts:variants";

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

function iterateSpans(text: string, options: VariantIndexOptions): Iterable<Span> {
  switch (options.tokenizer) {
    case "uax29-word":
      return segmentWordsUAX29(text);
    case "uax29-grapheme":
      return segmentGraphemes(text);
    case "codePoint":
      return (function* () {
        let codeUnitIndex = 0;
        while (codeUnitIndex < text.length) {
          const codePoint = text.codePointAt(codeUnitIndex) ?? 0;
          const nextIndex = codeUnitIndex + (codePoint > 0xffff ? 2 : 1);
          yield { startCU: codeUnitIndex, endCU: nextIndex };
          codeUnitIndex = nextIndex;
        }
      })();
    case "custom":
      if (!options.customTokenizer)
        throw new Error("customTokenizer is required for tokenizer=custom");
      return options.customTokenizer(text);
    default:
      return [];
  }
}

function canonicalizeToken(token: string, canonicalKey: VariantCanonicalKey): string {
  switch (canonicalKey) {
    case "nfkcCaseFold":
      return nfkcCaseFold(token);
    case "skeleton":
      return confusableSkeleton(token);
    default:
      return token;
  }
}

function collectScripts(token: string): { scripts: number[]; hasMixedScript: boolean } {
  const scriptSet = new Set<number>();
  for (let codeUnitIndex = 0; codeUnitIndex < token.length; ) {
    const codePoint = token.codePointAt(codeUnitIndex) ?? 0;
    const scriptExtensions = scriptExtAt(codePoint);
    for (const scriptId of scriptExtensions) {
      if (scriptId === Script.Common || scriptId === Script.Inherited) continue;
      scriptSet.add(scriptId);
    }
    codeUnitIndex += codePoint > 0xffff ? 2 : 1;
  }
  if (scriptSet.size === 0) {
    scriptSet.add(scriptIdAt(token.codePointAt(0) ?? 0));
  }
  const scripts = Array.from(scriptSet.values()).sort((a, b) => a - b);
  return { scripts, hasMixedScript: scriptSet.size > 1 };
}

function buildProvenance(options: VariantIndexOptions): Provenance {
  const units: Provenance["units"] = {
    text: "utf16-code-unit",
    token:
      options.tokenizer === "uax29-word"
        ? "uax29-word"
        : options.tokenizer === "uax29-grapheme"
          ? "uax29-grapheme"
          : options.tokenizer === "codePoint"
            ? "unicode-code-point"
            : "custom",
  };
  if (options.tokenizer === "uax29-word") {
    units.word = "uax29-word";
  }
  return createProvenance(
    {
      name: "Facts.VariantIndex",
      spec: VARIANT_SPEC,
      revisionOrDate: DEFAULT_ALGORITHM_REVISION,
      implementationId: IMPLEMENTATION_ID,
    },
    options,
    units,
  );
}

function finalizeVariants(
  accumulators: Map<string, VariantAccumulator>,
  compareTokens: (leftToken: string, rightToken: string) => number,
): VariantEntry[] {
  const entries: VariantEntry[] = [];
  for (const entry of accumulators.values()) {
    const forms = Array.from(entry.forms.values()).map((formEntry) => ({
      form: formEntry.form,
      count: formEntry.count,
      firstSpanCU: formEntry.firstSpanCU,
      exampleSpansCU: formEntry.exampleSpansCU.slice(),
    }));
    forms.sort((leftForm, rightForm) => {
      if (leftForm.count !== rightForm.count) return rightForm.count - leftForm.count;
      return compareTokens(leftForm.form, rightForm.form);
    });
    const scriptsSummary: VariantScriptSummary[] = Array.from(entry.scriptCounts.entries()).map(
      ([scriptId, count]) => ({
        script: SCRIPT_NAMES[scriptId] ?? "Unknown",
        count,
      }),
    );
    scriptsSummary.sort((leftSummary, rightSummary) => {
      if (leftSummary.count !== rightSummary.count) return rightSummary.count - leftSummary.count;
      return compareByCodePoint(leftSummary.script, rightSummary.script);
    });
    entries.push({
      key: entry.key,
      totalCount: entry.totalCount,
      distinctForms: entry.forms.size,
      forms,
      scriptsSummary,
      hasMixedScriptAny: entry.hasMixedScriptAny,
    });
  }
  entries.sort((leftEntry, rightEntry) => {
    if (leftEntry.totalCount !== rightEntry.totalCount) {
      return rightEntry.totalCount - leftEntry.totalCount;
    }
    return compareTokens(leftEntry.key, rightEntry.key);
  });
  return entries;
}

/**
 * Build variant index for a single input.
 * Units: bytes (UTF-8).
 * Units: UTF-16 code units.
 */
export function buildVariantIndex(input: TextInput, options: VariantIndexOptions): VariantIndex {
  const { text } = normalizeInput(input);
  const normalizedOptions: VariantIndexOptions = {
    tokenizer: options.tokenizer,
    canonicalKey: options.canonicalKey,
    wordFilter: options.wordFilter ?? "all",
    maxExamplesPerVariant: options.maxExamplesPerVariant ?? 5,
    maxVariants: options.maxVariants ?? Number.POSITIVE_INFINITY,
    sortOrder: options.sortOrder ?? "codepoint",
  };
  if (options.customTokenizer) normalizedOptions.customTokenizer = options.customTokenizer;
  if (options.collationOptions !== undefined) {
    normalizedOptions.collationOptions = options.collationOptions;
  }
  const maxExamples = normalizedOptions.maxExamplesPerVariant ?? 5;
  const maxVariants = normalizedOptions.maxVariants ?? Number.POSITIVE_INFINITY;
  const accumulators = new Map<string, VariantAccumulator>();
  let totalTokens = 0;
  let truncated = false;

  for (const span of iterateSpans(text, normalizedOptions)) {
    const token = sliceBySpan(text, span);
    if (
      normalizedOptions.tokenizer === "uax29-word" &&
      normalizedOptions.wordFilter === "word-like" &&
      !isWordLikeToken(token)
    ) {
      continue;
    }
    totalTokens += 1;
    const key = canonicalizeToken(token, normalizedOptions.canonicalKey);
    let entry = accumulators.get(key);
    if (!entry) {
      if (accumulators.size >= maxVariants) {
        truncated = true;
        continue;
      }
      entry = {
        key,
        totalCount: 0,
        forms: new Map(),
        scriptCounts: new Map(),
        hasMixedScriptAny: false,
      };
      accumulators.set(key, entry);
    }
    entry.totalCount += 1;
    let formEntry = entry.forms.get(token);
    if (!formEntry) {
      formEntry = {
        form: token,
        count: 0,
        firstSpanCU: span,
        exampleSpansCU: [],
      };
      entry.forms.set(token, formEntry);
    }
    formEntry.count += 1;
    if (formEntry.exampleSpansCU.length < maxExamples) {
      formEntry.exampleSpansCU.push(span);
    }

    const scriptInfo = collectScripts(token);
    if (scriptInfo.hasMixedScript) entry.hasMixedScriptAny = true;
    for (const scriptId of scriptInfo.scripts) {
      entry.scriptCounts.set(scriptId, (entry.scriptCounts.get(scriptId) ?? 0) + 1);
    }
  }

  const compareTokens =
    normalizedOptions.sortOrder === "uca"
      ? (leftToken: string, rightToken: string) =>
          ucaCompare(leftToken, rightToken, normalizedOptions.collationOptions)
      : compareByCodePoint;
  const result: VariantIndex = {
    variants: finalizeVariants(accumulators, compareTokens),
    totalTokens,
    provenance: buildProvenance(normalizedOptions),
  };
  if (truncated) result.truncated = true;
  return result;
}

/**
 * Build variant index across a corpus.
 * Units: bytes (UTF-8).
 * Units: UTF-16 code units.
 */
export async function buildCorpusVariantIndex(
  texts: Iterable<TextInput> | AsyncIterable<TextInput>,
  options: VariantIndexOptions,
): Promise<VariantIndex> {
  const normalizedOptions: VariantIndexOptions = {
    tokenizer: options.tokenizer,
    canonicalKey: options.canonicalKey,
    wordFilter: options.wordFilter ?? "all",
    maxExamplesPerVariant: options.maxExamplesPerVariant ?? 5,
    maxVariants: options.maxVariants ?? Number.POSITIVE_INFINITY,
    sortOrder: options.sortOrder ?? "codepoint",
  };
  if (options.customTokenizer) normalizedOptions.customTokenizer = options.customTokenizer;
  if (options.collationOptions !== undefined) {
    normalizedOptions.collationOptions = options.collationOptions;
  }
  const maxExamples = normalizedOptions.maxExamplesPerVariant ?? 5;
  const maxVariants = normalizedOptions.maxVariants ?? Number.POSITIVE_INFINITY;
  const accumulators = new Map<string, VariantAccumulator>();
  let totalTokens = 0;
  let truncated = false;

  const processText = (textInput: TextInput) => {
    const { text } = normalizeInput(textInput);
    for (const span of iterateSpans(text, normalizedOptions)) {
      const token = sliceBySpan(text, span);
      if (
        normalizedOptions.tokenizer === "uax29-word" &&
        normalizedOptions.wordFilter === "word-like" &&
        !isWordLikeToken(token)
      ) {
        continue;
      }
      totalTokens += 1;
      const key = canonicalizeToken(token, normalizedOptions.canonicalKey);
      let entry = accumulators.get(key);
      if (!entry) {
        if (accumulators.size >= maxVariants) {
          truncated = true;
          continue;
        }
        entry = {
          key,
          totalCount: 0,
          forms: new Map(),
          scriptCounts: new Map(),
          hasMixedScriptAny: false,
        };
        accumulators.set(key, entry);
      }
      entry.totalCount += 1;
      let formEntry = entry.forms.get(token);
      if (!formEntry) {
        formEntry = {
          form: token,
          count: 0,
          firstSpanCU: span,
          exampleSpansCU: [],
        };
        entry.forms.set(token, formEntry);
      }
      formEntry.count += 1;
      if (formEntry.exampleSpansCU.length < maxExamples) {
        formEntry.exampleSpansCU.push(span);
      }

      const scriptInfo = collectScripts(token);
      if (scriptInfo.hasMixedScript) entry.hasMixedScriptAny = true;
      for (const scriptId of scriptInfo.scripts) {
        entry.scriptCounts.set(scriptId, (entry.scriptCounts.get(scriptId) ?? 0) + 1);
      }
    }
  };

  if (Symbol.asyncIterator in texts) {
    for await (const textInput of texts as AsyncIterable<TextInput>) {
      processText(textInput);
    }
  } else {
    for (const textInput of texts as Iterable<TextInput>) {
      processText(textInput);
    }
  }

  const compareTokens =
    normalizedOptions.sortOrder === "uca"
      ? (leftToken: string, rightToken: string) =>
          ucaCompare(leftToken, rightToken, normalizedOptions.collationOptions)
      : compareByCodePoint;
  const result: VariantIndex = {
    variants: finalizeVariants(accumulators, compareTokens),
    totalTokens,
    provenance: buildProvenance(normalizedOptions),
  };
  if (truncated) result.truncated = true;
  return result;
}
