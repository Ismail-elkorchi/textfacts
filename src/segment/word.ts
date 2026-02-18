import { normalizeInput } from "../core/input.ts";
import { createProvenance } from "../core/provenance.ts";
import type { SegmentIterable, Span, TextInput } from "../core/types.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import { isExtendedPictographic } from "../unicode/emoji.ts";
import { WordBreakPropertyId, getWordBreakPropertyId } from "../unicode/word.ts";
import { collectCodePoints } from "./internal.ts";
import { createSegmentIterable } from "./segment-iterable.ts";

/**
 * WordSegmentOptions defines an exported structural contract.
 */
export interface WordSegmentOptions {
  algorithmRevision?: string;
}

const DEFAULT_ALGORITHM_REVISION = "Unicode 17.0.0";
const UAX29_SPEC = "https://unicode.org/reports/tr29/";

/**
 * Segment word boundaries using UAX #29.
 * Units: bytes (UTF-8).
 * Units: UTF-16 code units.
 */
export function segmentWordsUAX29(
  input: TextInput,
  options: WordSegmentOptions = {},
): SegmentIterable {
  const { text } = normalizeInput(input);
  const normalizedOptions = {
    algorithmRevision: options.algorithmRevision ?? DEFAULT_ALGORITHM_REVISION,
  };
  const algorithm = {
    name: "UAX29.Word",
    spec: UAX29_SPEC,
    revisionOrDate: normalizedOptions.algorithmRevision,
    implementationId: IMPLEMENTATION_ID,
  };
  const provenance = createProvenance(algorithm, normalizedOptions, {
    text: "utf16-code-unit",
    token: "uax29-word",
    word: "uax29-word",
  });

  const generate = function* (): Iterable<Span> {
    if (text.length === 0) return;

    const { codePoints, codeUnitStarts } = collectCodePoints(text);
    const count = codePoints.length;
    if (count === 0) return;

    const props = new Int32Array(count);
    const extPict = new Uint8Array(count);
    for (let i = 0; i < count; i += 1) {
      const cp = codePoints[i] ?? 0;
      props[i] = getWordBreakPropertyId(cp);
      extPict[i] = isExtendedPictographic(cp) ? 1 : 0;
    }

    const isSkippable = (prop: number) =>
      prop === WordBreakPropertyId.Extend ||
      prop === WordBreakPropertyId.Format ||
      prop === WordBreakPropertyId.ZWJ;

    const prevNonSkip = new Int32Array(count);
    let last = -1;
    for (let i = 0; i < count; i += 1) {
      const prop = props[i] ?? 0;
      if (!isSkippable(prop)) last = i;
      prevNonSkip[i] = last;
    }

    const nextNonSkip = new Int32Array(count);
    let next = -1;
    for (let i = count - 1; i >= 0; i -= 1) {
      const prop = props[i] ?? 0;
      if (!isSkippable(prop)) next = i;
      nextNonSkip[i] = next;
    }

    const riCountAt = new Int32Array(count);
    for (let i = 0; i < count; i += 1) {
      const prop = props[i] ?? 0;
      if (prop === WordBreakPropertyId.Regional_Indicator) {
        const prevIndex = i > 0 ? (prevNonSkip[i - 1] ?? -1) : -1;
        if (prevIndex >= 0 && (props[prevIndex] ?? 0) === WordBreakPropertyId.Regional_Indicator) {
          riCountAt[i] = (riCountAt[prevIndex] ?? 0) + 1;
        } else {
          riCountAt[i] = 1;
        }
      } else {
        riCountAt[i] = 0;
      }
    }

    const isNewline = (prop: number) =>
      prop === WordBreakPropertyId.Newline ||
      prop === WordBreakPropertyId.CR ||
      prop === WordBreakPropertyId.LF;

    const isAHLetter = (prop: number) =>
      prop === WordBreakPropertyId.ALetter || prop === WordBreakPropertyId.Hebrew_Letter;

    const isMidLetter = (prop: number) =>
      prop === WordBreakPropertyId.MidLetter ||
      prop === WordBreakPropertyId.MidNumLet ||
      prop === WordBreakPropertyId.Single_Quote;

    const isMidNum = (prop: number) =>
      prop === WordBreakPropertyId.MidNum ||
      prop === WordBreakPropertyId.MidNumLet ||
      prop === WordBreakPropertyId.Single_Quote;

    const isAHNumKatOrExtend = (prop: number) =>
      isAHLetter(prop) ||
      prop === WordBreakPropertyId.Numeric ||
      prop === WordBreakPropertyId.Katakana ||
      prop === WordBreakPropertyId.ExtendNumLet;

    const isAHNumKat = (prop: number) =>
      isAHLetter(prop) ||
      prop === WordBreakPropertyId.Numeric ||
      prop === WordBreakPropertyId.Katakana;

    const shouldBreak = (index: number) => {
      const prev = index - 1;
      const curr = index;
      const prevProp = props[prev] ?? 0;
      const currProp = props[curr] ?? 0;

      if (prevProp === WordBreakPropertyId.CR && currProp === WordBreakPropertyId.LF) return false;
      if (isNewline(prevProp)) return true;
      if (isNewline(currProp)) return true;

      if (prevProp === WordBreakPropertyId.ZWJ && (extPict[curr] ?? 0) === 1) {
        return false;
      }

      if (
        prevProp === WordBreakPropertyId.WSegSpace &&
        currProp === WordBreakPropertyId.WSegSpace
      ) {
        return false;
      }

      if (isSkippable(currProp)) return false;

      const left = prevNonSkip[prev] ?? -1;
      const right = nextNonSkip[curr] ?? -1;
      if (left < 0 || right < 0) return true;

      const leftProp = props[left] ?? 0;
      const rightProp = props[right] ?? 0;

      const left2 = left > 0 ? (prevNonSkip[left - 1] ?? -1) : -1;
      const right2 = right + 1 < count ? (nextNonSkip[right + 1] ?? -1) : -1;
      const left2Prop = left2 >= 0 ? (props[left2] ?? 0) : -1;
      const right2Prop = right2 >= 0 ? (props[right2] ?? 0) : -1;

      if (isAHLetter(leftProp) && isAHLetter(rightProp)) return false;

      if (isAHLetter(leftProp) && isMidLetter(rightProp) && right2 >= 0 && isAHLetter(right2Prop)) {
        return false;
      }

      if (left2 >= 0 && isAHLetter(left2Prop) && isMidLetter(leftProp) && isAHLetter(rightProp)) {
        return false;
      }

      if (
        leftProp === WordBreakPropertyId.Hebrew_Letter &&
        rightProp === WordBreakPropertyId.Single_Quote
      ) {
        return false;
      }

      if (
        leftProp === WordBreakPropertyId.Hebrew_Letter &&
        rightProp === WordBreakPropertyId.Double_Quote &&
        right2 >= 0 &&
        right2Prop === WordBreakPropertyId.Hebrew_Letter
      ) {
        return false;
      }

      if (
        left2 >= 0 &&
        left2Prop === WordBreakPropertyId.Hebrew_Letter &&
        leftProp === WordBreakPropertyId.Double_Quote &&
        rightProp === WordBreakPropertyId.Hebrew_Letter
      ) {
        return false;
      }

      if (leftProp === WordBreakPropertyId.Numeric && rightProp === WordBreakPropertyId.Numeric) {
        return false;
      }

      if (isAHLetter(leftProp) && rightProp === WordBreakPropertyId.Numeric) return false;
      if (leftProp === WordBreakPropertyId.Numeric && isAHLetter(rightProp)) return false;

      if (
        left2 >= 0 &&
        left2Prop === WordBreakPropertyId.Numeric &&
        isMidNum(leftProp) &&
        rightProp === WordBreakPropertyId.Numeric
      ) {
        return false;
      }

      if (
        leftProp === WordBreakPropertyId.Numeric &&
        isMidNum(rightProp) &&
        right2 >= 0 &&
        right2Prop === WordBreakPropertyId.Numeric
      ) {
        return false;
      }

      if (leftProp === WordBreakPropertyId.Katakana && rightProp === WordBreakPropertyId.Katakana) {
        return false;
      }

      if (isAHNumKatOrExtend(leftProp) && rightProp === WordBreakPropertyId.ExtendNumLet) {
        return false;
      }

      if (leftProp === WordBreakPropertyId.ExtendNumLet && isAHNumKat(rightProp)) return false;

      if (
        leftProp === WordBreakPropertyId.Regional_Indicator &&
        rightProp === WordBreakPropertyId.Regional_Indicator
      ) {
        return (riCountAt[left] ?? 0) % 2 === 0;
      }

      return true;
    };

    let startCU = 0;
    for (let i = 1; i < count; i += 1) {
      if (shouldBreak(i)) {
        const boundary = codeUnitStarts[i] ?? text.length;
        yield { startCU, endCU: boundary };
        startCU = boundary;
      }
    }

    yield { startCU, endCU: text.length };
  };

  return createSegmentIterable(generate, provenance);
}
