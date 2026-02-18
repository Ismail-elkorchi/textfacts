import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const distUrl = new URL("dist/src/all/mod.js", root);
const distPath = fileURLToPath(distUrl);

await fs.access(distPath).catch(() => {
  throw new Error("dist/src/all/mod.js not found. Run `npm run build` first.");
});

const textfacts = await import(distUrl.href);
const interopDir = fileURLToPath(new URL("interop", root));
const manifestText = await fs.readFile(path.join(interopDir, "manifest.json"), "utf8");
const manifest = JSON.parse(manifestText);
const writeMode = process.argv.includes("--write");

function decodeEnv(env) {
  return textfacts.decodeTextEnvelope(env);
}

function encodeEnv(text) {
  return textfacts.encodeTextEnvelope(text, { prefer: "string", fallback: "utf16le-base64" });
}

async function computeOutput(testCase) {
  switch (testCase.op) {
    case "packTextV1": {
      const text = decodeEnv(testCase.input.text);
      return textfacts.packTextV1(text, testCase.input.opts ?? {});
    }
    case "textEnvelopeRoundtrip": {
      const text = decodeEnv(testCase.input.text);
      return { decoded: encodeEnv(text) };
    }
    case "integrityProfile": {
      const text = decodeEnv(testCase.input.text);
      return { profile: textfacts.integrityProfile(text, testCase.input.options ?? {}) };
    }
    case "confusableSkeleton": {
      const text = decodeEnv(testCase.input.text);
      const skeleton = textfacts.confusableSkeleton(text, testCase.input.opts ?? {});
      return { skeleton: encodeEnv(skeleton) };
    }
    case "ucaSortKeyHex": {
      const options = testCase.input.options ?? {};
      const entries = testCase.input.texts.map((env) => {
        const text = decodeEnv(env);
        return { text: env, sortKeyHex: textfacts.ucaSortKeyHex(text, options) };
      });
      return { items: entries };
    }
    case "winnowingFingerprints": {
      const text = decodeEnv(testCase.input.text);
      return textfacts.winnowingFingerprints(text, testCase.input.options ?? {});
    }
    case "diffText": {
      const sourceText = decodeEnv(testCase.input.a);
      const targetText = decodeEnv(testCase.input.b);
      return textfacts.diffText(sourceText, targetText, testCase.input.options);
    }
    case "packTextV1Sha256": {
      const text = decodeEnv(testCase.input.text);
      return await textfacts.packTextV1Sha256(text, testCase.input.opts ?? {});
    }
    case "ucaCompare": {
      const leftText = decodeEnv(testCase.input.a);
      const rightText = decodeEnv(testCase.input.b);
      return textfacts.ucaCompare(leftText, rightText, testCase.input.options ?? {});
    }
    case "uts46ToAscii": {
      const text = decodeEnv(testCase.input.text);
      return textfacts.uts46ToAscii(text, testCase.input.opts ?? {});
    }
    case "uts46ToUnicode": {
      const text = decodeEnv(testCase.input.text);
      return textfacts.uts46ToUnicode(text, testCase.input.opts ?? {});
    }
    default:
      throw new Error(`Unsupported op: ${testCase.op}`);
  }
}

let passed = 0;
let updated = 0;
for (const relPath of manifest.cases ?? []) {
  const casePath = path.join(interopDir, relPath);
  const caseText = await fs.readFile(casePath, "utf8");
  const testCase = JSON.parse(caseText);
  const output = await computeOutput(testCase);
  textfacts.assertIJson(output);
  const digest = await textfacts.jcsSha256Hex(output);
  const expected = testCase.expect?.jcsSha256;
  if (digest !== expected) {
    if (writeMode) {
      testCase.expect = { jcsSha256: digest };
      await fs.writeFile(casePath, `${JSON.stringify(testCase, null, 2)}\n`, "utf8");
      updated += 1;
    } else {
      throw new Error(`Interop case ${testCase.id} failed: expected ${expected} got ${digest}`);
    }
  }
  passed += 1;
}

if (writeMode && updated > 0) {
  console.log(`Interop verify: ${passed} cases OK (updated ${updated})`);
} else {
  console.log(`Interop verify: ${passed} cases OK`);
}
