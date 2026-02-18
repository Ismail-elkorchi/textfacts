/**
 * TextEnvelopeKind defines an exported type contract.
 */
export type TextEnvelopeKind = "string" | "utf8-base64" | "utf16le-base64" | "utf16-code-units";

/**
 * TextEnvelopeV1 defines an exported type contract.
 */
export type TextEnvelopeV1 =
  | { v: 1; kind: "string"; text: string }
  | { v: 1; kind: "utf8-base64"; base64: string }
  | { v: 1; kind: "utf16le-base64"; base64: string }
  | { v: 1; kind: "utf16-code-units"; codeUnits: readonly number[] };
