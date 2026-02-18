import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "docs", "duplication");
const REPORT_JSON = path.join(OUT_DIR, "duplication-report.v1.json");
const REPORT_MD = path.join(OUT_DIR, "duplication-report.md");
const ALLOWLIST_PATH = path.join(OUT_DIR, "allowlist.v1.json");
const MARKDOWN_MANIFEST_PATH = path.join(ROOT, "docs", "markdown", "markdown-manifest.v1.json");
const DIST_PATH = fileURLToPath(new URL("../../dist/src/all/mod.js", import.meta.url));

const EXCLUDE_DIRS = new Set(["node_modules", "dist", "dist-test", ".git", "specs"]);
const EXCLUDE_FILES = new Set(["docs/duplication/duplication-report.md"]);

const OPTIONS = {
  tokenizer: "uax29-word",
  canonicalKey: "nfkcCaseFold",
  k: 5,
  window: 4,
  dedupe: "by-hash",
};

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function collectMarkdownPathsRecursive(dirPath, markdownPathAccumulator) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownPathsRecursive(entryPath, markdownPathAccumulator);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const rel = normalizePath(path.relative(ROOT, entryPath));
      if (EXCLUDE_FILES.has(rel)) continue;
      markdownPathAccumulator.push(entryPath);
    }
  }
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
  return `{${entries.join(",")}}`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function assertIJsonValue(value, context) {
  if (value === null) return;
  const valueType = typeof value;
  if (valueType === "string") {
    for (let index = 0; index < value.length; ) {
      const cu = value.charCodeAt(index);
      if (cu >= 0xd800 && cu <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          const cp = ((cu - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
          if (
            (cp >= 0xfdd0 && cp <= 0xfdef) ||
            (cp & 0xffff) === 0xfffe ||
            (cp & 0xffff) === 0xffff
          ) {
            throw new Error(`${context}: noncharacter U+${cp.toString(16)}`);
          }
          index += 2;
          continue;
        }
        throw new Error(`${context}: lone surrogate`);
      }
      if (cu >= 0xdc00 && cu <= 0xdfff) {
        throw new Error(`${context}: lone surrogate`);
      }
      if ((cu >= 0xfdd0 && cu <= 0xfdef) || (cu & 0xffff) === 0xfffe || (cu & 0xffff) === 0xffff) {
        throw new Error(`${context}: noncharacter U+${cu.toString(16)}`);
      }
      index += 1;
    }
    return;
  }
  if (valueType === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${context}: non-finite number`);
    }
    return;
  }
  if (valueType === "boolean") return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertIJsonValue(value[index], `${context}[${index}]`);
    }
    return;
  }
  if (valueType === "object") {
    for (const key of Object.keys(value)) {
      assertIJsonValue(key, `${context}.key`);
      assertIJsonValue(value[key], `${context}.${key}`);
    }
    return;
  }
  throw new Error(`${context}: unsupported type ${valueType}`);
}

function validateAllowlist(allowlist) {
  if (!allowlist || typeof allowlist !== "object") {
    throw new Error("allowlist: expected object");
  }
  if (allowlist.v !== 1) {
    throw new Error("allowlist: v must be 1");
  }
  const entries = allowlist.entries ?? [];
  if (!Array.isArray(entries)) {
    throw new Error("allowlist: entries must be an array");
  }
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      throw new Error("allowlist: entry must be an object");
    }
    if (typeof entry.fileA !== "string" || entry.fileA.length === 0) {
      throw new Error("allowlist: entry.fileA required");
    }
    if (typeof entry.fileB !== "string" || entry.fileB.length === 0) {
      throw new Error("allowlist: entry.fileB required");
    }
    if (entry.fileA === entry.fileB) {
      throw new Error("allowlist: entry fileA and fileB must differ");
    }
    if (typeof entry.justification !== "string" || entry.justification.length === 0) {
      throw new Error("allowlist: entry.justification required");
    }
  }
  return entries;
}

function parseSourceDate(value) {
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const date = new Date(Number(value) * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  return null;
}

function getStableGeneratedAt() {
  const env =
    parseSourceDate(process.env.SOURCE_DATE_EPOCH) ||
    parseSourceDate(process.env.TEXTFACTS_GENERATED_AT);
  if (env) return env;
  try {
    return execSync("git log -1 --format=%cI", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return new Date().toISOString();
  }
}

function setIntersectionCount(leftSet, rightSet) {
  let count = 0;
  for (const item of leftSet) {
    if (rightSet.has(item)) count += 1;
  }
  return count;
}

function uniquePairs(files) {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < files.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < files.length; rightIndex += 1) {
      pairs.push([files[leftIndex], files[rightIndex]]);
    }
  }
  return pairs;
}

function normalizePair(leftPath, rightPath) {
  return [leftPath, rightPath].sort().join("::");
}

async function main() {
  await fs.access(DIST_PATH).catch(() => {
    throw new Error("dist/src/all/mod.js not found. Run `npm run build` first.");
  });
  const textfacts = await import(pathToFileURL(DIST_PATH).href);
  await fs.mkdir(OUT_DIR, { recursive: true });

  const files = [];
  await collectMarkdownPathsRecursive(ROOT, files);
  const relFiles = files.map((p) => normalizePath(path.relative(ROOT, p))).sort();

  const manifest = JSON.parse(await fs.readFile(MARKDOWN_MANIFEST_PATH, "utf8"));
  const manifestByPath = new Map(
    (manifest.files ?? []).map((entry) => [normalizePath(entry.path), entry]),
  );

  const allowlist = JSON.parse(await fs.readFile(ALLOWLIST_PATH, "utf8"));
  assertIJsonValue(allowlist, "allowlist.v1.json");
  const allowEntries = validateAllowlist(allowlist);
  const allowPairs = new Set(allowEntries.map((entry) => normalizePair(entry.fileA, entry.fileB)));

  const fileData = new Map();
  for (const rel of relFiles) {
    const text = await fs.readFile(path.join(ROOT, rel), "utf8");
    const bytes = Buffer.byteLength(text, "utf8");
    const tokens = textfacts.tokenizeForComparison(text, {
      tokenizer: OPTIONS.tokenizer,
      canonicalKey: OPTIONS.canonicalKey,
      materialize: "none",
    });
    const words = tokens.length;
    const result = textfacts.winnowingFingerprints(text, {
      tokenizer: OPTIONS.tokenizer,
      canonicalKey: OPTIONS.canonicalKey,
      k: OPTIONS.k,
      window: OPTIONS.window,
      dedupe: OPTIONS.dedupe,
    });
    const fingerprints = result.fingerprints ?? [];
    const fpSet = new Set(fingerprints.map((fp) => fp.hash64Hex));
    fileData.set(rel, { text, bytes, words, fingerprints, fpSet });
  }

  const pairs = [];
  for (const [fileA, fileB] of uniquePairs(relFiles)) {
    const dataA = fileData.get(fileA);
    const dataB = fileData.get(fileB);
    if (!dataA || !dataB) continue;
    const overlap = setIntersectionCount(dataA.fpSet, dataB.fpSet);
    const sizeA = dataA.fpSet.size || 1;
    const sizeB = dataB.fpSet.size || 1;
    const containmentA = overlap / sizeA;
    const containmentB = overlap / sizeB;
    const union = sizeA + sizeB - overlap;
    const jaccard = union === 0 ? 0 : overlap / union;

    pairs.push({
      fileA,
      fileB,
      sizeA: {
        bytes: dataA.bytes,
        words: dataA.words,
        fingerprints: dataA.fpSet.size,
      },
      sizeB: {
        bytes: dataB.bytes,
        words: dataB.words,
        fingerprints: dataB.fpSet.size,
      },
      containmentAinB: containmentA,
      containmentBinA: containmentB,
      jaccard,
      overlapCount: overlap,
      matches: [],
    });
  }

  pairs.sort((a, b) => {
    const maxA = Math.max(a.containmentAinB, a.containmentBinA);
    const maxB = Math.max(b.containmentAinB, b.containmentBinA);
    if (maxB !== maxA) return maxB - maxA;
    return b.jaccard - a.jaccard;
  });

  const topPairs = pairs.slice(0, 50);
  for (const pair of topPairs) {
    const dataA = fileData.get(pair.fileA);
    const dataB = fileData.get(pair.fileB);
    if (!dataA || !dataB) continue;
    const hashToB = new Map();
    for (const fp of dataB.fingerprints) {
      if (!hashToB.has(fp.hash64Hex)) {
        hashToB.set(fp.hash64Hex, fp);
      }
    }
    const matches = [];
    for (const fp of dataA.fingerprints) {
      const other = hashToB.get(fp.hash64Hex);
      if (!other) continue;
      matches.push({
        hash: fp.hash64Hex,
        tokenIndexA: fp.tokenIndex,
        spanA: fp.span,
        tokenIndexB: other.tokenIndex,
        spanB: other.span,
      });
      if (matches.length >= 5) break;
    }
    pair.matches = matches;
  }

  const report = {
    v: 1,
    generatedAt: getStableGeneratedAt(),
    options: OPTIONS,
    fileCount: relFiles.length,
    pairs: topPairs,
  };

  const reportText = JSON.stringify(report, null, 2) + "\n";
  await fs.writeFile(REPORT_JSON, reportText, "utf8");

  const reportMdLines = [
    "# Duplication Report",
    "",
    "_Generated by `node tools/docs/duplication.mjs`._",
    "",
    "## Top Similarity Pairs",
    "",
    "| File A | File B | Containment (max) | Jaccard | Overlap |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const pair of topPairs) {
    const maxContainment = Math.max(pair.containmentAinB, pair.containmentBinA);
    reportMdLines.push(
      `| ${pair.fileA} | ${pair.fileB} | ${maxContainment.toFixed(4)} | ${pair.jaccard.toFixed(4)} | ${pair.overlapCount} |`,
    );
  }
  reportMdLines.push("");
  await fs.writeFile(REPORT_MD, reportMdLines.join("\n"), "utf8");

  const canonical = canonicalize(report);
  const hash = sha256(canonical);
  const hashPath = path.join(OUT_DIR, "duplication-report.v1.jcs.sha256.txt");
  await fs.writeFile(hashPath, `sha256:${hash}\n`, "utf8");

  let gatingFailures = 0;
  for (const pair of topPairs) {
    const maxContainment = Math.max(pair.containmentAinB, pair.containmentBinA);
    const minWords = Math.min(pair.sizeA.words, pair.sizeB.words);
    if (maxContainment < 0.97 || minWords < 200) continue;

    const entryA = manifestByPath.get(pair.fileA);
    const entryB = manifestByPath.get(pair.fileB);
    const explicitRelation =
      (entryA?.supersededBy && entryA.supersededBy === pair.fileB) ||
      (entryB?.supersededBy && entryB.supersededBy === pair.fileA) ||
      (Array.isArray(entryA?.canonicalFor) && entryA.canonicalFor.includes(pair.fileB)) ||
      (Array.isArray(entryB?.canonicalFor) && entryB.canonicalFor.includes(pair.fileA)) ||
      allowPairs.has(normalizePair(pair.fileA, pair.fileB));

    if (!explicitRelation) {
      gatingFailures += 1;
    }
  }

  const summary = [
    `Duplication report: files=${relFiles.length}`,
    `pairs=${topPairs.length}`,
    `gatingFailures=${gatingFailures}`,
  ].join(" ");
  if (gatingFailures > 0) {
    console.error(summary);
    process.exit(1);
  }
  console.log(summary);
}

await main();
