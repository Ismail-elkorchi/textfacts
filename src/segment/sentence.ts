import { normalizeInput } from "../core/input.ts";
import { createProvenance } from "../core/provenance.ts";
import type { SegmentIterable, Span, TextInput } from "../core/types.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import { SentenceBreakPropertyId, getSentenceBreakPropertyId } from "../unicode/sentence.ts";
import { collectCodePoints } from "./internal.ts";
import { createSegmentIterable } from "./segment-iterable.ts";

/**
 * SentenceSegmentOptions defines an exported structural contract.
 */
export interface SentenceSegmentOptions {
  algorithmRevision?: string;
}

const DEFAULT_ALGORITHM_REVISION = "Unicode 17.0.0";
const UAX29_SPEC = "https://unicode.org/reports/tr29/";

/**
 * Segment sentences using UAX #29.
 * Units: bytes (UTF-8).
 * Units: UTF-16 code units.
 */
export function segmentSentencesUAX29(
  input: TextInput,
  options: SentenceSegmentOptions = {},
): SegmentIterable {
  const { text } = normalizeInput(input);
  const normalizedOptions = {
    algorithmRevision: options.algorithmRevision ?? DEFAULT_ALGORITHM_REVISION,
  };
  const algorithm = {
    name: "UAX29.Sentence",
    spec: UAX29_SPEC,
    revisionOrDate: normalizedOptions.algorithmRevision,
    implementationId: IMPLEMENTATION_ID,
  };
  const provenance = createProvenance(algorithm, normalizedOptions, {
    text: "utf16-code-unit",
    token: "uax29-sentence",
    sentence: "uax29-sentence",
  });

  const generate = function* (): Iterable<Span> {
    if (text.length === 0) return;

    const { codePoints, codeUnitStarts } = collectCodePoints(text);
    const count = codePoints.length;
    if (count === 0) return;

    const props = new Int32Array(count);
    for (let i = 0; i < count; i += 1) {
      const cp = codePoints[i] ?? 0;
      props[i] = getSentenceBreakPropertyId(cp);
    }

    const isSkippable = (prop: number) =>
      prop === SentenceBreakPropertyId.Extend || prop === SentenceBreakPropertyId.Format;

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

    const isSep = (prop: number) =>
      prop === SentenceBreakPropertyId.Sep ||
      prop === SentenceBreakPropertyId.CR ||
      prop === SentenceBreakPropertyId.LF;

    const shouldBreak = (index: number) => {
      const prev = index - 1;
      const curr = index;
      const prevProp = props[prev] ?? 0;
      const currProp = props[curr] ?? 0;

      if (prevProp === SentenceBreakPropertyId.CR && currProp === SentenceBreakPropertyId.LF) {
        return false;
      }

      if (
        prevProp === SentenceBreakPropertyId.Extend &&
        (currProp === SentenceBreakPropertyId.Sp ||
          currProp === SentenceBreakPropertyId.Close ||
          isSep(currProp))
      ) {
        return false;
      }

      if (isSep(prevProp)) return true;
      if (isSkippable(currProp)) return false;
      if (isSep(currProp)) return false;

      const left = prevNonSkip[prev] ?? -1;
      const right = nextNonSkip[curr] ?? -1;
      if (left < 0 || right < 0) return false;

      const leftProp = props[left] ?? 0;
      const rightProp = props[right] ?? 0;
      const left2 = left > 0 ? (prevNonSkip[left - 1] ?? -1) : -1;
      const left2Prop = left2 >= 0 ? (props[left2] ?? 0) : -1;
      const { baseLeftProp, validCloseSp } = scanBaseLeft(left, props, prevNonSkip);
      const rightNonCloseProp = scanRightNonCloseSp(right, props, nextNonSkip);
      const prevEffective = isSkippable(prevProp) ? leftProp : prevProp;

      if (
        !validCloseSp &&
        (baseLeftProp === SentenceBreakPropertyId.STerm ||
          baseLeftProp === SentenceBreakPropertyId.ATerm) &&
        prevEffective === SentenceBreakPropertyId.Sp
      ) {
        const breaksAfter =
          baseLeftProp === SentenceBreakPropertyId.STerm
            ? isSentenceStarter(rightNonCloseProp, true)
            : isSentenceStarter(rightNonCloseProp, false);
        if (breaksAfter) return true;
      }

      if (
        leftProp === SentenceBreakPropertyId.ATerm &&
        rightProp === SentenceBreakPropertyId.Numeric
      ) {
        return false;
      }

      if (
        leftProp === SentenceBreakPropertyId.ATerm &&
        rightProp === SentenceBreakPropertyId.Upper &&
        left2 >= 0 &&
        (left2Prop === SentenceBreakPropertyId.Upper || left2Prop === SentenceBreakPropertyId.Lower)
      ) {
        return false;
      }

      if (
        validCloseSp &&
        baseLeftProp === SentenceBreakPropertyId.ATerm &&
        (rightProp === SentenceBreakPropertyId.SContinue ||
          rightProp === SentenceBreakPropertyId.ATerm ||
          rightProp === SentenceBreakPropertyId.STerm)
      ) {
        return false;
      }

      if (
        validCloseSp &&
        (baseLeftProp === SentenceBreakPropertyId.STerm ||
          baseLeftProp === SentenceBreakPropertyId.ATerm) &&
        (rightProp === SentenceBreakPropertyId.SContinue ||
          rightProp === SentenceBreakPropertyId.STerm ||
          rightProp === SentenceBreakPropertyId.ATerm)
      ) {
        return false;
      }

      if (
        validCloseSp &&
        (baseLeftProp === SentenceBreakPropertyId.STerm ||
          baseLeftProp === SentenceBreakPropertyId.ATerm) &&
        (prevEffective === SentenceBreakPropertyId.Close ||
          prevEffective === SentenceBreakPropertyId.ATerm ||
          prevEffective === SentenceBreakPropertyId.STerm) &&
        (rightProp === SentenceBreakPropertyId.Close ||
          rightProp === SentenceBreakPropertyId.Sp ||
          isSep(rightProp))
      ) {
        return false;
      }

      if (
        validCloseSp &&
        (baseLeftProp === SentenceBreakPropertyId.STerm ||
          baseLeftProp === SentenceBreakPropertyId.ATerm) &&
        prevEffective === SentenceBreakPropertyId.Sp &&
        (rightProp === SentenceBreakPropertyId.Sp || isSep(rightProp))
      ) {
        return false;
      }

      if (
        validCloseSp &&
        baseLeftProp === SentenceBreakPropertyId.ATerm &&
        rightProp === SentenceBreakPropertyId.Lower
      ) {
        return false;
      }

      if (
        validCloseSp &&
        baseLeftProp === SentenceBreakPropertyId.ATerm &&
        rightNonCloseProp === SentenceBreakPropertyId.Lower
      ) {
        return false;
      }

      if (
        validCloseSp &&
        (baseLeftProp === SentenceBreakPropertyId.STerm ||
          baseLeftProp === SentenceBreakPropertyId.ATerm) &&
        (rightProp === SentenceBreakPropertyId.Upper ||
          rightProp === SentenceBreakPropertyId.Lower ||
          rightProp === SentenceBreakPropertyId.OLetter ||
          rightProp === SentenceBreakPropertyId.Numeric ||
          rightProp === SentenceBreakPropertyId.SContinue)
      ) {
        return true;
      }

      if (
        validCloseSp &&
        (baseLeftProp === SentenceBreakPropertyId.STerm ||
          baseLeftProp === SentenceBreakPropertyId.ATerm)
      ) {
        return true;
      }

      return false;
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

function isSentenceStarter(prop: number, includeLower: boolean): boolean {
  if (prop === SentenceBreakPropertyId.Upper) return true;
  if (prop === SentenceBreakPropertyId.OLetter) return true;
  if (prop === SentenceBreakPropertyId.Numeric) return true;
  if (prop === SentenceBreakPropertyId.SContinue) return true;
  if (includeLower && prop === SentenceBreakPropertyId.Lower) return true;
  return false;
}

function scanBaseLeft(
  leftIndex: number,
  props: Int32Array,
  prevNonSkip: Int32Array,
): { baseLeftProp: number; validCloseSp: boolean } {
  let index = leftIndex;
  let sawClose = false;
  let invalid = false;
  while (index >= 0) {
    const prop = props[index] ?? 0;
    if (prop === SentenceBreakPropertyId.Extend || prop === SentenceBreakPropertyId.Format) {
      index = index > 0 ? (prevNonSkip[index - 1] ?? -1) : -1;
      continue;
    }
    if (prop === SentenceBreakPropertyId.Close) {
      sawClose = true;
      index = index > 0 ? (prevNonSkip[index - 1] ?? -1) : -1;
      continue;
    }
    if (prop === SentenceBreakPropertyId.Sp) {
      if (sawClose) invalid = true;
      index = index > 0 ? (prevNonSkip[index - 1] ?? -1) : -1;
      continue;
    }
    return { baseLeftProp: prop, validCloseSp: !invalid };
  }
  return { baseLeftProp: -1, validCloseSp: !invalid };
}

function scanRightNonCloseSp(
  rightIndex: number,
  props: Int32Array,
  nextNonSkip: Int32Array,
): number {
  let index = rightIndex;
  while (index >= 0 && index < props.length) {
    const prop = props[index] ?? 0;
    if (prop === SentenceBreakPropertyId.Extend || prop === SentenceBreakPropertyId.Format) {
      index = index + 1 < props.length ? (nextNonSkip[index + 1] ?? -1) : -1;
      continue;
    }
    if (prop === SentenceBreakPropertyId.Close || prop === SentenceBreakPropertyId.Sp) {
      index = index + 1 < props.length ? (nextNonSkip[index + 1] ?? -1) : -1;
      continue;
    }
    return prop;
  }
  return -1;
}
