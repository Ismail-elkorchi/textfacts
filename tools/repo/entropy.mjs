import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "docs", "entropy");
const REPORT_PATH = path.join(OUT_DIR, "entropy-report.v1.json");
const HASH_PATH = path.join(OUT_DIR, "entropy-report.v1.jcs.sha256.txt");
const MD_PATH = path.join(OUT_DIR, "entropy-report.md");

const isNoncharacter = (cp) =>
  (cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xffff) === 0xfffe || (cp & 0xffff) === 0xffff;

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
          if (isNoncharacter(cp)) {
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
      if (isNoncharacter(cu)) {
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

function runGit(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch (error) {
    throw new Error(`git ${args} failed: ${error.message}`);
  }
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
  return runGit("log -1 --format=%cI");
}

function countTopLevelSrcModules(files) {
  const modules = new Set();
  for (const file of files) {
    if (!file.startsWith("src/")) continue;
    const rest = file.slice("src/".length);
    const name = rest.split("/")[0];
    if (name) modules.add(name);
  }
  return modules.size;
}

function countGeneratedTables(files) {
  let count = 0;
  for (const file of files) {
    if (!file.startsWith("src/")) continue;
    if (file.includes("/generated/")) count += 1;
  }
  return count;
}

function renderMarkdown(report) {
  const definitions = {
    totalTrackedFiles: "Count of git-tracked files (`git ls-files`).",
    totalMarkdownFiles: "Count of tracked `.md` files across the repo.",
    totalNpmScripts: "Number of npm scripts in `package.json`.",
    totalEntrypoints: "Number of `package.json` export entrypoints.",
    totalJsrExports: "Number of `deno.json` exports (JSR).",
    totalSrcModules: "Top-level module folders under `src/`.",
    totalToolScripts: "Tool scripts under `tools/` (`.mjs`, `.js`, `.ts`).",
    totalSchemas: "Schema files under `schemas/*.schema.json`.",
    totalInteropCases: "Interop cases listed in `interop/manifest.json`.",
    totalGeneratedTables: "Files under `src/**/generated/`.",
  };
  const rows = Object.keys(report.current).map((key) => {
    const current = report.current[key];
    const baseline = report.baseline ? report.baseline[key] : null;
    const delta = baseline == null ? "" : String(current - baseline);
    return `| ${key} | ${baseline ?? "-"} | ${current} | ${delta} |`;
  });
  const definitionLines = Object.entries(definitions).map(([key, text]) => `- \`${key}\`: ${text}`);

  return [
    "# Entropy Report",
    "",
    `_Generated by \`npm run entropy:report\`._`,
    "",
    `- Generated at: ${report.generatedAt}`,
    "",
    "## Metric Definitions",
    ...definitionLines,
    "",
    "| Metric | Baseline | Current | Delta |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  runGit("rev-parse --is-inside-work-tree");
  const rawList = runGit("ls-files");
  const files = rawList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((a, b) => a.localeCompare(b));

  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
  const deno = JSON.parse(await fs.readFile(path.join(ROOT, "deno.json"), "utf8"));
  const interop = JSON.parse(
    await fs.readFile(path.join(ROOT, "interop", "manifest.json"), "utf8"),
  );

  const current = {
    totalTrackedFiles: files.length,
    totalMarkdownFiles: files.filter((file) => file.endsWith(".md")).length,
    totalNpmScripts: Object.keys(pkg.scripts ?? {}).length,
    totalEntrypoints: Object.keys(pkg.exports ?? {}).length,
    totalJsrExports: Object.keys(deno.exports ?? {}).length,
    totalSrcModules: countTopLevelSrcModules(files),
    totalToolScripts: files.filter(
      (file) => file.startsWith("tools/") && /\.(mjs|js|ts)$/.test(file),
    ).length,
    totalSchemas: files.filter(
      (file) => file.startsWith("schemas/") && file.endsWith(".schema.json"),
    ).length,
    totalInteropCases: (interop.cases ?? []).length,
    totalGeneratedTables: countGeneratedTables(files),
  };

  await fs.mkdir(OUT_DIR, { recursive: true });

  let baseline = null;
  try {
    const previous = JSON.parse(await fs.readFile(REPORT_PATH, "utf8"));
    if (previous?.baseline) {
      baseline = previous.baseline;
    } else if (previous?.current) {
      baseline = previous.current;
    }
  } catch {
    baseline = null;
  }

  const report = {
    v: 1,
    generatedAt: getStableGeneratedAt(),
    ...(baseline ? { baseline } : {}),
    current,
  };

  assertIJsonValue(report, "entropy-report.v1.json");
  const reportText = JSON.stringify(report, null, 2) + "\n";
  await fs.writeFile(REPORT_PATH, reportText, "utf8");
  await fs.writeFile(HASH_PATH, `sha256:${sha256(canonicalize(report))}\n`, "utf8");
  await fs.writeFile(MD_PATH, renderMarkdown(report), "utf8");

  if (args.has("--verify")) {
    const status = runGit("status --porcelain");
    if (status.length > 0) {
      console.error("Working tree dirty after entropy:report");
      console.error(status);
      process.exit(1);
    }
  }

  console.log(
    `entropy:report summary: files=${current.totalTrackedFiles} docs=${current.totalMarkdownFiles} entrypoints=${current.totalEntrypoints}`,
  );
}

await main();
