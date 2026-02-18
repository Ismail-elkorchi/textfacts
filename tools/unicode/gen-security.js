import fs from "node:fs/promises";
import path from "node:path";

const UNICODE_VERSION = "17.0.0";
const SECURITY_BASE = `https://www.unicode.org/Public/${UNICODE_VERSION}/security/`;

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, "tools", "unicode", "ucd", UNICODE_VERSION, "security");
const OUT_DIR = path.join(ROOT, "src", "security", "generated");

const FILES = {
  confusables: "confusables.txt",
  identifierStatus: "IdentifierStatus.txt",
  identifierType: "IdentifierType.txt",
};

const IDENTIFIER_TYPE_VALUES = [
  "Not_Character",
  "Deprecated",
  "Default_Ignorable",
  "Not_NFKC",
  "Not_XID",
  "Exclusion",
  "Obsolete",
  "Technical",
  "Uncommon_Use",
  "Limited_Use",
  "Inclusion",
  "Recommended",
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fetchFile(fileName) {
  await ensureDir(CACHE_DIR);
  const cachePath = path.join(CACHE_DIR, fileName);
  try {
    return await fs.readFile(cachePath, "utf8");
  } catch {
    const url = `${SECURITY_BASE}${fileName}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    const text = await response.text();
    await ensureDir(path.dirname(cachePath));
    await fs.writeFile(cachePath, text, "utf8");
    return text;
  }
}

function parseConfusables(text) {
  const mappings = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const parts = cleaned.split(";").map((part) => part.trim());
    if (parts.length < 2) continue;
    const sourceHex = parts[0];
    const targetHex = parts[1];
    const source = Number.parseInt(sourceHex, 16);
    if (!Number.isFinite(source)) continue;
    const target = targetHex
      .split(/\s+/)
      .filter(Boolean)
      .map((hex) => Number.parseInt(hex, 16));
    if (target.length === 0) continue;
    mappings.push([source, target]);
  }
  mappings.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  return mappings;
}

function generateMappingTable(name, mappings) {
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
  return `// Generated from Unicode ${UNICODE_VERSION} ${name}.\n// DO NOT EDIT MANUALLY.\n\nexport const CONFUSABLES_CODEPOINTS = new Int32Array([\n${formatArray(codePoints)}\n]);\n\nexport const CONFUSABLES_OFFSETS = new Int32Array([\n${formatArray(offsets)}\n]);\n\nexport const CONFUSABLES_DATA = new Int32Array([\n${formatArray(data)}\n]);\n`;
}

function parseRanges(text, valuesMap, defaultId = 0) {
  const ranges = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?\s*;\s*([^\s]+)/);
    if (!match) continue;
    const start = Number.parseInt(match[1], 16);
    const end = match[2] ? Number.parseInt(match[2], 16) : start;
    const value = match[3];
    const id = valuesMap.get(value);
    if (id === undefined || id === defaultId) continue;
    ranges.push([start, end, id]);
  }
  ranges.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && last[2] === range[2] && (last[1] ?? 0) + 1 === (range[0] ?? 0)) {
      last[1] = range[1];
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function parseIdentifierTypeRanges(text, typeMap, defaultMask) {
  const ranges = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?\s*;\s*(.+)$/);
    if (!match) continue;
    const start = Number.parseInt(match[1], 16);
    const end = match[2] ? Number.parseInt(match[2], 16) : start;
    const values = match[3]
      .split(/\s+/)
      .filter(Boolean)
      .map((value) => value.trim());
    if (!Number.isFinite(start) || !Number.isFinite(end) || values.length === 0) continue;
    let mask = 0;
    for (const value of values) {
      const bit = typeMap.get(value);
      if (bit !== undefined) {
        mask |= bit;
      }
    }
    if (mask === 0 || mask === defaultMask) continue;
    ranges.push([start, end, mask]);
  }
  ranges.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && last[2] === range[2] && (last[1] ?? 0) + 1 === (range[0] ?? 0)) {
      last[1] = range[1];
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function formatArray(values) {
  const rows = [];
  for (let i = 0; i < values.length; i += 12) {
    rows.push(`  ${values.slice(i, i + 12).join(", ")}`);
  }
  return rows.join(",\n");
}

function generateIdentifierStatusTable(ranges) {
  const names = ["Restricted", "Allowed"];
  const ids = `  Restricted: 0,\n  Allowed: 1`;
  const flat = ranges.flat();
  return `// Generated from Unicode ${UNICODE_VERSION} IdentifierStatus.txt.\n// DO NOT EDIT MANUALLY.\n\nexport const IDENTIFIER_STATUS_NAMES = ${JSON.stringify(names)} as const;\n\nexport const IDENTIFIER_STATUS_IDS = {\n${ids}\n} as const;\n\nexport const IDENTIFIER_STATUS_RANGES = new Int32Array([\n${formatArray(flat)}\n]);\n`;
}

function generateIdentifierTypeTable(ranges) {
  const idsEntries = IDENTIFIER_TYPE_VALUES.map((value, index) => `  ${value}: ${1 << index}`).join(
    ",\n",
  );
  const flat = ranges.flat();
  const defaultMask = 1 << IDENTIFIER_TYPE_VALUES.indexOf("Not_Character");
  return `// Generated from Unicode ${UNICODE_VERSION} IdentifierType.txt.\n// DO NOT EDIT MANUALLY.\n\nexport const IDENTIFIER_TYPE_NAMES = ${JSON.stringify(IDENTIFIER_TYPE_VALUES)} as const;\n\nexport const IDENTIFIER_TYPE_MASKS = {\n${idsEntries}\n} as const;\n\nexport const IDENTIFIER_TYPE_DEFAULT_MASK = ${defaultMask};\n\nexport const IDENTIFIER_TYPE_RANGES = new Int32Array([\n${formatArray(flat)}\n]);\n`;
}

async function main() {
  const confusableText = await fetchFile(FILES.confusables);
  const mappings = parseConfusables(confusableText);

  const statusText = await fetchFile(FILES.identifierStatus);
  const statusMap = new Map([
    ["Restricted", 0],
    ["Allowed", 1],
  ]);
  const statusRanges = parseRanges(statusText, statusMap, 0);

  const typeText = await fetchFile(FILES.identifierType);
  const typeMap = new Map();
  for (let i = 0; i < IDENTIFIER_TYPE_VALUES.length; i += 1) {
    typeMap.set(IDENTIFIER_TYPE_VALUES[i], 1 << i);
  }
  const defaultMask = 1 << IDENTIFIER_TYPE_VALUES.indexOf("Not_Character");
  const typeRanges = parseIdentifierTypeRanges(typeText, typeMap, defaultMask);

  await ensureDir(OUT_DIR);
  await fs.writeFile(
    path.join(OUT_DIR, "confusables.ts"),
    generateMappingTable("confusables.txt", mappings),
    "utf8",
  );
  await fs.writeFile(
    path.join(OUT_DIR, "identifier-status.ts"),
    generateIdentifierStatusTable(statusRanges),
    "utf8",
  );
  await fs.writeFile(
    path.join(OUT_DIR, "identifier-type.ts"),
    generateIdentifierTypeTable(typeRanges),
    "utf8",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
