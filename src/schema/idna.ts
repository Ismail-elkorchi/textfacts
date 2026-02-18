import type { StandardJSONSchemaV1 } from "./standard.ts";

/**
 * UTS46_OPTIONS_V1_SCHEMA is an exported constant used by public APIs.
 */
export const UTS46_OPTIONS_V1_SCHEMA: Record<string, unknown> = {
  $id: "https://textfacts.dev/schema/uts46-options-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Uts46OptionsV1",
  type: "object",
  additionalProperties: false,
  properties: {
    useStd3AsciiRules: { type: "boolean" },
    useCompatMapping: { type: "boolean" },
    checkHyphens: { type: "boolean" },
    checkBidi: { type: "boolean" },
    checkJoiners: { type: "boolean" },
    verifyDnsLength: { type: "boolean" },
    illFormed: { enum: ["error", "replace"] },
    splitOnDots: { enum: ["ascii-only", "uts46"] },
  },
};

/**
 * IDNA_RESULT_V1_SCHEMA is an exported constant used by public APIs.
 */
export const IDNA_RESULT_V1_SCHEMA: Record<string, unknown> = {
  $id: "https://textfacts.dev/schema/idna-result-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "IdnaResultV1",
  type: "object",
  additionalProperties: false,
  required: ["ok", "value", "errors", "warnings", "provenance"],
  properties: {
    ok: { type: "boolean" },
    value: { type: "string" },
    errors: {
      type: "array",
      items: { $ref: "#/$defs/idnaError" },
    },
    warnings: {
      type: "array",
      items: { $ref: "#/$defs/idnaError" },
    },
    provenance: { $ref: "#/$defs/provenance" },
  },
  $defs: {
    span: {
      type: "object",
      additionalProperties: false,
      required: ["startCU", "endCU"],
      properties: {
        startCU: { type: "integer", minimum: 0 },
        endCU: { type: "integer", minimum: 0 },
      },
    },
    idnaError: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: {
          enum: [
            "EMPTY_LABEL",
            "LEADING_HYPHEN",
            "TRAILING_HYPHEN",
            "HYPHEN_3_4",
            "LABEL_TOO_LONG",
            "DOMAIN_TOO_LONG",
            "INVALID_ACE_PREFIX",
            "PUNYCODE_ERROR",
            "DISALLOWED",
            "BIDI_RULE",
            "JOINER_RULE",
            "STD3_DISALLOWED",
            "DOT_EQUIVALENT",
            "ILL_FORMED_UNICODE",
            "NONCHARACTER",
            "DEFAULT_IGNORABLE",
            "CONTEXTJ",
            "CONTEXTO",
            "MAPPED",
            "DEVIATION",
            "IGNORED",
            "UNASSIGNED",
          ],
        },
        message: { type: "string" },
        span: { $ref: "#/$defs/span" },
        labelIndex: { type: "integer", minimum: 0 },
        codePoint: { type: "integer", minimum: 0 },
      },
    },
    provenance: {
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
    },
  },
};

/**
 * Uts46OptionsV1StandardJsonSchema is an exported constant used by public APIs.
 */
export const Uts46OptionsV1StandardJsonSchema: StandardJSONSchemaV1 = {
  "~standard": {
    version: 1,
    vendor: "textfacts",
    jsonSchema: {
      input: () => UTS46_OPTIONS_V1_SCHEMA,
      output: () => UTS46_OPTIONS_V1_SCHEMA,
    },
  },
};

/**
 * IdnaResultV1StandardJsonSchema is an exported constant used by public APIs.
 */
export const IdnaResultV1StandardJsonSchema: StandardJSONSchemaV1 = {
  "~standard": {
    version: 1,
    vendor: "textfacts",
    jsonSchema: {
      input: () => IDNA_RESULT_V1_SCHEMA,
      output: () => IDNA_RESULT_V1_SCHEMA,
    },
  },
};
