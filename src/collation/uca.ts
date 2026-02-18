import { TextfactsError } from "../core/error.ts";
import { isWellFormedUnicode, toWellFormedUnicode } from "../integrity/integrity.ts";
import { CCC_RANGES } from "../normalize/generated/ccc.ts";
import { normalize } from "../normalize/normalize.ts";
import { lookupProperty } from "../unicode/lookup.ts";
import {
  DUCET_CONTRACTION_EDGE_CHILD,
  DUCET_CONTRACTION_EDGE_CODEPOINT,
  DUCET_CONTRACTION_NODE_COUNT,
  DUCET_CONTRACTION_NODE_FIRST,
  DUCET_CONTRACTION_NODE_INDEX,
  DUCET_CONTRACTION_NODE_LENGTH,
} from "./generated/ducet-contractions.ts";
import {
  DUCET_CE_PRIMARY,
  DUCET_CE_SECONDARY,
  DUCET_CE_TERTIARY,
} from "./generated/ducet-expansions.ts";
import {
  CORE_HAN_RANGES_END,
  CORE_HAN_RANGES_START,
  DUCET_IMPLICIT_RANGES_BASE,
  DUCET_IMPLICIT_RANGES_BASE_START,
  DUCET_IMPLICIT_RANGES_END,
  DUCET_IMPLICIT_RANGES_START,
  UNIFIED_IDEOGRAPH_RANGES_END,
  UNIFIED_IDEOGRAPH_RANGES_START,
} from "./generated/ducet-implicit.ts";
import {
  DUCET_SINGLE_CODEPOINTS,
  DUCET_SINGLE_INDEX,
  DUCET_SINGLE_LENGTH,
} from "./generated/ducet-single.ts";
import type {
  UcaAlternate,
  UcaFoldOptions,
  UcaIllFormed,
  UcaNormalization,
  UcaOptions,
  UcaStrength,
} from "./types.ts";

const DEFAULT_STRENGTH: UcaStrength = 3;
const DEFAULT_ALTERNATE: UcaAlternate = "non-ignorable";
const DEFAULT_NORMALIZATION: UcaNormalization = "nfd";
const DEFAULT_ILL_FORMED: UcaIllFormed = "replace";

const TERTIARY_FLAG_VARIABLE = 0x8000;

interface CollationWeights {
  primary: number[];
  secondary: number[];
  tertiary: number[];
  quaternary: number[];
  codepoints: number[];
}

function binarySearch(array: Uint32Array, value: number): number {
  let low = 0;
  let high = array.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const current = array[mid] ?? 0;
    if (current === value) return mid;
    if (current < value) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

function rangeIncludes(starts: Uint32Array, ends: Uint32Array, value: number): boolean {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const start = starts[mid] ?? 0;
    const end = ends[mid] ?? 0;
    if (value < start) {
      high = mid - 1;
    } else if (value > end) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

function getCombiningClass(codePoint: number): number {
  return lookupProperty(CCC_RANGES, codePoint);
}

function findImplicitRange(
  value: number,
): { start: number; base: number; baseStart: number } | null {
  let low = 0;
  let high = DUCET_IMPLICIT_RANGES_START.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const start = DUCET_IMPLICIT_RANGES_START[mid] ?? 0;
    const end = DUCET_IMPLICIT_RANGES_END[mid] ?? 0;
    if (value < start) {
      high = mid - 1;
    } else if (value > end) {
      low = mid + 1;
    } else {
      return {
        start,
        base: DUCET_IMPLICIT_RANGES_BASE[mid] ?? 0,
        baseStart: DUCET_IMPLICIT_RANGES_BASE_START[mid] ?? start,
      };
    }
  }
  return null;
}

function findSingleMapping(cp: number): { index: number; length: number } | null {
  const idx = binarySearch(DUCET_SINGLE_CODEPOINTS, cp);
  if (idx < 0) return null;
  const index = DUCET_SINGLE_INDEX[idx] ?? 0;
  const length = DUCET_SINGLE_LENGTH[idx] ?? 0;
  if (length === 0) return null;
  return { index, length };
}

function findContractionEdge(node: number, cp: number): number {
  const first = DUCET_CONTRACTION_NODE_FIRST[node] ?? 0;
  const count = DUCET_CONTRACTION_NODE_COUNT[node] ?? 0;
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const edgeIndex = first + mid;
    const edgeCp = DUCET_CONTRACTION_EDGE_CODEPOINT[edgeIndex] ?? 0;
    if (edgeCp === cp) return edgeIndex;
    if (edgeCp < cp) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

function findContractionContiguous(
  codepoints: number[],
  start: number,
): { node: number; index: number; ceLength: number; codepointLength: number } | null {
  let node = 0;
  let bestIndex = -1;
  let bestCeLength = 0;
  let bestCodepointLength = 0;
  let bestNode = -1;
  for (let i = start; i < codepoints.length; i += 1) {
    const cp = codepoints[i] ?? 0;
    const edge = findContractionEdge(node, cp);
    if (edge < 0) break;
    node = DUCET_CONTRACTION_EDGE_CHILD[edge] ?? 0;
    const ceLength = DUCET_CONTRACTION_NODE_LENGTH[node] ?? 0;
    if (ceLength > 0) {
      bestNode = node;
      bestIndex = DUCET_CONTRACTION_NODE_INDEX[node] ?? 0;
      bestCeLength = ceLength;
      bestCodepointLength = i - start + 1;
    }
  }
  if (bestCodepointLength > 0 && bestIndex >= 0 && bestNode >= 0) {
    return {
      node: bestNode,
      index: bestIndex,
      ceLength: bestCeLength,
      codepointLength: bestCodepointLength,
    };
  }
  return null;
}

function findContractionDiscontiguous(
  codepoints: number[],
  cccs: number[],
  start: number,
): { index: number; ceLength: number; matched: number[] } | null {
  const rootEdge = findContractionEdge(0, codepoints[start] ?? 0);
  if (rootEdge < 0) return null;

  let node = DUCET_CONTRACTION_EDGE_CHILD[rootEdge] ?? 0;
  let index = -1;
  let ceLength = 0;
  let codepointLength = 1;

  const contiguous = findContractionContiguous(codepoints, start);
  if (contiguous) {
    node = contiguous.node;
    index = contiguous.index;
    ceLength = contiguous.ceLength;
    codepointLength = contiguous.codepointLength;
  }

  const matched: number[] = [];
  for (let i = 0; i < codepointLength; i += 1) {
    matched.push(start + i);
  }
  let lastCCC = 0;

  for (let j = start + codepointLength; j < codepoints.length; j += 1) {
    const ccc = cccs[j] ?? 0;
    if (ccc === 0) break;
    if (ccc <= lastCCC) {
      lastCCC = ccc;
      continue;
    }
    const edge = findContractionEdge(node, codepoints[j] ?? 0);
    if (edge < 0) {
      lastCCC = ccc;
      continue;
    }
    const child = DUCET_CONTRACTION_EDGE_CHILD[edge] ?? 0;
    const childLength = DUCET_CONTRACTION_NODE_LENGTH[child] ?? 0;
    if (childLength > 0) {
      node = child;
      index = DUCET_CONTRACTION_NODE_INDEX[child] ?? 0;
      ceLength = childLength;
      matched.push(j);
      continue;
    }
    lastCCC = ccc;
  }

  if (matched.length > 1 && ceLength > 0) {
    return { index, ceLength, matched };
  }
  return null;
}

function implicitWeights(cp: number): [number, number] {
  const range = findImplicitRange(cp);
  let primaryA = 0;
  let primaryB = 0;

  if (range) {
    const offset = cp - range.baseStart;
    primaryA = range.base + (offset >> 15);
    primaryB = (offset & 0x7fff) | 0x8000;
  } else if (rangeIncludes(UNIFIED_IDEOGRAPH_RANGES_START, UNIFIED_IDEOGRAPH_RANGES_END, cp)) {
    const isCore = rangeIncludes(CORE_HAN_RANGES_START, CORE_HAN_RANGES_END, cp);
    primaryA = (isCore ? 0xfb40 : 0xfb80) + (cp >> 15);
    primaryB = (cp & 0x7fff) | 0x8000;
  } else {
    primaryA = 0xfbc0 + (cp >> 15);
    primaryB = (cp & 0x7fff) | 0x8000;
  }

  return [primaryA, primaryB];
}

function prepareText(
  text: string,
  normalization: UcaNormalization,
  illFormed: UcaIllFormed,
): string {
  if (illFormed === "error" && !isWellFormedUnicode(text)) {
    throw new TextfactsError("COLLATION_ILL_FORMED", "Ill-formed Unicode input");
  }
  let normalizedText = text;
  if (illFormed === "replace") {
    normalizedText = toWellFormedUnicode(normalizedText);
  }
  if (normalization === "nfd") {
    if (illFormed === "implicit" && !isWellFormedUnicode(normalizedText)) {
      return normalizedText;
    }
    normalizedText = normalize(normalizedText, "NFD");
  }
  return normalizedText;
}

function stringToCodePoints(text: string, illFormed: UcaIllFormed): number[] {
  const cps: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cu = text.charCodeAt(i);
    if (cu >= 0xd800 && cu <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const cp = ((cu - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        cps.push(cp);
        i += 2;
        continue;
      }
      if (illFormed === "error") {
        throw new TextfactsError("COLLATION_ILL_FORMED", "Ill-formed Unicode input");
      }
      if (illFormed === "replace") {
        cps.push(0xfffd);
      } else {
        cps.push(cu);
      }
      i += 1;
      continue;
    }
    if (cu >= 0xdc00 && cu <= 0xdfff) {
      if (illFormed === "error") {
        throw new TextfactsError("COLLATION_ILL_FORMED", "Ill-formed Unicode input");
      }
      if (illFormed === "replace") {
        cps.push(0xfffd);
      } else {
        cps.push(cu);
      }
      i += 1;
      continue;
    }
    cps.push(cu);
    i += 1;
  }
  return cps;
}

function buildWeights(text: string, options: Required<UcaOptions>): CollationWeights {
  const prepared = prepareText(text, options.normalization, options.illFormed);
  const codepoints = stringToCodePoints(prepared, options.illFormed);
  const cccs = codepoints.map((cp) => getCombiningClass(cp));
  const primary: number[] = [];
  const secondary: number[] = [];
  const tertiary: number[] = [];
  const quaternary: number[] = [];
  let inShifted = false;

  const appendCe = (p: number, s: number, t: number, variable: boolean) => {
    if (options.alternate === "shifted") {
      if (variable) {
        if (p !== 0) quaternary.push(p);
        inShifted = true;
        return;
      }
      if (inShifted && p === 0) return;
      if (p !== 0) inShifted = false;
    }
    if (p !== 0) primary.push(p);
    if (s !== 0) secondary.push(s);
    if (t !== 0) tertiary.push(t);
  };

  const appendMapping = (index: number, ceLength: number) => {
    for (let offset = 0; offset < ceLength; offset += 1) {
      const idx = index + offset;
      const p = DUCET_CE_PRIMARY[idx] ?? 0;
      const s = DUCET_CE_SECONDARY[idx] ?? 0;
      const tRaw = DUCET_CE_TERTIARY[idx] ?? 0;
      const variable = (tRaw & TERTIARY_FLAG_VARIABLE) !== 0;
      const t = tRaw & 0x7fff;
      appendCe(p, s, t, variable);
    }
  };

  const emitCodePoint = (cp: number) => {
    const mapping = findSingleMapping(cp);
    if (mapping) {
      appendMapping(mapping.index, mapping.length);
      return;
    }
    const [primaryA, primaryB] = implicitWeights(cp);
    appendCe(primaryA, 0x0020, 0x0002, false);
    appendCe(primaryB, 0x0000, 0x0000, false);
  };

  const consumed = new Uint8Array(codepoints.length);
  for (let i = 0; i < codepoints.length; i += 1) {
    if (consumed[i]) continue;
    const cp = codepoints[i] ?? 0;
    const contraction = findContractionDiscontiguous(codepoints, cccs, i);
    if (contraction && contraction.matched.length > 1) {
      appendMapping(contraction.index, contraction.ceLength);
      for (const index of contraction.matched) {
        consumed[index] = 1;
      }
      continue;
    }
    emitCodePoint(cp);
    consumed[i] = 1;
  }

  return { primary, secondary, tertiary, quaternary, codepoints };
}

function encodeLevel(weights: number[], out: number[]): void {
  for (const weight of weights) {
    out.push((weight >> 8) & 0xff, weight & 0xff);
  }
  out.push(0x00);
}

function encodeIdentical(codepoints: number[], out: number[]): void {
  for (const cp of codepoints) {
    out.push((cp >> 24) & 0xff, (cp >> 16) & 0xff, (cp >> 8) & 0xff, cp & 0xff);
  }
  out.push(0x00);
}

function buildSortKey(text: string, options: Required<UcaOptions>): Uint8Array {
  const weights = buildWeights(text, options);
  const out: number[] = [];
  encodeLevel(weights.primary, out);
  if (options.strength >= 2) encodeLevel(weights.secondary, out);
  if (options.strength >= 3) encodeLevel(weights.tertiary, out);
  if (options.strength >= 4 && options.alternate === "shifted") {
    encodeLevel(weights.quaternary, out);
  }
  if (options.includeIdenticalLevel) {
    encodeIdentical(weights.codepoints, out);
  }
  return Uint8Array.from(out);
}

function compareBytes(a: Uint8Array, b: Uint8Array): -1 | 0 | 1 {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff < 0) return -1;
    if (diff > 0) return 1;
  }
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
}

function normalizeOptions(options?: UcaOptions): Required<UcaOptions> {
  const strength = options?.strength ?? DEFAULT_STRENGTH;
  return {
    strength: Math.min(4, Math.max(1, strength)) as UcaStrength,
    alternate: options?.alternate ?? DEFAULT_ALTERNATE,
    normalization: options?.normalization ?? DEFAULT_NORMALIZATION,
    illFormed: options?.illFormed ?? DEFAULT_ILL_FORMED,
    includeIdenticalLevel: options?.includeIdenticalLevel ?? true,
  };
}

/**
 * Build a UCA sort key as raw bytes.
 * Units: bytes (binary).
 */
export function ucaSortKeyBytes(text: string, options?: UcaOptions): Uint8Array {
  return buildSortKey(text, normalizeOptions(options));
}

/**
 * ucaSortKeyHex executes a deterministic operation in this module.
 */
export function ucaSortKeyHex(text: string, options?: UcaOptions): string {
  const bytes = ucaSortKeyBytes(text, options);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * ucaCompare executes a deterministic operation in this module.
 */
export function ucaCompare(a: string, b: string, options?: UcaOptions): -1 | 0 | 1 {
  const opts = normalizeOptions(options);
  const keyA = buildSortKey(a, opts);
  const keyB = buildSortKey(b, opts);
  return compareBytes(keyA, keyB);
}

/**
 * ucaStableSort executes a deterministic operation in this module.
 */
export function ucaStableSort(strings: readonly string[], options?: UcaOptions): string[] {
  const opts = normalizeOptions(options);
  const entries = strings.map((value, index) => ({
    value,
    index,
    key: buildSortKey(value, opts),
  }));

  const merge = (left: typeof entries, right: typeof entries) => {
    const result: typeof entries = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      const leftItem = left[i];
      const rightItem = right[j];
      if (!leftItem || !rightItem) break;
      const cmp = compareBytes(leftItem.key, rightItem.key);
      if (cmp < 0 || (cmp === 0 && leftItem.index <= rightItem.index)) {
        result.push(leftItem);
        i += 1;
      } else {
        result.push(rightItem);
        j += 1;
      }
    }
    while (i < left.length) {
      const leftItem = left[i];
      if (!leftItem) break;
      result.push(leftItem);
      i += 1;
    }
    while (j < right.length) {
      const rightItem = right[j];
      if (!rightItem) break;
      result.push(rightItem);
      j += 1;
    }
    return result;
  };

  const sort = (arr: typeof entries): typeof entries => {
    if (arr.length <= 1) return arr;
    const mid = Math.floor(arr.length / 2);
    return merge(sort(arr.slice(0, mid)), sort(arr.slice(mid)));
  };

  return sort(entries).map((entry) => entry.value);
}

/**
 * Build a folded UCA sort key as raw bytes.
 * Units: bytes (binary).
 */
export function ucaFoldKey(text: string, options: UcaFoldOptions): Uint8Array {
  const strength = Math.min(4, Math.max(1, options.strength)) as UcaStrength;
  const normalized: Required<UcaOptions> = {
    strength,
    alternate: options.alternate ?? DEFAULT_ALTERNATE,
    normalization: options.normalization ?? DEFAULT_NORMALIZATION,
    illFormed: options.illFormed ?? DEFAULT_ILL_FORMED,
    includeIdenticalLevel: false,
  };
  return buildSortKey(text, normalized);
}
