import type { Provenance, Span } from "../core/types.ts";

/**
 * BidiRun defines an exported structural contract.
 */
export interface BidiRun {
  level: number;
  start: number;
  end: number;
  startCU: number;
  endCU: number;
}

/**
 * BidiResolution defines an exported structural contract.
 */
export interface BidiResolution {
  paragraphLevel: 0 | 1;
  /**
   * Resolved embedding levels per code point index.
   * Positions removed by rule X9 use 0xff.
   */
  levels: Uint8Array;
  runs: BidiRun[];
  /**
   * Visual order mapping (visual index -> logical code point index).
   * Indices removed by X9 are omitted.
   */
  visualOrder: Uint32Array;
  hasBidiControls: boolean;
  bidiControlSpans: Span[];
  provenance: Provenance;
  debug?: {
    sequences: Array<{
      indices: number[];
      typesAfterW7: number[];
      typesAfterN0?: number[];
      typesAfterN1N2?: number[];
      bracketPairs?: Array<[number, number]>;
      decisions?: Array<{
        open: number;
        close: number;
        foundMatch: boolean;
        foundStrong: boolean;
        prevDir?: number;
        startPos?: number;
        endPos?: number;
        scanDirs?: Array<number | null>;
      }>;
      embeddingDirection?: number;
      sos?: number;
      eos?: number;
    }>;
  };
}

/**
 * BidiOptions defines an exported structural contract.
 */
export interface BidiOptions {
  paragraphDirection?: "auto" | "ltr" | "rtl";
  useBracketPairs?: boolean;
  debug?: boolean;
}
