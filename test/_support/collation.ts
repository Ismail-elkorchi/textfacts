export function parseCollationTestFile(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const items: string[] = [];
  for (const line of lines) {
    const cleaned = line.split("#")[0]?.trim();
    if (!cleaned) continue;
    const beforeSemi = cleaned.split(";")[0]?.trim();
    if (!beforeSemi) continue;
    const codepoints = beforeSemi
      .split(/\s+/)
      .filter(Boolean)
      .map((hex) => Number.parseInt(hex, 16));
    if (codepoints.length === 0 || codepoints.some((cp) => !Number.isFinite(cp))) continue;
    items.push(String.fromCodePoint(...codepoints));
  }
  return items;
}
