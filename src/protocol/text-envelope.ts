import { TextfactsError } from "../core/error.ts";
import {
  type IntegrityFinding,
  isWellFormedUnicode,
  iterIntegrityFindings,
} from "../integrity/integrity.ts";
import { base64Decode, base64Encode } from "./base64.ts";
import type { TextEnvelopeKind, TextEnvelopeV1 } from "./types.ts";

export interface TextEnvelopeOptions {
  prefer?: TextEnvelopeKind;
  fallback?: Exclude<TextEnvelopeKind, "string">;
}

const DEFAULT_PREFER: TextEnvelopeKind = "string";
const DEFAULT_FALLBACK: Exclude<TextEnvelopeKind, "string"> = "utf16le-base64";

/**
 * Scan I-JSON violations in a UTF-16 string.
 * Units: UTF-16 code units.
 * Units: Unicode scalar values.
 */
export function scanIJsonStringViolations(text: string): ReadonlyArray<IntegrityFinding> {
  return Array.from(
    iterIntegrityFindings(text, {
      include: ["lone-surrogate", "noncharacter"],
    }),
  );
}

/**
 * isIJsonSafeString executes a deterministic operation in this module.
 */
export function isIJsonSafeString(text: string): boolean {
  return scanIJsonStringViolations(text).length === 0;
}

function toUtf16CodeUnits(text: string): number[] {
  const codeUnits: number[] = new Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    codeUnits[index] = text.charCodeAt(index);
  }
  return codeUnits;
}

/**
 * Encode a string as UTF-16LE bytes.
 * Units: bytes (UTF-16LE).
 */
export function encodeUtf16leBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  let offset = 0;
  for (let index = 0; index < text.length; index += 1) {
    const codeUnitValue = text.charCodeAt(index);
    bytes[offset++] = codeUnitValue & 0xff;
    bytes[offset++] = (codeUnitValue >> 8) & 0xff;
  }
  return bytes;
}

/**
 * Decode UTF-16LE bytes into a string.
 * Units: bytes (UTF-16LE).
 */
export function decodeUtf16leBytes(bytes: Uint8Array): string {
  if (bytes.length % 2 !== 0) {
    throw new TextfactsError("PROTOCOL_INVALID_ENVELOPE", "UTF-16LE byte length must be even", {
      length: bytes.length,
    });
  }
  const codeUnits = new Array(bytes.length / 2);
  let codeUnitIndex = 0;
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 2) {
    const lowByte = bytes[byteIndex] ?? 0;
    const highByte = bytes[byteIndex + 1] ?? 0;
    codeUnits[codeUnitIndex++] = (highByte << 8) | lowByte;
  }
  const chunkSize = 0x8000;
  let output = "";
  for (let startIndex = 0; startIndex < codeUnits.length; startIndex += chunkSize) {
    output += String.fromCharCode(...codeUnits.slice(startIndex, startIndex + chunkSize));
  }
  return output;
}

function encodeUtf8Base64(text: string): TextEnvelopeV1 | null {
  if (!isWellFormedUnicode(text)) return null;
  const bytes = new TextEncoder().encode(text);
  return { v: 1, kind: "utf8-base64", base64: base64Encode(bytes) };
}

/**
 * Encode text into a TextEnvelope.
 * Units: UTF-16 code units.
 */
export function encodeTextEnvelope(
  text: string,
  options: TextEnvelopeOptions = {},
): TextEnvelopeV1 {
  const prefer = options.prefer ?? DEFAULT_PREFER;
  const fallback = options.fallback ?? DEFAULT_FALLBACK;

  if (prefer === "string") {
    if (isIJsonSafeString(text)) {
      return { v: 1, kind: "string", text };
    }
    if (fallback === "utf8-base64") {
      const encoded = encodeUtf8Base64(text);
      if (encoded) return encoded;
    }
    if (fallback === "utf16le-base64") {
      return { v: 1, kind: "utf16le-base64", base64: base64Encode(encodeUtf16leBytes(text)) };
    }
    return { v: 1, kind: "utf16-code-units", codeUnits: toUtf16CodeUnits(text) };
  }

  if (prefer === "utf8-base64") {
    const encoded = encodeUtf8Base64(text);
    if (encoded) return encoded;
    if (fallback === "utf16le-base64") {
      return { v: 1, kind: "utf16le-base64", base64: base64Encode(encodeUtf16leBytes(text)) };
    }
    return { v: 1, kind: "utf16-code-units", codeUnits: toUtf16CodeUnits(text) };
  }

  if (prefer === "utf16le-base64") {
    return { v: 1, kind: "utf16le-base64", base64: base64Encode(encodeUtf16leBytes(text)) };
  }

  return { v: 1, kind: "utf16-code-units", codeUnits: toUtf16CodeUnits(text) };
}

function decodeUtf16CodeUnits(codeUnits: readonly number[]): string {
  const chunkSize = 0x8000;
  let output = "";
  for (let startIndex = 0; startIndex < codeUnits.length; startIndex += chunkSize) {
    const slice = codeUnits.slice(startIndex, startIndex + chunkSize);
    output += String.fromCharCode(...slice);
  }
  return output;
}

/**
 * Decode a TextEnvelope into a string.
 * Units: UTF-16 code units.
 */
export function decodeTextEnvelope(env: TextEnvelopeV1): string {
  if (env.v !== 1) {
    throw new TextfactsError("PROTOCOL_INVALID_ENVELOPE", "Unsupported TextEnvelope version", {
      version: env.v,
    });
  }
  if (env.kind === "string") {
    return env.text;
  }
  if (env.kind === "utf8-base64") {
    const bytes = base64Decode(env.base64);
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      return decoder.decode(bytes);
    } catch (error) {
      throw new TextfactsError("PROTOCOL_INVALID_UTF8", "Invalid UTF-8 in base64 payload", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (env.kind === "utf16le-base64") {
    const bytes = base64Decode(env.base64);
    return decodeUtf16leBytes(bytes);
  }
  if (env.kind === "utf16-code-units") {
    const codeUnits = env.codeUnits;
    for (const codeUnitValue of codeUnits) {
      if (!Number.isInteger(codeUnitValue) || codeUnitValue < 0 || codeUnitValue > 0xffff) {
        throw new TextfactsError("PROTOCOL_INVALID_ENVELOPE", "Invalid UTF-16 code unit", {
          codeUnit: codeUnitValue,
        });
      }
    }
    return decodeUtf16CodeUnits(codeUnits);
  }
  throw new TextfactsError("PROTOCOL_INVALID_ENVELOPE", "Unknown TextEnvelope kind");
}
