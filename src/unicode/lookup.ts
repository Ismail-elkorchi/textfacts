/**
 * RangeTable defines an exported type contract.
 */
export type RangeTable = Int32Array;

/**
 * Lookup a property value for a Unicode scalar value in a range table.
 * Units: Unicode scalar values.
 */
export function lookupProperty(table: RangeTable, codePoint: number): number {
  let lo = 0;
  let hi = table.length / 3 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const base = mid * 3;
    const start = table[base] ?? 0;
    const end = table[base + 1] ?? 0;
    if (codePoint < start) {
      hi = mid - 1;
    } else if (codePoint > end) {
      lo = mid + 1;
    } else {
      return table[base + 2] ?? 0;
    }
  }
  return 0;
}
