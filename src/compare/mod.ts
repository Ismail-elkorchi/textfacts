export type { Token, TokenizerId, CanonicalKeyId, TokenizeOptions, Materialize } from "./tokens.ts";
export { iterTokenSpans } from "./tokens.ts";
export { tokenizeForComparison } from "./tokens.ts";
export type { Edit, EditScript, TextDiff, TokenEdit, TextDiffSummary } from "../diff/types.ts";
export { diffSequence } from "../diff/myers.ts";
export type { DiffOptions } from "../diff/myers.ts";
export { diffText, compareTextsDetailed } from "../diff/text-diff.ts";
export type {
  TextDiffOptions,
  CompareTextsOptions,
  CompareTextsResult,
} from "../diff/text-diff.ts";
export type {
  Fingerprint,
  WinnowingOptions,
  WinnowingResult,
  WinnowingDedupe,
} from "../fingerprint/winnowing.ts";
export { winnowingFingerprints, fingerprintSet } from "../fingerprint/winnowing.ts";
export { jaccard, containment, overlapCount } from "../fingerprint/metrics.ts";
export type { FingerprintIndexOptions, FingerprintIndex } from "../corpus/fingerprint-index.ts";
export { buildFingerprintIndex } from "../corpus/fingerprint-index.ts";
export type {
  SurfaceProfile,
  SurfaceProfileOptions,
  NgramProfile,
  NgramCount,
  CategoryCount,
  ScriptCount,
  LengthHistogram,
  LengthHistogramBin,
} from "../profile/surface-profile.ts";
export { surfaceProfile, surfaceProfileBuilder } from "../profile/surface-profile.ts";
export type { ProfileComparison, NgramComparison, Ratio } from "../profile/compare.ts";
export { compareProfiles } from "../profile/compare.ts";
