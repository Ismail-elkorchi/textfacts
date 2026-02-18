export interface Rng {
  nextU32(): number;
  nextU64BigInt(): bigint;
  int(min: number, max: number): number;
  choice<T>(items: readonly T[]): T;
}

const MASK_64 = (1n << 64n) - 1n;

function fnv1a64Utf16(input: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & MASK_64;
  }
  return hash & MASK_64;
}

function splitmix64(state: bigint): { state: bigint; value: bigint } {
  const next = (state + 0x9e3779b97f4a7c15n) & MASK_64;
  let mixValue = next;
  mixValue = (mixValue ^ (mixValue >> 30n)) * 0xbf58476d1ce4e5b9n;
  mixValue &= MASK_64;
  mixValue = (mixValue ^ (mixValue >> 27n)) * 0x94d049bb133111ebn;
  mixValue &= MASK_64;
  mixValue = mixValue ^ (mixValue >> 31n);
  return { state: next, value: mixValue & MASK_64 };
}

export function makeRng(seed: bigint | string): Rng {
  const seedValue = typeof seed === "bigint" ? seed : fnv1a64Utf16(seed);
  let splitmixState = seedValue & MASK_64;
  const splitA = splitmix64(splitmixState);
  splitmixState = splitA.state;
  const splitB = splitmix64(splitmixState);
  let state0 = splitA.value & MASK_64;
  let state1 = splitB.value & MASK_64;

  const nextU64BigInt = () => {
    let mixedState = state0;
    const carryState = state1;
    state0 = carryState;
    mixedState ^= (mixedState << 23n) & MASK_64;
    state1 = (mixedState ^ carryState ^ (mixedState >> 17n) ^ (carryState >> 26n)) & MASK_64;
    return (state1 + carryState) & MASK_64;
  };

  const nextU32 = () => Number(nextU64BigInt() & 0xffffffffn);

  const int = (min: number, max: number) => {
    const minBound = Math.min(min, max);
    const maxBound = Math.max(min, max);
    const span = maxBound - minBound + 1;
    if (span <= 1) return minBound;
    return minBound + (nextU32() % span);
  };

  const choice = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error("rng.choice requires a non-empty array");
    }
    return items[int(0, items.length - 1)] as T;
  };

  return { nextU32, nextU64BigInt, int, choice };
}
