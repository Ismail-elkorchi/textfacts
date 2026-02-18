/**
 * DUPLICATION_REPORT_V1_SCHEMA is an exported constant used by public APIs.
 */
export const DUPLICATION_REPORT_V1_SCHEMA: Record<string, unknown> = {
  $id: "https://textfacts.dev/schema/duplication-report-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "DuplicationReportV1",
  type: "object",
  additionalProperties: false,
  required: ["v", "generatedAt", "options", "fileCount", "pairs"],
  properties: {
    v: { const: 1 },
    generatedAt: { type: "string", minLength: 1 },
    options: {
      type: "object",
      additionalProperties: false,
      required: ["tokenizer", "canonicalKey", "k", "window", "dedupe"],
      properties: {
        tokenizer: { type: "string", minLength: 1 },
        canonicalKey: { type: "string", minLength: 1 },
        k: { type: "integer", minimum: 1 },
        window: { type: "integer", minimum: 1 },
        dedupe: { type: "string", minLength: 1 },
      },
    },
    fileCount: { type: "integer", minimum: 0 },
    pairs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "fileA",
          "fileB",
          "sizeA",
          "sizeB",
          "containmentAinB",
          "containmentBinA",
          "jaccard",
          "overlapCount",
          "matches",
        ],
        properties: {
          fileA: { type: "string", minLength: 1 },
          fileB: { type: "string", minLength: 1 },
          sizeA: {
            type: "object",
            additionalProperties: false,
            required: ["bytes", "words", "fingerprints"],
            properties: {
              bytes: { type: "integer", minimum: 0 },
              words: { type: "integer", minimum: 0 },
              fingerprints: { type: "integer", minimum: 0 },
            },
          },
          sizeB: {
            type: "object",
            additionalProperties: false,
            required: ["bytes", "words", "fingerprints"],
            properties: {
              bytes: { type: "integer", minimum: 0 },
              words: { type: "integer", minimum: 0 },
              fingerprints: { type: "integer", minimum: 0 },
            },
          },
          containmentAinB: { type: "number", minimum: 0 },
          containmentBinA: { type: "number", minimum: 0 },
          jaccard: { type: "number", minimum: 0 },
          overlapCount: { type: "integer", minimum: 0 },
          matches: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["hash", "tokenIndexA", "spanA", "tokenIndexB", "spanB"],
              properties: {
                hash: { type: "string", minLength: 1 },
                tokenIndexA: { type: "integer", minimum: 0 },
                spanA: {
                  type: "object",
                  additionalProperties: false,
                  required: ["startCU", "endCU"],
                  properties: {
                    startCU: { type: "integer", minimum: 0 },
                    endCU: { type: "integer", minimum: 0 },
                  },
                },
                tokenIndexB: { type: "integer", minimum: 0 },
                spanB: {
                  type: "object",
                  additionalProperties: false,
                  required: ["startCU", "endCU"],
                  properties: {
                    startCU: { type: "integer", minimum: 0 },
                    endCU: { type: "integer", minimum: 0 },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

/**
 * DUPLICATION_ALLOWLIST_V1_SCHEMA is an exported constant used by public APIs.
 */
export const DUPLICATION_ALLOWLIST_V1_SCHEMA: Record<string, unknown> = {
  $id: "https://textfacts.dev/schema/duplication-allowlist-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "DuplicationAllowlistV1",
  type: "object",
  additionalProperties: false,
  required: ["v", "entries"],
  properties: {
    v: { const: 1 },
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fileA", "fileB", "justification"],
        properties: {
          fileA: { type: "string", minLength: 1 },
          fileB: { type: "string", minLength: 1 },
          justification: { type: "string", minLength: 1 },
        },
      },
    },
  },
};
