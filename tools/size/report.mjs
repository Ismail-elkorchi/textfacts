import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { execSync } from "node:child_process";
import esbuild from "esbuild";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "book", "artifacts", "size");
const REPORT_PATH = path.join(OUT_DIR, "size-report.v1.json");
const HASH_PATH = path.join(OUT_DIR, "size-report.v1.jcs.sha256.txt");
const MD_PATH = path.join(OUT_DIR, "size-report.md");
const BUDGET_PATH = path.join(OUT_DIR, "budgets.v1.json");

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

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function inferSourcePath(pkgEntry) {
  if (typeof pkgEntry === "string") {
    if (pkgEntry.startsWith("./dist/")) {
      const rel = pkgEntry.replace(/^\.\/dist\//, "./").replace(/\.js$/, ".ts");
      if (rel === "./mod.ts") return rel;
      if (rel.startsWith("./src/")) return rel;
    }
    return null;
  }
  if (pkgEntry && typeof pkgEntry === "object") {
    const importPath = pkgEntry.import ?? pkgEntry.default;
    if (typeof importPath === "string") {
      return inferSourcePath(importPath);
    }
  }
  return null;
}

async function loadEntrypoints() {
  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
  const deno = JSON.parse(await fs.readFile(path.join(ROOT, "deno.json"), "utf8"));

  const pkgExports = pkg.exports ?? {};
  const denoExports = deno.exports ?? {};
  const ids = new Set([...Object.keys(pkgExports), ...Object.keys(denoExports)]);

  const entrypoints = [];
  for (const id of ids) {
    let sourcePath = denoExports[id];
    if (!sourcePath) {
      sourcePath = inferSourcePath(pkgExports[id]);
    }
    if (!sourcePath) {
      throw new Error(`Unable to resolve source entrypoint for export ${id}`);
    }
    const abs = path.resolve(ROOT, sourcePath);
    await fs.access(abs);
    entrypoints.push({ id, abs, path: normalizePath(path.relative(ROOT, abs)) });
  }

  entrypoints.sort((a, b) => a.id.localeCompare(b.id));
  return entrypoints;
}

function getEntryOutput(result) {
  const output =
    result.outputFiles.find((file) => file.path.endsWith(".js")) ?? result.outputFiles[0];
  if (!output) throw new Error("No esbuild output produced");
  return output.text ?? new TextDecoder().decode(output.contents);
}

function collectTopLevelImports(entryKey, metafile, entrypointMap) {
  const entry = metafile.inputs[entryKey];
  if (!entry) return [];
  const seen = new Set();
  for (const imp of entry.imports ?? []) {
    if (!imp.path) continue;
    let normalized = imp.path;
    if (path.isAbsolute(normalized)) {
      normalized = normalizePath(path.relative(ROOT, normalized));
    } else {
      normalized = normalizePath(normalized);
    }
    const match = entrypointMap.get(normalized);
    if (match) seen.add(match);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

function renderMarkdown(report) {
  const rows = report.entrypoints
    .slice()
    .sort((a, b) => b.bytes.gzip - a.bytes.gzip)
    .map(
      (entry) =>
        `| ${entry.id} | ${entry.bytes.minified} | ${entry.bytes.gzip} | ${entry.sha256.slice(0, 12)} | ${entry.imports.join(", ")} |`,
    );

  return [
    "# Size Report",
    "",
    `_Generated by \`npm run size:report\`._`,
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Node: ${report.environment.node}`,
    `- Esbuild: ${report.environment.esbuild}`,
    `- Platform: ${report.environment.platform} (${report.environment.arch})`,
    "",
    "## Entrypoints",
    "",
    "| Entrypoint | Minified bytes | Gzip bytes | sha256 (prefix) | Top-level imports |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

async function evalBudgetConstraints(report) {
  const errors = [];
  let budgets;
  try {
    const text = await fs.readFile(BUDGET_PATH, "utf8");
    budgets = JSON.parse(text);
  } catch (error) {
    errors.push(`Unable to read budgets: ${error.message}`);
    budgets = null;
  }

  if (budgets) {
    try {
      assertIJsonValue(budgets, "budgets.v1.json");
    } catch (error) {
      errors.push(`I-JSON validation failed: ${error.message}`);
    }
    const reportHash = sha256(canonicalize(report));
    if (budgets.report?.sha256 !== `sha256:${reportHash}`) {
      errors.push(`Budgets report hash mismatch (expected sha256:${reportHash})`);
    }

    const budgetMap = new Map();
    for (const entry of budgets.budgets ?? []) {
      budgetMap.set(entry.id, entry.gzipBytes);
    }
    const reportIds = new Set();
    for (const entry of report.entrypoints ?? []) {
      reportIds.add(entry.id);
    }
    const missingBudgets = [];
    for (const id of reportIds) {
      if (!budgetMap.has(id)) missingBudgets.push(id);
    }
    const extraBudgets = [];
    for (const id of budgetMap.keys()) {
      if (!reportIds.has(id)) extraBudgets.push(id);
    }
    if (missingBudgets.length > 0) {
      errors.push(`Missing budgets for entrypoints: ${missingBudgets.join(", ")}`);
    }
    if (extraBudgets.length > 0) {
      errors.push(`Budgets defined for missing entrypoints: ${extraBudgets.join(", ")}`);
    }
    const overages = [];
    for (const entry of report.entrypoints ?? []) {
      const limit = budgetMap.get(entry.id);
      if (limit == null) continue;
      if (entry.bytes?.gzip > limit) {
        overages.push(`${entry.id} (${entry.bytes.gzip} > ${limit})`);
      }
    }
    if (overages.length > 0) {
      errors.push(
        `Size budgets exceeded: ${overages.join(", ")}. Provide a dossier budget increase claim and update budgets.v1.json`,
      );
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    console.error(`size:validate summary: entrypoints=${report.entrypoints?.length ?? 0}`);
    process.exit(1);
  }
  console.log(`size:validate summary: entrypoints=${report.entrypoints?.length ?? 0} ok`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const isBudgetValidateMode = args.has("--validate");
  const entrypoints = await loadEntrypoints();
  const entrypointMap = new Map();
  for (const entry of entrypoints) {
    entrypointMap.set(entry.path, entry.id);
    entrypointMap.set(normalizePath(entry.abs), entry.id);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  const report = {
    v: 1,
    generatedAt: getStableGeneratedAt(),
    environment: {
      node: process.version,
      esbuild: esbuild.version,
      platform: process.platform,
      arch: process.arch,
    },
    entrypoints: [],
  };

  for (const entry of entrypoints) {
    const result = await esbuild.build({
      entryPoints: [entry.abs],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: ["es2020"],
      minify: true,
      treeShaking: true,
      legalComments: "none",
      write: false,
      metafile: true,
      logLevel: "silent",
    });

    const outputText = getEntryOutput(result);
    const minifiedBytes = Buffer.byteLength(outputText, "utf8");
    const gzipBytes = zlib.gzipSync(Buffer.from(outputText, "utf8")).length;
    const hash = sha256(outputText);
    const imports = collectTopLevelImports(entry.path, result.metafile, entrypointMap);

    report.entrypoints.push({
      id: entry.id,
      path: entry.path,
      bytes: { minified: minifiedBytes, gzip: gzipBytes },
      sha256: hash,
      imports,
    });
  }

  assertIJsonValue(report, "size-report.v1.json");
  const reportText = JSON.stringify(report, null, 2) + "\n";
  await fs.writeFile(REPORT_PATH, reportText, "utf8");
  await fs.writeFile(HASH_PATH, `sha256:${sha256(canonicalize(report))}\n`, "utf8");
  await fs.writeFile(MD_PATH, renderMarkdown(report), "utf8");

  if (isBudgetValidateMode) {
    await evalBudgetConstraints(report);
  }

  if (args.has("--verify")) {
    const status = runGit("status --porcelain");
    if (status.length > 0) {
      console.error("Working tree dirty after size:report");
      console.error(status);
      process.exit(1);
    }
  }

  console.log(
    `size:report summary: entrypoints=${report.entrypoints.length} env=${report.environment.node}`,
  );
}

await main();
