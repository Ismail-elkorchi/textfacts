import type { Span } from "../core/types.ts";
import {
  isBidiControl,
  isDefaultIgnorable,
  isJoinControl,
  isNoncharacter,
  isVariationSelector,
} from "../unicode/integrity.ts";

/**
 * IntegrityFindingKind defines an exported type contract.
 */
export type IntegrityFindingKind =
  | "lone-surrogate"
  | "default-ignorable"
  | "bidi-control"
  | "join-control"
  | "variation-selector"
  | "noncharacter";

/**
 * IntegrityFinding defines an exported structural contract.
 */
export interface IntegrityFinding {
  kind: IntegrityFindingKind;
  span: Span;
  codePoint: number;
}

/**
 * LoneSurrogateFinding defines an exported structural contract.
 */
export interface LoneSurrogateFinding {
  span: Span;
  codeUnit: number;
  kind: "high" | "low";
}

/**
 * IntegrityScanOptions defines an exported structural contract.
 */
export interface IntegrityScanOptions {
  include?: readonly IntegrityFindingKind[];
  maxFindings?: number;
}

/**
 * IntegrityProfileOptions defines an exported structural contract.
 */
export interface IntegrityProfileOptions {
  maxSamplesPerKind?: number;
}

/**
 * IntegrityProfile defines an exported structural contract.
 */
export interface IntegrityProfile {
  wellFormed: boolean;
  counts: Record<IntegrityFindingKind, number>;
  samples: Partial<Record<IntegrityFindingKind, ReadonlyArray<IntegrityFinding>>>;
}

const ALL_KINDS: readonly IntegrityFindingKind[] = [
  "lone-surrogate",
  "default-ignorable",
  "bidi-control",
  "join-control",
  "variation-selector",
  "noncharacter",
];

const DEFAULT_MAX_SAMPLES = 5;

function normalizeInclude(options?: IntegrityScanOptions) {
  if (!options?.include || options.include.length === 0) {
    return {
      includeAll: true,
      includeLone: true,
      includeDefaultIgnorable: true,
      includeBidiControl: true,
      includeJoinControl: true,
      includeVariationSelector: true,
      includeNoncharacter: true,
    };
  }
  const set = new Set(options.include);
  return {
    includeAll: false,
    includeLone: set.has("lone-surrogate"),
    includeDefaultIgnorable: set.has("default-ignorable"),
    includeBidiControl: set.has("bidi-control"),
    includeJoinControl: set.has("join-control"),
    includeVariationSelector: set.has("variation-selector"),
    includeNoncharacter: set.has("noncharacter"),
  };
}

/**
 * isWellFormedUnicode executes a deterministic operation in this module.
 */
export function isWellFormedUnicode(text: string): boolean {
  for (let codeUnitIndex = 0; codeUnitIndex < text.length; ) {
    const codeUnit = text.charCodeAt(codeUnitIndex);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = text.charCodeAt(codeUnitIndex + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        codeUnitIndex += 2;
        continue;
      }
      return false;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
    codeUnitIndex += 1;
  }
  return true;
}

/**
 * toWellFormedUnicode executes a deterministic operation in this module.
 */
export function toWellFormedUnicode(text: string): string {
  let output = "";
  for (let codeUnitIndex = 0; codeUnitIndex < text.length; ) {
    const codeUnit = text.charCodeAt(codeUnitIndex);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = text.charCodeAt(codeUnitIndex + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        output += text.slice(codeUnitIndex, codeUnitIndex + 2);
        codeUnitIndex += 2;
        continue;
      }
      output += "\uFFFD";
      codeUnitIndex += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      output += "\uFFFD";
      codeUnitIndex += 1;
      continue;
    }
    output += text[codeUnitIndex] ?? "";
    codeUnitIndex += 1;
  }
  return output;
}

/**
 * Scan text for lone surrogates.
 * Units: UTF-16 code units.
 */
export function scanLoneSurrogates(text: string): ReadonlyArray<LoneSurrogateFinding> {
  const findings: LoneSurrogateFinding[] = [];
  for (let codeUnitIndex = 0; codeUnitIndex < text.length; ) {
    const codeUnit = text.charCodeAt(codeUnitIndex);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = text.charCodeAt(codeUnitIndex + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        codeUnitIndex += 2;
        continue;
      }
      findings.push({
        span: { startCU: codeUnitIndex, endCU: codeUnitIndex + 1 },
        codeUnit,
        kind: "high",
      });
      codeUnitIndex += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      findings.push({
        span: { startCU: codeUnitIndex, endCU: codeUnitIndex + 1 },
        codeUnit,
        kind: "low",
      });
      codeUnitIndex += 1;
      continue;
    }
    codeUnitIndex += 1;
  }
  return findings;
}

function* pushFinding(
  kind: IntegrityFindingKind,
  startCU: number,
  endCU: number,
  codePoint: number,
  state: { count: number; max: number },
): Iterable<IntegrityFinding> {
  if (state.count >= state.max) return;
  state.count += 1;
  yield { kind, span: { startCU, endCU }, codePoint };
}

/**
 * Iterate integrity findings over text.
 * Units: UTF-16 code units.
 * Units: Unicode scalar values.
 */
export function* iterIntegrityFindings(
  text: string,
  options: IntegrityScanOptions = {},
): Iterable<IntegrityFinding> {
  const include = normalizeInclude(options);
  const state = { count: 0, max: options.maxFindings ?? Number.POSITIVE_INFINITY };

  for (let codeUnitIndex = 0; codeUnitIndex < text.length; ) {
    const codeUnit = text.charCodeAt(codeUnitIndex);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = text.charCodeAt(codeUnitIndex + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        const codePoint = ((codeUnit - 0xd800) << 10) + (nextCodeUnit - 0xdc00) + 0x10000;
        const startCodeUnit = codeUnitIndex;
        const endCodeUnit = codeUnitIndex + 2;
        if (include.includeDefaultIgnorable && isDefaultIgnorable(codePoint)) {
          yield* pushFinding("default-ignorable", startCodeUnit, endCodeUnit, codePoint, state);
        }
        if (include.includeBidiControl && isBidiControl(codePoint)) {
          yield* pushFinding("bidi-control", startCodeUnit, endCodeUnit, codePoint, state);
        }
        if (include.includeJoinControl && isJoinControl(codePoint)) {
          yield* pushFinding("join-control", startCodeUnit, endCodeUnit, codePoint, state);
        }
        if (include.includeVariationSelector && isVariationSelector(codePoint)) {
          yield* pushFinding("variation-selector", startCodeUnit, endCodeUnit, codePoint, state);
        }
        if (include.includeNoncharacter && isNoncharacter(codePoint)) {
          yield* pushFinding("noncharacter", startCodeUnit, endCodeUnit, codePoint, state);
        }
        if (state.count >= state.max) return;
        codeUnitIndex = endCodeUnit;
        continue;
      }
      if (include.includeLone) {
        yield* pushFinding("lone-surrogate", codeUnitIndex, codeUnitIndex + 1, codeUnit, state);
        if (state.count >= state.max) return;
      }
      codeUnitIndex += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      if (include.includeLone) {
        yield* pushFinding("lone-surrogate", codeUnitIndex, codeUnitIndex + 1, codeUnit, state);
        if (state.count >= state.max) return;
      }
      codeUnitIndex += 1;
      continue;
    }

    const codePoint = codeUnit;
    const startCodeUnit = codeUnitIndex;
    const endCodeUnit = codeUnitIndex + 1;
    if (include.includeDefaultIgnorable && isDefaultIgnorable(codePoint)) {
      yield* pushFinding("default-ignorable", startCodeUnit, endCodeUnit, codePoint, state);
    }
    if (include.includeBidiControl && isBidiControl(codePoint)) {
      yield* pushFinding("bidi-control", startCodeUnit, endCodeUnit, codePoint, state);
    }
    if (include.includeJoinControl && isJoinControl(codePoint)) {
      yield* pushFinding("join-control", startCodeUnit, endCodeUnit, codePoint, state);
    }
    if (include.includeVariationSelector && isVariationSelector(codePoint)) {
      yield* pushFinding("variation-selector", startCodeUnit, endCodeUnit, codePoint, state);
    }
    if (include.includeNoncharacter && isNoncharacter(codePoint)) {
      yield* pushFinding("noncharacter", startCodeUnit, endCodeUnit, codePoint, state);
    }
    if (state.count >= state.max) return;
    codeUnitIndex += 1;
  }
}

/**
 * Scan integrity findings over text.
 * Units: UTF-16 code units.
 * Units: Unicode scalar values.
 */
export function scanIntegrityFindings(
  text: string,
  options: IntegrityScanOptions = {},
): ReadonlyArray<IntegrityFinding> {
  const findings: IntegrityFinding[] = [];
  const maxFindings = options.maxFindings ?? Number.POSITIVE_INFINITY;
  for (const finding of iterIntegrityFindings(text, options)) {
    findings.push(finding);
    if (findings.length >= maxFindings) break;
  }
  return findings;
}

/**
 * integrityProfile executes a deterministic operation in this module.
 */
export function integrityProfile(
  text: string,
  options: IntegrityProfileOptions = {},
): IntegrityProfile {
  const counts: Record<IntegrityFindingKind, number> = {
    "lone-surrogate": 0,
    "default-ignorable": 0,
    "bidi-control": 0,
    "join-control": 0,
    "variation-selector": 0,
    noncharacter: 0,
  };
  const samples: Partial<Record<IntegrityFindingKind, IntegrityFinding[]>> = {};
  const maxSamples = options.maxSamplesPerKind ?? DEFAULT_MAX_SAMPLES;

  for (const finding of iterIntegrityFindings(text)) {
    counts[finding.kind] += 1;
    const bucket = samples[finding.kind];
    if (!bucket) {
      samples[finding.kind] = [finding];
      continue;
    }
    if (bucket.length < maxSamples) {
      bucket.push(finding);
    }
  }

  return {
    wellFormed: isWellFormedUnicode(text),
    counts,
    samples,
  };
}

/**
 * allIntegrityFindingKinds executes a deterministic operation in this module.
 */
export function allIntegrityFindingKinds(): readonly IntegrityFindingKind[] {
  return ALL_KINDS;
}
