import { iterateCodePoints } from "../core/codepoint.ts";

export interface CodePointArray {
  codePoints: number[];
  codeUnitStarts: number[];
}

export function collectCodePoints(text: string): CodePointArray {
  const codePoints: number[] = [];
  const codeUnitStarts: number[] = [];
  for (const cp of iterateCodePoints(text)) {
    codePoints.push(cp.codePoint);
    codeUnitStarts.push(cp.indexCU);
  }
  return { codePoints, codeUnitStarts };
}
