/**
 * compareByCodePoint executes a deterministic operation in this module.
 */
export function compareByCodePoint(leftText: string, rightText: string): number {
  if (leftText === rightText) return 0;
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftText.length && rightIndex < rightText.length) {
    const leftCodePoint = leftText.codePointAt(leftIndex) ?? 0;
    const rightCodePoint = rightText.codePointAt(rightIndex) ?? 0;
    if (leftCodePoint !== rightCodePoint) return leftCodePoint < rightCodePoint ? -1 : 1;
    leftIndex += leftCodePoint > 0xffff ? 2 : 1;
    rightIndex += rightCodePoint > 0xffff ? 2 : 1;
  }
  return leftText.length < rightText.length ? -1 : 1;
}
