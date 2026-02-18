import { TextfactsError, type TextfactsErrorCode } from "../core/error.ts";
import { isNoncharacter } from "../unicode/integrity.ts";

/**
 * JsonValue defines an exported type contract.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function throwError(
  code: TextfactsErrorCode,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new TextfactsError(code, message, details);
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertString(value: string, context: string): void {
  for (let index = 0; index < value.length; ) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        const codePoint = ((codeUnit - 0xd800) << 10) + (nextCodeUnit - 0xdc00) + 0x10000;
        if (isNoncharacter(codePoint)) {
          throwError(
            "JCS_NONCHARACTER",
            `${context} contains noncharacter U+${codePoint.toString(16)}`,
          );
        }
        index += 2;
        continue;
      }
      throwError("JCS_LONE_SURROGATE", `${context} contains lone surrogate`);
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throwError("JCS_LONE_SURROGATE", `${context} contains lone surrogate`);
    }
    if (isNoncharacter(codeUnit)) {
      throwError("JCS_NONCHARACTER", `${context} contains noncharacter U+${codeUnit.toString(16)}`);
    }
    index += 1;
  }
}

/**
 * assertIJson executes a deterministic operation in this module.
 */
export function assertIJson(value: unknown): asserts value is JsonValue {
  const visiting = new Set<unknown>();

  const visit = (current: unknown): void => {
    if (current === undefined) {
      throwError("JCS_UNSUPPORTED_TYPE", "undefined is not valid JSON");
    }
    if (current === null) return;

    if (typeof current === "string") {
      assertString(current, "JSON string");
      return;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throwError("JCS_NON_FINITE_NUMBER", "JSON number must be finite");
      }
      return;
    }
    if (typeof current === "boolean") return;

    if (typeof current === "bigint") {
      throwError("JCS_UNSUPPORTED_TYPE", "BigInt is not valid JSON");
    }
    if (typeof current === "function") {
      throwError("JCS_UNSUPPORTED_TYPE", "function is not valid JSON");
    }
    if (typeof current === "symbol") {
      throwError("JCS_UNSUPPORTED_TYPE", "symbol is not valid JSON");
    }

    if (Array.isArray(current)) {
      if (visiting.has(current)) {
        throwError("JCS_UNSUPPORTED_TYPE", "cyclic structures are not valid JSON");
      }
      visiting.add(current);
      for (const item of current) {
        visit(item);
      }
      visiting.delete(current);
      return;
    }

    if (current instanceof Date) {
      throwError("JCS_UNSUPPORTED_TYPE", "Date is not valid JSON");
    }
    if (typeof ArrayBuffer !== "undefined") {
      if (current instanceof ArrayBuffer) {
        throwError("JCS_UNSUPPORTED_TYPE", "ArrayBuffer is not valid JSON");
      }
      if (ArrayBuffer.isView(current)) {
        throwError("JCS_UNSUPPORTED_TYPE", "TypedArray/DataView is not valid JSON");
      }
    }
    if (current instanceof Map || current instanceof Set) {
      throwError("JCS_UNSUPPORTED_TYPE", "Map/Set is not valid JSON");
    }

    if (typeof current === "object") {
      if (!isPlainObject(current)) {
        throwError("JCS_UNSUPPORTED_TYPE", "Only plain objects are valid JSON objects");
      }
      if (visiting.has(current)) {
        throwError("JCS_UNSUPPORTED_TYPE", "cyclic structures are not valid JSON");
      }
      visiting.add(current);
      const symbols = Object.getOwnPropertySymbols(current as object);
      if (symbols.length > 0) {
        throwError("JCS_UNSUPPORTED_TYPE", "JSON objects must not contain symbol keys");
      }
      const jsonObject = current as Record<string, unknown>;
      const keys = Object.keys(jsonObject);
      for (const key of keys) {
        assertString(key, "JSON object key");
        visit(jsonObject[key]);
      }
      visiting.delete(current);
      return;
    }

    throwError("JCS_UNSUPPORTED_TYPE", "Unsupported JSON value");
  };

  visit(value);
}

function compareKeys(leftKey: string, rightKey: string): number {
  const minLength = Math.min(leftKey.length, rightKey.length);
  for (let index = 0; index < minLength; index += 1) {
    const diff = leftKey.charCodeAt(index) - rightKey.charCodeAt(index);
    if (diff !== 0) return diff;
  }
  return leftKey.length - rightKey.length;
}

function serializeString(value: string): string {
  return JSON.stringify(value);
}

function serializeNumber(value: number): string {
  return JSON.stringify(value);
}

function serializeValue(value: JsonValue): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string") return serializeString(value);
  if (typeof value === "number") return serializeNumber(value);
  if (Array.isArray(value)) {
    const parts = value.map((item) => serializeValue(item));
    return `[${parts.join(",")}]`;
  }
  const keys = Object.keys(value).sort(compareKeys);
  const parts: string[] = [];
  for (const key of keys) {
    const fieldValue = (value as Record<string, JsonValue>)[key] as JsonValue;
    parts.push(`${serializeString(key)}:${serializeValue(fieldValue)}`);
  }
  return `{${parts.join(",")}}`;
}

/**
 * jcsCanonicalize executes a deterministic operation in this module.
 */
export function jcsCanonicalize(value: JsonValue): string {
  assertIJson(value);
  return serializeValue(value);
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  if (globalThis.crypto?.subtle) {
    const buffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return new Uint8Array(digest);
  }
  throwError("JCS_UNSUPPORTED_TYPE", "WebCrypto SHA-256 is not available");
}

/**
 * jcsSha256Hex executes a deterministic operation in this module.
 */
export async function jcsSha256Hex(value: JsonValue): Promise<string> {
  const canonical = jcsCanonicalize(value);
  const data = new TextEncoder().encode(canonical);
  const bytes = await sha256Bytes(data);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `sha256:${hex}`;
}
