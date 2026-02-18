import type { Provenance, Span } from "../core/types.ts";

/**
 * Edit defines an exported type contract.
 */
export type Edit =
  | { op: "equal"; a0: number; a1: number; b0: number; b1: number }
  | { op: "delete"; a0: number; a1: number }
  | { op: "insert"; b0: number; b1: number };

/**
 * EditScript defines an exported structural contract.
 */
export interface EditScript {
  edits: Edit[];
  aLen: number;
  bLen: number;
  algo: Provenance;
  truncated?: boolean;
}

/**
 * TokenEdit defines an exported type contract.
 */
export type TokenEdit = Edit & {
  aSpans?: Span[];
  bSpans?: Span[];
};

/**
 * TextDiffSummary defines an exported structural contract.
 */
export interface TextDiffSummary {
  insertedTokens: number;
  deletedTokens: number;
  equalTokens: number;
}

/**
 * TextDiff defines an exported structural contract.
 */
export interface TextDiff {
  edits: TokenEdit[];
  summary: TextDiffSummary;
  aTokens: number;
  bTokens: number;
  truncated?: boolean;
  provenance: Provenance;
}
