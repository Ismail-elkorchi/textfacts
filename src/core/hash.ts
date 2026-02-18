import { canonicalModelStringify } from "./canonical.ts";

/**
 * fnv1a32 executes a deterministic operation in this module.
 */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `fnv1a32:${hex}`;
}

/**
 * hashCanonicalSync executes a deterministic operation in this module.
 */
export function hashCanonicalSync(value: unknown): string {
  return fnv1a32(canonicalModelStringify(value));
}

/**
 * sha256Hex executes a deterministic operation in this module.
 */
export async function sha256Hex(input: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return `sha256-unavailable:${fnv1a32(input)}`;
  }
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `sha256:${hex}`;
}
