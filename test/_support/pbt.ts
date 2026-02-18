import type { Rng } from "./prng.ts";
import { makeRng } from "./prng.ts";

export type Generator<T> = (rng: Rng, size: number) => T;
export type Property<T> = (value: T) => boolean | undefined;

export interface EvalPropertyConfig<T> {
  name: string;
  seed: bigint | string;
  runs: number;
  gen: Generator<T>;
  property: Property<T>;
}

export function getEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get: (envKey: string) => string | undefined } } })
    .Deno;
  if (deno?.env?.get) {
    try {
      return deno.env.get(name);
    } catch {
      return undefined;
    }
  }
  const globalProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  if (globalProcess?.env) {
    try {
      return globalProcess.env[name];
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function getPbtRuns(defaultRuns = 100): number {
  const raw = getEnv("TEXTFACTS_PBT_RUNS");
  if (!raw) return defaultRuns;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultRuns;
}

export function getPbtSeed(defaultSeed = "textfacts-pbt-v1"): string {
  return getEnv("TEXTFACTS_PBT_SEED") ?? defaultSeed;
}

function formatStringForError(value: string, limit = 160): string {
  const truncated = value.length > limit ? `${value.slice(0, limit)}…` : value;
  const codeUnits = Array.from(truncated, (char) =>
    char.charCodeAt(0).toString(16).padStart(4, "0"),
  );
  return `"${truncated.replace(/\n/g, "\\n")}" (cu=[${codeUnits.join(" ")}])`;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return formatStringForError(value);
  if (Array.isArray(value)) return `array(len=${value.length}) ${JSON.stringify(value)}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function shrinkString(value: string, fails: (candidateValue: string) => boolean): string {
  let current = value;
  let changed = true;
  while (changed) {
    changed = false;
    const len = current.length;
    if (len === 0) return current;

    const half = Math.floor(len / 2);
    const candidates: string[] = [];
    if (half > 0) {
      candidates.push(current.slice(0, half));
      candidates.push(current.slice(len - half));
    }
    candidates.push("");
    if (len > 1) {
      candidates.push(current.slice(0, len - 1));
      candidates.push(current.slice(1));
    }
    const maxRemove = Math.min(len, 16);
    for (let index = 0; index < maxRemove; index += 1) {
      candidates.push(current.slice(0, index) + current.slice(index + 1));
    }

    for (const candidate of candidates) {
      if (candidate === current) continue;
      if (fails(candidate)) {
        current = candidate;
        changed = true;
        break;
      }
    }

    if (changed) continue;

    const replacements = ["", "a", "\u0000"];
    for (let index = 0; index < Math.min(len, 24); index += 1) {
      for (const rep of replacements) {
        const candidate = current.slice(0, index) + rep + current.slice(index + 1);
        if (candidate === current) continue;
        if (fails(candidate)) {
          current = candidate;
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return current;
}

function shrinkArray<T>(
  value: readonly T[],
  fails: (candidateValue: readonly T[]) => boolean,
): T[] {
  let current = value.slice();
  let changed = true;
  while (changed) {
    changed = false;
    const len = current.length;
    if (len === 0) return current;

    const half = Math.floor(len / 2);
    const candidates: T[][] = [];
    if (half > 0) {
      candidates.push(current.slice(0, half));
      candidates.push(current.slice(len - half));
    }
    candidates.push([]);
    if (len > 1) {
      candidates.push(current.slice(0, len - 1));
      candidates.push(current.slice(1));
    }
    for (let index = 0; index < Math.min(len, 16); index += 1) {
      candidates.push([...current.slice(0, index), ...current.slice(index + 1)]);
    }

    for (const candidate of candidates) {
      if (candidate.length === current.length) continue;
      if (fails(candidate)) {
        current = candidate;
        changed = true;
        break;
      }
    }
  }
  return current;
}

function minimize<T>(value: T, fails: (candidateValue: T) => boolean): T {
  if (typeof value === "string") {
    return shrinkString(value, (candidateValue) => fails(candidateValue as T)) as T;
  }
  if (Array.isArray(value)) {
    return shrinkArray(value, (candidateValue) => fails(candidateValue as T)) as T;
  }
  return value;
}

export function evalProperty<T>({ name, seed, runs, gen, property }: EvalPropertyConfig<T>): void {
  const rng = makeRng(seed);
  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const size = Math.max(4, (runIndex % 64) + 1);
    const value = gen(rng, size);
    let isPassing = true;
    try {
      const result = property(value);
      if (result === false) isPassing = false;
    } catch {
      isPassing = false;
    }
    if (!isPassing) {
      const minimized = minimize(value, (candidateValue) => {
        try {
          const result = property(candidateValue);
          return result === false;
        } catch {
          return true;
        }
      });
      throw new Error(
        `[PBT] ${name} failed\nseed=${String(seed)} run=${runIndex}\ncounterexample=${formatValue(
          minimized,
        )}`,
      );
    }
  }
}
