import type { SurfaceProfile } from "./surface-profile.ts";

/**
 * Ratio defines an exported structural contract.
 */
export interface Ratio {
  num: string;
  den: string;
}

/**
 * NgramComparison defines an exported structural contract.
 */
export interface NgramComparison {
  n: number;
  jaccard: Ratio;
  cosineSquared: Ratio;
}

/**
 * ProfileComparison defines an exported structural contract.
 */
export interface ProfileComparison {
  ngrams: NgramComparison[];
}

function ratio(num: bigint, den: bigint): Ratio {
  if (den === 0n) return { num: "0", den: "1" };
  return { num: num.toString(), den: den.toString() };
}

/**
 * Compare surface profiles with similarity metrics.
 * Units: UTF-16 code units.
 * Units: Unicode scalar values.
 */
export function compareProfiles(
  leftProfile: SurfaceProfile,
  rightProfile: SurfaceProfile,
): ProfileComparison {
  const comparisons: NgramComparison[] = [];
  const leftNgrams = leftProfile.ngrams?.charNgrams ?? [];
  const rightNgrams = rightProfile.ngrams?.charNgrams ?? [];
  const rightByN = new Map(rightNgrams.map((entry) => [entry.n, entry]));

  for (const leftEntry of leftNgrams) {
    const rightEntry = rightByN.get(leftEntry.n);
    if (!rightEntry) continue;
    const leftCounts = new Map(leftEntry.items.map((item) => [item.gram, item.count]));
    const rightCounts = new Map(rightEntry.items.map((item) => [item.gram, item.count]));
    const leftSet = new Set(leftCounts.keys());
    const rightSet = new Set(rightCounts.keys());
    let intersection = 0n;
    for (const gram of leftSet) {
      if (rightSet.has(gram)) intersection += 1n;
    }
    const union = BigInt(leftSet.size + rightSet.size) - intersection;

    let dot = 0n;
    let leftNorm = 0n;
    let rightNorm = 0n;
    for (const [gram, leftCount] of leftCounts.entries()) {
      const rightCount = rightCounts.get(gram) ?? 0;
      dot += BigInt(leftCount) * BigInt(rightCount);
      leftNorm += BigInt(leftCount) * BigInt(leftCount);
    }
    for (const rightCount of rightCounts.values()) {
      rightNorm += BigInt(rightCount) * BigInt(rightCount);
    }
    const cosineSquared =
      leftNorm === 0n || rightNorm === 0n ? ratio(0n, 1n) : ratio(dot * dot, leftNorm * rightNorm);

    comparisons.push({
      n: leftEntry.n,
      jaccard: ratio(intersection, union === 0n ? 1n : union),
      cosineSquared,
    });
  }

  comparisons.sort((aComp, bComp) => aComp.n - bComp.n);
  return { ngrams: comparisons };
}
