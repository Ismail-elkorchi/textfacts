export interface Ratio {
  num: string;
  den: string;
}

function ratio(num: bigint, den: bigint): Ratio {
  if (den === 0n) return { num: "0", den: "1" };
  return { num: num.toString(), den: den.toString() };
}

/**
 * overlapCount executes a deterministic operation in this module.
 */
export function overlapCount(leftSet: Set<string>, rightSet: Set<string>): string {
  if (leftSet.size === 0 || rightSet.size === 0) return "0";
  const [smallerSet, largerSet] =
    leftSet.size <= rightSet.size ? [leftSet, rightSet] : [rightSet, leftSet];
  let count = 0n;
  for (const value of smallerSet.values()) {
    if (largerSet.has(value)) count += 1n;
  }
  return count.toString();
}

/**
 * jaccard executes a deterministic operation in this module.
 */
export function jaccard(leftSet: Set<string>, rightSet: Set<string>): Ratio {
  const intersection = BigInt(overlapCount(leftSet, rightSet));
  const union = BigInt(leftSet.size + rightSet.size) - intersection;
  return ratio(intersection, union === 0n ? 1n : union);
}

/**
 * containment executes a deterministic operation in this module.
 */
export function containment(leftSet: Set<string>, rightSet: Set<string>): Ratio {
  const intersection = BigInt(overlapCount(leftSet, rightSet));
  const denominator = BigInt(leftSet.size);
  return ratio(intersection, denominator === 0n ? 1n : denominator);
}
