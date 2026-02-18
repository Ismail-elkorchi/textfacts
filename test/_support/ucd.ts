import { getRepoRootUrl, readTextFile } from "./runtime.ts";

const UNICODE_VERSION = "17.0.0";

export interface BreakTestCase {
  text: string;
  boundaryPositions: number[];
  raw: string;
}

const cache = new Map<string, string>();

export async function readUcdTestFile(relativePath: string): Promise<string> {
  if (cache.has(relativePath)) return cache.get(relativePath) as string;
  const root = getRepoRootUrl();
  const fileUrl = new URL(`testdata/unicode/${UNICODE_VERSION}/${relativePath}`, root);
  const text = await readTextFile(fileUrl);
  cache.set(relativePath, text);
  return text;
}

export function parseBreakTestFile(text: string): BreakTestCase[] {
  const cases: BreakTestCase[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("@")) continue;

    const data = (trimmed.split("#")[0] ?? "").trim();
    if (!data) continue;

    const tokens = data.split(/\s+/);
    const cps: number[] = [];
    const breaks: boolean[] = [];
    let pending: boolean | null = null;

    for (const token of tokens) {
      if (token === "÷") {
        pending = true;
        continue;
      }
      if (token === "×") {
        pending = false;
        continue;
      }
      const cp = Number.parseInt(token, 16);
      if (Number.isNaN(cp)) continue;
      if (pending === null) {
        throw new Error(`Malformed test line (missing boundary): ${line}`);
      }
      breaks.push(pending);
      cps.push(cp);
      pending = null;
    }

    if (pending !== null) {
      breaks.push(pending);
    } else {
      breaks.push(true);
    }

    const textValue = String.fromCodePoint(...cps);
    const codeUnitOffsets: number[] = new Array(cps.length + 1);
    let cu = 0;
    for (let index = 0; index < cps.length; index += 1) {
      const codePoint = cps[index] ?? 0;
      codeUnitOffsets[index] = cu;
      cu += codePoint > 0xffff ? 2 : 1;
    }
    codeUnitOffsets[cps.length] = cu;

    const boundaryPositions: number[] = [];
    for (let index = 0; index < breaks.length; index += 1) {
      if (breaks[index]) boundaryPositions.push(codeUnitOffsets[index] ?? 0);
    }

    cases.push({ text: textValue, boundaryPositions, raw: line });
  }
  return cases;
}
