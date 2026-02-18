/**
 * PURPOSE_MAP_V1_SCHEMA is an exported constant used by public APIs.
 */
export const PURPOSE_MAP_V1_SCHEMA: Record<string, unknown> = {
  $id: "https://textfacts.dev/schema/purpose-map-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "PurposeMapV1",
  type: "object",
  additionalProperties: false,
  required: ["v", "generatedAt", "docs", "relationships"],
  properties: {
    v: { const: 1 },
    generatedAt: { type: "string", minLength: 1 },
    docs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "purpose", "scopes"],
        properties: {
          id: { type: "string", minLength: 1 },
          purpose: { type: "string", minLength: 1 },
          scopes: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["docA", "docB", "relation", "justification"],
        properties: {
          docA: { type: "string", minLength: 1 },
          docB: { type: "string", minLength: 1 },
          relation: {
            enum: ["complements", "supersedes", "explains-reference-of", "overlaps-acceptable"],
          },
          justification: { type: "string", minLength: 1 },
        },
      },
    },
  },
};
