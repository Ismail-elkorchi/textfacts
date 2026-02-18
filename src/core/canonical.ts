function isTypedArray(value: unknown): value is ArrayLike<number> {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function stringCompare(leftText: string, rightText: string): number {
  if (leftText === rightText) return 0;
  return leftText < rightText ? -1 : 1;
}

function canonicalizeInternal(value: unknown): unknown {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const type = typeof value;
  if (type === "string" || type === "boolean") return value;
  if (type === "number") return Number.isFinite(value) ? value : null;
  if (type === "bigint") return value.toString();
  if (type === "symbol" || type === "function") return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = canonicalizeInternal(item);
      return normalized === undefined ? null : normalized;
    });
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    const entries: { key: unknown; value: unknown; keyJson: string; valueJson: string }[] = [];
    for (const [key, mapValue] of value.entries()) {
      const keyNorm = canonicalizeInternal(key);
      const valueNorm = canonicalizeInternal(mapValue);
      const keyJson = JSON.stringify(keyNorm ?? null);
      const valueJson = JSON.stringify(valueNorm ?? null);
      entries.push({
        key: keyNorm ?? null,
        value: valueNorm ?? null,
        keyJson,
        valueJson,
      });
    }
    entries.sort((leftEntry, rightEntry) => {
      const keyCmp = stringCompare(leftEntry.keyJson, rightEntry.keyJson);
      if (keyCmp !== 0) return keyCmp;
      return stringCompare(leftEntry.valueJson, rightEntry.valueJson);
    });
    return entries.map((entry) => [entry.key, entry.value]);
  }

  if (value instanceof Set) {
    const items = Array.from(value.values()).map((item) => canonicalizeInternal(item) ?? null);
    items.sort((leftItem, rightItem) =>
      stringCompare(JSON.stringify(leftItem), JSON.stringify(rightItem)),
    );
    return items;
  }

  if (isTypedArray(value)) {
    return Array.from(value);
  }

  if (type === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const output: Record<string, unknown> = {};
    for (const key of keys) {
      const normalized = canonicalizeInternal(record[key]);
      if (normalized !== undefined) {
        output[key] = normalized;
      }
    }
    return output;
  }

  return JSON.stringify(String(value));
}

/**
 * canonicalizeJson executes a deterministic operation in this module.
 */
export function canonicalizeJson(value: unknown): unknown {
  const normalized = canonicalizeInternal(value);
  return normalized === undefined ? null : normalized;
}

/**
 * canonicalModelStringify executes a deterministic operation in this module.
 */
export function canonicalModelStringify(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}
