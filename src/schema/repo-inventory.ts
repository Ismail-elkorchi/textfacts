/**
 * REPO_INVENTORY_V1_SCHEMA is an exported constant used by public APIs.
 */
export const REPO_INVENTORY_V1_SCHEMA: Record<string, unknown> = {
  $id: "https://textfacts.dev/schema/repo-inventory-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "RepoInventoryV1",
  type: "object",
  additionalProperties: false,
  required: [
    "v",
    "generatedAt",
    "commit",
    "fileCount",
    "countsByExtension",
    "countsByTopLevelDir",
    "markdownFiles",
    "schemaFiles",
    "toolScripts",
  ],
  properties: {
    v: { const: 1 },
    generatedAt: { type: "string", minLength: 1 },
    commit: { type: "string", minLength: 1 },
    fileCount: { type: "integer", minimum: 0 },
    countsByExtension: {
      type: "object",
      additionalProperties: { type: "integer", minimum: 0 },
    },
    countsByTopLevelDir: {
      type: "object",
      additionalProperties: { type: "integer", minimum: 0 },
    },
    markdownFiles: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    schemaFiles: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    toolScripts: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
};
