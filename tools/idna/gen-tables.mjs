import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SPEC_DIR = path.join(ROOT, "specs", "unicode", "17.0.0", "idna");
const UCD_DIR = path.join(ROOT, "specs", "unicode", "17.0.0", "ucd");
const OUT_DIR = path.join(ROOT, "src", "idna", "generated");

const MAPPING_TABLE_PATH = path.join(SPEC_DIR, "IdnaMappingTable.txt");
const IDNA2008_PATH = path.join(SPEC_DIR, "Idna2008.txt");
const JOINING_PATH = path.join(UCD_DIR, "DerivedJoiningType.txt");

const STATUS_IDS = {
  valid: 0,
  mapped: 1,
  deviation: 2,
  ignored: 3,
  disallowed: 4,
};

const JOINING_TYPE_IDS = {
  U: 0,
  R: 1,
  L: 2,
  D: 3,
  T: 4,
  C: 5,
};

function parseRange(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.includes("..")) {
    const [startHex, endHex] = trimmed.split("..");
    return {
      start: Number.parseInt(startHex, 16),
      end: Number.parseInt(endHex, 16),
    };
  }
  const value = Number.parseInt(trimmed, 16);
  return { start: value, end: value };
}

function parseMappingField(text) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const cps = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((hex) => Number.parseInt(hex, 16));
  return String.fromCodePoint(...cps);
}

function mergeRanges(ranges) {
  if (ranges.length === 0) return [];
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i += 1) {
    const current = ranges[i];
    const last = merged[merged.length - 1];
    if (last.id === current.id && last.end + 1 === current.start) {
      last.end = current.end;
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

async function parseMappingTable() {
  const text = await fs.readFile(MAPPING_TABLE_PATH, "utf8");
  const ranges = [];
  const mappingEntries = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0]?.trim();
    if (!cleaned) continue;
    const parts = cleaned.split(";").map((part) => part.trim());
    if (parts.length < 2) continue;
    const range = parseRange(parts[0]);
    if (!range) continue;
    const status = parts[1];
    const statusId = STATUS_IDS[status];
    if (statusId === undefined) continue;

    ranges.push({ start: range.start, end: range.end, id: statusId });

    if (status === "mapped" || status === "deviation") {
      const mapping = parseMappingField(parts[2] ?? "");
      for (let cp = range.start; cp <= range.end; cp += 1) {
        mappingEntries.push({ cp, mapping });
      }
    }
  }

  const sorted = ranges.sort((a, b) => a.start - b.start);
  const withGaps = [];
  let cursor = 0;
  for (const range of sorted) {
    if (range.start > cursor) {
      withGaps.push({ start: cursor, end: range.start - 1, id: STATUS_IDS.disallowed });
    }
    withGaps.push(range);
    cursor = range.end + 1;
  }
  if (cursor <= 0x10ffff) {
    withGaps.push({ start: cursor, end: 0x10ffff, id: STATUS_IDS.disallowed });
  }

  const merged = mergeRanges(withGaps);
  const mappingCps = mappingEntries.map((entry) => entry.cp);
  const mappingValues = mappingEntries.map((entry) => entry.mapping);

  return { ranges: merged, mappingCps, mappingValues };
}

async function parseIdna2008() {
  const text = await fs.readFile(IDNA2008_PATH, "utf8");
  const contextJ = [];
  const contextO = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0]?.trim();
    if (!cleaned) continue;
    const parts = cleaned.split(";").map((part) => part.trim());
    if (parts.length < 2) continue;
    const range = parseRange(parts[0]);
    if (!range) continue;
    const property = parts[1];
    if (property === "CONTEXTJ") {
      contextJ.push({ start: range.start, end: range.end, id: 1 });
    } else if (property === "CONTEXTO") {
      contextO.push({ start: range.start, end: range.end, id: 1 });
    }
  }
  return {
    contextJ: mergeRanges(contextJ),
    contextO: mergeRanges(contextO),
  };
}

async function parseJoiningTypes() {
  const text = await fs.readFile(JOINING_PATH, "utf8");
  const ranges = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0]?.trim();
    if (!cleaned) continue;
    const parts = cleaned.split(";").map((part) => part.trim());
    if (parts.length < 2) continue;
    const range = parseRange(parts[0]);
    if (!range) continue;
    const type = parts[1];
    if (!(type in JOINING_TYPE_IDS)) continue;
    ranges.push({ start: range.start, end: range.end, id: JOINING_TYPE_IDS[type] });
  }
  const merged = mergeRanges(ranges.sort((a, b) => a.start - b.start));
  return merged;
}

function renderRangeArray(ranges) {
  const values = [];
  for (const range of ranges) {
    values.push(range.start, range.end, range.id);
  }
  return values;
}

async function writeMappingTable(data) {
  const { ranges, mappingCps, mappingValues } = data;
  const content = `// Generated from Unicode 17.0.0 IdnaMappingTable.txt
// DO NOT EDIT MANUALLY.

export const IDNA_MAPPING_STATUS_NAMES = ["valid","mapped","deviation","ignored","disallowed"] as const;
export const IDNA_MAPPING_STATUS_IDS = {
  valid: 0,
  mapped: 1,
  deviation: 2,
  ignored: 3,
  disallowed: 4,
} as const;

export const IDNA_MAPPING_RANGES = new Int32Array([
  ${renderRangeArray(ranges).join(", ")}
]);

export const IDNA_MAPPING_CODEPOINTS = new Int32Array([
  ${mappingCps.join(", ")}
]);

export const IDNA_MAPPING_VALUES = [
  ${mappingValues.map((value) => JSON.stringify(value)).join(",\n  ")}
];
`;

  await fs.writeFile(path.join(OUT_DIR, "mapping.ts"), content, "utf8");
}

async function writeIdna2008Tables(data) {
  const content = `// Generated from Unicode 17.0.0 Idna2008.txt
// DO NOT EDIT MANUALLY.

export const CONTEXTJ_RANGES = new Int32Array([
  ${renderRangeArray(data.contextJ).join(", ")}
]);

export const CONTEXTO_RANGES = new Int32Array([
  ${renderRangeArray(data.contextO).join(", ")}
]);
`;
  await fs.writeFile(path.join(OUT_DIR, "idna2008.ts"), content, "utf8");
}

async function writeJoiningTypes(ranges) {
  const content = `// Generated from Unicode 17.0.0 DerivedJoiningType.txt
// DO NOT EDIT MANUALLY.

export const JOINING_TYPE_NAMES = ["U","R","L","D","T","C"] as const;
export const JOINING_TYPE_IDS = {
  U: 0,
  R: 1,
  L: 2,
  D: 3,
  T: 4,
  C: 5,
} as const;

export const JOINING_TYPE_RANGES = new Int32Array([
  ${renderRangeArray(ranges).join(", ")}
]);
`;
  await fs.writeFile(path.join(OUT_DIR, "joining-type.ts"), content, "utf8");
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const mappingData = await parseMappingTable();
  const idna2008 = await parseIdna2008();
  const joiningTypes = await parseJoiningTypes();
  await writeMappingTable(mappingData);
  await writeIdna2008Tables(idna2008);
  await writeJoiningTypes(joiningTypes);
  console.log("Generated IDNA tables.");
}

await main();
