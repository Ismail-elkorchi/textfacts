import { getJsonSchema } from "../schema/mod.ts";
import type { ToolId, ToolSpecV1 } from "./types.ts";

const DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema";

const TEXT_ENVELOPE_SCHEMA = getJsonSchema("text-envelope-v1");
const PACK_V1_SCHEMA = getJsonSchema("pack-v1");
const IDNA_RESULT_SCHEMA = getJsonSchema("idna-result-v1");
const UTS46_OPTIONS_SCHEMA = getJsonSchema("uts46-options-v1");

const SPAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["startCU", "endCU"],
  properties: {
    startCU: { type: "integer", minimum: 0 },
    endCU: { type: "integer", minimum: 0 },
  },
};

const PROVENANCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["unicodeVersion", "algorithm", "configHash", "units"],
  properties: {
    unicodeVersion: { type: "string" },
    algorithm: {
      type: "object",
      additionalProperties: false,
      required: ["name", "spec", "revisionOrDate", "implementationId"],
      properties: {
        name: { type: "string" },
        spec: { type: "string" },
        revisionOrDate: { type: "string" },
        implementationId: { type: "string" },
      },
    },
    configHash: { type: "string" },
    units: { type: "object" },
  },
};

const TOOL_SPECS: Record<ToolId, ToolSpecV1> = {
  packTextV1: {
    v: 1,
    name: "packTextV1",
    description: "Produce a deterministic, I-JSON-safe fact pack for a text envelope.",
    inputSchema: {
      $schema: DRAFT_2020_12,
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: TEXT_ENVELOPE_SCHEMA,
        opts: { type: "object" },
      },
    },
    outputSchema: PACK_V1_SCHEMA,
  },
  packTextV1Sha256: {
    v: 1,
    name: "packTextV1Sha256",
    description: "Return the JCS SHA-256 digest of a Pack V1 object derived from the input text.",
    inputSchema: {
      $schema: DRAFT_2020_12,
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: TEXT_ENVELOPE_SCHEMA,
        opts: { type: "object" },
      },
    },
    outputSchema: {
      $schema: DRAFT_2020_12,
      type: "string",
    },
  },
  diffText: {
    v: 1,
    name: "diffText",
    description: "Compute a deterministic diff over token streams derived from two texts.",
    inputSchema: {
      $schema: DRAFT_2020_12,
      type: "object",
      additionalProperties: false,
      required: ["a", "b", "options"],
      properties: {
        a: TEXT_ENVELOPE_SCHEMA,
        b: TEXT_ENVELOPE_SCHEMA,
        options: {
          type: "object",
          additionalProperties: false,
          required: ["tokenizer", "canonicalKey"],
          properties: {
            tokenizer: { enum: ["uax29-word", "uax29-grapheme", "codePoint"] },
            canonicalKey: { enum: ["raw", "nfc", "nfkc", "nfkcCaseFold", "skeleton"] },
            maxTokens: { type: "integer", minimum: 0 },
            maxD: { type: "integer", minimum: 0 },
            prefer: { enum: ["delete", "insert"] },
          },
        },
      },
    },
    outputSchema: {
      $schema: DRAFT_2020_12,
      type: "object",
      additionalProperties: false,
      required: ["edits", "summary", "aTokens", "bTokens", "provenance"],
      properties: {
        edits: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["op"],
            properties: {
              op: { enum: ["equal", "delete", "insert"] },
              a0: { type: "integer", minimum: 0 },
              a1: { type: "integer", minimum: 0 },
              b0: { type: "integer", minimum: 0 },
              b1: { type: "integer", minimum: 0 },
              aSpans: { type: "array", items: SPAN_SCHEMA },
              bSpans: { type: "array", items: SPAN_SCHEMA },
            },
          },
        },
        summary: {
          type: "object",
          additionalProperties: false,
          required: ["insertedTokens", "deletedTokens", "equalTokens"],
          properties: {
            insertedTokens: { type: "integer", minimum: 0 },
            deletedTokens: { type: "integer", minimum: 0 },
            equalTokens: { type: "integer", minimum: 0 },
          },
        },
        aTokens: { type: "integer", minimum: 0 },
        bTokens: { type: "integer", minimum: 0 },
        truncated: { type: "boolean" },
        provenance: PROVENANCE_SCHEMA,
      },
    },
  },
  winnowingFingerprints: {
    v: 1,
    name: "winnowingFingerprints",
    description: "Generate deterministic winnowing fingerprints over token streams.",
    inputSchema: {
      $schema: DRAFT_2020_12,
      type: "object",
      additionalProperties: false,
      required: ["text", "options"],
      properties: {
        text: TEXT_ENVELOPE_SCHEMA,
        options: {
          type: "object",
          additionalProperties: false,
          required: ["tokenizer", "canonicalKey", "k", "window"],
          properties: {
            tokenizer: { enum: ["uax29-word", "uax29-grapheme", "codePoint"] },
            canonicalKey: { enum: ["raw", "nfc", "nfkc", "nfkcCaseFold", "skeleton"] },
            k: { type: "integer", minimum: 1 },
            window: { type: "integer", minimum: 1 },
            maxTokens: { type: "integer", minimum: 0 },
            maxFingerprints: { type: "integer", minimum: 0 },
            dedupe: { enum: ["by-position", "by-hash"] },
          },
        },
      },
    },
    outputSchema: {
      $schema: DRAFT_2020_12,
      type: "object",
      additionalProperties: false,
      required: ["fingerprints", "algo"],
      properties: {
        fingerprints: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["hash64Hex", "tokenIndex", "span"],
            properties: {
              hash64Hex: { type: "string" },
              tokenIndex: { type: "integer", minimum: 0 },
              span: SPAN_SCHEMA,
            },
          },
        },
        truncated: { type: "boolean" },
        algo: PROVENANCE_SCHEMA,
      },
    },
  },
  ucaCompare: {
    v: 1,
    name: "ucaCompare",
    description: "Compare two strings under UCA+DUCET with fixed, deterministic options.",
    inputSchema: {
      $schema: DRAFT_2020_12,
      type: "object",
      additionalProperties: false,
      required: ["a", "b"],
      properties: {
        a: TEXT_ENVELOPE_SCHEMA,
        b: TEXT_ENVELOPE_SCHEMA,
        options: { type: "object" },
      },
    },
    outputSchema: {
      $schema: DRAFT_2020_12,
      type: "integer",
      enum: [-1, 0, 1],
    },
  },
  confusableSkeleton: {
    v: 1,
    name: "confusableSkeleton",
    description: "Compute UTS #39 confusable skeleton for a text envelope under fixed options.",
    inputSchema: {
      $schema: DRAFT_2020_12,
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: TEXT_ENVELOPE_SCHEMA,
        options: {
          type: "object",
          additionalProperties: false,
          properties: {
            normalization: { enum: ["NFD", "NFKD", "none"] },
            caseFold: { type: "boolean" },
          },
        },
      },
    },
    outputSchema: TEXT_ENVELOPE_SCHEMA,
  },
  integrityProfile: {
    v: 1,
    name: "integrityProfile",
    description: "Scan text for integrity findings and return counts and samples.",
    inputSchema: {
      $schema: DRAFT_2020_12,
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: TEXT_ENVELOPE_SCHEMA,
        options: {
          type: "object",
          additionalProperties: false,
          properties: {
            maxSamplesPerKind: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    outputSchema: {
      $schema: DRAFT_2020_12,
      type: "object",
      additionalProperties: false,
      required: ["wellFormed", "counts", "samples"],
      properties: {
        wellFormed: { type: "boolean" },
        counts: {
          type: "object",
          additionalProperties: false,
          required: [
            "lone-surrogate",
            "default-ignorable",
            "bidi-control",
            "join-control",
            "variation-selector",
            "noncharacter",
          ],
          properties: {
            "lone-surrogate": { type: "integer", minimum: 0 },
            "default-ignorable": { type: "integer", minimum: 0 },
            "bidi-control": { type: "integer", minimum: 0 },
            "join-control": { type: "integer", minimum: 0 },
            "variation-selector": { type: "integer", minimum: 0 },
            noncharacter: { type: "integer", minimum: 0 },
          },
        },
        samples: { type: "object" },
      },
    },
  },
  uts46ToAscii: {
    v: 1,
    name: "uts46ToAscii",
    description:
      "Apply UTS #46 ToASCII processing to a text envelope and return deterministic results.",
    inputSchema: {
      $schema: DRAFT_2020_12,
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: TEXT_ENVELOPE_SCHEMA,
        opts: UTS46_OPTIONS_SCHEMA,
      },
    },
    outputSchema: IDNA_RESULT_SCHEMA,
  },
  uts46ToUnicode: {
    v: 1,
    name: "uts46ToUnicode",
    description:
      "Apply UTS #46 ToUnicode processing to a text envelope and return deterministic results.",
    inputSchema: {
      $schema: DRAFT_2020_12,
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: TEXT_ENVELOPE_SCHEMA,
        opts: UTS46_OPTIONS_SCHEMA,
      },
    },
    outputSchema: IDNA_RESULT_SCHEMA,
  },
};

/**
 * getToolSpec executes a deterministic operation in this module.
 */
export function getToolSpec(id: ToolId): ToolSpecV1 {
  return TOOL_SPECS[id];
}

/**
 * listToolSpecs executes a deterministic operation in this module.
 */
export function listToolSpecs(): readonly ToolSpecV1[] {
  return Object.values(TOOL_SPECS);
}
