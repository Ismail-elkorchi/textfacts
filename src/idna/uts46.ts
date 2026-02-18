import { createProvenance } from "../core/provenance.ts";
import type { Provenance } from "../core/types.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import { scanLoneSurrogates, toWellFormedUnicode } from "../integrity/integrity.ts";
import { CCC_RANGES } from "../normalize/generated/ccc.ts";
import { isNormalized, normalize } from "../normalize/normalize.ts";
import { BidiClass, bidiClassAt } from "../unicode/bidi.ts";
import { isGeneralCategoryMark, isUnassigned } from "../unicode/general-category.ts";
import { isDefaultIgnorable, isNoncharacter } from "../unicode/integrity.ts";
import { lookupProperty } from "../unicode/lookup.ts";
import { Script, scriptIdAt } from "../unicode/script.ts";
import { CONTEXTO_RANGES } from "./generated/idna2008.ts";
import { JOINING_TYPE_IDS, JOINING_TYPE_RANGES } from "./generated/joining-type.ts";
import {
  IDNA_MAPPING_CODEPOINTS,
  IDNA_MAPPING_RANGES,
  IDNA_MAPPING_STATUS_IDS,
  IDNA_MAPPING_VALUES,
} from "./generated/mapping.ts";
import { punycodeDecode, punycodeEncode } from "./punycode.ts";
import type {
  IdnaError,
  IdnaErrorCode,
  IdnaResult,
  Uts46MapOptions,
  Uts46MapResult,
  Uts46Options,
} from "./types.ts";

const UTS46_SPEC = "https://unicode.org/reports/tr46/";
const DEFAULT_REVISION = "Unicode 17.0.0";

const DEFAULT_OPTIONS: Required<Uts46Options> = {
  useStd3AsciiRules: true,
  useCompatMapping: false,
  checkHyphens: true,
  checkBidi: true,
  checkJoiners: true,
  verifyDnsLength: true,
  illFormed: "error",
  splitOnDots: "uts46",
};

const DEFAULT_MAP_OPTIONS: Required<Uts46MapOptions> = {
  useCompatMapping: false,
  illFormed: "error",
  splitOnDots: "uts46",
};

const DOT_EQUIVALENTS = new Set([0x3002, 0xff0e, 0xff61]);

const ERROR_MESSAGES: Record<IdnaErrorCode, string> = {
  EMPTY_LABEL: "Empty label",
  LEADING_HYPHEN: "Label starts with a hyphen",
  TRAILING_HYPHEN: "Label ends with a hyphen",
  HYPHEN_3_4: "Hyphen in third and fourth positions",
  LABEL_TOO_LONG: "Label too long",
  DOMAIN_TOO_LONG: "Domain too long",
  INVALID_ACE_PREFIX: "Invalid ACE prefix",
  PUNYCODE_ERROR: "Punycode error",
  DISALLOWED: "Disallowed code point",
  BIDI_RULE: "Bidi rule failed",
  JOINER_RULE: "Joiner rule failed",
  STD3_DISALLOWED: "STD3 disallowed ASCII",
  DOT_EQUIVALENT: "Dot equivalent in label",
  ILL_FORMED_UNICODE: "Ill-formed Unicode",
  NONCHARACTER: "Noncharacter code point",
  DEFAULT_IGNORABLE: "Default ignorable code point",
  CONTEXTJ: "ContextJ rule failed",
  CONTEXTO: "ContextO rule failed",
  MAPPED: "Code point mapped",
  DEVIATION: "Deviation code point",
  IGNORED: "Code point ignored",
  UNASSIGNED: "Unassigned code point",
};

interface MapResult {
  mapped: string;
  errors: IdnaError[];
  warnings: IdnaError[];
  dotEquivalentIndices: number[];
}

interface LabelSplitResult {
  labels: string[];
  labelHasDotEquivalent: boolean[];
  trailingDot: boolean;
}

interface CodePointInfo {
  cp: number;
  startCU: number;
  endCU: number;
}

function normalizeOptions(options?: Uts46Options): Required<Uts46Options> {
  return {
    useStd3AsciiRules: options?.useStd3AsciiRules ?? DEFAULT_OPTIONS.useStd3AsciiRules,
    useCompatMapping: options?.useCompatMapping ?? DEFAULT_OPTIONS.useCompatMapping,
    checkHyphens: options?.checkHyphens ?? DEFAULT_OPTIONS.checkHyphens,
    checkBidi: options?.checkBidi ?? DEFAULT_OPTIONS.checkBidi,
    checkJoiners: options?.checkJoiners ?? DEFAULT_OPTIONS.checkJoiners,
    verifyDnsLength: options?.verifyDnsLength ?? DEFAULT_OPTIONS.verifyDnsLength,
    illFormed: options?.illFormed ?? DEFAULT_OPTIONS.illFormed,
    splitOnDots: options?.splitOnDots ?? DEFAULT_OPTIONS.splitOnDots,
  };
}

function normalizeMapOptions(options?: Uts46MapOptions): Required<Uts46MapOptions> {
  return {
    useCompatMapping: options?.useCompatMapping ?? DEFAULT_MAP_OPTIONS.useCompatMapping,
    illFormed: options?.illFormed ?? DEFAULT_MAP_OPTIONS.illFormed,
    splitOnDots: options?.splitOnDots ?? DEFAULT_MAP_OPTIONS.splitOnDots,
  };
}

function buildProvenance(name: string, options: unknown): Provenance {
  return createProvenance(
    {
      name,
      spec: UTS46_SPEC,
      revisionOrDate: DEFAULT_REVISION,
      implementationId: IMPLEMENTATION_ID,
    },
    options,
    { text: "utf16-code-unit", codePoint: "unicode-code-point" },
  );
}

function pushIssue(
  target: IdnaError[],
  code: IdnaErrorCode,
  extras: Partial<IdnaError> = {},
): void {
  target.push({
    code,
    message: ERROR_MESSAGES[code],
    ...extras,
  });
}

function isStd3Ascii(codePoint: number): boolean {
  return (
    codePoint === 0x2d ||
    (codePoint >= 0x30 && codePoint <= 0x39) ||
    (codePoint >= 0x61 && codePoint <= 0x7a)
  );
}

function isAllAscii(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

function hasNonAscii(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) > 0x7f) return true;
  }
  return false;
}

function statusAt(codePoint: number): number {
  return lookupProperty(IDNA_MAPPING_RANGES, codePoint);
}

function mappingAt(codePoint: number): string | null {
  let lo = 0;
  let hi = IDNA_MAPPING_CODEPOINTS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cp = IDNA_MAPPING_CODEPOINTS[mid] ?? 0;
    if (codePoint < cp) {
      hi = mid - 1;
    } else if (codePoint > cp) {
      lo = mid + 1;
    } else {
      return IDNA_MAPPING_VALUES[mid] ?? "";
    }
  }
  return null;
}

function joiningTypeAt(codePoint: number): number {
  return lookupProperty(JOINING_TYPE_RANGES, codePoint);
}

function cccAt(codePoint: number): number {
  return lookupProperty(CCC_RANGES, codePoint);
}

function isVirama(codePoint: number): boolean {
  return cccAt(codePoint) === 9;
}

function isContextO(codePoint: number): boolean {
  return lookupProperty(CONTEXTO_RANGES, codePoint) === 1;
}

function mapDomain(domain: string, options: Required<Uts46MapOptions>): MapResult {
  const errors: IdnaError[] = [];
  const warnings: IdnaError[] = [];
  let working = domain;

  const loneSurrogates = scanLoneSurrogates(working);
  if (loneSurrogates.length > 0) {
    for (const surrogate of loneSurrogates) {
      pushIssue(errors, "ILL_FORMED_UNICODE", {
        span: surrogate.span,
        codePoint: surrogate.codeUnit,
      });
    }
    if (options.illFormed === "replace") {
      working = toWellFormedUnicode(working);
    }
  }

  let output = "";
  const dotEquivalentIndices: number[] = [];

  for (let i = 0; i < working.length; ) {
    const startCU = i;
    const cp = working.codePointAt(i) ?? 0;
    const size = cp > 0xffff ? 2 : 1;
    const endCU = i + size;

    if (isNoncharacter(cp)) {
      pushIssue(errors, "NONCHARACTER", { span: { startCU, endCU }, codePoint: cp });
    }
    if (isDefaultIgnorable(cp) && cp !== 0x200c && cp !== 0x200d) {
      pushIssue(warnings, "DEFAULT_IGNORABLE", { span: { startCU, endCU }, codePoint: cp });
    }

    const status = statusAt(cp);
    if (status === IDNA_MAPPING_STATUS_IDS.mapped) {
      let mapping = mappingAt(cp) ?? "";
      if (options.useCompatMapping && cp === 0x1e9e) {
        mapping = "ss";
      }
      const startIndex = output.length;
      output += mapping;
      pushIssue(warnings, "MAPPED", { span: { startCU, endCU }, codePoint: cp });
      if (DOT_EQUIVALENTS.has(cp)) {
        for (let offset = 0; offset < mapping.length; offset += 1) {
          if (mapping.charCodeAt(offset) === 0x2e) {
            dotEquivalentIndices.push(startIndex + offset);
          }
        }
        pushIssue(warnings, "DOT_EQUIVALENT", { span: { startCU, endCU }, codePoint: cp });
      }
    } else if (status === IDNA_MAPPING_STATUS_IDS.deviation) {
      if (options.useCompatMapping) {
        const mapping = mappingAt(cp) ?? "";
        output += mapping;
      } else {
        output += String.fromCodePoint(cp);
      }
      pushIssue(warnings, "DEVIATION", { span: { startCU, endCU }, codePoint: cp });
    } else if (status === IDNA_MAPPING_STATUS_IDS.ignored) {
      pushIssue(warnings, "IGNORED", { span: { startCU, endCU }, codePoint: cp });
    } else {
      output += String.fromCodePoint(cp);
    }

    i = endCU;
  }

  return { mapped: output, errors, warnings, dotEquivalentIndices };
}

function splitLabels(
  mapped: string,
  dotEquivalentIndices: number[],
  mode: "ascii-only" | "uts46",
): LabelSplitResult {
  const dotEquivalentSet = new Set(dotEquivalentIndices);
  const labels: string[] = [];
  const labelHasDotEquivalent: boolean[] = [];
  let current = "";
  let currentHasDotEquivalent = false;
  let trailingDot = false;

  for (let i = 0; i < mapped.length; ) {
    const cp = mapped.codePointAt(i) ?? 0;
    const size = cp > 0xffff ? 2 : 1;
    if (cp === 0x2e) {
      const isDotEquivalent = dotEquivalentSet.has(i);
      const isSeparator = mode === "uts46" || !isDotEquivalent;
      if (isSeparator) {
        labels.push(current);
        labelHasDotEquivalent.push(currentHasDotEquivalent);
        current = "";
        currentHasDotEquivalent = false;
        if (i + size >= mapped.length) trailingDot = true;
        i += size;
        continue;
      }
      current += ".";
      currentHasDotEquivalent = true;
      i += size;
      continue;
    }
    current += mapped.slice(i, i + size);
    i += size;
  }

  labels.push(current);
  labelHasDotEquivalent.push(currentHasDotEquivalent);
  return { labels, labelHasDotEquivalent, trailingDot };
}

function collectCodePoints(text: string): CodePointInfo[] {
  const items: CodePointInfo[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) ?? 0;
    const size = cp > 0xffff ? 2 : 1;
    items.push({ cp, startCU: i, endCU: i + size });
    i += size;
  }
  return items;
}

function checkHyphens(label: string, labelIndex: number, errors: IdnaError[]): void {
  if (label.startsWith("-")) {
    pushIssue(errors, "LEADING_HYPHEN", {
      span: { startCU: 0, endCU: 1 },
      labelIndex,
      codePoint: 0x2d,
    });
  }
  if (label.endsWith("-")) {
    const pos = Math.max(0, label.length - 1);
    pushIssue(errors, "TRAILING_HYPHEN", {
      span: { startCU: pos, endCU: pos + 1 },
      labelIndex,
      codePoint: 0x2d,
    });
  }
  if (label.length >= 4 && label[2] === "-" && label[3] === "-") {
    pushIssue(errors, "HYPHEN_3_4", {
      span: { startCU: 2, endCU: 4 },
      labelIndex,
      codePoint: 0x2d,
    });
  }
}

function checkBidiLabel(label: string, labelIndex: number, errors: IdnaError[]): void {
  if (label.length === 0) return;
  const cps = collectCodePoints(label);
  if (cps.length === 0) return;
  const classes = cps.map((info) => bidiClassAt(info.cp));
  const first = classes[0];
  if (first !== BidiClass.L && first !== BidiClass.R && first !== BidiClass.AL) {
    const extras: Partial<IdnaError> = { labelIndex };
    if (cps[0]) {
      extras.span = { startCU: cps[0].startCU, endCU: cps[0].endCU };
    }
    pushIssue(errors, "BIDI_RULE", extras);
    return;
  }

  const isRtl = first === BidiClass.R || first === BidiClass.AL;
  const allowedRtl = new Set([
    BidiClass.R,
    BidiClass.AL,
    BidiClass.AN,
    BidiClass.EN,
    BidiClass.ES,
    BidiClass.CS,
    BidiClass.ET,
    BidiClass.ON,
    BidiClass.BN,
    BidiClass.NSM,
  ]);
  const allowedLtr = new Set([
    BidiClass.L,
    BidiClass.EN,
    BidiClass.ES,
    BidiClass.CS,
    BidiClass.ET,
    BidiClass.ON,
    BidiClass.BN,
    BidiClass.NSM,
  ]);

  const hasEN = classes.includes(BidiClass.EN);
  const hasAN = classes.includes(BidiClass.AN);

  if (isRtl) {
    for (let i = 0; i < classes.length; i += 1) {
      if (!allowedRtl.has(classes[i] ?? BidiClass.ON)) {
        const extras: Partial<IdnaError> = { labelIndex };
        const info = cps[i];
        if (info) {
          extras.span = { startCU: info.startCU, endCU: info.endCU };
        }
        pushIssue(errors, "BIDI_RULE", extras);
        break;
      }
    }
    let idx = classes.length - 1;
    while (idx >= 0 && classes[idx] === BidiClass.NSM) idx -= 1;
    if (
      idx < 0 ||
      ![BidiClass.R, BidiClass.AL, BidiClass.EN, BidiClass.AN].includes(
        classes[idx] ?? BidiClass.ON,
      )
    ) {
      pushIssue(errors, "BIDI_RULE", { labelIndex });
    }
    if (hasEN && hasAN) {
      pushIssue(errors, "BIDI_RULE", { labelIndex });
    }
    return;
  }

  for (let i = 0; i < classes.length; i += 1) {
    if (!allowedLtr.has(classes[i] ?? BidiClass.ON)) {
      const extras: Partial<IdnaError> = { labelIndex };
      const info = cps[i];
      if (info) {
        extras.span = { startCU: info.startCU, endCU: info.endCU };
      }
      pushIssue(errors, "BIDI_RULE", extras);
      break;
    }
  }
  let idx = classes.length - 1;
  while (idx >= 0 && classes[idx] === BidiClass.NSM) idx -= 1;
  if (idx < 0 || ![BidiClass.L, BidiClass.EN].includes(classes[idx] ?? BidiClass.ON)) {
    pushIssue(errors, "BIDI_RULE", { labelIndex });
  }
}

function checkContextJ(label: string, labelIndex: number, errors: IdnaError[]): void {
  const cps = collectCodePoints(label);
  for (let i = 0; i < cps.length; i += 1) {
    const info = cps[i];
    if (!info) continue;
    if (info.cp === 0x200d) {
      const prev = cps[i - 1];
      if (!prev || !isVirama(prev.cp)) {
        pushIssue(errors, "CONTEXTJ", {
          labelIndex,
          span: { startCU: info.startCU, endCU: info.endCU },
          codePoint: info.cp,
        });
      }
      continue;
    }
    if (info.cp !== 0x200c) continue;
    const prev = cps[i - 1];
    if (prev && isVirama(prev.cp)) {
      continue;
    }
    let prevIndex = i - 1;
    while (prevIndex >= 0) {
      const candidate = cps[prevIndex];
      if (!candidate) break;
      const type = joiningTypeAt(candidate.cp);
      if (type !== JOINING_TYPE_IDS.T) {
        break;
      }
      prevIndex -= 1;
    }
    let nextIndex = i + 1;
    while (nextIndex < cps.length) {
      const candidate = cps[nextIndex];
      if (!candidate) break;
      const type = joiningTypeAt(candidate.cp);
      if (type !== JOINING_TYPE_IDS.T) {
        break;
      }
      nextIndex += 1;
    }
    const prevType = prevIndex >= 0 ? joiningTypeAt(cps[prevIndex]?.cp ?? 0) : JOINING_TYPE_IDS.U;
    const nextType =
      nextIndex < cps.length ? joiningTypeAt(cps[nextIndex]?.cp ?? 0) : JOINING_TYPE_IDS.U;
    const prevOk = prevType === JOINING_TYPE_IDS.L || prevType === JOINING_TYPE_IDS.D;
    const nextOk = nextType === JOINING_TYPE_IDS.R || nextType === JOINING_TYPE_IDS.D;
    if (!prevOk || !nextOk) {
      pushIssue(errors, "CONTEXTJ", {
        labelIndex,
        span: { startCU: info.startCU, endCU: info.endCU },
        codePoint: info.cp,
      });
    }
  }
}

function checkContextO(label: string, labelIndex: number, errors: IdnaError[]): void {
  const cps = collectCodePoints(label);
  if (cps.length === 0) return;

  let hasHiraganaKatakanaHan = false;
  let hasArabicIndic = false;
  let hasExtArabicIndic = false;

  for (const info of cps) {
    if (!info) continue;
    if (info.cp >= 0x0660 && info.cp <= 0x0669) hasArabicIndic = true;
    if (info.cp >= 0x06f0 && info.cp <= 0x06f9) hasExtArabicIndic = true;
    const script = scriptIdAt(info.cp);
    if (script === Script.Hiragana || script === Script.Katakana || script === Script.Han) {
      hasHiraganaKatakanaHan = true;
    }
  }

  for (let i = 0; i < cps.length; i += 1) {
    const info = cps[i];
    if (!info) continue;
    if (!isContextO(info.cp)) continue;

    if (info.cp === 0x00b7) {
      const prev = cps[i - 1];
      const next = cps[i + 1];
      if (!prev || !next || prev.cp !== 0x006c || next.cp !== 0x006c) {
        pushIssue(errors, "CONTEXTO", {
          labelIndex,
          span: { startCU: info.startCU, endCU: info.endCU },
          codePoint: info.cp,
        });
      }
    }

    if (info.cp === 0x0375) {
      const next = cps[i + 1];
      if (!next || scriptIdAt(next.cp) !== Script.Greek) {
        pushIssue(errors, "CONTEXTO", {
          labelIndex,
          span: { startCU: info.startCU, endCU: info.endCU },
          codePoint: info.cp,
        });
      }
    }

    if (info.cp === 0x05f3 || info.cp === 0x05f4) {
      const prev = cps[i - 1];
      if (!prev || scriptIdAt(prev.cp) !== Script.Hebrew) {
        pushIssue(errors, "CONTEXTO", {
          labelIndex,
          span: { startCU: info.startCU, endCU: info.endCU },
          codePoint: info.cp,
        });
      }
    }

    if (info.cp === 0x30fb) {
      if (!hasHiraganaKatakanaHan) {
        pushIssue(errors, "CONTEXTO", {
          labelIndex,
          span: { startCU: info.startCU, endCU: info.endCU },
          codePoint: info.cp,
        });
      }
    }
  }

  if (hasArabicIndic && hasExtArabicIndic) {
    pushIssue(errors, "CONTEXTO", { labelIndex });
  }
}

function validateLabel(
  label: string,
  options: Required<Uts46Options>,
  labelIndex: number,
  opts: { useCompatMapping: boolean; requireNfc: boolean; dotEquivalent: boolean },
  errors: IdnaError[],
  warnings: IdnaError[],
): void {
  if (label.length === 0) {
    pushIssue(errors, "EMPTY_LABEL", { labelIndex });
    return;
  }

  if (opts.requireNfc && !isNormalized(label, "NFC")) {
    pushIssue(errors, "DISALLOWED", { labelIndex });
  }

  if (options.checkHyphens) {
    checkHyphens(label, labelIndex, errors);
  } else if (label.startsWith("xn--")) {
    pushIssue(errors, "INVALID_ACE_PREFIX", { labelIndex });
  }

  if (label.includes(".")) {
    pushIssue(errors, opts.dotEquivalent ? "DOT_EQUIVALENT" : "DISALLOWED", { labelIndex });
  }

  const codePoints = collectCodePoints(label);
  if (codePoints.length > 0 && isGeneralCategoryMark(codePoints[0]?.cp ?? 0)) {
    pushIssue(errors, "DISALLOWED", {
      labelIndex,
      span: { startCU: codePoints[0]?.startCU ?? 0, endCU: codePoints[0]?.endCU ?? 1 },
    });
  }

  for (const info of codePoints) {
    if (!info) continue;
    const cp = info.cp;
    const status = statusAt(cp);
    if (opts.useCompatMapping) {
      if (status !== IDNA_MAPPING_STATUS_IDS.valid) {
        pushIssue(
          errors,
          status === IDNA_MAPPING_STATUS_IDS.deviation ? "DEVIATION" : "DISALLOWED",
          {
            labelIndex,
            span: { startCU: info.startCU, endCU: info.endCU },
            codePoint: cp,
          },
        );
      }
    } else {
      if (
        status !== IDNA_MAPPING_STATUS_IDS.valid &&
        status !== IDNA_MAPPING_STATUS_IDS.deviation
      ) {
        pushIssue(errors, "DISALLOWED", {
          labelIndex,
          span: { startCU: info.startCU, endCU: info.endCU },
          codePoint: cp,
        });
      }
    }

    if (options.useStd3AsciiRules && cp <= 0x7f && !isStd3Ascii(cp)) {
      pushIssue(errors, "STD3_DISALLOWED", {
        labelIndex,
        span: { startCU: info.startCU, endCU: info.endCU },
        codePoint: cp,
      });
    }

    if (isUnassigned(cp)) {
      pushIssue(errors, "UNASSIGNED", {
        labelIndex,
        span: { startCU: info.startCU, endCU: info.endCU },
        codePoint: cp,
      });
    }

    if (isNoncharacter(cp)) {
      pushIssue(errors, "NONCHARACTER", {
        labelIndex,
        span: { startCU: info.startCU, endCU: info.endCU },
        codePoint: cp,
      });
    }

    if (isDefaultIgnorable(cp) && cp !== 0x200c && cp !== 0x200d) {
      pushIssue(warnings, "DEFAULT_IGNORABLE", {
        labelIndex,
        span: { startCU: info.startCU, endCU: info.endCU },
        codePoint: cp,
      });
    }
  }

  if (options.checkJoiners) {
    checkContextJ(label, labelIndex, errors);
  }

  checkContextO(label, labelIndex, errors);
}

function processDomain(domain: string, options: Required<Uts46Options>) {
  const mapResult = mapDomain(domain, options);
  const split = splitLabels(mapResult.mapped, mapResult.dotEquivalentIndices, options.splitOnDots);

  const labels: string[] = [];
  const errors = [...mapResult.errors];
  const warnings = [...mapResult.warnings];

  split.labels.forEach((label, index) => {
    const normalizedLabel = normalize(label, "NFC");

    if (normalizedLabel.startsWith("xn--")) {
      if (!options.checkHyphens) {
        pushIssue(errors, "INVALID_ACE_PREFIX", { labelIndex: index });
      }
      if (hasNonAscii(normalizedLabel)) {
        pushIssue(errors, "INVALID_ACE_PREFIX", { labelIndex: index });
        labels.push(normalizedLabel);
        return;
      }
      const decoded = punycodeDecode(normalizedLabel.slice(4));
      if (!decoded.ok || decoded.value === undefined) {
        pushIssue(errors, "PUNYCODE_ERROR", { labelIndex: index });
        labels.push(normalizedLabel);
        return;
      }
      const decodedLabel = decoded.value;
      if (decodedLabel.length === 0 || isAllAscii(decodedLabel)) {
        pushIssue(errors, "INVALID_ACE_PREFIX", { labelIndex: index });
      }
      validateLabel(
        decodedLabel,
        options,
        index,
        {
          useCompatMapping: false,
          requireNfc: true,
          dotEquivalent: split.labelHasDotEquivalent[index] ?? false,
        },
        errors,
        warnings,
      );
      labels.push(decodedLabel);
      return;
    }

    if (normalizedLabel.length === 0) {
      if (!(split.trailingDot && index === split.labels.length - 1)) {
        pushIssue(errors, "EMPTY_LABEL", { labelIndex: index });
      }
      labels.push(normalizedLabel);
      return;
    }

    validateLabel(
      normalizedLabel,
      options,
      index,
      {
        useCompatMapping: options.useCompatMapping,
        requireNfc: false,
        dotEquivalent: split.labelHasDotEquivalent[index] ?? false,
      },
      errors,
      warnings,
    );
    labels.push(normalizedLabel);
  });

  if (options.checkBidi) {
    const isBidiDomain = labels.some((label) => {
      for (let i = 0; i < label.length; ) {
        const cp = label.codePointAt(i) ?? 0;
        const size = cp > 0xffff ? 2 : 1;
        const bidi = bidiClassAt(cp);
        if (bidi === BidiClass.R || bidi === BidiClass.AL || bidi === BidiClass.AN) return true;
        i += size;
      }
      return false;
    });

    if (isBidiDomain) {
      labels.forEach((label, index) => {
        checkBidiLabel(label, index, errors);
      });
    }
  }

  return { labels, errors, warnings, trailingDot: split.trailingDot };
}

function applyDnsLengthChecks(
  labels: string[],
  options: Required<Uts46Options>,
  errors: IdnaError[],
): void {
  if (!options.verifyDnsLength) return;
  if (labels.length === 0) {
    pushIssue(errors, "EMPTY_LABEL");
    return;
  }

  const lastIndex = labels.length - 1;
  const hasRootLabel = labels[lastIndex] === "";
  if (hasRootLabel) {
    pushIssue(errors, "EMPTY_LABEL", { labelIndex: lastIndex });
  }

  let totalLength = 0;
  for (let i = 0; i < labels.length; i += 1) {
    const label = labels[i] ?? "";
    if (label.length === 0) {
      if (!(hasRootLabel && i === lastIndex)) {
        pushIssue(errors, "EMPTY_LABEL", { labelIndex: i });
      }
      continue;
    }
    if (label.length > 63) {
      pushIssue(errors, "LABEL_TOO_LONG", { labelIndex: i });
    }
    totalLength += label.length;
    if (i < labels.length - 1) totalLength += 1;
  }

  if (hasRootLabel) {
    totalLength = Math.max(0, totalLength - 1);
  }

  if (totalLength > 253) {
    pushIssue(errors, "DOMAIN_TOO_LONG");
  }
}

/**
 * Apply UTS #46 mapping to a domain.
 * Units: UTF-16 code units.
 */
export function uts46Map(domain: string, opts?: Uts46MapOptions): Uts46MapResult {
  const normalized = normalizeMapOptions(opts);
  const { mapped, errors, warnings } = mapDomain(domain, normalized);
  return {
    mapped,
    errors,
    warnings,
    provenance: buildProvenance("UTS46.Map", normalized),
  };
}

/**
 * Convert a domain to Unicode per UTS #46.
 * Units: UTF-16 code units.
 */
export function uts46ToUnicode(domain: string, opts?: Uts46Options): IdnaResult {
  const normalized = normalizeOptions(opts);
  const { labels, errors, warnings } = processDomain(domain, normalized);
  const value = labels.join(".");
  return {
    ok: errors.length === 0,
    value,
    errors,
    warnings,
    provenance: buildProvenance("UTS46.ToUnicode", normalized),
  };
}

/**
 * Convert a domain to ASCII per UTS #46.
 * Units: UTF-16 code units.
 */
export function uts46ToAscii(domain: string, opts?: Uts46Options): IdnaResult {
  const normalized = normalizeOptions(opts);
  const { labels, errors, warnings } = processDomain(domain, normalized);
  const asciiLabels = labels.map((label, index) => {
    if (label.length === 0) return label;
    if (!hasNonAscii(label)) return label;
    const encoded = punycodeEncode(label);
    if (!encoded.ok || !encoded.value) {
      pushIssue(errors, "PUNYCODE_ERROR", { labelIndex: index });
      return label;
    }
    return `xn--${encoded.value}`;
  });

  applyDnsLengthChecks(asciiLabels, normalized, errors);

  const value = asciiLabels.join(".");
  return {
    ok: errors.length === 0,
    value,
    errors,
    warnings,
    provenance: buildProvenance("UTS46.ToASCII", normalized),
  };
}
