export interface NormalizationCase {
  c1: string;
  c2: string;
  c3: string;
  c4: string;
  c5: string;
  raw: string;
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

export function parseNormalizationTestFile(text: string): NormalizationCase[] {
  const cases: NormalizationCase[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("@")) continue;
    const data = (trimmed.split("#")[0] ?? "").trim();
    if (!data) continue;
    const fields = data.split(";").map((field) => field.trim());
    if (fields.length < 5) continue;
    const [c1, c2, c3, c4, c5] = fields;
    if (!c1 || !c2 || !c3 || !c4 || !c5) continue;
    cases.push({
      c1: parseCodePointSequence(c1),
      c2: parseCodePointSequence(c2),
      c3: parseCodePointSequence(c3),
      c4: parseCodePointSequence(c4),
      c5: parseCodePointSequence(c5),
      raw: line,
    });
  }
  return cases;
}
