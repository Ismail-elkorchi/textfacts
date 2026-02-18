/**
 * UcaStrength defines an exported type contract.
 */
export type UcaStrength = 1 | 2 | 3 | 4;
/**
 * UcaAlternate defines an exported type contract.
 */
export type UcaAlternate = "non-ignorable" | "shifted";
/**
 * UcaNormalization defines an exported type contract.
 */
export type UcaNormalization = "nfd" | "none";
/**
 * UcaIllFormed defines an exported type contract.
 */
export type UcaIllFormed = "error" | "replace" | "implicit";

/**
 * UcaOptions defines an exported structural contract.
 */
export interface UcaOptions {
  strength?: UcaStrength;
  alternate?: UcaAlternate;
  normalization?: UcaNormalization;
  illFormed?: UcaIllFormed;
  includeIdenticalLevel?: boolean;
}

/**
 * UcaFoldOptions defines an exported structural contract.
 */
export interface UcaFoldOptions {
  strength: UcaStrength;
  alternate?: UcaAlternate;
  normalization?: UcaNormalization;
  illFormed?: UcaIllFormed;
}
