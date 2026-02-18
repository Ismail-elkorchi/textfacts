import type { Provenance, Span } from "../core/types.ts";

/**
 * IdnaErrorCode defines an exported type contract.
 */
export type IdnaErrorCode =
  | "EMPTY_LABEL"
  | "LEADING_HYPHEN"
  | "TRAILING_HYPHEN"
  | "HYPHEN_3_4"
  | "LABEL_TOO_LONG"
  | "DOMAIN_TOO_LONG"
  | "INVALID_ACE_PREFIX"
  | "PUNYCODE_ERROR"
  | "DISALLOWED"
  | "BIDI_RULE"
  | "JOINER_RULE"
  | "STD3_DISALLOWED"
  | "DOT_EQUIVALENT"
  | "ILL_FORMED_UNICODE"
  | "NONCHARACTER"
  | "DEFAULT_IGNORABLE"
  | "CONTEXTJ"
  | "CONTEXTO"
  | "MAPPED"
  | "DEVIATION"
  | "IGNORED"
  | "UNASSIGNED";

/**
 * IdnaError defines an exported structural contract.
 */
export interface IdnaError {
  code: IdnaErrorCode;
  message: string;
  span?: Span;
  labelIndex?: number;
  codePoint?: number;
}

/**
 * IdnaResult defines an exported structural contract.
 */
export interface IdnaResult {
  ok: boolean;
  value: string;
  errors: readonly IdnaError[];
  warnings: readonly IdnaError[];
  provenance: Provenance;
}

/**
 * Uts46Options defines an exported structural contract.
 */
export interface Uts46Options {
  useStd3AsciiRules?: boolean;
  useCompatMapping?: boolean;
  checkHyphens?: boolean;
  checkBidi?: boolean;
  checkJoiners?: boolean;
  verifyDnsLength?: boolean;
  illFormed?: "error" | "replace";
  splitOnDots?: "ascii-only" | "uts46";
}

/**
 * Uts46MapOptions defines an exported structural contract.
 */
export interface Uts46MapOptions {
  useCompatMapping?: boolean;
  illFormed?: "error" | "replace";
  splitOnDots?: "ascii-only" | "uts46";
}

/**
 * Uts46MapResult defines an exported structural contract.
 */
export interface Uts46MapResult {
  mapped: string;
  errors: readonly IdnaError[];
  warnings: readonly IdnaError[];
  provenance: Provenance;
}
