export interface BidiTestCase {
  input: string[];
  levels: Array<number | null>;
  reorder: number[];
  bitset: number;
  raw: string;
}

export interface BidiCharacterCase {
  text: string;
  paragraphDirection: 0 | 1 | 2;
  paragraphLevel: 0 | 1;
  levels: Array<number | null>;
  reorder: number[];
  raw: string;
}

function parseLevels(value: string): Array<number | null> {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  return tokens.map((token) => (token === "x" ? null : Number.parseInt(token, 10)));
}

function parseReorder(value: string): number[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => Number.parseInt(token, 10));
}

function parseCodePointSequence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const cps = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((hex) => Number.parseInt(hex, 16));
  return String.fromCodePoint(...cps);
}

export function parseBidiTestFile(text: string): BidiTestCase[] {
  const cases: BidiTestCase[] = [];
  let currentLevels: Array<number | null> = [];
  let currentReorder: number[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("@Levels:")) {
      const payload = trimmed.slice("@Levels:".length).trim();
      currentLevels = parseLevels(payload);
      continue;
    }
    if (trimmed.startsWith("@Reorder:")) {
      const payload = trimmed.slice("@Reorder:".length).trim();
      currentReorder = parseReorder(payload);
      continue;
    }
    if (trimmed.startsWith("@")) continue;

    const data = (trimmed.split("#")[0] ?? "").trim();
    if (!data) continue;
    const parts = data.split(";").map((part) => part.trim());
    if (parts.length < 2) continue;
    const input = parts[0]?.split(/\s+/).filter(Boolean) ?? [];
    const bitsetText = parts[1] ?? "0";
    const bitset = Number.parseInt(bitsetText, 16);
    cases.push({
      input,
      levels: currentLevels,
      reorder: currentReorder,
      bitset,
      raw: line,
    });
  }
  return cases;
}

export function parseBidiCharacterTestFile(text: string): BidiCharacterCase[] {
  const cases: BidiCharacterCase[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const data = (trimmed.split("#")[0] ?? "").trim();
    if (!data) continue;
    const fields = data.split(";").map((field) => field.trim());
    if (fields.length < 5) continue;
    const [seq, dir, level, levels, reorder] = fields;
    if (!seq || dir === undefined || level === undefined || !levels || reorder === undefined)
      continue;
    const paragraphDirection = Number.parseInt(dir, 10) as 0 | 1 | 2;
    const paragraphLevel = Number.parseInt(level, 10) as 0 | 1;
    cases.push({
      text: parseCodePointSequence(seq),
      paragraphDirection,
      paragraphLevel,
      levels: parseLevels(levels),
      reorder: parseReorder(reorder),
      raw: line,
    });
  }
  return cases;
}
