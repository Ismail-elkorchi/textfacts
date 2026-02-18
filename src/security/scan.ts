import { hasBidiControls } from "../bidi/bidi.ts";
import { nfkcCaseFold } from "../casefold/casefold.ts";
import { normalizeInput } from "../core/input.ts";
import { sliceBySpan } from "../core/span.ts";
import type { Span, TextInput } from "../core/types.ts";
import { segmentGraphemes } from "../segment/grapheme.ts";
import { segmentSentencesUAX29 } from "../segment/sentence.ts";
import { segmentWordsUAX29 } from "../segment/word.ts";
import { SCRIPT_NAMES, Script, scriptExtAt, scriptIdAt } from "../unicode/script.ts";
import { WordBreakPropertyId, getWordBreakPropertyId } from "../unicode/word.ts";
import { confusableSkeleton } from "./confusables.ts";

/**
 * TokenizerKind defines an exported type contract.
 */
export type TokenizerKind =
  | "uax29-word"
  | "uax29-grapheme"
  | "uax29-sentence"
  | "codePoint"
  | "custom";
/**
 * Canonicalization defines an exported type contract.
 */
export type Canonicalization = "none" | "nfkcCaseFold" | "skeleton";

/**
 * TokenScanOptions defines an exported structural contract.
 */
export interface TokenScanOptions {
  tokenizer: TokenizerKind;
  canonicalize?: Canonicalization;
  maxTokens?: number;
  wordFilter?: "all" | "word-like";
  customTokenizer?: (text: string) => Iterable<Span>;
}

/**
 * ScannedToken defines an exported structural contract.
 */
export interface ScannedToken {
  spanCU: Span;
  raw: string;
  canonical: string;
  scripts: string[];
  hasMixedScript: boolean;
  hasBidiControls: boolean;
}

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

function iterateSpans(text: string, options: TokenScanOptions): Iterable<Span> {
  switch (options.tokenizer) {
    case "uax29-word":
      return segmentWordsUAX29(text);
    case "uax29-grapheme":
      return segmentGraphemes(text);
    case "uax29-sentence":
      return segmentSentencesUAX29(text);
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

function canonicalizeToken(raw: string, canonicalize: Canonicalization): string {
  if (canonicalize === "nfkcCaseFold") return nfkcCaseFold(raw);
  if (canonicalize === "skeleton") return confusableSkeleton(raw);
  return raw;
}

function collectScripts(token: string): { scripts: string[]; hasMixedScript: boolean } {
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
    const fallback = scriptIdAt(token.codePointAt(0) ?? 0);
    scriptSet.add(fallback);
  }
  const scripts = Array.from(scriptSet.values())
    .sort((a, b) => a - b)
    .map((scriptId) => SCRIPT_NAMES[scriptId] ?? "Unknown");
  return { scripts, hasMixedScript: scriptSet.size > 1 };
}

/**
 * hasMixedScriptToken executes a deterministic operation in this module.
 */
export function hasMixedScriptToken(token: string): boolean {
  return collectScripts(token).hasMixedScript;
}

/**
 * Scan tokens for script and confusable signals.
 * Units: bytes (UTF-8).
 * Units: UTF-16 code units.
 */
export function* scanTokens(input: TextInput, options: TokenScanOptions): Iterable<ScannedToken> {
  const { text } = normalizeInput(input);
  const canonicalize = options.canonicalize ?? "none";
  const maxTokens = options.maxTokens ?? Number.POSITIVE_INFINITY;
  const wordFilter = options.wordFilter ?? "all";
  let scannedCount = 0;
  for (const span of iterateSpans(text, options)) {
    if (scannedCount >= maxTokens) break;
    const raw = sliceBySpan(text, span);
    if (options.tokenizer === "uax29-word" && wordFilter === "word-like" && !isWordLikeToken(raw)) {
      continue;
    }
    const canonical = canonicalizeToken(raw, canonicalize);
    const scriptInfo = collectScripts(raw);
    yield {
      spanCU: span,
      raw,
      canonical,
      scripts: scriptInfo.scripts,
      hasMixedScript: scriptInfo.hasMixedScript,
      hasBidiControls: hasBidiControls(raw),
    };
    scannedCount += 1;
  }
}
