import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "docs", "inventory");
const LS_PATH = path.join(OUT_DIR, "git-ls-files.txt");
const LS_HASH_PATH = path.join(OUT_DIR, "git-ls-files.sha256.txt");
const INV_PATH = path.join(OUT_DIR, "inventory.v1.json");
const INV_HASH_PATH = path.join(OUT_DIR, "inventory.v1.jcs.sha256.txt");

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

function toSortedObject(map) {
  const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return Object.fromEntries(entries);
}

async function main() {
  runGit("rev-parse --is-inside-work-tree");
  const rawList = runGit("ls-files");
  const files = rawList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((a, b) => a.localeCompare(b));

  await fs.mkdir(OUT_DIR, { recursive: true });

  const lsText = `${files.join("\n")}\n`;
  let previousCommit = null;
  let previousGeneratedAt = null;
  try {
    const existingList = await fs.readFile(LS_PATH, "utf8");
    if (existingList === lsText) {
      const existingInventory = JSON.parse(await fs.readFile(INV_PATH, "utf8"));
      if (typeof existingInventory.commit === "string") {
        previousCommit = existingInventory.commit;
      }
      if (typeof existingInventory.generatedAt === "string") {
        previousGeneratedAt = existingInventory.generatedAt;
      }
    }
  } catch {
    // First run or missing artifacts; fall back to current git metadata.
  }

  const commit = previousCommit ?? runGit("rev-parse HEAD");
  const generatedAt = previousGeneratedAt ?? getStableGeneratedAt();
  await fs.writeFile(LS_PATH, lsText, "utf8");
  await fs.writeFile(LS_HASH_PATH, `sha256:${sha256(lsText)}\n`, "utf8");

  const countsByExtension = new Map();
  const countsByTopLevel = new Map();
  const markdownFiles = [];
  const schemaFiles = [];
  const toolScripts = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const extKey = ext.length > 0 ? ext : "(none)";
    countsByExtension.set(extKey, (countsByExtension.get(extKey) ?? 0) + 1);

    const topLevel = file.includes("/") ? file.split("/")[0] : "(root)";
    countsByTopLevel.set(topLevel, (countsByTopLevel.get(topLevel) ?? 0) + 1);

    if (file.endsWith(".md")) {
      markdownFiles.push(file);
    }
    if (file.startsWith("schemas/") && file.endsWith(".schema.json")) {
      schemaFiles.push(file);
    }
    if (file.startsWith("tools/")) {
      if (/\.(mjs|js|ts)$/.test(file)) {
        toolScripts.push(file);
      }
    }
  }

  markdownFiles.sort((a, b) => a.localeCompare(b));
  schemaFiles.sort((a, b) => a.localeCompare(b));
  toolScripts.sort((a, b) => a.localeCompare(b));

  const inventory = {
    v: 1,
    generatedAt,
    commit,
    fileCount: files.length,
    countsByExtension: toSortedObject(countsByExtension),
    countsByTopLevelDir: toSortedObject(countsByTopLevel),
    markdownFiles,
    schemaFiles,
    toolScripts,
  };

  assertIJsonValue(inventory, "inventory.v1.json");
  const inventoryText = JSON.stringify(inventory, null, 2) + "\n";
  await fs.writeFile(INV_PATH, inventoryText, "utf8");

  const canonical = canonicalize(inventory);
  await fs.writeFile(INV_HASH_PATH, `sha256:${sha256(canonical)}\n`, "utf8");

  console.log(
    [
      "repo:inventory summary:",
      `files=${inventory.fileCount}`,
      `markdown=${markdownFiles.length}`,
      `schemas=${schemaFiles.length}`,
      `tools=${toolScripts.length}`,
    ].join(" "),
  );
}

await main();
