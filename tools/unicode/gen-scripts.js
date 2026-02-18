import fs from "node:fs/promises";
import path from "node:path";

const UNICODE_VERSION = "17.0.0";
const UCD_BASE = `https://www.unicode.org/Public/${UNICODE_VERSION}/ucd/`;

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, "tools", "unicode", "ucd", UNICODE_VERSION);
const OUT_DIR = path.join(ROOT, "src", "unicode", "generated");

const FILES = {
  scripts: "Scripts.txt",
  scriptExtensions: "ScriptExtensions.txt",
  propertyValueAliases: "PropertyValueAliases.txt",
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fetchFile(fileName) {
  await ensureDir(CACHE_DIR);
  const cachePath = path.join(CACHE_DIR, fileName);
  try {
    return await fs.readFile(cachePath, "utf8");
  } catch {
    const url = `${UCD_BASE}${fileName}`;
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

function parseScriptRanges(text) {
  const ranges = [];
  const names = new Set();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?\s*;\s*(\w+)/);
    if (!match) continue;
    const start = Number.parseInt(match[1], 16);
    const end = match[2] ? Number.parseInt(match[2], 16) : start;
    const script = match[3];
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    names.add(script);
    ranges.push([start, end, script]);
  }
  return { ranges, names };
}

function buildScriptIds(names) {
  const list = Array.from(names);
  if (!list.includes("Unknown")) list.push("Unknown");
  list.sort((a, b) => {
    if (a === "Unknown") return -1;
    if (b === "Unknown") return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const ids = new Map();
  for (let i = 0; i < list.length; i += 1) {
    ids.set(list[i], i);
  }
  return { list, ids };
}

function mergeRanges(ranges) {
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

function parseScriptAliases(text) {
  const aliasMap = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const parts = cleaned
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 3) continue;
    if (parts[0] !== "sc") continue;
    const shortName = parts[1];
    const longName = parts[2];
    for (const alias of parts.slice(1)) {
      aliasMap.set(alias, longName);
    }
    aliasMap.set(shortName, longName);
    aliasMap.set(longName, longName);
  }
  return aliasMap;
}

function parseScriptExtensions(text, ids, aliasMap) {
  const ranges = [];
  const sets = [];
  const setMap = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?\s*;\s*(.+)$/);
    if (!match) continue;
    const start = Number.parseInt(match[1], 16);
    const end = match[2] ? Number.parseInt(match[2], 16) : start;
    const scripts = match[3].trim().split(/\s+/).filter(Boolean);
    if (!Number.isFinite(start) || !Number.isFinite(end) || scripts.length === 0) continue;
    const scriptIds = scripts
      .map((name) => ids.get(aliasMap.get(name) ?? name))
      .filter((value) => value !== undefined)
      .sort((a, b) => a - b);
    const key = scriptIds.join(",");
    let setIndex = setMap.get(key);
    if (setIndex === undefined) {
      setIndex = sets.length;
      sets.push(scriptIds);
      setMap.set(key, setIndex);
    }
    ranges.push([start, end, setIndex + 1]);
  }
  return { ranges: mergeRanges(ranges), sets: [[], ...sets] };
}

function formatArray(values) {
  const rows = [];
  for (let i = 0; i < values.length; i += 12) {
    rows.push(`  ${values.slice(i, i + 12).join(", ")}`);
  }
  return rows.join(",\n");
}

function generateScriptTable(scriptNames, scriptRanges, extRanges, extSets) {
  const idsEntries = scriptNames.map((name, index) => `  ${name}: ${index}`).join(",\n");
  const enumEntries = scriptNames.map((name, index) => `  ${name} = ${index}`).join(",\n");
  const scriptFlat = scriptRanges.flat();
  const extFlat = extRanges.flat();
  const setsText = extSets.map((set) => `  [${set.join(", ")}]`).join(",\n");

  return `// Generated from Unicode ${UNICODE_VERSION} Scripts.txt and ScriptExtensions.txt.\n// DO NOT EDIT MANUALLY.\n\nexport const SCRIPT_NAMES = ${JSON.stringify(scriptNames)} as const;\n\nexport const SCRIPT_IDS = {\n${idsEntries}\n} as const;\n\nexport enum Script {\n${enumEntries}\n}\n\nexport const SCRIPT_RANGES = new Int32Array([\n${formatArray(scriptFlat)}\n]);\n\nexport const SCRIPT_EXT_RANGES = new Int32Array([\n${formatArray(extFlat)}\n]);\n\nexport const SCRIPT_EXT_SETS = [\n${setsText}\n] as const;\n`;
}

async function main() {
  const scriptsText = await fetchFile(FILES.scripts);
  const aliasText = await fetchFile(FILES.propertyValueAliases);
  const aliasMap = parseScriptAliases(aliasText);
  const { ranges, names } = parseScriptRanges(scriptsText);
  const { list, ids } = buildScriptIds(names);
  const scriptRanges = mergeRanges(
    ranges
      .map(([start, end, script]) => [start, end, ids.get(script) ?? 0])
      .filter((range) => range[2] !== 0),
  );

  const scriptExtText = await fetchFile(FILES.scriptExtensions);
  const { ranges: extRanges, sets: extSets } = parseScriptExtensions(scriptExtText, ids, aliasMap);

  await ensureDir(OUT_DIR);
  const output = generateScriptTable(list, scriptRanges, extRanges, extSets);
  await fs.writeFile(path.join(OUT_DIR, "script.ts"), output, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
