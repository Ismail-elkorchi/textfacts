export function assertOk(value: unknown, message?: string): void {
  if (!value) {
    throw new Error(message ?? "Assertion failed");
  }
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)}, got ${String(actual)}`);
  }
}

export function assertDeepEqual(actual: unknown, expected: unknown, message?: string): void {
  if (!deepEqual(actual, expected)) {
    throw new Error(message ?? "Deep equal assertion failed");
  }
}

function deepEqual(leftValue: unknown, rightValue: unknown): boolean {
  if (Object.is(leftValue, rightValue)) return true;
  if (typeof leftValue !== typeof rightValue) return false;
  if (leftValue === null || rightValue === null) return false;
  if (typeof leftValue !== "object") return false;

  if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
    if (leftValue.length !== rightValue.length) return false;
    for (let index = 0; index < leftValue.length; index += 1) {
      if (!deepEqual(leftValue[index], rightValue[index])) return false;
    }
    return true;
  }

  if (Array.isArray(leftValue) || Array.isArray(rightValue)) return false;

  const recordA = leftValue as Record<string, unknown>;
  const recordB = rightValue as Record<string, unknown>;
  const keysA = Object.keys(recordA).sort();
  const keysB = Object.keys(recordB).sort();
  if (keysA.length !== keysB.length) return false;
  for (let index = 0; index < keysA.length; index += 1) {
    const keyA = keysA[index] ?? "";
    const keyB = keysB[index] ?? "";
    if (keyA !== keyB) return false;
    if (!deepEqual(recordA[keyA], recordB[keyB])) return false;
  }
  return true;
}
