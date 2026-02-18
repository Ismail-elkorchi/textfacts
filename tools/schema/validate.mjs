import fs from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";

const ROOT = process.cwd();
const SCHEMA_DIR = path.join(ROOT, "schemas");
const META_PATH = path.join(ROOT, "specs", "json-schema", "draft-2020-12-metaschema.json");

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

async function main() {
  const files = (await fs.readdir(SCHEMA_DIR)).filter((name) => name.endsWith(".schema.json"));
  const ajv = new Ajv({ strict: false, allErrors: true });
  try {
    const metaText = await fs.readFile(META_PATH, "utf8");
    const metaSchema = JSON.parse(metaText);
    try {
      ajv.addSchema(metaSchema);
    } catch {
      // Ajv may already include the 2020-12 meta-schema.
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const errors = [];
  for (const file of files) {
    const fullPath = path.join(SCHEMA_DIR, file);
    const text = await fs.readFile(fullPath, "utf8");
    const schema = JSON.parse(text);

    try {
      assertIJsonValue(schema, file);
    } catch (error) {
      errors.push(`I-JSON validation failed for ${file}: ${error.message}`);
      continue;
    }

    if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
      errors.push(`$schema missing or incorrect for ${file}`);
    }

    const valid = ajv.validateSchema(schema);
    if (!valid) {
      const message = ajv.errorsText(ajv.errors, { separator: "; " });
      errors.push(`Meta-schema validation failed for ${file}: ${message}`);
    }

    try {
      canonicalize(schema);
    } catch (error) {
      errors.push(`Canonicalization failed for ${file}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }
  console.log(`Schema validation OK (${files.length} files).`);
}

await main();
