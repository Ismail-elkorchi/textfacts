import { normalizeInput } from "../core/input.ts";
import { createProvenance } from "../core/provenance.ts";
import type { Provenance, TextInput } from "../core/types.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import { collectCodePoints } from "../segment/internal.ts";
import { isEastAsianWide } from "../unicode/east-asian.ts";
import { isExtendedPictographic } from "../unicode/emoji.ts";
import {
  isFinalPunctuation,
  isGeneralCategoryMark,
  isInitialPunctuation,
  isUnassigned,
} from "../unicode/general-category.ts";
import { LineBreakClass, getLineBreakClassId } from "../unicode/linebreak.ts";

/**
 * LineBreakOpportunity defines an exported structural contract.
 */
export interface LineBreakOpportunity {
  posCU: number;
  kind: "prohibited" | "allowed" | "mandatory";
  ruleId?: string | undefined;
}

/**
 * LineBreakOptions defines an exported structural contract.
 */
export interface LineBreakOptions {
  treatCRLFAsSingle?: boolean;
  treatNLAsHardBreak?: boolean;
  debug?: boolean;
}

/**
 * LineBreakIterable defines an exported structural contract.
 */
export interface LineBreakIterable extends Iterable<LineBreakOpportunity> {
  provenance: Provenance;
}

const DEFAULT_ALGORITHM_REVISION = "Unicode 17.0.0";
const UAX14_SPEC = "https://unicode.org/reports/tr14/";

function normalizeOptions(options: LineBreakOptions): Required<LineBreakOptions> {
  return {
    treatCRLFAsSingle: options.treatCRLFAsSingle ?? true,
    treatNLAsHardBreak: options.treatNLAsHardBreak ?? true,
    debug: options.debug ?? false,
  };
}

function isHardBreak(cls: LineBreakClass): boolean {
  return (
    cls === LineBreakClass.BK ||
    cls === LineBreakClass.CR ||
    cls === LineBreakClass.LF ||
    cls === LineBreakClass.NL
  );
}

function isCombiningBaseExcluded(cls: LineBreakClass): boolean {
  return (
    cls === LineBreakClass.BK ||
    cls === LineBreakClass.CR ||
    cls === LineBreakClass.LF ||
    cls === LineBreakClass.NL ||
    cls === LineBreakClass.SP ||
    cls === LineBreakClass.ZW
  );
}

function isClassIn(cls: LineBreakClass, list: readonly LineBreakClass[]): boolean {
  return list.includes(cls);
}

function createLineBreakIterable(
  generate: () => Iterable<LineBreakOpportunity>,
  provenance: Provenance,
): LineBreakIterable {
  return {
    provenance,
    [Symbol.iterator]: () => generate()[Symbol.iterator](),
  };
}

/**
 * Compute line break opportunities using UAX #14.
 * Units: bytes (UTF-8).
 * Units: UTF-16 code units.
 */
export function lineBreakOpportunities(
  input: TextInput,
  options: LineBreakOptions = {},
): LineBreakIterable {
  const { text } = normalizeInput(input);
  const normalizedOptions = normalizeOptions(options);
  const algorithm = {
    name: "UAX14.LineBreak",
    spec: UAX14_SPEC,
    revisionOrDate: DEFAULT_ALGORITHM_REVISION,
    implementationId: IMPLEMENTATION_ID,
  };
  const provenance = createProvenance(algorithm, normalizedOptions, {
    text: "utf16-code-unit",
    token: "uax14-line-break",
    lineBreak: "uax14-line-break",
  });

  const generate = function* (): Iterable<LineBreakOpportunity> {
    const { codePoints, codeUnitStarts } = collectCodePoints(text);
    const count = codePoints.length;
    if (count === 0) {
      yield { posCU: 0, kind: "mandatory", ruleId: normalizedOptions.debug ? "LB3" : undefined };
      return;
    }

    const raw = new Int32Array(count);
    const resolved = new Int32Array(count);
    const isCombining = new Uint8Array(count);
    const isEastAsian = new Uint8Array(count);
    const isPi = new Uint8Array(count);
    const isPf = new Uint8Array(count);

    for (let i = 0; i < count; i += 1) {
      const cp = codePoints[i] ?? 0;
      let cls = getLineBreakClassId(cp);
      if (cls === LineBreakClass.AI || cls === LineBreakClass.SG || cls === LineBreakClass.XX) {
        cls = LineBreakClass.AL;
      } else if (cls === LineBreakClass.CJ) {
        cls = LineBreakClass.NS;
      } else if (cls === LineBreakClass.SA) {
        cls = isGeneralCategoryMark(cp) ? LineBreakClass.CM : LineBreakClass.AL;
      }
      raw[i] = cls;
      isEastAsian[i] = isEastAsianWide(cp) ? 1 : 0;
      isPi[i] = isInitialPunctuation(cp) ? 1 : 0;
      isPf[i] = isFinalPunctuation(cp) ? 1 : 0;
    }

    let lastNonCombining = -1;
    for (let i = 0; i < count; i += 1) {
      let cls = raw[i] ?? LineBreakClass.XX;
      if (cls === LineBreakClass.ZWJ) cls = LineBreakClass.CM;
      if (cls === LineBreakClass.CM) {
        if (lastNonCombining >= 0) {
          const baseOriginal = raw[lastNonCombining] ?? LineBreakClass.XX;
          if (!isCombiningBaseExcluded(baseOriginal)) {
            resolved[i] = resolved[lastNonCombining] ?? baseOriginal;
            isCombining[i] = 1;
            continue;
          }
        }
        resolved[i] = LineBreakClass.AL;
        continue;
      }
      resolved[i] = cls;
      lastNonCombining = i;
    }

    const prevNonCombining = new Int32Array(count);
    let last = -1;
    for (let i = 0; i < count; i += 1) {
      if (!isCombining[i]) last = i;
      prevNonCombining[i] = last;
    }
    const nextNonCombining = new Int32Array(count);
    let next = -1;
    for (let i = count - 1; i >= 0; i -= 1) {
      if (!isCombining[i]) next = i;
      nextNonCombining[i] = next;
    }

    const isPiResolved = new Uint8Array(count);
    const isPfResolved = new Uint8Array(count);
    for (let i = 0; i < count; i += 1) {
      if (isCombining[i]) {
        const base = prevNonCombining[i] ?? -1;
        if (base >= 0) {
          isPiResolved[i] = isPi[base] ?? 0;
          isPfResolved[i] = isPf[base] ?? 0;
          continue;
        }
      }
      isPiResolved[i] = isPi[i] ?? 0;
      isPfResolved[i] = isPf[i] ?? 0;
    }

    const prevNonSpace = new Int32Array(count);
    let lastNonSpace = -1;
    for (let i = 0; i < count; i += 1) {
      if (resolved[i] !== LineBreakClass.SP) lastNonSpace = i;
      prevNonSpace[i] = lastNonSpace;
    }
    const nextNonSpace = new Int32Array(count);
    let nextNS = -1;
    for (let i = count - 1; i >= 0; i -= 1) {
      if (resolved[i] !== LineBreakClass.SP) nextNS = i;
      nextNonSpace[i] = nextNS;
    }

    const getLeftIndex = (boundary: number) =>
      boundary > 0 ? (prevNonCombining[boundary - 1] ?? -1) : -1;
    const getRightIndex = (boundary: number) =>
      boundary < count ? (nextNonCombining[boundary] ?? -1) : -1;

    const shouldBreak = (boundary: number): LineBreakOpportunity => {
      const debug = normalizedOptions.debug;
      if (boundary === 0) {
        return { posCU: 0, kind: "prohibited", ruleId: debug ? "LB2" : undefined };
      }
      if (boundary === count) {
        return { posCU: text.length, kind: "mandatory", ruleId: debug ? "LB3" : undefined };
      }

      const leftRaw = raw[boundary - 1] as LineBreakClass;
      const rightRaw = raw[boundary] as LineBreakClass;

      if (leftRaw === LineBreakClass.BK) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "mandatory",
          ruleId: debug ? "LB4" : undefined,
        };
      }

      if (
        leftRaw === LineBreakClass.CR &&
        rightRaw === LineBreakClass.LF &&
        normalizedOptions.treatCRLFAsSingle
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB5" : undefined,
        };
      }

      if (
        leftRaw === LineBreakClass.CR ||
        leftRaw === LineBreakClass.LF ||
        (leftRaw === LineBreakClass.NL && normalizedOptions.treatNLAsHardBreak)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "mandatory",
          ruleId: debug ? "LB5" : undefined,
        };
      }

      if (isHardBreak(rightRaw)) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB6" : undefined,
        };
      }

      if (rightRaw === LineBreakClass.SP || rightRaw === LineBreakClass.ZW) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB7" : undefined,
        };
      }

      const prevNonSpaceRawIndex = boundary > 0 ? (prevNonSpace[boundary - 1] ?? -1) : -1;
      if (
        prevNonSpaceRawIndex >= 0 &&
        (raw[prevNonSpaceRawIndex] ?? LineBreakClass.XX) === LineBreakClass.ZW
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "allowed",
          ruleId: debug ? "LB8" : undefined,
        };
      }

      if (leftRaw === LineBreakClass.ZWJ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB8a" : undefined,
        };
      }

      if (boundary < count && isCombining[boundary]) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB9" : undefined,
        };
      }

      const leftIndex = getLeftIndex(boundary);
      const rightIndex = getRightIndex(boundary);
      const leftClass =
        leftIndex >= 0 ? ((resolved[leftIndex] ?? LineBreakClass.XX) as LineBreakClass) : null;
      const rightClass =
        rightIndex >= 0 ? ((resolved[rightIndex] ?? LineBreakClass.XX) as LineBreakClass) : null;

      if (leftClass === LineBreakClass.WJ || rightClass === LineBreakClass.WJ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB11" : undefined,
        };
      }

      if (leftClass === LineBreakClass.GL) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB12" : undefined,
        };
      }

      if (rightClass === LineBreakClass.GL && leftClass !== null) {
        if (
          !isClassIn(leftClass, [
            LineBreakClass.SP,
            LineBreakClass.BA,
            LineBreakClass.HY,
            LineBreakClass.HH,
          ])
        ) {
          return {
            posCU: codeUnitStarts[boundary] ?? text.length,
            kind: "prohibited",
            ruleId: debug ? "LB12a" : undefined,
          };
        }
      }

      if (
        rightClass === LineBreakClass.CL ||
        rightClass === LineBreakClass.CP ||
        rightClass === LineBreakClass.EX ||
        rightClass === LineBreakClass.SY
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB13" : undefined,
        };
      }

      const leftNonSpaceIndex = boundary > 0 ? (prevNonSpace[boundary - 1] ?? -1) : -1;
      const rightNonSpaceIndex = boundary < count ? (nextNonSpace[boundary] ?? -1) : -1;
      const leftNonSpaceClass =
        leftNonSpaceIndex >= 0
          ? ((resolved[leftNonSpaceIndex] ?? LineBreakClass.XX) as LineBreakClass)
          : null;
      const rightNonSpaceClass =
        rightNonSpaceIndex >= 0
          ? ((resolved[rightNonSpaceIndex] ?? LineBreakClass.XX) as LineBreakClass)
          : null;

      if (leftNonSpaceClass === LineBreakClass.OP) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB14" : undefined,
        };
      }

      if (
        leftNonSpaceIndex >= 0 &&
        leftNonSpaceClass === LineBreakClass.QU &&
        isPiResolved[leftNonSpaceIndex] === 1
      ) {
        const prevIndex =
          leftNonSpaceIndex > 0 ? (prevNonCombining[leftNonSpaceIndex - 1] ?? -1) : -1;
        const prevClass =
          prevIndex >= 0 ? ((resolved[prevIndex] ?? LineBreakClass.XX) as LineBreakClass) : null;
        if (
          prevIndex < 0 ||
          prevClass === LineBreakClass.BK ||
          prevClass === LineBreakClass.CR ||
          prevClass === LineBreakClass.LF ||
          prevClass === LineBreakClass.NL ||
          prevClass === LineBreakClass.OP ||
          prevClass === LineBreakClass.QU ||
          prevClass === LineBreakClass.GL ||
          prevClass === LineBreakClass.SP ||
          prevClass === LineBreakClass.ZW
        ) {
          return {
            posCU: codeUnitStarts[boundary] ?? text.length,
            kind: "prohibited",
            ruleId: debug ? "LB15a" : undefined,
          };
        }
      }

      if (
        rightNonSpaceIndex >= 0 &&
        rightNonSpaceClass === LineBreakClass.QU &&
        isPfResolved[rightNonSpaceIndex] === 1
      ) {
        const nextIndex = rightNonSpaceIndex + 1 < count ? rightNonSpaceIndex + 1 : -1;
        const nextClass =
          nextIndex >= 0 ? ((resolved[nextIndex] ?? LineBreakClass.XX) as LineBreakClass) : null;
        if (
          nextIndex < 0 ||
          nextClass === LineBreakClass.SP ||
          nextClass === LineBreakClass.GL ||
          nextClass === LineBreakClass.WJ ||
          nextClass === LineBreakClass.CL ||
          nextClass === LineBreakClass.QU ||
          nextClass === LineBreakClass.CP ||
          nextClass === LineBreakClass.EX ||
          nextClass === LineBreakClass.IS ||
          nextClass === LineBreakClass.SY ||
          nextClass === LineBreakClass.BK ||
          nextClass === LineBreakClass.CR ||
          nextClass === LineBreakClass.LF ||
          nextClass === LineBreakClass.NL ||
          nextClass === LineBreakClass.ZW ||
          nextIndex === -1
        ) {
          return {
            posCU: codeUnitStarts[boundary] ?? text.length,
            kind: "prohibited",
            ruleId: debug ? "LB15b" : undefined,
          };
        }
      }

      if (
        leftClass === LineBreakClass.SP &&
        rightClass === LineBreakClass.IS &&
        rightIndex >= 0 &&
        rightIndex + 1 < count &&
        ((resolved[rightIndex + 1] ?? LineBreakClass.XX) as LineBreakClass) === LineBreakClass.NU
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "allowed",
          ruleId: debug ? "LB15c" : undefined,
        };
      }

      if (rightClass === LineBreakClass.IS) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB15d" : undefined,
        };
      }

      if (
        rightNonSpaceClass === LineBreakClass.NS &&
        (leftNonSpaceClass === LineBreakClass.CL || leftNonSpaceClass === LineBreakClass.CP)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB16" : undefined,
        };
      }

      if (leftNonSpaceClass === LineBreakClass.B2 && rightNonSpaceClass === LineBreakClass.B2) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB17" : undefined,
        };
      }

      if (leftClass === LineBreakClass.SP) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "allowed",
          ruleId: debug ? "LB18" : undefined,
        };
      }

      if (rightClass === LineBreakClass.QU && rightIndex >= 0 && isPi[rightIndex] === 0) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB19" : undefined,
        };
      }
      if (leftClass === LineBreakClass.QU && leftIndex >= 0 && isPf[leftIndex] === 0) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB19" : undefined,
        };
      }

      if (rightClass === LineBreakClass.QU || leftClass === LineBreakClass.QU) {
        if (rightClass === LineBreakClass.QU && rightIndex >= 0) {
          const leftEastAsian = leftIndex >= 0 ? isEastAsian[leftIndex] === 1 : false;
          const afterIndex = rightIndex + 1 < count ? (nextNonCombining[rightIndex + 1] ?? -1) : -1;
          const rightEastAsian = afterIndex >= 0 ? isEastAsian[afterIndex] === 1 : false;
          if (!(leftEastAsian && rightEastAsian)) {
            return {
              posCU: codeUnitStarts[boundary] ?? text.length,
              kind: "prohibited",
              ruleId: debug ? "LB19a" : undefined,
            };
          }
        }
        if (leftClass === LineBreakClass.QU && leftIndex >= 0) {
          const rightEastAsian = rightIndex >= 0 ? isEastAsian[rightIndex] === 1 : false;
          const beforeIndex = leftIndex > 0 ? (prevNonCombining[leftIndex - 1] ?? -1) : -1;
          const leftEastAsian = beforeIndex >= 0 ? isEastAsian[beforeIndex] === 1 : false;
          if (!(leftEastAsian && rightEastAsian)) {
            return {
              posCU: codeUnitStarts[boundary] ?? text.length,
              kind: "prohibited",
              ruleId: debug ? "LB19a" : undefined,
            };
          }
        }
      }

      if (leftClass === LineBreakClass.CB || rightClass === LineBreakClass.CB) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "allowed",
          ruleId: debug ? "LB20" : undefined,
        };
      }

      if (
        leftClass !== null &&
        rightClass !== null &&
        (leftClass === LineBreakClass.HY || leftClass === LineBreakClass.HH) &&
        (rightClass === LineBreakClass.AL || rightClass === LineBreakClass.HL)
      ) {
        const prevIndex = leftIndex > 0 ? (prevNonCombining[leftIndex - 1] ?? -1) : -1;
        const prevClass =
          prevIndex >= 0 ? ((resolved[prevIndex] ?? LineBreakClass.XX) as LineBreakClass) : null;
        if (
          prevIndex < 0 ||
          prevClass === LineBreakClass.BK ||
          prevClass === LineBreakClass.CR ||
          prevClass === LineBreakClass.LF ||
          prevClass === LineBreakClass.NL ||
          prevClass === LineBreakClass.SP ||
          prevClass === LineBreakClass.ZW ||
          prevClass === LineBreakClass.CB ||
          prevClass === LineBreakClass.GL
        ) {
          return {
            posCU: codeUnitStarts[boundary] ?? text.length,
            kind: "prohibited",
            ruleId: debug ? "LB20a" : undefined,
          };
        }
      }

      if (
        rightClass === LineBreakClass.BA ||
        rightClass === LineBreakClass.HH ||
        rightClass === LineBreakClass.HY ||
        rightClass === LineBreakClass.NS
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB21" : undefined,
        };
      }
      if (leftClass === LineBreakClass.BB) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB21" : undefined,
        };
      }

      if (
        leftClass !== null &&
        rightClass !== null &&
        (leftClass === LineBreakClass.HY || leftClass === LineBreakClass.HH)
      ) {
        const prevIndex = leftIndex > 0 ? (prevNonCombining[leftIndex - 1] ?? -1) : -1;
        const prevClass =
          prevIndex >= 0 ? ((resolved[prevIndex] ?? LineBreakClass.XX) as LineBreakClass) : null;
        if (prevClass === LineBreakClass.HL && rightClass !== LineBreakClass.HL) {
          return {
            posCU: codeUnitStarts[boundary] ?? text.length,
            kind: "prohibited",
            ruleId: debug ? "LB21a" : undefined,
          };
        }
      }

      if (leftClass === LineBreakClass.SY && rightClass === LineBreakClass.HL) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB21b" : undefined,
        };
      }

      if (rightClass === LineBreakClass.IN) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB22" : undefined,
        };
      }

      if (
        (leftClass === LineBreakClass.AL || leftClass === LineBreakClass.HL) &&
        rightClass === LineBreakClass.NU
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB23" : undefined,
        };
      }
      if (
        leftClass === LineBreakClass.NU &&
        (rightClass === LineBreakClass.AL || rightClass === LineBreakClass.HL)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB23" : undefined,
        };
      }

      if (
        leftClass === LineBreakClass.PR &&
        (rightClass === LineBreakClass.ID ||
          rightClass === LineBreakClass.EB ||
          rightClass === LineBreakClass.EM)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB23a" : undefined,
        };
      }
      if (
        (leftClass === LineBreakClass.ID ||
          leftClass === LineBreakClass.EB ||
          leftClass === LineBreakClass.EM) &&
        rightClass === LineBreakClass.PO
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB23a" : undefined,
        };
      }

      if (
        (leftClass === LineBreakClass.PR || leftClass === LineBreakClass.PO) &&
        (rightClass === LineBreakClass.AL || rightClass === LineBreakClass.HL)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB24" : undefined,
        };
      }
      if (
        (leftClass === LineBreakClass.AL || leftClass === LineBreakClass.HL) &&
        (rightClass === LineBreakClass.PR || rightClass === LineBreakClass.PO)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB24" : undefined,
        };
      }

      const isSYorIS = (cls: LineBreakClass | null) =>
        cls === LineBreakClass.SY || cls === LineBreakClass.IS;

      const hasNUSuffix = (index: number): boolean => {
        let idx = index;
        while (idx >= 0) {
          const cls = (resolved[idx] ?? LineBreakClass.XX) as LineBreakClass;
          if (cls === LineBreakClass.CL || cls === LineBreakClass.CP || isSYorIS(cls)) {
            idx = idx > 0 ? (prevNonCombining[idx - 1] ?? -1) : -1;
            continue;
          }
          return cls === LineBreakClass.NU;
        }
        return false;
      };

      const hasFollowingNU = (index: number): boolean => {
        let idx = index + 1 < count ? (nextNonCombining[index + 1] ?? -1) : -1;
        if (idx < 0) return false;
        const first = (resolved[idx] ?? LineBreakClass.XX) as LineBreakClass;
        if (first === LineBreakClass.NU) return true;
        if (first === LineBreakClass.IS) {
          idx = idx + 1 < count ? (nextNonCombining[idx + 1] ?? -1) : -1;
          return (
            idx >= 0 &&
            ((resolved[idx] ?? LineBreakClass.XX) as LineBreakClass) === LineBreakClass.NU
          );
        }
        return false;
      };

      if (rightClass === LineBreakClass.PO || rightClass === LineBreakClass.PR) {
        if (leftClass === LineBreakClass.CL || leftClass === LineBreakClass.CP) {
          if (hasNUSuffix(leftIndex)) {
            return {
              posCU: codeUnitStarts[boundary] ?? text.length,
              kind: "prohibited",
              ruleId: debug ? "LB25" : undefined,
            };
          }
        }
        if (leftClass === LineBreakClass.NU || isSYorIS(leftClass)) {
          if (hasNUSuffix(leftIndex)) {
            return {
              posCU: codeUnitStarts[boundary] ?? text.length,
              kind: "prohibited",
              ruleId: debug ? "LB25" : undefined,
            };
          }
        }
      }

      if (
        leftClass === LineBreakClass.PO &&
        rightClass === LineBreakClass.OP &&
        rightIndex >= 0 &&
        hasFollowingNU(rightIndex)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB25" : undefined,
        };
      }
      if (
        leftClass === LineBreakClass.PR &&
        rightClass === LineBreakClass.OP &&
        rightIndex >= 0 &&
        hasFollowingNU(rightIndex)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB25" : undefined,
        };
      }
      if (leftClass === LineBreakClass.PO && rightClass === LineBreakClass.NU) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB25" : undefined,
        };
      }
      if (leftClass === LineBreakClass.PR && rightClass === LineBreakClass.NU) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB25" : undefined,
        };
      }
      if (leftClass === LineBreakClass.HY && rightClass === LineBreakClass.NU) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB25" : undefined,
        };
      }
      if (leftClass === LineBreakClass.IS && rightClass === LineBreakClass.NU) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB25" : undefined,
        };
      }
      if (leftClass === LineBreakClass.SY && rightClass === LineBreakClass.NU) {
        if (leftIndex >= 0 && hasNUSuffix(leftIndex)) {
          return {
            posCU: codeUnitStarts[boundary] ?? text.length,
            kind: "prohibited",
            ruleId: debug ? "LB25" : undefined,
          };
        }
      }
      if (
        leftClass === LineBreakClass.NU &&
        (rightClass === LineBreakClass.NU || isSYorIS(rightClass))
      ) {
        if (rightClass === LineBreakClass.NU || isSYorIS(rightClass)) {
          if (hasNUSuffix(leftIndex)) {
            return {
              posCU: codeUnitStarts[boundary] ?? text.length,
              kind: "prohibited",
              ruleId: debug ? "LB25" : undefined,
            };
          }
        }
      }

      if (
        leftClass === LineBreakClass.JL &&
        (rightClass === LineBreakClass.JL ||
          rightClass === LineBreakClass.JV ||
          rightClass === LineBreakClass.H2 ||
          rightClass === LineBreakClass.H3)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB26" : undefined,
        };
      }
      if (
        (leftClass === LineBreakClass.JV || leftClass === LineBreakClass.H2) &&
        (rightClass === LineBreakClass.JV || rightClass === LineBreakClass.JT)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB26" : undefined,
        };
      }
      if (
        (leftClass === LineBreakClass.JT || leftClass === LineBreakClass.H3) &&
        rightClass === LineBreakClass.JT
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB26" : undefined,
        };
      }

      if (
        (leftClass === LineBreakClass.JL ||
          leftClass === LineBreakClass.JV ||
          leftClass === LineBreakClass.JT ||
          leftClass === LineBreakClass.H2 ||
          leftClass === LineBreakClass.H3) &&
        rightClass === LineBreakClass.PO
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB27" : undefined,
        };
      }
      if (
        leftClass === LineBreakClass.PR &&
        (rightClass === LineBreakClass.JL ||
          rightClass === LineBreakClass.JV ||
          rightClass === LineBreakClass.JT ||
          rightClass === LineBreakClass.H2 ||
          rightClass === LineBreakClass.H3)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB27" : undefined,
        };
      }

      if (
        (leftClass === LineBreakClass.AL || leftClass === LineBreakClass.HL) &&
        (rightClass === LineBreakClass.AL || rightClass === LineBreakClass.HL)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB28" : undefined,
        };
      }

      const isAkAsOrDotted = (index: number, cls: LineBreakClass | null): boolean => {
        if (cls === LineBreakClass.AK || cls === LineBreakClass.AS) return true;
        const cp = codePoints[index] ?? 0;
        return cp === 0x25cc;
      };

      if (
        leftClass === LineBreakClass.AP &&
        rightIndex >= 0 &&
        isAkAsOrDotted(rightIndex, rightClass)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB28a" : undefined,
        };
      }
      if (
        leftIndex >= 0 &&
        isAkAsOrDotted(leftIndex, leftClass) &&
        (rightClass === LineBreakClass.VF || rightClass === LineBreakClass.VI)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB28a" : undefined,
        };
      }
      if (
        leftClass === LineBreakClass.VI &&
        rightIndex >= 0 &&
        isAkAsOrDotted(rightIndex, rightClass)
      ) {
        const prevIndex = leftIndex > 0 ? (prevNonCombining[leftIndex - 1] ?? -1) : -1;
        const prevClass =
          prevIndex >= 0 ? ((resolved[prevIndex] ?? LineBreakClass.XX) as LineBreakClass) : null;
        if (prevIndex >= 0 && isAkAsOrDotted(prevIndex, prevClass)) {
          return {
            posCU: codeUnitStarts[boundary] ?? text.length,
            kind: "prohibited",
            ruleId: debug ? "LB28a" : undefined,
          };
        }
      }
      if (
        leftIndex >= 0 &&
        isAkAsOrDotted(leftIndex, leftClass) &&
        rightIndex >= 0 &&
        isAkAsOrDotted(rightIndex, rightClass)
      ) {
        const nextIndex = rightIndex + 1 < count ? (nextNonCombining[rightIndex + 1] ?? -1) : -1;
        const nextClass =
          nextIndex >= 0 ? ((resolved[nextIndex] ?? LineBreakClass.XX) as LineBreakClass) : null;
        if (nextClass === LineBreakClass.VF) {
          return {
            posCU: codeUnitStarts[boundary] ?? text.length,
            kind: "prohibited",
            ruleId: debug ? "LB28a" : undefined,
          };
        }
      }

      if (
        leftClass === LineBreakClass.IS &&
        (rightClass === LineBreakClass.AL || rightClass === LineBreakClass.HL)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB29" : undefined,
        };
      }

      if (
        (leftClass === LineBreakClass.AL ||
          leftClass === LineBreakClass.HL ||
          leftClass === LineBreakClass.NU) &&
        rightIndex >= 0 &&
        rightClass === LineBreakClass.OP &&
        isEastAsian[rightIndex] === 0
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB30" : undefined,
        };
      }
      if (
        leftIndex >= 0 &&
        leftClass === LineBreakClass.CP &&
        isEastAsian[leftIndex] === 0 &&
        (rightClass === LineBreakClass.AL ||
          rightClass === LineBreakClass.HL ||
          rightClass === LineBreakClass.NU)
      ) {
        return {
          posCU: codeUnitStarts[boundary] ?? text.length,
          kind: "prohibited",
          ruleId: debug ? "LB30" : undefined,
        };
      }

      if (leftClass === LineBreakClass.RI && rightClass === LineBreakClass.RI) {
        let countRI = 0;
        let idx = leftIndex;
        while (
          idx >= 0 &&
          ((resolved[idx] ?? LineBreakClass.XX) as LineBreakClass) === LineBreakClass.RI
        ) {
          countRI += 1;
          idx = idx > 0 ? (prevNonCombining[idx - 1] ?? -1) : -1;
        }
        if (countRI % 2 === 1) {
          return {
            posCU: codeUnitStarts[boundary] ?? text.length,
            kind: "prohibited",
            ruleId: debug ? "LB30a" : undefined,
          };
        }
      }

      if (rightClass === LineBreakClass.EM && leftIndex >= 0) {
        const leftCp = codePoints[leftIndex] ?? 0;
        if (
          leftClass === LineBreakClass.EB ||
          (isExtendedPictographic(leftCp) && isUnassigned(leftCp))
        ) {
          return {
            posCU: codeUnitStarts[boundary] ?? text.length,
            kind: "prohibited",
            ruleId: debug ? "LB30b" : undefined,
          };
        }
      }

      return {
        posCU: codeUnitStarts[boundary] ?? text.length,
        kind: "allowed",
        ruleId: debug ? "LB31" : undefined,
      };
    };

    for (let boundary = 0; boundary <= count; boundary += 1) {
      yield shouldBreak(boundary);
    }
  };

  return createLineBreakIterable(generate, provenance);
}

/**
 * Compute line break positions as UTF-16 code unit indices.
 * Units: bytes (UTF-8).
 * Units: UTF-16 code units.
 */
export function lineBreakPositions(input: TextInput, options: LineBreakOptions = {}): Uint32Array {
  const iterable = lineBreakOpportunities(input, options);
  const positions: number[] = [];
  for (const opportunity of iterable) {
    if (opportunity.kind !== "prohibited") {
      positions.push(opportunity.posCU);
    }
  }
  return new Uint32Array(positions);
}
