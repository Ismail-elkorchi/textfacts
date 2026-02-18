import { normalizeInput } from "../core/input.ts";
import { createProvenance } from "../core/provenance.ts";
import type { Span, TextInput } from "../core/types.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import { collectCodePoints } from "../segment/internal.ts";
import {
  BidiBracketType,
  getBidiBracketPair,
  getBidiBracketType,
} from "../unicode/bidi-brackets.ts";
import { BidiClass, bidiClassAt } from "../unicode/bidi.ts";
import type { BidiOptions, BidiResolution, BidiRun } from "./types.ts";

const DEFAULT_ALGORITHM_REVISION = "Unicode 17.0.0";
const UAX9_SPEC = "https://unicode.org/reports/tr9/";
const MAX_LEVEL = 125;
const MAX_STACK_DEPTH = 125;
const MAX_BRACKET_DEPTH = 63;
const REMOVED_LEVEL = 0xff;

const BIDI_CONTROLS = new Set([
  0x202a, // LRE
  0x202b, // RLE
  0x202c, // PDF
  0x202d, // LRO
  0x202e, // RLO
  0x2066, // LRI
  0x2067, // RLI
  0x2068, // FSI
  0x2069, // PDI
  0x200e, // LRM
  0x200f, // RLM
  0x061c, // ALM
]);

interface StackEntry {
  level: number;
  override: BidiClass | null;
  isolate: boolean;
}

function normalizeOptions(options: BidiOptions): Required<BidiOptions> {
  return {
    paragraphDirection: options.paragraphDirection ?? "auto",
    useBracketPairs: options.useBracketPairs ?? true,
    debug: options.debug ?? false,
  };
}

function isIsolateInitiator(cls: BidiClass): boolean {
  return cls === BidiClass.LRI || cls === BidiClass.RLI || cls === BidiClass.FSI;
}

function isExplicitFormat(cls: BidiClass): boolean {
  return (
    cls === BidiClass.LRE ||
    cls === BidiClass.RLE ||
    cls === BidiClass.LRO ||
    cls === BidiClass.RLO ||
    cls === BidiClass.PDF
  );
}

function isNeutralOrIsolate(cls: BidiClass): boolean {
  return (
    cls === BidiClass.B ||
    cls === BidiClass.S ||
    cls === BidiClass.WS ||
    cls === BidiClass.ON ||
    cls === BidiClass.LRI ||
    cls === BidiClass.RLI ||
    cls === BidiClass.FSI ||
    cls === BidiClass.PDI
  );
}

function isBidiControlCodePoint(codePoint: number): boolean {
  return BIDI_CONTROLS.has(codePoint);
}

function isStrongType(cls: BidiClass): boolean {
  return cls === BidiClass.L || cls === BidiClass.R || cls === BidiClass.AL;
}

function directionFromLevel(level: number): BidiClass.L | BidiClass.R {
  return level % 2 === 0 ? BidiClass.L : BidiClass.R;
}

function nextEvenLevel(level: number): number {
  return level + 2 - (level % 2);
}

function nextOddLevel(level: number): number {
  return level + 1 + (level % 2);
}

function bracketEquivalence(codePoint: number): number {
  if (codePoint === 0x2329) return 0x3008;
  if (codePoint === 0x232a) return 0x3009;
  return codePoint;
}

function computeIsolatePairs(
  classes: Uint8Array,
  isolateEnd: Int32Array,
  isolateStart: Int32Array,
): void {
  const stack: number[] = [];
  for (let i = 0; i < classes.length; i += 1) {
    const cls = classes[i] as BidiClass;
    if (isIsolateInitiator(cls)) {
      stack.push(i);
      continue;
    }
    if (cls === BidiClass.PDI && stack.length > 0) {
      const start = stack.pop();
      if (start !== undefined) {
        isolateEnd[start] = i;
        isolateStart[i] = start;
      }
    }
  }
}

function resolveFSIDirection(
  index: number,
  classes: Uint8Array,
  isolateEnd: Int32Array,
): BidiClass.LRI | BidiClass.RLI {
  const endIndex = isolateEnd[index] ?? -1;
  const end = endIndex >= 0 ? endIndex : classes.length;
  let depth = 0;
  for (let i = index + 1; i < end; i += 1) {
    const cls = (classes[i] ?? BidiClass.L) as BidiClass;
    if (isIsolateInitiator(cls)) {
      depth += 1;
      continue;
    }
    if (cls === BidiClass.PDI) {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      break;
    }
    if (depth > 0) continue;
    if (cls === BidiClass.L) return BidiClass.LRI;
    if (cls === BidiClass.R || cls === BidiClass.AL) return BidiClass.RLI;
  }
  return BidiClass.LRI;
}

function determineParagraphLevel(
  classes: Uint8Array,
  isolateEnd: Int32Array,
  options: Required<BidiOptions>,
): 0 | 1 {
  if (options.paragraphDirection === "ltr") return 0;
  if (options.paragraphDirection === "rtl") return 1;

  for (let i = 0; i < classes.length; i += 1) {
    const cls = classes[i] as BidiClass;
    if (isIsolateInitiator(cls)) {
      const end = isolateEnd[i] ?? -1;
      if (end >= 0) {
        i = end;
        continue;
      }
      break;
    }
    if (cls === BidiClass.L) return 0;
    if (cls === BidiClass.R || cls === BidiClass.AL) return 1;
  }
  return 0;
}

function applyExplicitLevels(
  classes: Uint8Array,
  types: Uint8Array,
  levels: Uint8Array,
  removed: Uint8Array,
  isolateEnd: Int32Array,
  paragraphLevel: 0 | 1,
): void {
  const stack: StackEntry[] = [
    {
      level: paragraphLevel,
      override: null,
      isolate: false,
    },
  ];
  let overflowIsolateCount = 0;
  let overflowEmbeddingCount = 0;
  let validIsolateCount = 0;

  for (let i = 0; i < types.length; i += 1) {
    let cls = types[i] as BidiClass;
    if (cls === BidiClass.FSI) {
      cls = resolveFSIDirection(i, classes, isolateEnd);
      types[i] = cls;
    }

    if (
      cls === BidiClass.LRE ||
      cls === BidiClass.LRO ||
      cls === BidiClass.RLE ||
      cls === BidiClass.RLO
    ) {
      if (overflowIsolateCount > 0) {
        // Ignore embedding initiators inside an overflow isolate.
      } else if (overflowEmbeddingCount > 0) {
        overflowEmbeddingCount += 1;
      } else {
        const currentLevel = stack[stack.length - 1]?.level ?? paragraphLevel;
        const newLevel =
          cls === BidiClass.LRE || cls === BidiClass.LRO
            ? nextEvenLevel(currentLevel)
            : nextOddLevel(currentLevel);
        if (newLevel <= MAX_LEVEL && stack.length < MAX_STACK_DEPTH) {
          stack.push({
            level: newLevel,
            override:
              cls === BidiClass.LRO ? BidiClass.L : cls === BidiClass.RLO ? BidiClass.R : null,
            isolate: false,
          });
        } else {
          overflowEmbeddingCount += 1;
        }
      }
      removed[i] = 1;
      levels[i] = REMOVED_LEVEL;
      continue;
    }

    if (cls === BidiClass.PDF) {
      if (overflowIsolateCount > 0) {
        // ignore
      } else if (overflowEmbeddingCount > 0) {
        overflowEmbeddingCount -= 1;
      } else if (stack.length > 1 && !stack[stack.length - 1]?.isolate) {
        stack.pop();
      }
      removed[i] = 1;
      levels[i] = REMOVED_LEVEL;
      continue;
    }

    if (cls === BidiClass.BN) {
      removed[i] = 1;
      levels[i] = REMOVED_LEVEL;
      continue;
    }

    if (cls === BidiClass.B) {
      levels[i] = paragraphLevel;
      continue;
    }

    if (cls === BidiClass.LRI || cls === BidiClass.RLI) {
      const currentLevel = stack[stack.length - 1]?.level ?? paragraphLevel;
      levels[i] = currentLevel;
      if (overflowIsolateCount > 0) {
        overflowIsolateCount += 1;
        continue;
      }
      const newLevel =
        cls === BidiClass.LRI ? nextEvenLevel(currentLevel) : nextOddLevel(currentLevel);
      if (newLevel <= MAX_LEVEL && stack.length < MAX_STACK_DEPTH) {
        stack.push({ level: newLevel, override: null, isolate: true });
        validIsolateCount += 1;
      } else {
        overflowIsolateCount += 1;
      }
      continue;
    }

    if (cls === BidiClass.PDI) {
      if (overflowIsolateCount > 0) {
        overflowIsolateCount -= 1;
      } else if (validIsolateCount === 0) {
        // no matching isolate, no stack changes
      } else {
        overflowEmbeddingCount = 0;
        while (stack.length > 1) {
          const entry = stack.pop();
          if (entry?.isolate) {
            validIsolateCount -= 1;
            break;
          }
        }
      }
      const entry = stack[stack.length - 1] ?? {
        level: paragraphLevel,
        override: null,
        isolate: false,
      };
      levels[i] = entry.level;
      if (entry.override !== null) {
        types[i] = entry.override;
      }
      continue;
    }

    const currentLevel = stack[stack.length - 1]?.level ?? paragraphLevel;
    levels[i] = currentLevel;
    const override = stack[stack.length - 1]?.override ?? null;
    if (override !== null) {
      types[i] = override;
    }
  }
}

interface LevelRun {
  start: number;
  end: number;
  level: number;
}

function computeLevelRuns(levels: Uint8Array, removed: Uint8Array): LevelRun[] {
  const runs: LevelRun[] = [];
  let i = 0;
  while (i < levels.length) {
    while (i < levels.length && removed[i]) i += 1;
    if (i >= levels.length) break;
    const level = levels[i] ?? 0;
    const start = i;
    let end = i + 1;
    let j = i + 1;
    while (j < levels.length) {
      if (removed[j]) {
        j += 1;
        continue;
      }
      if ((levels[j] ?? 0) !== level) break;
      end = j + 1;
      j += 1;
    }
    runs.push({ start, end, level });
    i = j;
  }
  return runs;
}

function computeIsolatingRunSequences(
  runs: LevelRun[],
  types: Uint8Array,
  isolateEnd: Int32Array,
  isolateStart: Int32Array,
): number[][] {
  const runIndexByPos = new Int32Array(types.length).fill(-1);
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i];
    if (!run) continue;
    for (let idx = run.start; idx < run.end; idx += 1) {
      runIndexByPos[idx] = i;
    }
  }

  const assigned = new Uint8Array(runs.length);
  const sequences: number[][] = [];

  for (let i = 0; i < runs.length; i += 1) {
    if (assigned[i]) continue;
    const run = runs[i];
    if (!run) continue;
    const startIndex = run.start;
    const startType = types[startIndex] as BidiClass;
    const startMatch = isolateStart[startIndex] ?? -1;
    if (startType === BidiClass.PDI && startMatch >= 0) {
      continue;
    }
    const sequence: number[] = [];
    let current = i;
    while (current >= 0 && !assigned[current]) {
      assigned[current] = 1;
      sequence.push(current);
      const currentRun = runs[current];
      if (!currentRun) break;
      const lastIndex = currentRun.end - 1;
      const lastType = types[lastIndex] as BidiClass;
      const match = isolateEnd[lastIndex] ?? -1;
      if (isIsolateInitiator(lastType) && match >= 0) {
        const nextRunIndex = runIndexByPos[match] ?? -1;
        if (nextRunIndex >= 0 && !assigned[nextRunIndex]) {
          current = nextRunIndex;
          continue;
        }
      }
      break;
    }
    sequences.push(sequence);
  }

  return sequences;
}

function buildSequenceIndices(runs: LevelRun[], sequence: number[], removed: Uint8Array): number[] {
  const indices: number[] = [];
  for (const runIndex of sequence) {
    const run = runs[runIndex];
    if (!run) continue;
    for (let i = run.start; i < run.end; i += 1) {
      if (removed[i]) continue;
      indices.push(i);
    }
  }
  return indices;
}

function computePrevNextNonRemoved(removed: Uint8Array): {
  prev: Int32Array;
  next: Int32Array;
} {
  const prev = new Int32Array(removed.length).fill(-1);
  const next = new Int32Array(removed.length).fill(-1);
  let last = -1;
  for (let i = 0; i < removed.length; i += 1) {
    if (!removed[i]) last = i;
    prev[i] = last;
  }
  let nextIndex = -1;
  for (let i = removed.length - 1; i >= 0; i -= 1) {
    if (!removed[i]) nextIndex = i;
    next[i] = nextIndex;
  }
  return { prev, next };
}

function computeSosEos(
  sequenceIndices: number[],
  levels: Uint8Array,
  removed: Uint8Array,
  types: Uint8Array,
  isolateEnd: Int32Array,
  paragraphLevel: number,
  prevNonRemoved: Int32Array,
  nextNonRemoved: Int32Array,
): { sos: BidiClass.L | BidiClass.R; eos: BidiClass.L | BidiClass.R } {
  const firstIndex = sequenceIndices[0] ?? 0;
  const lastIndex = sequenceIndices[sequenceIndices.length - 1] ?? 0;
  const firstLevel = levels[firstIndex] ?? paragraphLevel;
  const prevIndex = firstIndex > 0 ? (prevNonRemoved[firstIndex - 1] ?? -1) : -1;
  const prevLevel = prevIndex >= 0 ? (levels[prevIndex] ?? paragraphLevel) : paragraphLevel;
  const sos = directionFromLevel(Math.max(firstLevel, prevLevel));

  let nextLevel = paragraphLevel;
  const lastType = (types[lastIndex] ?? BidiClass.L) as BidiClass;
  if (!(isIsolateInitiator(lastType) && (isolateEnd[lastIndex] ?? -1) < 0)) {
    const nextIndex = lastIndex + 1 < removed.length ? (nextNonRemoved[lastIndex + 1] ?? -1) : -1;
    nextLevel = nextIndex >= 0 ? (levels[nextIndex] ?? paragraphLevel) : paragraphLevel;
  }
  const lastLevel = levels[lastIndex] ?? paragraphLevel;
  const eos = directionFromLevel(Math.max(lastLevel, nextLevel));

  return { sos, eos };
}

function applyW1(sequence: number[], types: Uint8Array, sos: BidiClass.L | BidiClass.R): void {
  for (let i = 0; i < sequence.length; i += 1) {
    const idx = sequence[i] ?? 0;
    if ((types[idx] as BidiClass) !== BidiClass.NSM) continue;
    const prevIdx = i > 0 ? (sequence[i - 1] ?? -1) : -1;
    const prevType = prevIdx >= 0 ? (types[prevIdx] as BidiClass) : null;
    if (
      prevType === null ||
      prevType === BidiClass.LRI ||
      prevType === BidiClass.RLI ||
      prevType === BidiClass.FSI ||
      prevType === BidiClass.PDI
    ) {
      types[idx] = prevType === null ? sos : BidiClass.ON;
    } else {
      types[idx] = prevType;
    }
  }
}

function applyW2(sequence: number[], types: Uint8Array): void {
  let lastStrong: BidiClass | null = null;
  for (const idx of sequence) {
    const type = types[idx] as BidiClass;
    if (type === BidiClass.L || type === BidiClass.R || type === BidiClass.AL) {
      lastStrong = type;
    }
    if (type === BidiClass.EN && lastStrong === BidiClass.AL) {
      types[idx] = BidiClass.AN;
    }
  }
}

function applyW3(sequence: number[], types: Uint8Array): void {
  for (const idx of sequence) {
    if ((types[idx] as BidiClass) === BidiClass.AL) {
      types[idx] = BidiClass.R;
    }
  }
}

function applyW4(sequence: number[], types: Uint8Array): void {
  for (let i = 0; i < sequence.length; i += 1) {
    const idx = sequence[i] ?? 0;
    const type = types[idx] as BidiClass;
    if (type !== BidiClass.ES && type !== BidiClass.CS) continue;
    const prevIdx = i > 0 ? (sequence[i - 1] ?? -1) : -1;
    const nextIdx = i + 1 < sequence.length ? (sequence[i + 1] ?? -1) : -1;
    const prevType = prevIdx >= 0 ? (types[prevIdx] as BidiClass) : null;
    const nextType = nextIdx >= 0 ? (types[nextIdx] as BidiClass) : null;
    if (type === BidiClass.ES) {
      if (prevType === BidiClass.EN && nextType === BidiClass.EN) {
        types[idx] = BidiClass.EN;
      }
    } else if (type === BidiClass.CS) {
      if (prevType === BidiClass.EN && nextType === BidiClass.EN) {
        types[idx] = BidiClass.EN;
      } else if (prevType === BidiClass.AN && nextType === BidiClass.AN) {
        types[idx] = BidiClass.AN;
      }
    }
  }
}

function applyW5(sequence: number[], types: Uint8Array): void {
  let i = 0;
  while (i < sequence.length) {
    const idx = sequence[i] ?? 0;
    if ((types[idx] as BidiClass) !== BidiClass.ET) {
      i += 1;
      continue;
    }
    const start = i;
    let end = i;
    while (end < sequence.length && (types[sequence[end] ?? 0] as BidiClass) === BidiClass.ET) {
      end += 1;
    }
    const leftIdx = start > 0 ? (sequence[start - 1] ?? -1) : -1;
    const rightIdx = end < sequence.length ? (sequence[end] ?? -1) : -1;
    const leftType = leftIdx >= 0 ? (types[leftIdx] as BidiClass) : null;
    const rightType = rightIdx >= 0 ? (types[rightIdx] as BidiClass) : null;
    if (leftType === BidiClass.EN || rightType === BidiClass.EN) {
      for (let j = start; j < end; j += 1) {
        const target = sequence[j] ?? 0;
        types[target] = BidiClass.EN;
      }
    }
    i = end;
  }
}

function applyW6(sequence: number[], types: Uint8Array): void {
  for (const idx of sequence) {
    const type = types[idx] as BidiClass;
    if (type === BidiClass.ET || type === BidiClass.ES || type === BidiClass.CS) {
      types[idx] = BidiClass.ON;
    }
  }
}

function applyW7(sequence: number[], types: Uint8Array, sos: BidiClass.L | BidiClass.R): void {
  let lastStrong: BidiClass | null = sos;
  for (const idx of sequence) {
    const type = types[idx] as BidiClass;
    if (type === BidiClass.L || type === BidiClass.R) {
      lastStrong = type;
      continue;
    }
    if (type === BidiClass.EN && lastStrong === BidiClass.L) {
      types[idx] = BidiClass.L;
    }
  }
}

function strongDirectionForN0(type: BidiClass): BidiClass.L | BidiClass.R | null {
  if (type === BidiClass.L) return BidiClass.L;
  if (type === BidiClass.R || type === BidiClass.EN || type === BidiClass.AN) return BidiClass.R;
  return null;
}

function applyN0(
  sequence: number[],
  types: Uint8Array,
  codePoints: number[],
  nsmBeforeW1: Uint8Array,
  sos: BidiClass.L | BidiClass.R,
  embeddingDirection: BidiClass.L | BidiClass.R,
  decisions?: Array<{
    open: number;
    close: number;
    foundMatch: boolean;
    foundStrong: boolean;
    prevDir?: number;
    startPos?: number;
    endPos?: number;
    scanDirs?: Array<number | null>;
  }>,
): Array<[number, number]> {
  const position = new Int32Array(types.length).fill(-1);
  for (let i = 0; i < sequence.length; i += 1) {
    position[sequence[i] ?? 0] = i;
  }

  const stack: { pair: number; index: number }[] = [];
  const pairs: Array<[number, number]> = [];

  for (const idx of sequence) {
    if ((types[idx] as BidiClass) !== BidiClass.ON) continue;
    const cp = codePoints[idx] ?? 0;
    const bracketType = getBidiBracketType(cp);
    if (bracketType === BidiBracketType.Open) {
      if (stack.length >= MAX_BRACKET_DEPTH) {
        pairs.length = 0;
        break;
      }
      const pair = getBidiBracketPair(cp);
      stack.push({ pair: bracketEquivalence(pair), index: idx });
    } else if (bracketType === BidiBracketType.Close) {
      const closeEquiv = bracketEquivalence(cp);
      for (let s = stack.length - 1; s >= 0; s -= 1) {
        if (stack[s]?.pair === closeEquiv) {
          pairs.push([stack[s]?.index ?? idx, idx]);
          stack.length = s;
          break;
        }
      }
    }
  }

  pairs.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));

  const changed = new Map<number, BidiClass.L | BidiClass.R>();

  for (const [openIndex, closeIndex] of pairs) {
    const startPos = position[openIndex] ?? -1;
    const endPos = position[closeIndex] ?? -1;
    if (startPos < 0 || endPos < 0 || endPos <= startPos) continue;
    let foundMatch = false;
    let foundStrong = false;
    const scanDirs: Array<number | null> = [];
    for (let pos = startPos + 1; pos < endPos; pos += 1) {
      const idx = sequence[pos] ?? 0;
      const dir = strongDirectionForN0(types[idx] as BidiClass);
      scanDirs.push(dir);
      if (dir === null) continue;
      if (dir === embeddingDirection) {
        foundMatch = true;
        break;
      }
      foundStrong = true;
    }

    if (foundMatch) {
      types[openIndex] = embeddingDirection;
      types[closeIndex] = embeddingDirection;
      changed.set(openIndex, embeddingDirection);
      changed.set(closeIndex, embeddingDirection);
      if (decisions) {
        decisions.push({
          open: openIndex,
          close: closeIndex,
          foundMatch,
          foundStrong,
          startPos,
          endPos,
          scanDirs,
        });
      }
      continue;
    }

    if (foundStrong) {
      let prevDir: BidiClass.L | BidiClass.R = sos;
      for (let pos = startPos - 1; pos >= 0; pos -= 1) {
        const idx = sequence[pos] ?? 0;
        const dir = strongDirectionForN0(types[idx] as BidiClass);
        if (dir !== null) {
          prevDir = dir;
          break;
        }
      }
      if (prevDir === embeddingDirection) {
        types[openIndex] = embeddingDirection;
        types[closeIndex] = embeddingDirection;
        changed.set(openIndex, embeddingDirection);
        changed.set(closeIndex, embeddingDirection);
      } else {
        types[openIndex] = prevDir;
        types[closeIndex] = prevDir;
        changed.set(openIndex, prevDir);
        changed.set(closeIndex, prevDir);
      }
      if (decisions) {
        decisions.push({
          open: openIndex,
          close: closeIndex,
          foundMatch,
          foundStrong,
          prevDir,
          startPos,
          endPos,
          scanDirs,
        });
      }
      continue;
    }
    if (decisions) {
      decisions.push({
        open: openIndex,
        close: closeIndex,
        foundMatch,
        foundStrong,
        startPos,
        endPos,
        scanDirs,
      });
    }
  }

  for (const [idx, dir] of changed.entries()) {
    let pos = (position[idx] ?? -1) + 1;
    while (pos >= 0 && pos < sequence.length) {
      const nextIdx = sequence[pos] ?? 0;
      if (!nsmBeforeW1[nextIdx]) break;
      types[nextIdx] = dir;
      pos += 1;
    }
  }

  return pairs;
}

function applyN1N2(
  sequence: number[],
  types: Uint8Array,
  levels: Uint8Array,
  sos: BidiClass.L | BidiClass.R,
  eos: BidiClass.L | BidiClass.R,
): void {
  const effectiveStrong = (cls: BidiClass): BidiClass.L | BidiClass.R | null => {
    if (cls === BidiClass.L) return BidiClass.L;
    if (cls === BidiClass.R || cls === BidiClass.AN || cls === BidiClass.EN) return BidiClass.R;
    return null;
  };

  let i = 0;
  while (i < sequence.length) {
    const idx = sequence[i] ?? 0;
    const type = types[idx] as BidiClass;
    if (!isNeutralOrIsolate(type)) {
      i += 1;
      continue;
    }
    const start = i;
    let end = i + 1;
    while (end < sequence.length && isNeutralOrIsolate(types[sequence[end] ?? 0] as BidiClass)) {
      end += 1;
    }

    let leftDir: BidiClass.L | BidiClass.R = sos;
    for (let j = start - 1; j >= 0; j -= 1) {
      const prevType = types[sequence[j] ?? 0] as BidiClass;
      const dir = effectiveStrong(prevType);
      if (dir !== null) {
        leftDir = dir;
        break;
      }
    }

    let rightDir: BidiClass.L | BidiClass.R = eos;
    for (let j = end; j < sequence.length; j += 1) {
      const nextType = types[sequence[j] ?? 0] as BidiClass;
      const dir = effectiveStrong(nextType);
      if (dir !== null) {
        rightDir = dir;
        break;
      }
    }

    if (leftDir === rightDir) {
      for (let j = start; j < end; j += 1) {
        types[sequence[j] ?? 0] = leftDir;
      }
    } else {
      for (let j = start; j < end; j += 1) {
        const target = sequence[j] ?? 0;
        const embeddingDir = directionFromLevel(levels[target] ?? 0);
        types[target] = embeddingDir;
      }
    }
    i = end;
  }
}

function applyI1I2(sequence: number[], types: Uint8Array, levels: Uint8Array): void {
  for (const idx of sequence) {
    const level = levels[idx];
    if (level === undefined || level === REMOVED_LEVEL) continue;
    const type = types[idx] as BidiClass;
    if (level % 2 === 0) {
      if (type === BidiClass.R) {
        levels[idx] = level + 1;
      } else if (type === BidiClass.EN || type === BidiClass.AN) {
        levels[idx] = level + 2;
      }
    } else {
      if (type === BidiClass.L) {
        levels[idx] = level + 1;
      } else if (type === BidiClass.EN || type === BidiClass.AN) {
        levels[idx] = level + 1;
      }
    }
  }
}

function applyL1(
  levels: Uint8Array,
  removed: Uint8Array,
  originalTypes: Uint8Array,
  paragraphLevel: number,
): void {
  const isWhitespaceOrIsolate = (cls: BidiClass): boolean =>
    cls === BidiClass.WS ||
    cls === BidiClass.LRI ||
    cls === BidiClass.RLI ||
    cls === BidiClass.FSI ||
    cls === BidiClass.PDI;

  for (let i = 0; i < originalTypes.length; i += 1) {
    if (removed[i]) continue;
    const cls = originalTypes[i] as BidiClass;
    if (cls === BidiClass.B || cls === BidiClass.S) {
      levels[i] = paragraphLevel;
      let j = i - 1;
      while (j >= 0) {
        if (removed[j]) {
          j -= 1;
          continue;
        }
        if (!isWhitespaceOrIsolate(originalTypes[j] as BidiClass)) break;
        levels[j] = paragraphLevel;
        j -= 1;
      }
    }
  }

  let k = originalTypes.length - 1;
  while (k >= 0) {
    if (removed[k]) {
      k -= 1;
      continue;
    }
    const cls = originalTypes[k] as BidiClass;
    if (isWhitespaceOrIsolate(cls)) {
      levels[k] = paragraphLevel;
      k -= 1;
      continue;
    }
    break;
  }
}

function buildRuns(
  levels: Uint8Array,
  removed: Uint8Array,
  codeUnitStarts: number[],
  textLength: number,
): BidiRun[] {
  const runs: BidiRun[] = [];
  let i = 0;
  while (i < levels.length) {
    if (removed[i]) {
      i += 1;
      continue;
    }
    const level = levels[i] ?? 0;
    const start = i;
    i += 1;
    while (i < levels.length && !removed[i] && levels[i] === level) {
      i += 1;
    }
    const end = i;
    const startCU = codeUnitStarts[start] ?? textLength;
    const endCU = end < codeUnitStarts.length ? (codeUnitStarts[end] ?? textLength) : textLength;
    runs.push({ level, start, end, startCU, endCU });
  }
  return runs;
}

function reorderVisual(levels: Uint8Array, removed: Uint8Array): Uint32Array {
  const order: number[] = [];
  let maxLevel = 0;
  let minLevel = Number.POSITIVE_INFINITY;
  for (let i = 0; i < levels.length; i += 1) {
    if (removed[i]) continue;
    const level = levels[i] ?? 0;
    order.push(i);
    if (level > maxLevel) maxLevel = level;
    if (level < minLevel) minLevel = level;
  }
  if (order.length === 0) return new Uint32Array();
  let minOdd = minLevel;
  if (minOdd % 2 === 0) minOdd += 1;
  for (let level = maxLevel; level >= minOdd; level -= 1) {
    let i = 0;
    while (i < order.length) {
      const idx = order[i] ?? 0;
      if ((levels[idx] ?? 0) < level) {
        i += 1;
        continue;
      }
      const start = i;
      i += 1;
      while (i < order.length && (levels[order[i] ?? 0] ?? 0) >= level) {
        i += 1;
      }
      let left = start;
      let right = i - 1;
      while (left < right) {
        const leftValue = order[left];
        order[left] = order[right] ?? 0;
        order[right] = leftValue ?? 0;
        left += 1;
        right -= 1;
      }
    }
  }
  return new Uint32Array(order);
}

/**
 * Resolve bidi ordering and embedding levels.
 * Units: bytes (UTF-8).
 * Units: UTF-16 code units.
 * Units: Unicode scalar values.
 */
export function resolveBidi(input: TextInput, options: BidiOptions = {}): BidiResolution {
  const { text } = normalizeInput(input);
  const normalizedOptions = normalizeOptions(options);
  const algorithm = {
    name: "UAX9.Bidi",
    spec: UAX9_SPEC,
    revisionOrDate: DEFAULT_ALGORITHM_REVISION,
    implementationId: IMPLEMENTATION_ID,
  };
  const provenance = createProvenance(algorithm, normalizedOptions, {
    text: "utf16-code-unit",
    token: "uax9-bidi",
    bidi: "uax9-bidi",
  });

  const { codePoints, codeUnitStarts } = collectCodePoints(text);
  const count = codePoints.length;
  const classes = new Uint8Array(count);
  const bidiControlSpans: Span[] = [];
  let hasBidiControls = false;

  for (let i = 0; i < count; i += 1) {
    const cp = codePoints[i] ?? 0;
    const cls = bidiClassAt(cp);
    classes[i] = cls;
    if (isBidiControlCodePoint(cp)) {
      hasBidiControls = true;
      const startCU = codeUnitStarts[i] ?? text.length;
      const endCU = startCU + (cp > 0xffff ? 2 : 1);
      bidiControlSpans.push({ startCU, endCU });
    }
  }

  const isolateEnd = new Int32Array(count).fill(-1);
  const isolateStart = new Int32Array(count).fill(-1);
  computeIsolatePairs(classes, isolateEnd, isolateStart);

  const paragraphLevel = determineParagraphLevel(classes, isolateEnd, normalizedOptions);
  const types = new Uint8Array(count);
  types.set(classes);
  const levels = new Uint8Array(count);
  const removed = new Uint8Array(count);
  applyExplicitLevels(classes, types, levels, removed, isolateEnd, paragraphLevel);
  const nsmBeforeW1 = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    if ((types[i] as BidiClass) === BidiClass.NSM) nsmBeforeW1[i] = 1;
  }
  const baseLevels = levels.slice();

  const runs = computeLevelRuns(baseLevels, removed);
  const sequences = computeIsolatingRunSequences(runs, types, isolateEnd, isolateStart);
  const { prev, next } = computePrevNextNonRemoved(removed);
  const debugInfo = normalizedOptions.debug
    ? {
        sequences: [] as Array<{
          indices: number[];
          typesAfterW7: number[];
          bracketPairs?: Array<[number, number]>;
        }>,
      }
    : undefined;

  for (const sequence of sequences) {
    const sequenceIndices = buildSequenceIndices(runs, sequence, removed);
    if (sequenceIndices.length === 0) continue;
    const { sos, eos } = computeSosEos(
      sequenceIndices,
      baseLevels,
      removed,
      types,
      isolateEnd,
      paragraphLevel,
      prev,
      next,
    );
    applyW1(sequenceIndices, types, sos);
    applyW2(sequenceIndices, types);
    applyW3(sequenceIndices, types);
    applyW4(sequenceIndices, types);
    applyW5(sequenceIndices, types);
    applyW6(sequenceIndices, types);
    applyW7(sequenceIndices, types, sos);
    const typesSnapshot = debugInfo ? sequenceIndices.map((idx) => types[idx] ?? 0) : undefined;
    let bracketPairs: Array<[number, number]> | undefined;
    const decisions = debugInfo ? [] : undefined;
    const embeddingDirection = directionFromLevel(
      baseLevels[sequenceIndices[0] ?? 0] ?? paragraphLevel,
    );
    if (normalizedOptions.useBracketPairs) {
      bracketPairs = applyN0(
        sequenceIndices,
        types,
        codePoints,
        nsmBeforeW1,
        sos,
        embeddingDirection,
        decisions,
      );
    } else if (debugInfo) {
      bracketPairs = [];
    }
    const typesAfterN0 = debugInfo ? sequenceIndices.map((idx) => types[idx] ?? 0) : undefined;
    applyN1N2(sequenceIndices, types, levels, sos, eos);
    const typesAfterN1N2 = debugInfo ? sequenceIndices.map((idx) => types[idx] ?? 0) : undefined;
    applyI1I2(sequenceIndices, types, levels);
    if (debugInfo) {
      const entry: {
        indices: number[];
        typesAfterW7: number[];
        typesAfterN0?: number[];
        typesAfterN1N2?: number[];
        bracketPairs?: Array<[number, number]>;
        decisions?: Array<{
          open: number;
          close: number;
          foundMatch: boolean;
          foundStrong: boolean;
          prevDir?: number;
        }>;
        embeddingDirection?: number;
        sos?: number;
        eos?: number;
      } = {
        indices: sequenceIndices.slice(),
        typesAfterW7: typesSnapshot ?? [],
      };
      if (bracketPairs) entry.bracketPairs = bracketPairs;
      if (typesAfterN0) entry.typesAfterN0 = typesAfterN0;
      if (typesAfterN1N2) entry.typesAfterN1N2 = typesAfterN1N2;
      entry.embeddingDirection = embeddingDirection;
      entry.sos = sos;
      entry.eos = eos;
      if (decisions) entry.decisions = decisions;
      debugInfo.sequences.push(entry);
    }
  }

  applyL1(levels, removed, classes, paragraphLevel);

  for (let i = 0; i < removed.length; i += 1) {
    if (removed[i]) levels[i] = REMOVED_LEVEL;
  }

  const runsResolved = buildRuns(levels, removed, codeUnitStarts, text.length);
  const visualOrder = reorderVisual(levels, removed);

  const resolution: BidiResolution = {
    paragraphLevel,
    levels,
    runs: runsResolved,
    visualOrder,
    hasBidiControls,
    bidiControlSpans,
    provenance,
  };
  if (debugInfo) resolution.debug = debugInfo;

  return resolution;
}

/**
 * Detect presence of bidi control code points in text.
 * Units: bytes (UTF-8).
 */
export function hasBidiControls(input: TextInput): boolean {
  const { text } = normalizeInput(input);
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) ?? 0;
    if (isBidiControlCodePoint(cp)) return true;
    i += cp > 0xffff ? 2 : 1;
  }
  return false;
}
