import { utf8Bytes } from "./encoding.ts";

const MASK64 = 0xffffffffffffffffn;

const PRIME64_1 = 0x9e3779b185ebca87n;
const PRIME64_2 = 0xc2b2ae3d27d4eb4fn;
const PRIME64_3 = 0x165667b19e3779f9n;
const PRIME64_4 = 0x85ebca77c2b2ae63n;
const PRIME64_5 = 0x27d4eb2f165667c5n;

function add64(a: bigint, b: bigint): bigint {
  return (a + b) & MASK64;
}

function sub64(a: bigint, b: bigint): bigint {
  return (a - b) & MASK64;
}

function mul64(a: bigint, b: bigint): bigint {
  return (a * b) & MASK64;
}

function rotl64(value: bigint, count: number): bigint {
  const c = BigInt(count & 63);
  return ((value << c) | (value >> (64n - c))) & MASK64;
}

function readU64LE(bytes: Uint8Array, offset: number): bigint {
  let result = 0n;
  for (let i = 0; i < 8; i += 1) {
    result |= BigInt(bytes[offset + i] ?? 0) << BigInt(8 * i);
  }
  return result;
}

function readU32LE(bytes: Uint8Array, offset: number): bigint {
  let result = 0n;
  for (let i = 0; i < 4; i += 1) {
    result |= BigInt(bytes[offset + i] ?? 0) << BigInt(8 * i);
  }
  return result;
}

function round(acc: bigint, lane: bigint): bigint {
  let value = add64(acc, mul64(lane, PRIME64_2));
  value = rotl64(value, 31);
  return mul64(value, PRIME64_1);
}

function mergeAccumulator(acc: bigint, lane: bigint): bigint {
  let value = acc ^ round(0n, lane);
  value = mul64(value, PRIME64_1);
  return add64(value, PRIME64_4);
}

/**
 * XXH64 over raw bytes.
 * Units: bytes (binary).
 */
export function xxh64Bytes(bytes: Uint8Array, seed = 0n): bigint {
  const length = bytes.length;
  let offset = 0;
  let acc: bigint;

  if (length >= 32) {
    let acc1 = add64(add64(seed, PRIME64_1), PRIME64_2);
    let acc2 = add64(seed, PRIME64_2);
    let acc3 = seed & MASK64;
    let acc4 = sub64(seed, PRIME64_1);

    const limit = length - 32;
    while (offset <= limit) {
      acc1 = round(acc1, readU64LE(bytes, offset));
      acc2 = round(acc2, readU64LE(bytes, offset + 8));
      acc3 = round(acc3, readU64LE(bytes, offset + 16));
      acc4 = round(acc4, readU64LE(bytes, offset + 24));
      offset += 32;
    }

    acc = add64(rotl64(acc1, 1), rotl64(acc2, 7));
    acc = add64(acc, rotl64(acc3, 12));
    acc = add64(acc, rotl64(acc4, 18));
    acc = mergeAccumulator(acc, acc1);
    acc = mergeAccumulator(acc, acc2);
    acc = mergeAccumulator(acc, acc3);
    acc = mergeAccumulator(acc, acc4);
  } else {
    acc = add64(seed, PRIME64_5);
  }

  acc = add64(acc, BigInt(length));

  const remaining = length - offset;
  let remainingOffset = offset;
  let remainingLength = remaining;

  while (remainingLength >= 8) {
    const lane = readU64LE(bytes, remainingOffset);
    acc = acc ^ round(0n, lane);
    acc = mul64(rotl64(acc, 27), PRIME64_1);
    acc = add64(acc, PRIME64_4);
    remainingOffset += 8;
    remainingLength -= 8;
  }

  if (remainingLength >= 4) {
    const lane = readU32LE(bytes, remainingOffset);
    acc = acc ^ mul64(lane, PRIME64_1);
    acc = mul64(rotl64(acc, 23), PRIME64_2);
    acc = add64(acc, PRIME64_3);
    remainingOffset += 4;
    remainingLength -= 4;
  }

  while (remainingLength >= 1) {
    const lane = BigInt(bytes[remainingOffset] ?? 0);
    acc = acc ^ mul64(lane, PRIME64_5);
    acc = mul64(rotl64(acc, 11), PRIME64_1);
    remainingOffset += 1;
    remainingLength -= 1;
  }

  acc = acc ^ (acc >> 33n);
  acc = mul64(acc, PRIME64_2);
  acc = acc ^ (acc >> 29n);
  acc = mul64(acc, PRIME64_3);
  acc = acc ^ (acc >> 32n);

  return acc & MASK64;
}

/**
 * xxh64Utf8 executes a deterministic operation in this module.
 */
export function xxh64Utf8(text: string, seed = 0n): bigint {
  return xxh64Bytes(utf8Bytes(text), seed);
}
