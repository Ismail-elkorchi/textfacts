import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const ALLKEYS_PATH = path.join(ROOT, "specs", "unicode", "17.0.0", "uca", "allkeys.txt");
const PROPLIST_PATH = path.join(ROOT, "specs", "unicode", "17.0.0", "ucd", "PropList.txt");
const OUT_DIR = path.join(ROOT, "src", "collation", "generated");

function hexToInt(hex) {
  return Number.parseInt(hex, 16);
}

function parseImplicitWeights(lines) {
  const ranges = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("@implicitweights")) continue;
    const match = trimmed.match(
      /@implicitweights\s+([0-9A-Fa-f]+)\.\.([0-9A-Fa-f]+);\s*([0-9A-Fa-f]+)/,
    );
    if (!match) continue;
    ranges.push({
      start: hexToInt(match[1]),
      end: hexToInt(match[2]),
      base: hexToInt(match[3]),
    });
  }
  return ranges;
}

function parseUnifiedIdeographRanges(text) {
  const ranges = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.split("#")[0]?.trim();
    if (!cleaned) continue;
    const parts = cleaned.split(";").map((part) => part.trim());
    if (parts.length < 2) continue;
    if (parts[1] !== "Unified_Ideograph") continue;
    const rangePart = parts[0] ?? "";
    const rangeMatch = rangePart.match(/^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?$/);
    if (!rangeMatch) continue;
    const start = hexToInt(rangeMatch[1]);
    const end = rangeMatch[2] ? hexToInt(rangeMatch[2]) : start;
    ranges.push({ start, end });
  }
  return ranges;
}

function parseAllKeys(lines) {
  const primary = [];
  const secondary = [];
  const tertiary = [];
  const single = [];
  const contractions = [];

  const addExpansion = (ces) => {
    const index = primary.length;
    for (const ce of ces) {
      primary.push(ce.primary);
      secondary.push(ce.secondary);
      tertiary.push(ce.tertiary);
    }
    return { index, length: ces.length };
  };

  for (const line of lines) {
    const trimmed = line.split("#")[0]?.trim();
    if (!trimmed || trimmed.startsWith("@")) continue;
    const parts = trimmed.split(";");
    if (parts.length < 2) continue;
    const left = parts[0]?.trim() ?? "";
    const right = parts[1]?.trim() ?? "";
    if (!left || !right) continue;

    const codepoints = left
      .split(/\s+/)
      .filter(Boolean)
      .map((hex) => hexToInt(hex));
    if (codepoints.length === 0) continue;

    const ceMatches = right.match(/\[[^\]]+\]/g) ?? [];
    const ces = [];
    for (const raw of ceMatches) {
      let inner = raw.slice(1, -1).trim();
      let variable = false;
      if (inner.startsWith("*")) {
        variable = true;
        inner = inner.slice(1);
      }
      if (inner.startsWith(".")) inner = inner.slice(1);
      const parts = inner.split(".");
      if (parts.length < 3) continue;
      const primaryWeight = hexToInt(parts[0] ?? "0");
      const secondaryWeight = hexToInt(parts[1] ?? "0");
      const tertiaryWeight = hexToInt(parts[2] ?? "0");
      const tertiaryFlag = variable ? tertiaryWeight | 0x8000 : tertiaryWeight;
      ces.push({
        primary: primaryWeight,
        secondary: secondaryWeight,
        tertiary: tertiaryFlag,
      });
    }
    if (ces.length === 0) continue;

    const expansion = addExpansion(ces);
    if (codepoints.length === 1) {
      single.push({ cp: codepoints[0], index: expansion.index, length: expansion.length });
    } else {
      contractions.push({ sequence: codepoints, index: expansion.index, length: expansion.length });
    }
  }

  single.sort((a, b) => a.cp - b.cp);
  return { primary, secondary, tertiary, single, contractions };
}

function buildContractionTrie(contractions) {
  const nodes = [{ edges: new Map(), index: 0, length: 0 }];
  for (const entry of contractions) {
    let nodeIndex = 0;
    for (const cp of entry.sequence) {
      const node = nodes[nodeIndex];
      let next = node.edges.get(cp);
      if (next === undefined) {
        next = nodes.length;
        node.edges.set(cp, next);
        nodes.push({ edges: new Map(), index: 0, length: 0 });
      }
      nodeIndex = next;
    }
    nodes[nodeIndex].index = entry.index;
    nodes[nodeIndex].length = entry.length;
  }

  const nodeFirst = [];
  const nodeCount = [];
  const nodeIndex = [];
  const nodeLength = [];
  const edgeCodepoints = [];
  const edgeChild = [];

  for (const node of nodes) {
    const edges = Array.from(node.edges.entries()).sort((a, b) => a[0] - b[0]);
    nodeFirst.push(edgeCodepoints.length);
    nodeCount.push(edges.length);
    nodeIndex.push(node.index);
    nodeLength.push(node.length);
    for (const [cp, child] of edges) {
      edgeCodepoints.push(cp);
      edgeChild.push(child);
    }
  }

  return {
    nodeFirst,
    nodeCount,
    nodeIndex,
    nodeLength,
    edgeCodepoints,
    edgeChild,
  };
}

function formatArray(values, columns = 16) {
  const lines = [];
  for (let i = 0; i < values.length; i += columns) {
    lines.push(values.slice(i, i + columns).join(", "));
  }
  return lines.join(",\n  ");
}

async function writeFile(relativePath, content) {
  const target = path.join(ROOT, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function main() {
  const allkeysText = await fs.readFile(ALLKEYS_PATH, "utf8");
  const allLines = allkeysText.split(/\r?\n/);
  const implicitRanges = parseImplicitWeights(allLines).sort((a, b) => a.start - b.start);
  const baseStarts = new Map();
  for (const range of implicitRanges) {
    const current = baseStarts.get(range.base);
    if (current === undefined || range.start < current) {
      baseStarts.set(range.base, range.start);
    }
  }
  const parsed = parseAllKeys(allLines);
  const trie = buildContractionTrie(parsed.contractions);

  const propListText = await fs.readFile(PROPLIST_PATH, "utf8");
  const unifiedRanges = parseUnifiedIdeographRanges(propListText).sort((a, b) => a.start - b.start);

  const singleCodepoints = parsed.single.map((entry) => entry.cp);
  const singleIndex = parsed.single.map((entry) => entry.index);
  const singleLength = parsed.single.map((entry) => entry.length);

  await fs.mkdir(OUT_DIR, { recursive: true });

  await writeFile(
    "src/collation/generated/ducet-expansions.ts",
    `export const DUCET_CE_PRIMARY = new Uint16Array([\n  ${formatArray(parsed.primary)}\n]);\n` +
      `export const DUCET_CE_SECONDARY = new Uint16Array([\n  ${formatArray(parsed.secondary)}\n]);\n` +
      `export const DUCET_CE_TERTIARY = new Uint16Array([\n  ${formatArray(parsed.tertiary)}\n]);\n`,
  );

  await writeFile(
    "src/collation/generated/ducet-single.ts",
    `export const DUCET_SINGLE_CODEPOINTS = new Uint32Array([\n  ${formatArray(singleCodepoints)}\n]);\n` +
      `export const DUCET_SINGLE_INDEX = new Uint32Array([\n  ${formatArray(singleIndex)}\n]);\n` +
      `export const DUCET_SINGLE_LENGTH = new Uint16Array([\n  ${formatArray(singleLength)}\n]);\n`,
  );

  await writeFile(
    "src/collation/generated/ducet-contractions.ts",
    `export const DUCET_CONTRACTION_NODE_FIRST = new Uint32Array([\n  ${formatArray(trie.nodeFirst)}\n]);\n` +
      `export const DUCET_CONTRACTION_NODE_COUNT = new Uint16Array([\n  ${formatArray(trie.nodeCount)}\n]);\n` +
      `export const DUCET_CONTRACTION_NODE_INDEX = new Uint32Array([\n  ${formatArray(trie.nodeIndex)}\n]);\n` +
      `export const DUCET_CONTRACTION_NODE_LENGTH = new Uint16Array([\n  ${formatArray(trie.nodeLength)}\n]);\n` +
      `export const DUCET_CONTRACTION_EDGE_CODEPOINT = new Uint32Array([\n  ${formatArray(trie.edgeCodepoints)}\n]);\n` +
      `export const DUCET_CONTRACTION_EDGE_CHILD = new Uint32Array([\n  ${formatArray(trie.edgeChild)}\n]);\n`,
  );

  await writeFile(
    "src/collation/generated/ducet-implicit.ts",
    `export const DUCET_IMPLICIT_RANGES_START = new Uint32Array([\n  ${formatArray(
      implicitRanges.map((r) => r.start),
    )}\n]);\n` +
      `export const DUCET_IMPLICIT_RANGES_END = new Uint32Array([\n  ${formatArray(
        implicitRanges.map((r) => r.end),
      )}\n]);\n` +
      `export const DUCET_IMPLICIT_RANGES_BASE = new Uint16Array([\n  ${formatArray(
        implicitRanges.map((r) => r.base),
      )}\n]);\n` +
      `export const DUCET_IMPLICIT_RANGES_BASE_START = new Uint32Array([\n  ${formatArray(
        implicitRanges.map((r) => baseStarts.get(r.base) ?? r.start),
      )}\n]);\n` +
      `export const UNIFIED_IDEOGRAPH_RANGES_START = new Uint32Array([\n  ${formatArray(
        unifiedRanges.map((r) => r.start),
      )}\n]);\n` +
      `export const UNIFIED_IDEOGRAPH_RANGES_END = new Uint32Array([\n  ${formatArray(
        unifiedRanges.map((r) => r.end),
      )}\n]);\n` +
      `export const CORE_HAN_RANGES_START = new Uint32Array([0x4e00, 0xf900]);\n` +
      `export const CORE_HAN_RANGES_END = new Uint32Array([0x9fff, 0xfaff]);\n`,
  );

  console.log("DUCET tables generated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
