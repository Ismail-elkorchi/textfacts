import { TextfactsError } from "../core/error.ts";
import { hash64Text } from "../hash64/hash64.ts";
import type { Hash64AlgoId } from "../hash64/types.ts";

/**
 * Hash128 defines an exported type contract.
 */
export type Hash128 = readonly [bigint, bigint];

/**
 * hash128Text executes a deterministic operation in this module.
 */
export function hash128Text(
  text: string,
  opts: { left: Hash64AlgoId; right: Hash64AlgoId },
): Hash128 {
  const left = hash64Text(text, { algo: opts.left });
  const right = hash64Text(text, { algo: opts.right });
  return [left, right];
}

/**
 * formatHash128Hex executes a deterministic operation in this module.
 */
export function formatHash128Hex(hash: Hash128): string {
  const [left, right] = hash;
  return `${left.toString(16).padStart(16, "0")}${right.toString(16).padStart(16, "0")}`.toLowerCase();
}

/**
 * parseHash128Hex executes a deterministic operation in this module.
 */
export function parseHash128Hex(hex: string): Hash128 {
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new TextfactsError("HASH128_INVALID_HEX", "Expected 32 hex characters", { hex });
  }
  const left = BigInt(`0x${hex.slice(0, 16)}`);
  const right = BigInt(`0x${hex.slice(16)}`);
  return [left, right];
}
