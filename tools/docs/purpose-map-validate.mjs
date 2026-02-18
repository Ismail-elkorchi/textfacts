import fs from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";

const ROOT = process.cwd();
const PURPOSE_PATH = path.join(ROOT, "docs", "ia", "purpose-map.v1.json");
const SCHEMA_PATH = path.join(ROOT, "schemas", "purpose-map-v1.schema.json");
const MANIFEST_PATH = path.join(ROOT, "docs", "manifest.v1.json");
const DUPLICATION_PATH = path.join(ROOT, "docs", "duplication", "duplication-report.v1.json");

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

function pairKey(leftId, rightId) {
  return [leftId, rightId].sort().join("::");
}

async function main() {
  const schema = JSON.parse(await fs.readFile(SCHEMA_PATH, "utf8"));
  const purposeMap = JSON.parse(await fs.readFile(PURPOSE_PATH, "utf8"));
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  const duplication = JSON.parse(await fs.readFile(DUPLICATION_PATH, "utf8"));

  const errors = [];
  try {
    assertIJsonValue(purposeMap, "purpose-map.v1.json");
  } catch (error) {
    errors.push(`I-JSON validation failed: ${error.message}`);
  }

  try {
    canonicalize(purposeMap);
  } catch (error) {
    errors.push(`Canonicalization failed: ${error.message}`);
  }

  const ajv = new Ajv({ strict: false, allErrors: true });
  const valid = ajv.validate(schema, purposeMap);
  if (!valid) {
    errors.push(`Schema validation failed: ${ajv.errorsText(ajv.errors, { separator: "; " })}`);
  }

  const activeDocs = (manifest.docs ?? []).filter((doc) => doc.status === "active");
  const activeIds = new Set(activeDocs.map((doc) => doc.id));
  const pathToId = new Map(activeDocs.map((doc) => [doc.path, doc.id]));

  const purposeDocs = purposeMap.docs ?? [];
  const purposeIds = new Set(purposeDocs.map((doc) => doc.id));

  for (const doc of activeDocs) {
    if (!purposeIds.has(doc.id)) {
      errors.push(`Purpose map missing active doc: ${doc.id}`);
    }
  }

  for (const entry of purposeDocs) {
    if (!activeIds.has(entry.id)) {
      errors.push(`Purpose map references non-active doc id: ${entry.id}`);
    }
  }

  const scopeById = new Map();
  for (const entry of purposeDocs) {
    const scopes = new Set(entry.scopes ?? []);
    scopeById.set(entry.id, scopes);
  }

  const relationships = purposeMap.relationships ?? [];
  const relationshipKeys = new Set();
  for (const rel of relationships) {
    if (!activeIds.has(rel.docA) || !activeIds.has(rel.docB)) {
      errors.push(`Relationship references non-active docs: ${rel.docA}, ${rel.docB}`);
      continue;
    }
    const key = pairKey(rel.docA, rel.docB);
    if (relationshipKeys.has(key)) {
      errors.push(`Duplicate relationship pair: ${rel.docA} / ${rel.docB}`);
    }
    relationshipKeys.add(key);
  }

  let flaggedPairs = 0;
  let missingRelationships = 0;

  for (const pair of duplication.pairs ?? []) {
    const idA = pathToId.get(pair.fileA);
    const idB = pathToId.get(pair.fileB);
    if (!idA || !idB) continue;
    const maxContainment = Math.max(pair.containmentAinB, pair.containmentBinA);
    if (maxContainment <= 0.2) continue;
    const scopesA = scopeById.get(idA) ?? new Set();
    const scopesB = scopeById.get(idB) ?? new Set();
    const overlap = [...scopesA].some((scope) => scopesB.has(scope));
    if (!overlap) continue;
    flaggedPairs += 1;
    const key = pairKey(idA, idB);
    if (!relationshipKeys.has(key)) {
      missingRelationships += 1;
      errors.push(`Missing relationship for pair: ${idA} / ${idB}`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    console.error(
      `purpose-map summary: activeDocs=${activeDocs.length} purposeDocs=${purposeDocs.length} flaggedPairs=${flaggedPairs} missingRelationships=${missingRelationships}`,
    );
    process.exit(1);
  }

  console.log(
    `purpose-map summary: activeDocs=${activeDocs.length} purposeDocs=${purposeDocs.length} flaggedPairs=${flaggedPairs} missingRelationships=${missingRelationships}`,
  );
}

await main();
