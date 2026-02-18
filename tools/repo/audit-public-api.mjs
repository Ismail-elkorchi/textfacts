import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const ROOT_MOD = path.join(ROOT, "mod.ts");

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

async function collectEntrypoints() {
  const files = [];
  await collectFilePathsRecursive(SRC_DIR, files);
  const mods = files.filter((file) => path.basename(file) === "mod.ts");
  return [ROOT_MOD, ...mods];
}

const UNIT_RULES = {
  codeUnits: {
    label: "UTF-16 code units",
    test: (text) => /utf-?16\s+code\s+units/i.test(text),
  },
  codePoints: {
    label: "Unicode scalar values",
    test: (text) => /unicode\s+scalar\s+values/i.test(text),
  },
  bytes: {
    label: "bytes (encoding)",
    test: (text) => /bytes\s*\([^)]*\)/i.test(text),
  },
};

const NAME_RULES = {
  codeUnits: /(start|end|index|offset|pos|position)CU\b|codeUnit/i,
  codePoints: /codePoint/i,
  bytes: /(start|end)B\b|bytes?/i,
};

function isNumberLike(type) {
  return (type.flags & ts.TypeFlags.NumberLike) !== 0;
}

function isNumericArray(type, checker) {
  if (!checker.isArrayLikeType(type)) return false;
  const element = checker.getElementTypeOfArrayType(type);
  return element ? isNumberLike(element) : false;
}

function collectUnitsFromType(type, checker, out, seen) {
  if (!type) return;
  if (seen.has(type)) return;
  seen.add(type);

  if (type.isUnionOrIntersection()) {
    for (const part of type.types) {
      collectUnitsFromType(part, checker, out, seen);
    }
    return;
  }

  const alias = type.aliasSymbol?.getName();
  const symbol = type.symbol?.getName();
  const name = alias ?? symbol ?? "";
  const typedArrays = new Set([
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float32Array",
    "Float64Array",
    "BigInt64Array",
    "BigUint64Array",
    "ArrayBuffer",
    "SharedArrayBuffer",
  ]);
  if (type.aliasSymbol) {
    const aliasType = checker.getDeclaredTypeOfSymbol(type.aliasSymbol);
    const aliasName = aliasType.symbol?.getName() ?? aliasType.aliasSymbol?.getName() ?? "";
    if (typedArrays.has(aliasName)) {
      if (aliasName === "Uint8Array" || aliasName === "ArrayBuffer") out.add("bytes");
      return;
    }
  }
  if (name === "Span") out.add("codeUnits");
  if (name === "ByteSpan") out.add("bytes");
  if (name === "TextInput") out.add("bytes");
  if (name === "Uint8Array" || name === "ArrayBuffer") out.add("bytes");
  if (name === "CodePointInfo") {
    out.add("codeUnits");
    out.add("codePoints");
  }
  if (/CodePoint/.test(name)) out.add("codePoints");

  if (typedArrays.has(name)) {
    return;
  }

  const primitiveFlags =
    ts.TypeFlags.StringLike |
    ts.TypeFlags.NumberLike |
    ts.TypeFlags.BooleanLike |
    ts.TypeFlags.BigIntLike |
    ts.TypeFlags.ESSymbolLike |
    ts.TypeFlags.Void |
    ts.TypeFlags.Never |
    ts.TypeFlags.Any |
    ts.TypeFlags.Unknown;
  if (type.flags & primitiveFlags) {
    return;
  }

  if (checker.isArrayLikeType(type)) {
    const element = checker.getElementTypeOfArrayType(type);
    if (element) collectUnitsFromType(element, checker, out, seen);
  }

  if (type.aliasSymbol && type.aliasSymbol !== type.symbol) {
    const aliasType = checker.getDeclaredTypeOfSymbol(type.aliasSymbol);
    collectUnitsFromType(aliasType, checker, out, seen);
  }

  if (type.symbol?.name === "Iterable" || type.symbol?.name === "Iterator") {
    const typeArgs = checker.getTypeArguments(type);
    for (const arg of typeArgs) {
      collectUnitsFromType(arg, checker, out, seen);
    }
  }

  if (type.getProperties) {
    for (const prop of type.getProperties()) {
      const propName = prop.getName();
      const decl = prop.valueDeclaration ?? prop.declarations?.[0];
      if (decl) {
        const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
        if (
          NAME_RULES.codeUnits.test(propName) &&
          (isNumberLike(propType) || isNumericArray(propType, checker))
        ) {
          out.add("codeUnits");
        }
        if (
          NAME_RULES.codePoints.test(propName) &&
          (isNumberLike(propType) || isNumericArray(propType, checker))
        ) {
          out.add("codePoints");
        }
        if (
          /^(start|end)B$/i.test(propName) &&
          (isNumberLike(propType) || isNumericArray(propType, checker))
        ) {
          out.add("bytes");
        }
        collectUnitsFromType(propType, checker, out, seen);
      }
    }
  }

  if (type.aliasSymbol || type.symbol) {
    const typeArgs = checker.getTypeArguments(type);
    for (const arg of typeArgs) {
      collectUnitsFromType(arg, checker, out, seen);
    }
  }
}

function collectUnitsFromSignature(signature, checker) {
  const required = new Set();
  const params = signature.getParameters();
  for (const param of params) {
    const name = param.getName();
    if (NAME_RULES.codeUnits.test(name)) required.add("codeUnits");
    if (NAME_RULES.codePoints.test(name)) required.add("codePoints");
    if (NAME_RULES.bytes.test(name)) required.add("bytes");
    const decl = param.valueDeclaration ?? param.declarations?.[0];
    if (!decl) continue;
    const type = checker.getTypeOfSymbolAtLocation(param, decl);
    collectUnitsFromType(type, checker, required, new Set());
  }
  const returnType = signature.getReturnType();
  collectUnitsFromType(returnType, checker, required, new Set());
  return required;
}

function getUnitsTagText(decl) {
  const tags = ts.getJSDocTags(decl);
  const units = tags
    .filter((tag) => tag.tagName?.getText() === "units")
    .map((tag) => {
      const text = ts.getTextOfJSDocComment(tag.comment);
      return typeof text === "string" ? text.trim() : "";
    })
    .filter(Boolean);
  return units.join(" | ");
}

function hasRequiredUnits(unitsText, required) {
  if (!unitsText) return false;
  for (const key of required) {
    const rule = UNIT_RULES[key];
    if (!rule.test(unitsText)) return false;
  }
  return true;
}

function getLineInfo(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return { line: line + 1, column: character + 1 };
}

async function main() {
  const entrypoints = await collectEntrypoints();
  const program = ts.createProgram(entrypoints, {
    target: ts.ScriptTarget.ES2024,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    strict: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();

  const missing = [];
  let checked = 0;
  const seen = new Set();

  for (const entrypoint of entrypoints) {
    const sourceFile = program.getSourceFile(entrypoint);
    if (!sourceFile) continue;
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) continue;
    const exports = checker.getExportsOfModule(moduleSymbol);
    for (const exp of exports) {
      const target = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
      const declarations = target.declarations ?? [];
      if (declarations.length === 0) continue;
      const decl = declarations[0];
      const declFile = decl.getSourceFile().fileName;
      if (declFile.includes("node_modules")) continue;
      const key = `${normalizePath(declFile)}::${target.getName()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const type = checker.getTypeOfSymbolAtLocation(target, decl);
      const signatures = type.getCallSignatures();
      if (signatures.length === 0) continue;

      let requiredUnits = new Set();
      for (const sig of signatures) {
        const needs = collectUnitsFromSignature(sig, checker);
        for (const unit of needs) requiredUnits.add(unit);
      }
      if (requiredUnits.size === 0) continue;

      checked += 1;
      const unitsText = getUnitsTagText(decl);
      if (!hasRequiredUnits(unitsText, requiredUnits)) {
        const { line } = getLineInfo(decl.getSourceFile(), decl);
        missing.push({
          symbol: target.getName(),
          file: normalizePath(path.relative(ROOT, declFile)),
          line,
          required: [...requiredUnits].map((unit) => UNIT_RULES[unit].label),
        });
      }
    }
  }

  const maxReport = Number.parseInt(process.env.API_AUDIT_MAX ?? "20", 10);
  if (missing.length > 0) {
    const sample = missing.slice(0, maxReport);
    console.error(`repo:api:audit missing @units: ${missing.length} of ${checked} checked`);
    for (const item of sample) {
      console.error(`- ${item.file}:${item.line} ${item.symbol} (${item.required.join(", ")})`);
    }
    process.exit(1);
  }
  console.log(`repo:api:audit ok: ${checked} exports checked; 0 missing @units`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
