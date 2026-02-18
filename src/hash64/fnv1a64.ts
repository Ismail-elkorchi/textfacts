import { TextfactsError } from "../core/error.ts";

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function clamp64(value: bigint): bigint {
  return value & MASK_64;
}

/**
 * FNV-1a 64-bit over UTF-16 code units.
 * Each code unit is processed as two bytes, little-endian (low byte, high byte).
 */
export function fnv1a64Utf16(text: string): bigint {
  return fnv1a64Utf16Span(text, 0, text.length);
}

/**
 * Hash a UTF-16 code unit span with FNV-1a 64.
 * Units: UTF-16 code units.
 */
export function fnv1a64Utf16Span(text: string, startCU: number, endCU: number): bigint {
  let hash = FNV_OFFSET;
  const start = Math.max(0, startCU);
  const end = Math.min(endCU, text.length);
  for (let index = start; index < end; index += 1) {
    const codeUnit = text.charCodeAt(index);
    const lowByte = codeUnit & 0xff;
    const highByte = codeUnit >> 8;
    hash ^= BigInt(lowByte);
    hash = clamp64(hash * FNV_PRIME);
    hash ^= BigInt(highByte);
    hash = clamp64(hash * FNV_PRIME);
  }
  return hash;
}

/**
 * FNV-1a 64-bit over raw bytes.
 * Units: bytes (binary).
 */
export function fnv1a64Bytes(bytes: Uint8Array): bigint {
  let hash = FNV_OFFSET;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = clamp64(hash * FNV_PRIME);
  }
  return hash;
}

/**
 * formatU64Hex executes a deterministic operation in this module.
 */
export function formatU64Hex(value: bigint): string {
  if (value < 0n || value > MASK_64) {
    throw new TextfactsError("HASH64_INVALID_HEX", "Value is outside uint64 range", {
      value: value.toString(),
    });
  }
  return value.toString(16).padStart(16, "0");
}

/**
 * parseU64Hex executes a deterministic operation in this module.
 */
export function parseU64Hex(hex: string): bigint {
  if (!/^[0-9a-fA-F]{16}$/.test(hex)) {
    throw new TextfactsError("HASH64_INVALID_HEX", "Expected 16 hex characters", { hex });
  }
  const value = BigInt(`0x${hex}`);
  if (value < 0n || value > MASK_64) {
    throw new TextfactsError("HASH64_INVALID_HEX", "Hex value outside uint64 range", { hex });
  }
  return value;
}

/**
 * FNV1A64_MASK is an exported constant used by public APIs.
 */
export const FNV1A64_MASK = MASK_64;
