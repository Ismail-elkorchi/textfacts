import { iterateCodePoints } from "../core/codepoint.ts";
import { normalizeInput } from "../core/input.ts";
import { createProvenance } from "../core/provenance.ts";
import type { SegmentIterable, Span, TextInput } from "../core/types.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import { isExtendedPictographic } from "../unicode/emoji.ts";
import { GraphemeBreakPropertyId, getGraphemeBreakPropertyId } from "../unicode/grapheme.ts";
import { IncbPropertyId, getIncbPropertyId } from "../unicode/incb.ts";
import { createSegmentIterable } from "./segment-iterable.ts";

/**
 * GraphemeSegmentOptions defines an exported structural contract.
 */
export interface GraphemeSegmentOptions {
  algorithmRevision?: string;
}

const DEFAULT_ALGORITHM_REVISION = "Unicode 17.0.0";
const UAX29_SPEC = "https://unicode.org/reports/tr29/";

/**
 * Segment grapheme clusters using UAX #29.
 * Units: bytes (UTF-8).
 * Units: UTF-16 code units.
 */
export function segmentGraphemes(
  input: TextInput,
  options: GraphemeSegmentOptions = {},
): SegmentIterable {
  const { text } = normalizeInput(input);
  const normalizedOptions = {
    algorithmRevision: options.algorithmRevision ?? DEFAULT_ALGORITHM_REVISION,
  };
  const algorithm = {
    name: "UAX29.Grapheme",
    spec: UAX29_SPEC,
    revisionOrDate: normalizedOptions.algorithmRevision,
    implementationId: IMPLEMENTATION_ID,
  };
  const provenance = createProvenance(algorithm, normalizedOptions, {
    text: "utf16-code-unit",
    token: "uax29-grapheme",
    grapheme: "uax29-grapheme",
  });

  const generate = function* (): Iterable<Span> {
    if (text.length === 0) return;

    let startCU = 0;
    let first = true;
    let prevProp = 0;
    const state = {
      riCount: 0,
      emojiSeq: false,
      prevWasZWJAfterEP: false,
      incbConsonant: false,
      incbAfterLinker: false,
    };

    const clearClusterState = () => {
      state.riCount = 0;
      state.emojiSeq = false;
      state.prevWasZWJAfterEP = false;
      state.incbConsonant = false;
      state.incbAfterLinker = false;
    };

    const updateState = (prop: number, extendedPictographic: boolean, incb: number) => {
      if (prop === GraphemeBreakPropertyId.Regional_Indicator) {
        state.riCount += 1;
      } else {
        state.riCount = 0;
      }

      if (prop === GraphemeBreakPropertyId.ZWJ) {
        state.prevWasZWJAfterEP = state.emojiSeq;
        state.emojiSeq = false;
      } else if (prop === GraphemeBreakPropertyId.Extend) {
        state.prevWasZWJAfterEP = false;
      } else if (extendedPictographic) {
        state.emojiSeq = true;
        state.prevWasZWJAfterEP = false;
      } else {
        state.emojiSeq = false;
        state.prevWasZWJAfterEP = false;
      }

      if (incb === IncbPropertyId.Consonant) {
        state.incbConsonant = true;
        state.incbAfterLinker = false;
      } else if (incb === IncbPropertyId.Linker) {
        state.incbAfterLinker = state.incbConsonant || state.incbAfterLinker;
        state.incbConsonant = false;
      } else if (incb !== IncbPropertyId.Extend) {
        state.incbConsonant = false;
        state.incbAfterLinker = false;
      }
    };

    const isControl = (prop: number) =>
      prop === GraphemeBreakPropertyId.Control ||
      prop === GraphemeBreakPropertyId.CR ||
      prop === GraphemeBreakPropertyId.LF;

    const shouldBreak = (prev: number, curr: number, currIsEP: boolean, currIncb: number) => {
      if (prev === GraphemeBreakPropertyId.CR && curr === GraphemeBreakPropertyId.LF) return false;
      if (isControl(prev)) return true;
      if (isControl(curr)) return true;

      if (
        prev === GraphemeBreakPropertyId.L &&
        (curr === GraphemeBreakPropertyId.L ||
          curr === GraphemeBreakPropertyId.V ||
          curr === GraphemeBreakPropertyId.LV ||
          curr === GraphemeBreakPropertyId.LVT)
      ) {
        return false;
      }

      if (
        (prev === GraphemeBreakPropertyId.LV || prev === GraphemeBreakPropertyId.V) &&
        (curr === GraphemeBreakPropertyId.V || curr === GraphemeBreakPropertyId.T)
      ) {
        return false;
      }

      if (
        (prev === GraphemeBreakPropertyId.LVT || prev === GraphemeBreakPropertyId.T) &&
        curr === GraphemeBreakPropertyId.T
      ) {
        return false;
      }

      if (curr === GraphemeBreakPropertyId.Extend) return false;
      if (curr === GraphemeBreakPropertyId.ZWJ) return false;
      if (curr === GraphemeBreakPropertyId.SpacingMark) return false;
      if (prev === GraphemeBreakPropertyId.Prepend) return false;

      if (currIncb === IncbPropertyId.Consonant && state.incbAfterLinker) {
        return false;
      }

      if (prev === GraphemeBreakPropertyId.ZWJ && currIsEP && state.prevWasZWJAfterEP) {
        return false;
      }

      if (
        prev === GraphemeBreakPropertyId.Regional_Indicator &&
        curr === GraphemeBreakPropertyId.Regional_Indicator
      ) {
        return state.riCount % 2 === 0;
      }

      return true;
    };

    for (const cp of iterateCodePoints(text)) {
      const prop = getGraphemeBreakPropertyId(cp.codePoint);
      const isEP = isExtendedPictographic(cp.codePoint);
      const incb = getIncbPropertyId(cp.codePoint);
      if (first) {
        first = false;
        prevProp = prop;
        updateState(prop, isEP, incb);
        continue;
      }

      const breakHere = shouldBreak(prevProp, prop, isEP, incb);
      if (breakHere) {
        yield { startCU, endCU: cp.indexCU };
        startCU = cp.indexCU;
        clearClusterState();
      }

      updateState(prop, isEP, incb);
      prevProp = prop;
    }

    if (!first) {
      yield { startCU, endCU: text.length };
    }
  };

  return createSegmentIterable(generate, provenance);
}
