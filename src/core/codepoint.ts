/**
 * Code point and its UTF-16 index metadata.
 * Units: Unicode scalar values.
 * Units: UTF-16 code units.
 */
export interface CodePointInfo {
  codePoint: number;
  indexCU: number;
  sizeCU: number;
}

/**
 * Iterate code points with UTF-16 code unit offsets.
 * Units: Unicode scalar values.
 * Units: UTF-16 code units.
 */
export function* iterateCodePoints(text: string): Iterable<CodePointInfo> {
  for (let codeUnitIndex = 0; codeUnitIndex < text.length; ) {
    const codePoint = text.codePointAt(codeUnitIndex) ?? 0;
    const sizeCU = codePoint > 0xffff ? 2 : 1;
    yield { codePoint, indexCU: codeUnitIndex, sizeCU };
    codeUnitIndex += sizeCU;
  }
}

/**
 * Length of a Unicode scalar value in UTF-16 code units.
 * Units: Unicode scalar values.
 */
export function codePointLength(codePoint: number): number {
  return codePoint > 0xffff ? 2 : 1;
}
