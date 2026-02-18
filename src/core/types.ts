/**
 * TextInput defines an exported type contract.
 */
export type TextInput = string | Uint8Array;

/**
 * Span defines an exported structural contract.
 */
export interface Span {
  startCU: number;
  endCU: number;
}

/**
 * ByteSpan defines an exported structural contract.
 */
export interface ByteSpan {
  startB: number;
  endB: number;
}

/**
 * AlgorithmInfo defines an exported structural contract.
 */
export interface AlgorithmInfo {
  name: string;
  spec: string;
  revisionOrDate: string;
  implementationId: string;
}

/**
 * Provenance defines an exported structural contract.
 */
export interface Provenance {
  unicodeVersion: string;
  algorithm: AlgorithmInfo;
  configHash: string;
  units: {
    text: "utf16-code-unit";
    byte?: "utf8-byte";
    codePoint?: "unicode-code-point";
    token?: string;
    grapheme?: "uax29-grapheme";
    word?: "uax29-word";
    sentence?: "uax29-sentence";
    lineBreak?: "uax14-line-break";
    bidi?: "uax9-bidi";
    caseFold?: "unicode-casefold";
    script?: "unicode-script";
    security?: "uts39-security";
    variants?: "textfacts-variant-index";
    profile?: "textfacts-surface-profile";
  };
}

/**
 * SegmentIterable defines an exported structural contract.
 */
export interface SegmentIterable extends Iterable<Span> {
  provenance: Provenance;
}
