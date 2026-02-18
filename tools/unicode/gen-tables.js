import fs from "node:fs/promises";
import path from "node:path";

const UNICODE_VERSION = "17.0.0";
const UCD_BASE = `https://www.unicode.org/Public/${UNICODE_VERSION}/ucd/`;

const ROOT = process.cwd();
const SPEC_DIR = path.join(ROOT, "specs", "unicode", UNICODE_VERSION, "ucd");
const CACHE_DIR = path.join(ROOT, "tools", "unicode", "ucd", UNICODE_VERSION);
const OUT_DIR = path.join(ROOT, "src", "unicode", "generated");

const FILES = {
  grapheme: "auxiliary/GraphemeBreakProperty.txt",
  word: "auxiliary/WordBreakProperty.txt",
  sentence: "auxiliary/SentenceBreakProperty.txt",
  linebreak: "LineBreak.txt",
  derivedBidi: "extracted/DerivedBidiClass.txt",
  derivedGeneralCategory: "extracted/DerivedGeneralCategory.txt",
  bidiBrackets: "BidiBrackets.txt",
  bidiMirroring: "BidiMirroring.txt",
  eastAsianWidth: "EastAsianWidth.txt",
  unicodeData: "UnicodeData.txt",
  emoji: "emoji/emoji-data.txt",
  derivedCore: "DerivedCoreProperties.txt",
  propList: "PropList.txt",
};

const GCB_VALUES = [
  "Other",
  "CR",
  "LF",
  "Control",
  "Extend",
  "ZWJ",
  "Regional_Indicator",
  "Prepend",
  "SpacingMark",
  "L",
  "V",
  "T",
  "LV",
  "LVT",
  "Extended_Pictographic",
];

const WB_VALUES = [
  "Other",
  "CR",
  "LF",
  "Newline",
  "Extend",
  "ZWJ",
  "Regional_Indicator",
  "Format",
  "Katakana",
  "ALetter",
  "Hebrew_Letter",
  "Numeric",
  "ExtendNumLet",
  "MidLetter",
  "MidNum",
  "MidNumLet",
  "Single_Quote",
  "Double_Quote",
  "WSegSpace",
  "Extended_Pictographic",
];

const SB_VALUES = [
  "Other",
  "CR",
  "LF",
  "Sep",
  "Extend",
  "Format",
  "Sp",
  "Lower",
  "Upper",
  "OLetter",
  "Numeric",
  "ATerm",
  "STerm",
  "Close",
  "SContinue",
];

const LB_VALUES = [
  "XX",
  "AI",
  "AK",
  "AL",
  "AP",
  "AS",
  "B2",
  "BA",
  "BB",
  "BK",
  "CB",
  "CJ",
  "CL",
  "CM",
  "CP",
  "CR",
  "EB",
  "EM",
  "EX",
  "GL",
  "H2",
  "H3",
  "HH",
  "HL",
  "HY",
  "ID",
  "IN",
  "IS",
  "JL",
  "JT",
  "JV",
  "LF",
  "NL",
  "NS",
  "NU",
  "OP",
  "PO",
  "PR",
  "QU",
  "RI",
  "SA",
  "SG",
  "SP",
  "SY",
  "VF",
  "VI",
  "WJ",
  "ZW",
  "ZWJ",
];

const BIDI_VALUES = [
  "L",
  "R",
  "AL",
  "EN",
  "ES",
  "ET",
  "AN",
  "CS",
  "NSM",
  "BN",
  "B",
  "S",
  "WS",
  "ON",
  "LRE",
  "RLE",
  "LRO",
  "RLO",
  "PDF",
  "LRI",
  "RLI",
  "FSI",
  "PDI",
];

const INCB_VALUES = ["None", "Consonant", "Extend", "Linker"];
const GENERAL_CATEGORY_VALUES = [
  "Cn",
  "Lu",
  "Ll",
  "Lt",
  "Lm",
  "Lo",
  "Mn",
  "Mc",
  "Me",
  "Nd",
  "Nl",
  "No",
  "Pc",
  "Pd",
  "Ps",
  "Pe",
  "Pi",
  "Pf",
  "Po",
  "Sm",
  "Sc",
  "Sk",
  "So",
  "Zs",
  "Zl",
  "Zp",
  "Cc",
  "Cf",
  "Cs",
  "Co",
];

function valueMap(values) {
  return Object.fromEntries(values.map((name, index) => [name, index]));
}

const VALUE_MAPS = {
  grapheme: valueMap(GCB_VALUES),
  word: valueMap(WB_VALUES),
  sentence: valueMap(SB_VALUES),
  linebreak: valueMap(LB_VALUES),
  bidi: valueMap(BIDI_VALUES),
  generalCategory: valueMap(GENERAL_CATEGORY_VALUES),
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

function parseRanges(text, valueMap) {
  const ranges = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?\s*;\s*(\w+)/);
    if (!match) continue;
    const start = parseInt(match[1], 16);
    const end = match[2] ? parseInt(match[2], 16) : start;
    const prop = match[3];
    if (!(prop in valueMap)) {
      throw new Error(`Unknown property value: ${prop}`);
    }
    const id = valueMap[prop];
    if (id !== 0) {
      ranges.push([start, end, id]);
    }
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

function mergeBooleanRanges(ranges) {
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && last[1] + 1 === range[0]) {
      last[1] = range[1];
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function parsePropertyRanges(text, propertyName) {
  const ranges = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?\s*;\s*(\w+)/);
    if (!match) continue;
    const prop = match[3];
    if (prop !== propertyName) continue;
    const start = parseInt(match[1], 16);
    const end = match[2] ? parseInt(match[2], 16) : start;
    ranges.push([start, end, 1]);
  }
  return mergeBooleanRanges(ranges);
}

function formatRanges(ranges) {
  const flat = ranges.flat();
  const rows = [];
  for (let i = 0; i < flat.length; i += 12) {
    rows.push(`  ${flat.slice(i, i + 12).join(", ")}`);
  }
  return rows.join(",\n");
}

function generateBooleanTable(constName, ranges, sourceName) {
  return `// Generated from Unicode ${UNICODE_VERSION} ${sourceName}.\n// DO NOT EDIT MANUALLY.\n\nexport const ${constName} = new Int32Array([\n${formatRanges(ranges)}\n]);\n`;
}

function generateTable(name, values, ranges) {
  const prefix = name.toUpperCase();
  const ids = values.map((value, index) => `  ${value}: ${index}`).join(",\n");

  const flat = ranges.flat();
  const rows = [];
  for (let i = 0; i < flat.length; i += 12) {
    rows.push(`  ${flat.slice(i, i + 12).join(", ")}`);
  }

  return `// Generated from Unicode ${UNICODE_VERSION} ${name} break property data.
// DO NOT EDIT MANUALLY.

export const ${prefix}_PROPERTY_NAMES = ${JSON.stringify(values)} as const;

export const ${prefix}_PROPERTY_IDS = {
${ids}
} as const;

export const ${prefix}_RANGES = new Int32Array([\n${rows.join(",\n")}\n]);
`;
}

async function writeTable(kind, fileName, values) {
  const text = await fetchFile(fileName);
  const ranges = parseRanges(text, VALUE_MAPS[kind]);
  await ensureDir(OUT_DIR);
  const label =
    kind === "word" ? "wb" : kind === "sentence" ? "sb" : kind === "linebreak" ? "lb" : "gcb";
  const output = generateTable(label, values, ranges);
  const outPath = path.join(OUT_DIR, `${kind}-break.ts`);
  await fs.writeFile(outPath, output, "utf8");
}

async function writeBidiClassTable() {
  const text = await fetchFile(FILES.derivedBidi);
  const ranges = parseRanges(text, VALUE_MAPS.bidi);
  await ensureDir(OUT_DIR);
  const output = generateTable("bidi", BIDI_VALUES, ranges);
  const outPath = path.join(OUT_DIR, "bidi-class.ts");
  await fs.writeFile(outPath, output, "utf8");
}

function parseBidiBrackets(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)\s*;\s*([0-9A-Fa-f<>]+)\s*;\s*([ocn])/);
    if (!match) continue;
    const cp = parseInt(match[1], 16);
    const paired = match[2] === "<none>" ? -1 : parseInt(match[2], 16);
    const type = match[3];
    if (type !== "o" && type !== "c") continue;
    rows.push([cp, paired, type === "o" ? 1 : 2]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  return rows;
}

function generateBidiBracketsTable(rows) {
  const codePoints = [];
  const paired = [];
  const types = [];
  for (const [cp, pair, type] of rows) {
    codePoints.push(cp);
    paired.push(pair);
    types.push(type);
  }
  const formatArray = (arr) => {
    const rowsOut = [];
    for (let i = 0; i < arr.length; i += 12) {
      rowsOut.push(`  ${arr.slice(i, i + 12).join(", ")}`);
    }
    return rowsOut.join(",\n");
  };
  return `// Generated from Unicode ${UNICODE_VERSION} BidiBrackets.txt.\n// DO NOT EDIT MANUALLY.\n\nexport const BIDI_BRACKET_CODEPOINTS = new Int32Array([\n${formatArray(codePoints)}\n]);\n\nexport const BIDI_BRACKET_PAIRED = new Int32Array([\n${formatArray(paired)}\n]);\n\nexport const BIDI_BRACKET_TYPES = new Uint8Array([\n${formatArray(types)}\n]);\n`;
}

async function writeBidiBracketsTable() {
  const text = await fetchFile(FILES.bidiBrackets);
  const rows = parseBidiBrackets(text);
  await ensureDir(OUT_DIR);
  const output = generateBidiBracketsTable(rows);
  const outPath = path.join(OUT_DIR, "bidi-brackets.ts");
  await fs.writeFile(outPath, output, "utf8");
}

function parseBidiMirroring(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)\s*;\s*([0-9A-Fa-f]+)/);
    if (!match) continue;
    const cp = parseInt(match[1], 16);
    const mirror = parseInt(match[2], 16);
    rows.push([cp, mirror]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  return rows;
}

function generateBidiMirroringTable(rows) {
  const codePoints = [];
  const mirrors = [];
  for (const [cp, mirror] of rows) {
    codePoints.push(cp);
    mirrors.push(mirror);
  }
  const formatArray = (arr) => {
    const rowsOut = [];
    for (let i = 0; i < arr.length; i += 12) {
      rowsOut.push(`  ${arr.slice(i, i + 12).join(", ")}`);
    }
    return rowsOut.join(",\n");
  };
  return `// Generated from Unicode ${UNICODE_VERSION} BidiMirroring.txt.\n// DO NOT EDIT MANUALLY.\n\nexport const BIDI_MIRRORING_CODEPOINTS = new Int32Array([\n${formatArray(codePoints)}\n]);\n\nexport const BIDI_MIRRORING_MAP = new Int32Array([\n${formatArray(mirrors)}\n]);\n`;
}

async function writeBidiMirroringTable() {
  const text = await fetchFile(FILES.bidiMirroring);
  const rows = parseBidiMirroring(text);
  await ensureDir(OUT_DIR);
  const output = generateBidiMirroringTable(rows);
  const outPath = path.join(OUT_DIR, "bidi-mirroring.ts");
  await fs.writeFile(outPath, output, "utf8");
}

function parseIncbRanges(text) {
  const ranges = [];
  const incbValueMap = valueMap(INCB_VALUES);
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?\s*;\s*InCB\s*;\s*(\w+)/);
    if (!match) continue;
    const start = parseInt(match[1], 16);
    const end = match[2] ? parseInt(match[2], 16) : start;
    const prop = match[3];
    if (!(prop in incbValueMap)) continue;
    const id = incbValueMap[prop];
    if (id !== 0) ranges.push([start, end, id]);
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

async function writeIncbTable() {
  const text = await fetchFile(FILES.derivedCore);
  const ranges = parseIncbRanges(text);
  await ensureDir(OUT_DIR);
  const output = generateTable("incb", INCB_VALUES, ranges);
  const outPath = path.join(OUT_DIR, "incb.ts");
  await fs.writeFile(outPath, output, "utf8");
}

function parseExtendedPictographic(text) {
  const ranges = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?\s*;\s*(\w+)/);
    if (!match) continue;
    const prop = match[3];
    if (prop !== "Extended_Pictographic") continue;
    const start = parseInt(match[1], 16);
    const end = match[2] ? parseInt(match[2], 16) : start;
    ranges.push([start, end, 1]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && last[1] + 1 === range[0]) {
      last[1] = range[1];
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function generateEmojiTable(ranges) {
  const flat = ranges.flat();
  const rows = [];
  for (let i = 0; i < flat.length; i += 12) {
    rows.push(`  ${flat.slice(i, i + 12).join(", ")}`);
  }
  return `// Generated from Unicode ${UNICODE_VERSION} emoji-data.txt (Extended_Pictographic).\n// DO NOT EDIT MANUALLY.\n\nexport const EP_RANGES = new Int32Array([\n${rows.join(",\n")}\n]);\n`;
}

async function writeEmojiTable() {
  const text = await fetchFile(FILES.emoji);
  const ranges = parseExtendedPictographic(text);
  await ensureDir(OUT_DIR);
  const output = generateEmojiTable(ranges);
  const outPath = path.join(OUT_DIR, "emoji-extended-pictographic.ts");
  await fs.writeFile(outPath, output, "utf8");
}

function parseEastAsianWidth(text) {
  const ranges = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?\s*;\s*(\w+)/);
    if (!match) continue;
    const prop = match[3];
    if (prop !== "F" && prop !== "W" && prop !== "H") continue;
    const start = parseInt(match[1], 16);
    const end = match[2] ? parseInt(match[2], 16) : start;
    ranges.push([start, end, 1]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && last[1] + 1 === range[0]) {
      last[1] = range[1];
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function generateEastAsianWidthTable(ranges) {
  const flat = ranges.flat();
  const rows = [];
  for (let i = 0; i < flat.length; i += 12) {
    rows.push(`  ${flat.slice(i, i + 12).join(", ")}`);
  }
  return `// Generated from Unicode ${UNICODE_VERSION} EastAsianWidth.txt (F/W/H).\n// DO NOT EDIT MANUALLY.\n\nexport const EAW_RANGES = new Int32Array([\n${rows.join(",\n")}\n]);\n`;
}

async function writeEastAsianWidthTable() {
  const text = await fetchFile(FILES.eastAsianWidth);
  const ranges = parseEastAsianWidth(text);
  await ensureDir(OUT_DIR);
  const output = generateEastAsianWidthTable(ranges);
  const outPath = path.join(OUT_DIR, "east-asian-width.ts");
  await fs.writeFile(outPath, output, "utf8");
}

function parseGeneralCategory(text) {
  const mark = [];
  const pi = [];
  const pf = [];
  const lines = text.split(/\r?\n/);
  let rangeStart = null;
  let rangeCategory = null;

  const pushRange = (start, end, category) => {
    if (category === "Mn" || category === "Mc") {
      mark.push([start, end, 1]);
    }
    if (category === "Pi") {
      pi.push([start, end, 1]);
    }
    if (category === "Pf") {
      pf.push([start, end, 1]);
    }
  };

  for (const line of lines) {
    if (!line) continue;
    const fields = line.split(";");
    if (fields.length < 3) continue;
    const cp = parseInt(fields[0], 16);
    if (Number.isNaN(cp)) continue;
    const name = fields[1] ?? "";
    const gc = fields[2] ?? "";
    if (name.endsWith(", First>")) {
      rangeStart = cp;
      rangeCategory = gc;
      continue;
    }
    if (name.endsWith(", Last>") && rangeStart !== null && rangeCategory === gc) {
      pushRange(rangeStart, cp, gc);
      rangeStart = null;
      rangeCategory = null;
      continue;
    }
    pushRange(cp, cp, gc);
  }

  const merge = (ranges) => {
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && last[1] + 1 === range[0]) {
        last[1] = range[1];
      } else {
        merged.push(range);
      }
    }
    return merged;
  };

  return {
    mark: merge(mark),
    pi: merge(pi),
    pf: merge(pf),
  };
}

function generateGeneralCategoryTable(name, ranges) {
  const flat = ranges.flat();
  const rows = [];
  for (let i = 0; i < flat.length; i += 12) {
    rows.push(`  ${flat.slice(i, i + 12).join(", ")}`);
  }
  return `// Generated from Unicode ${UNICODE_VERSION} UnicodeData.txt (${name}).\n// DO NOT EDIT MANUALLY.\n\nexport const ${name} = new Int32Array([\n${rows.join(",\n")}\n]);\n`;
}

async function writeGeneralCategoryTables() {
  const text = await fetchFile(FILES.unicodeData);
  const { mark, pi, pf } = parseGeneralCategory(text);
  await ensureDir(OUT_DIR);
  await fs.writeFile(
    path.join(OUT_DIR, "general-category-mark.ts"),
    generateGeneralCategoryTable("GC_MARK_RANGES", mark),
    "utf8",
  );
  await fs.writeFile(
    path.join(OUT_DIR, "general-category-pi.ts"),
    generateGeneralCategoryTable("GC_PI_RANGES", pi),
    "utf8",
  );
  await fs.writeFile(
    path.join(OUT_DIR, "general-category-pf.ts"),
    generateGeneralCategoryTable("GC_PF_RANGES", pf),
    "utf8",
  );
}

async function writeGeneralCategoryAllTable() {
  const text = await fetchFile(FILES.derivedGeneralCategory);
  const ranges = parseRanges(text, VALUE_MAPS.generalCategory);
  await ensureDir(OUT_DIR);
  const output = generateTable("gc", GENERAL_CATEGORY_VALUES, ranges);
  const outPath = path.join(OUT_DIR, "general-category.ts");
  await fs.writeFile(outPath, output, "utf8");
}

function parseDerivedGeneralCategoryCn(text) {
  const ranges = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?\s*;\s*(\w+)/);
    if (!match) continue;
    const prop = match[3];
    if (prop !== "Cn") continue;
    const start = parseInt(match[1], 16);
    const end = match[2] ? parseInt(match[2], 16) : start;
    ranges.push([start, end, 1]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && last[1] + 1 === range[0]) {
      last[1] = range[1];
    } else {
      merged.push(range);
    }
  }
  return merged;
}

async function writeDerivedGeneralCategoryCn() {
  const text = await fetchFile(FILES.derivedGeneralCategory);
  const ranges = parseDerivedGeneralCategoryCn(text);
  await ensureDir(OUT_DIR);
  await fs.writeFile(
    path.join(OUT_DIR, "general-category-cn.ts"),
    generateGeneralCategoryTable("GC_CN_RANGES", ranges),
    "utf8",
  );
}

async function writeIntegrityTables() {
  const derivedCore = await fetchFile(FILES.derivedCore);
  const propList = await fetchFile(FILES.propList);

  const defaultIgnorable = parsePropertyRanges(derivedCore, "Default_Ignorable_Code_Point");
  const bidiControl = parsePropertyRanges(propList, "Bidi_Control");
  const joinControl = parsePropertyRanges(propList, "Join_Control");
  const variationSelector = parsePropertyRanges(propList, "Variation_Selector");
  const noncharacter = parsePropertyRanges(propList, "Noncharacter_Code_Point");

  await ensureDir(OUT_DIR);
  const output = `// Generated from Unicode ${UNICODE_VERSION} property lists.\n// DO NOT EDIT MANUALLY.\n\n${generateBooleanTable(
    "DEFAULT_IGNORABLE_RANGES",
    defaultIgnorable,
    "DerivedCoreProperties.txt (Default_Ignorable_Code_Point)",
  )}\n${generateBooleanTable(
    "BIDI_CONTROL_RANGES",
    bidiControl,
    "PropList.txt (Bidi_Control)",
  )}\n${generateBooleanTable(
    "JOIN_CONTROL_RANGES",
    joinControl,
    "PropList.txt (Join_Control)",
  )}\n${generateBooleanTable(
    "VARIATION_SELECTOR_RANGES",
    variationSelector,
    "PropList.txt (Variation_Selector)",
  )}\n${generateBooleanTable(
    "NONCHARACTER_RANGES",
    noncharacter,
    "PropList.txt (Noncharacter_Code_Point)",
  )}\n`;
  await fs.writeFile(path.join(OUT_DIR, "integrity-properties.ts"), output, "utf8");
}

async function main() {
  await writeTable("grapheme", FILES.grapheme, GCB_VALUES);
  await writeTable("word", FILES.word, WB_VALUES);
  await writeTable("sentence", FILES.sentence, SB_VALUES);
  await writeTable("linebreak", FILES.linebreak, LB_VALUES);
  await writeBidiClassTable();
  await writeBidiBracketsTable();
  await writeBidiMirroringTable();
  await writeEastAsianWidthTable();
  await writeGeneralCategoryTables();
  await writeGeneralCategoryAllTable();
  await writeDerivedGeneralCategoryCn();
  await writeEmojiTable();
  await writeIncbTable();
  await writeIntegrityTables();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
