import fs from "node:fs/promises";
import path from "node:path";

const UNICODE_VERSION = "17.0.0";
const UCD_BASE = `https://www.unicode.org/Public/${UNICODE_VERSION}/ucd/`;

const ROOT = process.cwd();
const SPEC_DIR = path.join(ROOT, "specs", "unicode", UNICODE_VERSION, "ucd");
const CACHE_DIR = path.join(ROOT, "tools", "unicode", "ucd", UNICODE_VERSION);
const OUT_DIR = path.join(ROOT, "src", "normalize", "generated");

const FILES = {
  unicodeData: "UnicodeData.txt",
  combiningClass: "extracted/DerivedCombiningClass.txt",
  compositionExclusions: "CompositionExclusions.txt",
};

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

function parseRanges(text, parser) {
  const ranges = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const entry = parser(cleaned);
    if (!entry) continue;
    ranges.push(entry);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && last[2] === range[2] && last[1] + 1 === range[0]) {
      last[1] = range[1];
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function parseCombiningClass(text) {
  return parseRanges(text, (cleaned) => {
    const match = cleaned.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?\s*;\s*(\d+)/);
    if (!match) return null;
    const start = parseInt(match[1], 16);
    const end = match[2] ? parseInt(match[2], 16) : start;
    const ccc = parseInt(match[3], 10);
    if (!ccc) return null;
    return [start, end, ccc];
  });
}

function parseCompositionExclusions(text) {
  const exclusions = new Set();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?/);
    if (!match) continue;
    const start = parseInt(match[1], 16);
    const end = match[2] ? parseInt(match[2], 16) : start;
    for (let cp = start; cp <= end; cp += 1) {
      exclusions.add(cp);
    }
  }
  return exclusions;
}

function parseUnicodeData(text, exclusions) {
  const decompCodepoints = [];
  const decompIndex = [];
  const decompData = [];
  const decompCompat = [];
  const composeMap = new Map();

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    const fields = line.split(";");
    if (fields.length < 6) continue;
    const cp = parseInt(fields[0], 16);
    if (Number.isNaN(cp)) continue;
    const decomp = fields[5];
    if (!decomp) continue;
    let mapping = decomp.trim();
    if (!mapping) continue;
    let compat = false;
    if (mapping.startsWith("<")) {
      compat = true;
      mapping = mapping.replace(/^<[^>]+>\s*/, "");
    }
    if (!mapping) continue;
    const seq = mapping
      .split(/\s+/)
      .filter(Boolean)
      .map((hex) => parseInt(hex, 16))
      .filter((value) => !Number.isNaN(value));
    if (seq.length === 0) continue;
    decompCodepoints.push(cp);
    decompIndex.push(decompData.length);
    decompCompat.push(compat ? 1 : 0);
    decompData.push(...seq);
    if (!compat && seq.length === 2 && !exclusions.has(cp)) {
      const starter = seq[0];
      const combining = seq[1];
      const list = composeMap.get(starter);
      if (list) {
        list.push([combining, cp]);
      } else {
        composeMap.set(starter, [[combining, cp]]);
      }
    }
  }
  decompIndex.push(decompData.length);
  return { decompCodepoints, decompIndex, decompData, decompCompat, composeMap };
}

function buildComposeTables(composeMap) {
  const starters = Array.from(composeMap.keys()).sort((a, b) => a - b);
  const composeIndex = [0];
  const composeData = [];
  for (const starter of starters) {
    const pairs = composeMap.get(starter) ?? [];
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [combining, composite] of pairs) {
      composeData.push(combining, composite);
    }
    composeIndex.push(composeData.length);
  }
  return { starters, composeIndex, composeData };
}

function formatArray(values, perLine = 12) {
  const rows = [];
  for (let i = 0; i < values.length; i += perLine) {
    rows.push(`  ${values.slice(i, i + perLine).join(", ")}`);
  }
  return rows.join(",\n");
}

async function writeCccTable(ranges) {
  await ensureDir(OUT_DIR);
  const flat = ranges.flat();
  const output = `// Generated from Unicode ${UNICODE_VERSION} DerivedCombiningClass.txt\n// DO NOT EDIT MANUALLY.\n\nexport const CCC_RANGES = new Int32Array([\n${formatArray(flat)}\n]);\n`;
  await fs.writeFile(path.join(OUT_DIR, "ccc.ts"), output, "utf8");
}

async function writeDecompositionTables(data) {
  await ensureDir(OUT_DIR);
  const output = `// Generated from Unicode ${UNICODE_VERSION} UnicodeData.txt\n// DO NOT EDIT MANUALLY.\n\nexport const DECOMP_CODEPOINTS = new Int32Array([\n${formatArray(data.decompCodepoints)}\n]);\n\nexport const DECOMP_INDEX = new Int32Array([\n${formatArray(data.decompIndex)}\n]);\n\nexport const DECOMP_DATA = new Int32Array([\n${formatArray(data.decompData)}\n]);\n\nexport const DECOMP_COMPAT = new Uint8Array([\n${formatArray(data.decompCompat)}\n]);\n`;
  await fs.writeFile(path.join(OUT_DIR, "decomp.ts"), output, "utf8");
}

async function writeCompositionTables(tables) {
  await ensureDir(OUT_DIR);
  const output = `// Generated from Unicode ${UNICODE_VERSION} UnicodeData.txt + CompositionExclusions.txt\n// DO NOT EDIT MANUALLY.\n\nexport const COMPOSE_STARTERS = new Int32Array([\n${formatArray(tables.starters)}\n]);\n\nexport const COMPOSE_INDEX = new Int32Array([\n${formatArray(tables.composeIndex)}\n]);\n\nexport const COMPOSE_DATA = new Int32Array([\n${formatArray(tables.composeData)}\n]);\n`;
  await fs.writeFile(path.join(OUT_DIR, "composition.ts"), output, "utf8");
}

async function main() {
  const [combiningText, unicodeDataText, exclusionsText] = await Promise.all([
    fetchFile(FILES.combiningClass),
    fetchFile(FILES.unicodeData),
    fetchFile(FILES.compositionExclusions),
  ]);
  const exclusions = parseCompositionExclusions(exclusionsText);
  const ranges = parseCombiningClass(combiningText);
  const data = parseUnicodeData(unicodeDataText, exclusions);
  const compositionTables = buildComposeTables(data.composeMap);
  await writeCccTable(ranges);
  await writeDecompositionTables(data);
  await writeCompositionTables(compositionTables);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
