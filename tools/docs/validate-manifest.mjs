import fs from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "docs", "manifest.v1.json");
const SCHEMA_PATH = path.join(ROOT, "schemas", "docs-manifest-v1.schema.json");

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

function ensureUnique(items, field, errors) {
  const seen = new Set();
  for (const item of items) {
    const value = item[field];
    if (!value) continue;
    if (seen.has(value)) {
      errors.push(`Duplicate ${field}: ${value}`);
    }
    seen.add(value);
  }
}

async function main() {
  const schemaText = await fs.readFile(SCHEMA_PATH, "utf8");
  const schema = JSON.parse(schemaText);
  const manifestText = await fs.readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestText);

  const errors = [];
  try {
    assertIJsonValue(manifest, "docs/manifest.v1.json");
  } catch (error) {
    errors.push(`I-JSON validation failed: ${error.message}`);
  }

  try {
    canonicalize(manifest);
  } catch (error) {
    errors.push(`Canonicalization failed: ${error.message}`);
  }

  const ajv = new Ajv({ strict: false, allErrors: true });
  const valid = ajv.validate(schema, manifest);
  if (!valid) {
    errors.push(`Schema validation failed: ${ajv.errorsText(ajv.errors, { separator: "; " })}`);
  }

  const docs = manifest.docs ?? [];
  ensureUnique(docs, "id", errors);
  ensureUnique(docs, "path", errors);

  for (const doc of docs) {
    if (!doc.path?.startsWith("docs/")) {
      errors.push(`Doc path must be under docs/: ${doc.path}`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }

  console.log(`Docs manifest validation OK (${docs.length} entries).`);
}

await main();
