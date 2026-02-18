import fs from "node:fs/promises";
import path from "node:path";

const UNICODE_VERSION = "17.0.0";
const UCD_BASE = `https://www.unicode.org/Public/${UNICODE_VERSION}/ucd/`;

const ROOT = process.cwd();
const SPEC_DIR = path.join(ROOT, "specs", "unicode", UNICODE_VERSION, "ucd");
const CACHE_DIR = path.join(ROOT, "tools", "unicode", "ucd", UNICODE_VERSION);
const OUT_DIR = path.join(ROOT, "src", "casefold", "generated");
const FILE = "CaseFolding.txt";

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fetchFile(fileName) {
  const specPath = path.join(SPEC_DIR, fileName);
  try {
    return await fs.readFile(specPath, "utf8");
  } catch {}

  const cachePath = path.join(CACHE_DIR, fileName);
  try {
    return await fs.readFile(cachePath, "utf8");
  } catch {
    const url = `${UCD_BASE}${fileName}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return await response.text();
  }
}

function parseCaseFolding(text) {
  const mappings = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const parts = cleaned.split(";").map((part) => part.trim());
    if (parts.length < 3) continue;
    const code = parts[0];
    const status = parts[1];
    const mapping = parts[2];
    if (status !== "C" && status !== "F") continue;
    const cp = Number.parseInt(code, 16);
    if (!Number.isFinite(cp)) continue;
    const target = mapping
      .split(/\s+/)
      .filter(Boolean)
      .map((hex) => Number.parseInt(hex, 16));
    if (target.length === 0) continue;
    mappings.push([cp, target]);
  }
  mappings.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  return mappings;
}

function generateCaseFoldTable(mappings) {
  const codePoints = [];
  const offsets = [0];
  const data = [];
  let offset = 0;
  for (const [cp, target] of mappings) {
    codePoints.push(cp);
    data.push(...target);
    offset += target.length;
    offsets.push(offset);
  }

  const formatArray = (arr) => {
    const rows = [];
    for (let i = 0; i < arr.length; i += 12) {
      rows.push(`  ${arr.slice(i, i + 12).join(", ")}`);
    }
    return rows.join(",\n");
  };

  return `// Generated from Unicode ${UNICODE_VERSION} CaseFolding.txt (C + F mappings).\n// DO NOT EDIT MANUALLY.\n\nexport const CASEFOLD_CODEPOINTS = new Int32Array([\n${formatArray(codePoints)}\n]);\n\nexport const CASEFOLD_OFFSETS = new Int32Array([\n${formatArray(offsets)}\n]);\n\nexport const CASEFOLD_DATA = new Int32Array([\n${formatArray(data)}\n]);\n`;
}

async function main() {
  const text = await fetchFile(FILE);
  const mappings = parseCaseFolding(text);
  await ensureDir(OUT_DIR);
  const output = generateCaseFoldTable(mappings);
  await fs.writeFile(path.join(OUT_DIR, "casefold.ts"), output, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
