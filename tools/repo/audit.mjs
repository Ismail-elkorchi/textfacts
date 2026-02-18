import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "docs", "coherence-report.md");
const DIST_PATH = fileURLToPath(new URL("../../dist/src/all/mod.js", import.meta.url));
const MARKDOWN_MANIFEST_PATH = path.join(ROOT, "docs", "markdown", "markdown-manifest.v1.json");

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

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function collectFilePathsRecursive(dirPath, filePathAccumulator) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectFilePathsRecursive(entryPath, filePathAccumulator);
    } else if (entry.isFile()) {
      filePathAccumulator.push(entryPath);
    }
  }
}

function isExternalLink(link) {
  return /^(https?:|mailto:|tel:|data:)/i.test(link);
}

function stripTitle(link) {
  const trimmed = link.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.slice(1, -1);
  }
  const spaceIdx = trimmed.indexOf(" ");
  return spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
}

async function readMarkdownManifest() {
  try {
    await fs.access(MARKDOWN_MANIFEST_PATH);
  } catch {
    execSync("node tools/docs/markdown-manifest.mjs", { cwd: ROOT, stdio: "ignore" });
  }
  const text = await fs.readFile(MARKDOWN_MANIFEST_PATH, "utf8");
  return JSON.parse(text);
}

async function evalExportClosure(errors) {
  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
  const deno = JSON.parse(await fs.readFile(path.join(ROOT, "deno.json"), "utf8"));
  const modText = await fs.readFile(path.join(ROOT, "mod.ts"), "utf8");

  const pkgExports = Object.keys(pkg.exports ?? {});
  const denoExports = Object.keys(deno.exports ?? {});
  const pkgExportModules = new Set(
    pkgExports.filter((key) => key.startsWith("./")).map((key) => key.slice(2)),
  );
  const denoExportModules = new Set();

  const missingPkg = [];
  for (const key of pkgExports) {
    if (key === ".") {
      const full = path.join(ROOT, "mod.ts");
      await fs.access(full).catch(() => missingPkg.push("mod.ts"));
      continue;
    }
    if (!key.startsWith("./")) continue;
    const rel = key.slice(2);
    const entry = path.join(ROOT, "src", rel, "mod.ts");
    await fs.access(entry).catch(() => missingPkg.push(`src/${rel}/mod.ts`));
  }

  const missingDeno = [];
  for (const key of denoExports) {
    const rel = deno.exports[key];
    const entry = path.join(ROOT, rel);
    await fs.access(entry).catch(() => missingDeno.push(rel));
    if (rel.startsWith("./src/") && rel.endsWith("/mod.ts")) {
      const moduleName = normalizePath(rel.slice("./src/".length, -"/mod.ts".length));
      denoExportModules.add(moduleName);
    }
  }

  const reExports = [];
  const exportRegex = /export\s+\*\s+from\s+["']([^"']+)["']/g;
  let match;
  while ((match = exportRegex.exec(modText)) !== null) {
    reExports.push(match[1]);
  }
  const missingReExports = [];
  const modExportModules = new Set();
  for (const rel of reExports) {
    const entry = path.join(path.dirname(path.join(ROOT, "mod.ts")), rel);
    await fs.access(entry).catch(() => missingReExports.push(rel));
    if (rel.startsWith("./src/") && rel.endsWith("/mod.ts")) {
      const moduleName = normalizePath(rel.slice("./src/".length, -"/mod.ts".length));
      modExportModules.add(moduleName);
    }
  }

  if (missingPkg.length > 0) {
    errors.push(`Package exports missing source entrypoints: ${missingPkg.join(", ")}`);
  }
  if (missingDeno.length > 0) {
    errors.push(`Deno exports missing source entrypoints: ${missingDeno.join(", ")}`);
  }
  if (missingReExports.length > 0) {
    errors.push(`mod.ts re-exports missing files: ${missingReExports.join(", ")}`);
  }

  const srcDir = path.join(ROOT, "src");
  const srcFiles = [];
  await collectFilePathsRecursive(srcDir, srcFiles);
  const srcModules = srcFiles
    .filter((file) => path.basename(file) === "mod.ts")
    .map((file) => normalizePath(path.relative(srcDir, file)).replace(/\/mod\.ts$/, ""));

  const exportCoverage = new Set([...pkgExportModules, ...denoExportModules, ...modExportModules]);
  const moduleIslands = srcModules.filter((name) => !exportCoverage.has(name));
  if (moduleIslands.length > 0) {
    errors.push(`Module islands without exports: ${moduleIslands.join(", ")}`);
  }

  return {
    pkgExportCount: pkgExports.length,
    denoExportCount: denoExports.length,
    modReExportCount: reExports.length,
    moduleCount: srcModules.length,
    exportIslands: moduleIslands.length,
  };
}

async function evalSchemaRegistryClosure(errors) {
  const schemaDir = path.join(ROOT, "schemas");
  const files = (await fs.readdir(schemaDir)).filter((name) => name.endsWith(".schema.json"));
  const schemaIds = files.map((file) => file.replace(/\.schema\.json$/, ""));

  const schemaMod = await fs.readFile(path.join(ROOT, "src", "schema", "mod.ts"), "utf8");
  const idMatches = [...schemaMod.matchAll(/case\s+"([^"]+)":/g)].map((m) => m[1]);
  const idSet = new Set(idMatches);

  for (const id of schemaIds) {
    if (!idSet.has(id)) {
      errors.push(`Schema file not mapped in getJsonSchema: ${id}`);
    }
  }
  for (const id of idSet) {
    const file = path.join(schemaDir, `${id}.schema.json`);
    try {
      await fs.access(file);
    } catch {
      errors.push(`getJsonSchema id missing schema file: ${id}`);
    }
  }

  return {
    schemaFileCount: files.length,
    schemaIdCount: idSet.size,
    schemaIds,
  };
}

function extractSchemaIdFromUrl(value) {
  if (typeof value !== "string") return null;
  const match = /\/schema\/([^/]+)\.json$/.exec(value);
  return match ? match[1] : null;
}

function collectSchemaIds(value, ids) {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaIds(item, ids);
    return;
  }
  const id = extractSchemaIdFromUrl(value.$id);
  if (id) ids.add(id);
  for (const key of Object.keys(value)) {
    collectSchemaIds(value[key], ids);
  }
}

function collectToolSchemaIds(toolSpecs) {
  const ids = new Set();
  for (const tool of toolSpecs) {
    collectSchemaIds(tool.inputSchema, ids);
    if (tool.outputSchema) collectSchemaIds(tool.outputSchema, ids);
  }
  return ids;
}

function resolveMarkdownLink(sourcePath, link) {
  const dest = stripTitle(link);
  if (!dest || isExternalLink(dest)) return null;
  const [linkPath] = dest.split("#");
  if (!linkPath) return null;
  const target = linkPath.startsWith("/")
    ? path.join(ROOT, linkPath.slice(1))
    : path.resolve(path.dirname(path.join(ROOT, sourcePath)), linkPath);
  return normalizePath(path.relative(ROOT, target));
}

async function evalToolSpecSchemas(errors, toolSpecs) {
  const toolIssues = [];
  for (const tool of toolSpecs) {
    if (!tool.inputSchema) {
      toolIssues.push(`${tool.name}: missing input schema`);
      continue;
    }
    try {
      assertIJsonValue(tool.inputSchema, `ToolSpec:${tool.name}.inputSchema`);
    } catch (error) {
      toolIssues.push(`${tool.name}: input schema not I-JSON (${error.message})`);
    }
    if (!tool.outputSchema) {
      toolIssues.push(`${tool.name}: missing output schema`);
      continue;
    }
    try {
      assertIJsonValue(tool.outputSchema, `ToolSpec:${tool.name}.outputSchema`);
    } catch (error) {
      toolIssues.push(`${tool.name}: output schema not I-JSON (${error.message})`);
    }
  }
  if (toolIssues.length > 0) {
    errors.push(`ToolSpec schema issues: ${toolIssues.join("; ")}`);
  }

  return { toolCount: toolSpecs.length };
}

async function evalSchemaReferenceClosure(errors, schemaIds, toolSpecs, markdownManifest) {
  const toolSchemaIds = collectToolSchemaIds(toolSpecs);
  const docSchemaIds = new Set();
  for (const entry of markdownManifest.files ?? []) {
    if (entry.kind !== "reference") continue;
    for (const link of entry.outboundLinks ?? []) {
      const resolved = resolveMarkdownLink(entry.path, link);
      if (!resolved) continue;
      if (resolved.startsWith("schemas/") && resolved.endsWith(".schema.json")) {
        const id = resolved.replace(/^schemas\//, "").replace(/\.schema\.json$/, "");
        docSchemaIds.add(id);
      }
    }
  }

  const unexplained = schemaIds.filter((id) => !toolSchemaIds.has(id) && !docSchemaIds.has(id));
  if (unexplained.length > 0) {
    errors.push(`Schemas not referenced by tools or reference docs: ${unexplained.join(", ")}`);
  }

  return {
    unexplainedSchemas: unexplained.length,
    toolSchemaCount: toolSchemaIds.size,
    docSchemaCount: docSchemaIds.size,
  };
}

const TOOLING_ORPHAN_ALLOWLIST = new Set([
  "tools/docs/markdown-manifest.mjs",
  "tools/docs/audit.mjs",
  "tools/docs/build-index.mjs",
  "tools/docs/duplication.mjs",
  "tools/docs/purpose-map-validate.mjs",
  "tools/docs/validate-manifest.mjs",
  "tools/idna/gen-tables.mjs",
  "tools/interop/verify.mjs",
  "tools/repo/audit-public-api.mjs",
  "tools/repo/audit.mjs",
  "tools/repo/entropy.mjs",
  "tools/repo/inventory.mjs",
  "tools/terminology/audit-markdown.mjs",
  "tools/terminology/render.mjs",
  "tools/terminology/validate.mjs",
]);

async function evalToolingReferenceClosure(errors, markdownManifest) {
  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
  const scriptValues = Object.values(pkg.scripts ?? {});

  const linkedPaths = new Set();
  for (const entry of markdownManifest.files ?? []) {
    for (const link of entry.outboundLinks ?? []) {
      const resolved = resolveMarkdownLink(entry.path, link);
      if (resolved) linkedPaths.add(resolved);
    }
  }

  const toolsDir = path.join(ROOT, "tools");
  const toolFiles = [];
  await collectFilePathsRecursive(toolsDir, toolFiles);
  const toolScripts = toolFiles
    .filter((file) => /\.(mjs|js|ts)$/.test(file))
    .map((file) => normalizePath(path.relative(ROOT, file)))
    .sort((a, b) => a.localeCompare(b));

  const orphanTools = [];
  for (const toolPath of toolScripts) {
    if (TOOLING_ORPHAN_ALLOWLIST.has(toolPath)) continue;
    const inScripts = scriptValues.some((value) => value.includes(toolPath));
    const inDocs = linkedPaths.has(toolPath);
    if (!inScripts && !inDocs) {
      orphanTools.push(toolPath);
    }
  }

  if (orphanTools.length > 0) {
    errors.push(`Orphan tool scripts: ${orphanTools.join(", ")}`);
  }

  return {
    toolScriptCount: toolScripts.length,
    orphanTools: orphanTools.length,
  };
}

async function evalInteropCaseClosure(errors) {
  const interopDir = path.join(ROOT, "interop");
  const manifest = JSON.parse(await fs.readFile(path.join(interopDir, "manifest.json"), "utf8"));
  const caseFiles = manifest.cases ?? [];
  const seenIds = new Set();
  const seenOps = new Set();
  const caseIssues = [];

  const verifyScriptText = await fs.readFile(
    path.join(ROOT, "tools", "interop", "verify.mjs"),
    "utf8",
  );
  const supportedOps = new Set(
    [...verifyScriptText.matchAll(/case\s+"([^"]+)":/g)].map((m) => m[1]),
  );

  for (const rel of caseFiles) {
    const data = JSON.parse(await fs.readFile(path.join(interopDir, rel), "utf8"));
    if (seenIds.has(data.id)) {
      caseIssues.push(`Duplicate interop case id: ${data.id}`);
    }
    seenIds.add(data.id);
    seenOps.add(data.op);
    if (!supportedOps.has(data.op)) {
      caseIssues.push(`Interop op not supported in verify.mjs: ${data.op}`);
    }
    try {
      assertIJsonValue(data, `Interop case ${data.id}`);
    } catch (error) {
      caseIssues.push(`Interop case ${data.id} not I-JSON: ${error.message}`);
    }
    try {
      canonicalize(data);
    } catch (error) {
      caseIssues.push(`Interop case ${data.id} not canonicalizable: ${error.message}`);
    }
  }

  if (caseIssues.length > 0) {
    errors.push(`Interop issues: ${caseIssues.join("; ")}`);
  }

  return {
    interopCaseCount: caseFiles.length,
    interopOpCount: seenOps.size,
  };
}

async function evalToolInteropCoverage(errors, toolSpecs) {
  const manifest = JSON.parse(
    await fs.readFile(path.join(ROOT, "interop", "manifest.json"), "utf8"),
  );
  const caseFiles = manifest.cases ?? [];
  const ops = new Set();
  for (const rel of caseFiles) {
    const data = JSON.parse(await fs.readFile(path.join(ROOT, "interop", rel), "utf8"));
    ops.add(data.op);
  }

  const missing = [];
  const allowed = [];
  for (const tool of toolSpecs) {
    if (ops.has(tool.name)) continue;
    const interopPending = tool.interopPending;
    if (
      interopPending &&
      typeof interopPending.justification === "string" &&
      interopPending.justification.length > 0
    ) {
      allowed.push(tool.name);
      continue;
    }
    missing.push(tool.name);
  }
  if (missing.length > 0) {
    errors.push(`ToolSpec entries missing interop cases: ${missing.join(", ")}`);
  }

  return { toolsMissingInterop: missing.length, toolsInteropPendingCount: allowed.length };
}

function renderReport(summary) {
  return [
    "# Coherence Report",
    "",
    "_Generated by `node tools/repo/audit.mjs --write`._",
    "",
    "## Summary",
    `- Package exports: ${summary.pkgExportCount}`,
    `- Deno exports: ${summary.denoExportCount}`,
    `- mod.ts re-exports: ${summary.modReExportCount}`,
    `- src modules: ${summary.moduleCount} (islands: ${summary.exportIslands})`,
    `- Schemas: ${summary.schemaFileCount} files, ${summary.schemaIdCount} ids`,
    `- Schemas unexplained: ${summary.unexplainedSchemas}`,
    `- ToolSpecs: ${summary.toolCount}`,
    `- Tool scripts: ${summary.toolScriptCount} (orphans: ${summary.orphanTools})`,
    `- Interop cases: ${summary.interopCaseCount} (ops: ${summary.interopOpCount})`,
    `- ToolSpecs missing interop: ${summary.toolsMissingInterop}`,
    `- ToolSpecs interopPending: ${summary.toolsInteropPendingCount}`,
    "",
    "## Notes",
    "- This report is committed to the repo so reviewers can diff changes.",
    "- The repo audit enforces freshness by failing if the report is out of date.",
  ].join("\n");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const errors = [];

  await fs.access(DIST_PATH).catch(() => {
    throw new Error("dist/src/all/mod.js not found. Run `npm run build` first.");
  });
  const textfacts = await import(pathToFileURL(DIST_PATH).href);
  const toolSpecs = textfacts.listToolSpecs();

  const markdownManifest = await readMarkdownManifest();

  const exportSummary = await evalExportClosure(errors);
  const schemaSummary = await evalSchemaRegistryClosure(errors);
  const toolSummary = await evalToolSpecSchemas(errors, toolSpecs);
  const schemaClosureSummary = await evalSchemaReferenceClosure(
    errors,
    schemaSummary.schemaIds ?? [],
    toolSpecs,
    markdownManifest,
  );
  const toolingClosureSummary = await evalToolingReferenceClosure(errors, markdownManifest);
  const interopSummary = await evalInteropCaseClosure(errors);
  const toolInteropSummary = await evalToolInteropCoverage(errors, toolSpecs);

  const summary = {
    ...exportSummary,
    ...schemaSummary,
    ...toolSummary,
    ...schemaClosureSummary,
    ...toolingClosureSummary,
    ...interopSummary,
    ...toolInteropSummary,
  };

  const report = renderReport(summary);
  if (args.has("--write")) {
    await fs.writeFile(REPORT_PATH, report, "utf8");
  } else {
    const existing = await fs.readFile(REPORT_PATH, "utf8").catch(() => "");
    if (existing !== report) {
      errors.push("Coherence report out of date. Run `node tools/repo/audit.mjs --write`.");
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    console.error(
      `repo:audit summary: exports=${summary.pkgExportCount}/${summary.denoExportCount} schemas=${summary.schemaFileCount} tools=${summary.toolCount} interop=${summary.interopCaseCount}`,
    );
    process.exit(1);
  }

  console.log(
    `repo:audit summary: exports=${summary.pkgExportCount}/${summary.denoExportCount} schemas=${summary.schemaFileCount} tools=${summary.toolCount} interop=${summary.interopCaseCount}`,
  );
}

await main();
