import { TextfactsError } from "../core/error.ts";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const PAD = "=";

const LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let index = 0; index < ALPHABET.length; index += 1) {
    table[ALPHABET.charCodeAt(index)] = index;
  }
  table[PAD.charCodeAt(0)] = -2;
  return table;
})();

function throwInvalid(message: string, details?: Record<string, unknown>): never {
  throw new TextfactsError("PROTOCOL_INVALID_BASE64", message, details);
}

/**
 * Encode bytes as base64.
 * Units: bytes (binary).
 */
export function base64Encode(bytes: Uint8Array): string {
  let output = "";
  let byteIndex = 0;
  for (; byteIndex + 2 < bytes.length; byteIndex += 3) {
    const byte0 = bytes[byteIndex] ?? 0;
    const byte1 = bytes[byteIndex + 1] ?? 0;
    const byte2 = bytes[byteIndex + 2] ?? 0;
    const chunkValue = (byte0 << 16) | (byte1 << 8) | byte2;
    output += ALPHABET[(chunkValue >> 18) & 63];
    output += ALPHABET[(chunkValue >> 12) & 63];
    output += ALPHABET[(chunkValue >> 6) & 63];
    output += ALPHABET[chunkValue & 63];
  }
  const remaining = bytes.length - byteIndex;
  if (remaining === 1) {
    const byte0 = bytes[byteIndex] ?? 0;
    const chunkValue = byte0 << 16;
    output += ALPHABET[(chunkValue >> 18) & 63];
    output += ALPHABET[(chunkValue >> 12) & 63];
    output += PAD;
    output += PAD;
  } else if (remaining === 2) {
    const byte0 = bytes[byteIndex] ?? 0;
    const byte1 = bytes[byteIndex + 1] ?? 0;
    const chunkValue = (byte0 << 16) | (byte1 << 8);
    output += ALPHABET[(chunkValue >> 18) & 63];
    output += ALPHABET[(chunkValue >> 12) & 63];
    output += ALPHABET[(chunkValue >> 6) & 63];
    output += PAD;
  }
  return output;
}

/**
 * Decode base64 to bytes.
 * Units: bytes (binary).
 */
export function base64Decode(input: string): Uint8Array {
  if (input.length % 4 !== 0) {
    throwInvalid("Base64 length must be a multiple of 4", { length: input.length });
  }
  if (input.length === 0) return new Uint8Array(0);

  let pad = 0;
  if (input.endsWith("==")) {
    pad = 2;
  } else if (input.endsWith("=")) {
    pad = 1;
  }
  const outputLength = (input.length / 4) * 3 - pad;
  const output = new Uint8Array(outputLength);
  let outIndex = 0;

  for (let inputIndex = 0; inputIndex < input.length; inputIndex += 4) {
    const charCode0 = input.charCodeAt(inputIndex);
    const charCode1 = input.charCodeAt(inputIndex + 1);
    const charCode2 = input.charCodeAt(inputIndex + 2);
    const charCode3 = input.charCodeAt(inputIndex + 3);

    if (charCode0 > 127 || charCode1 > 127 || charCode2 > 127 || charCode3 > 127) {
      throwInvalid("Base64 contains non-ASCII characters", { index: inputIndex });
    }

    const value0 = LOOKUP[charCode0] ?? -1;
    const value1 = LOOKUP[charCode1] ?? -1;
    const value2 = LOOKUP[charCode2] ?? -1;
    const value3 = LOOKUP[charCode3] ?? -1;

    const isLastQuartet = inputIndex + 4 >= input.length;
    if (!isLastQuartet && (value2 === -2 || value3 === -2)) {
      throwInvalid("Base64 padding is only allowed in the final quartet", { index: inputIndex });
    }

    if (value0 < 0 || value1 < 0 || value0 === -2 || value1 === -2) {
      throwInvalid("Base64 contains invalid characters", { index: inputIndex });
    }

    if (value2 === -2 && value3 !== -2) {
      throwInvalid("Invalid base64 padding sequence", { index: inputIndex });
    }

    const chunkValue =
      (value0 << 18) |
      (value1 << 12) |
      ((value2 > 0 ? value2 : 0) << 6) |
      (value3 > 0 ? value3 : 0);

    if (value2 === -2) {
      if (!isLastQuartet) {
        throwInvalid("Padding is only allowed in the final quartet", { index: inputIndex });
      }
      if (outIndex < output.length) output[outIndex++] = (chunkValue >> 16) & 0xff;
      continue;
    }

    if (value3 === -2) {
      if (!isLastQuartet) {
        throwInvalid("Padding is only allowed in the final quartet", { index: inputIndex });
      }
      if (outIndex < output.length) output[outIndex++] = (chunkValue >> 16) & 0xff;
      if (outIndex < output.length) output[outIndex++] = (chunkValue >> 8) & 0xff;
      continue;
    }

    if (value2 < 0 || value3 < 0) {
      throwInvalid("Base64 contains invalid characters", { index: inputIndex });
    }

    if (outIndex < output.length) output[outIndex++] = (chunkValue >> 16) & 0xff;
    if (outIndex < output.length) output[outIndex++] = (chunkValue >> 8) & 0xff;
    if (outIndex < output.length) output[outIndex++] = chunkValue & 0xff;
  }

  return output;
}
