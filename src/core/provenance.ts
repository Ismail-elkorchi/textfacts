import { UNICODE_VERSION } from "../unicode/version.ts";
import { canonicalModelStringify } from "./canonical.ts";
import { fnv1a32 } from "./hash.ts";
import type { AlgorithmInfo, Provenance } from "./types.ts";

/**
 * createProvenance executes a deterministic operation in this module.
 */
export function createProvenance(
  algorithm: AlgorithmInfo,
  options: unknown,
  units: Provenance["units"],
): Provenance {
  const normalized = canonicalModelStringify(options ?? {});
  const configHash = fnv1a32(normalized);
  return {
    unicodeVersion: UNICODE_VERSION,
    algorithm,
    configHash,
    units,
  };
}
