import type { TextInput } from "./types.ts";

/**
 * NormalizedInput defines an exported structural contract.
 */
export interface NormalizedInput {
  text: string;
  inputType: "string" | "utf8";
  byteLength?: number;
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Normalize input into a UTF-16 string, decoding UTF-8 bytes when needed.
 * Units: bytes (UTF-8).
 */
export function normalizeInput(input: TextInput): NormalizedInput {
  if (typeof input === "string") {
    return { text: input, inputType: "string" };
  }
  const text = utf8Decoder.decode(input);
  return { text, inputType: "utf8", byteLength: input.byteLength };
}
