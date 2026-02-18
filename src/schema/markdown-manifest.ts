/**
 * MARKDOWN_MANIFEST_V1_SCHEMA is an exported constant used by public APIs.
 */
export const MARKDOWN_MANIFEST_V1_SCHEMA: Record<string, unknown> = {
  $id: "https://textfacts.dev/schema/markdown-manifest-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "MarkdownManifestV1",
  type: "object",
  additionalProperties: false,
  required: ["v", "generatedAt", "files"],
  properties: {
    v: { const: 1 },
    generatedAt: { type: "string", minLength: 1 },
    files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "title", "kind", "status", "outboundLinks", "inboundLinks"],
        properties: {
          path: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          kind: {
            enum: ["tutorial", "howto", "reference", "explanation", "meta", "governance", "other"],
          },
          status: { enum: ["active", "superseded", "generated"] },
          entrypoint: { type: "boolean" },
          supersededBy: { type: "string", minLength: 1 },
          canonicalFor: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          orphanJustification: { type: "string", minLength: 1 },
          fragmentCheck: { type: "boolean" },
          outboundLinks: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          inboundLinks: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
  },
};
