import { genFuzzString, genWellFormed } from "../_support/genText.ts";
import { evalProperty, getPbtRuns, getPbtSeed } from "../_support/pbt.ts";
import { makeRng } from "../_support/prng.ts";
import { importTextfacts } from "../_support/runtime.ts";

type JsonValue = import("../../mod.ts").JsonValue;

export interface TestApi {
  test: (name: string, fn: () => void | Promise<void>) => void;
  assertEqual: (actual: unknown, expected: unknown, message?: string) => void;
  assertDeepEqual: (actual: unknown, expected: unknown, message?: string) => void;
  assertOk: (value: unknown, message?: string) => void;
}

type AsyncProperty<T> = (value: T) => Promise<boolean | undefined>;

type Generator<T> = (rng: ReturnType<typeof makeRng>, size: number) => T;

async function evalAsyncPropertyRuns<T>(
  name: string,
  seed: string,
  runs: number,
  gen: Generator<T>,
  property: AsyncProperty<T>,
) {
  const rng = makeRng(seed);
  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const size = Math.max(4, (runIndex % 64) + 1);
    const value = gen(rng, size);
    const result = await property(value);
    if (result === false) {
      throw new Error(`[PBT] ${name} failed\nseed=${seed} run=${runIndex}`);
    }
  }
}

function compareBytes(leftBytes: Uint8Array, rightBytes: Uint8Array): number {
  const min = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < min; index += 1) {
    const diff = leftBytes[index] - rightBytes[index];
    if (diff !== 0) return diff;
  }
  return leftBytes.length - rightBytes.length;
}

export function registerMetamorphicTests(api: TestApi): void {
  const runs = getPbtRuns(80);
  const seed = getPbtSeed();
  const seedFor = (name: string) => `${seed}:metamorphic:${name}`;

  api.test("metamorphic: text envelope round-trip", async () => {
    const { encodeTextEnvelope, decodeTextEnvelope, isIJsonSafeString } = await importTextfacts();
    evalProperty({
      name: "envelope-roundtrip",
      seed: seedFor("envelope"),
      runs,
      gen: genFuzzString,
      property: (value) => {
        const env = encodeTextEnvelope(value);
        const decoded = decodeTextEnvelope(env);
        if (decoded !== value) return false;
        const safe = isIJsonSafeString(value);
        if (safe && env.kind !== "string") return false;
        if (!safe && env.kind !== "utf16le-base64") return false;
      },
    });
  });

  api.test("metamorphic: pack digest matches canonical hash", async () => {
    const { packTextV1, packTextV1Sha256, jcsCanonicalize, sha256Hex } = await importTextfacts();
    const opts = {
      includeInputText: true,
      sections: { integrity: true },
      maxExamples: 2,
    } as const;
    await evalAsyncPropertyRuns(
      "pack-digest",
      seedFor("pack"),
      Math.max(10, Math.floor(runs / 2)),
      genFuzzString,
      async (value) => {
        const pack = packTextV1(value, opts);
        const digest = await packTextV1Sha256(value, opts);
        const expected = await sha256Hex(jcsCanonicalize(pack as unknown as JsonValue));
        if (digest !== expected) return false;
      },
    );
  });

  api.test("metamorphic: JCS canonicalization stability", async () => {
    const { jcsCanonicalize, sha256Hex } = await importTextfacts();
    await evalAsyncPropertyRuns(
      "jcs-stable",
      seedFor("jcs"),
      Math.max(10, Math.floor(runs / 2)),
      genWellFormed,
      async (value) => {
        const payload = { a: value, b: [value.length, true] };
        const first = jcsCanonicalize(payload);
        const second = jcsCanonicalize(payload);
        if (first !== second) return false;
        const hashA = await sha256Hex(first);
        const hashB = await sha256Hex(second);
        if (hashA !== hashB) return false;
      },
    );
  });

  api.test("metamorphic: token materialization preserves hashes", async () => {
    const { tokenizeForComparison } = await importTextfacts();
    evalProperty({
      name: "token-materialization",
      seed: seedFor("tokens"),
      runs,
      gen: genFuzzString,
      property: (value) => {
        const base = {
          tokenizer: "uax29-word",
          canonicalKey: "nfkcCaseFold",
          maxTokens: 200,
          hash: { algo: "xxh64-utf8" },
        } as const;
        const none = tokenizeForComparison(value, { ...base, materialize: "none" });
        const full = tokenizeForComparison(value, { ...base, materialize: "raw+key" });
        if (none.length !== full.length) return false;
        for (let index = 0; index < none.length; index += 1) {
          const noneToken = none[index];
          const fullToken = full[index];
          if (!noneToken || !fullToken) return false;
          if (
            noneToken.span.startCU !== fullToken.span.startCU ||
            noneToken.span.endCU !== fullToken.span.endCU
          ) {
            return false;
          }
          if (noneToken.keyHash64 !== fullToken.keyHash64) return false;
        }
      },
    });
  });

  api.test("metamorphic: collation compare matches sort keys", async () => {
    const { ucaCompare, ucaSortKeyBytes } = await importTextfacts();
    const options = {
      strength: 3,
      alternate: "non-ignorable",
      normalization: "nfd",
      illFormed: "replace",
      includeIdenticalLevel: true,
    } as const;
    evalProperty({
      name: "uca-compare",
      seed: seedFor("uca"),
      runs,
      gen: (rng, size) => [genWellFormed(rng, size), genWellFormed(rng, size)] as const,
      property: ([a, b]) => {
        const cmp = ucaCompare(a, b, options);
        const keyA = ucaSortKeyBytes(a, options);
        const keyB = ucaSortKeyBytes(b, options);
        const keyCmp = Math.sign(compareBytes(keyA, keyB));
        if (cmp !== keyCmp) return false;
      },
    });
  });
}
