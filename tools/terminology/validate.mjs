import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import Ajv from "ajv/dist/2020.js";

const ROOT = process.cwd();
const GLOSSARY_PATH = path.join(ROOT, "docs", "terminology", "glossary.v1.json");
const HASH_PATH = path.join(ROOT, "docs", "terminology", "glossary.v1.jcs.sha256.txt");
const SCHEMA_PATH = path.join(ROOT, "schemas", "glossary-v1.schema.json");

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

async function main() {
  const schema = JSON.parse(await fs.readFile(SCHEMA_PATH, "utf8"));
  const glossary = JSON.parse(await fs.readFile(GLOSSARY_PATH, "utf8"));

  const errors = [];
  try {
    assertIJsonValue(glossary, "glossary.v1.json");
  } catch (error) {
    errors.push(`I-JSON validation failed: ${error.message}`);
  }

  try {
    canonicalize(glossary);
  } catch (error) {
    errors.push(`Canonicalization failed: ${error.message}`);
  }

  const ajv = new Ajv({ strict: false, allErrors: true });
  const valid = ajv.validate(schema, glossary);
  if (!valid) {
    errors.push(`Schema validation failed: ${ajv.errorsText(ajv.errors, { separator: "; " })}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }

  const hash = sha256(canonicalize(glossary));
  await fs.writeFile(HASH_PATH, `sha256:${hash}\n`, "utf8");
  console.log(`Glossary validation OK (${glossary.terms?.length ?? 0} terms).`);
}

await main();
