import { TextfactsError } from "../core/error.ts";
import { DOCS_MANIFEST_V1_SCHEMA } from "./docs-manifest.ts";
import { DUPLICATION_ALLOWLIST_V1_SCHEMA, DUPLICATION_REPORT_V1_SCHEMA } from "./duplication.ts";
import { GLOSSARY_V1_SCHEMA } from "./glossary.ts";
import { CONTRADICTION_REGISTER_V1_SCHEMA, METHOD_DOSSIER_V1_SCHEMA } from "./governance.ts";
import {
  IDNA_RESULT_V1_SCHEMA,
  IdnaResultV1StandardJsonSchema,
  UTS46_OPTIONS_V1_SCHEMA,
  Uts46OptionsV1StandardJsonSchema,
} from "./idna.ts";
import { MARKDOWN_MANIFEST_V1_SCHEMA } from "./markdown-manifest.ts";
import { PURPOSE_MAP_V1_SCHEMA } from "./purpose-map.ts";
import { REPO_INVENTORY_V1_SCHEMA } from "./repo-inventory.ts";
import {
  PACK_V1_SCHEMA,
  PackV1StandardJsonSchema,
  TEXT_ENVELOPE_V1_SCHEMA,
  TextEnvelopeV1StandardJsonSchema,
} from "./textfacts.ts";

export type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
  StandardResult,
  StandardIssue,
} from "./standard.ts";
/**
 * TextfactsSchemaId defines an exported type contract.
 */
export type TextfactsSchemaId =
  | "text-envelope-v1"
  | "pack-v1"
  | "idna-result-v1"
  | "uts46-options-v1"
  | "docs-manifest-v1"
  | "contradiction-register-v1"
  | "method-dossier-v1"
  | "repo-inventory-v1"
  | "markdown-manifest-v1"
  | "duplication-report-v1"
  | "duplication-allowlist-v1"
  | "glossary-v1"
  | "purpose-map-v1";

/**
 * getJsonSchema executes a deterministic operation in this module.
 */
export function getJsonSchema(
  id: TextfactsSchemaId,
  target: "draft-2020-12" | "draft-07" = "draft-2020-12",
): Record<string, unknown> {
  if (target !== "draft-2020-12") {
    throw new TextfactsError("SCHEMA_TARGET_UNSUPPORTED", `Unsupported schema target: ${target}`);
  }
  switch (id) {
    case "text-envelope-v1":
      return TEXT_ENVELOPE_V1_SCHEMA;
    case "pack-v1":
      return PACK_V1_SCHEMA;
    case "idna-result-v1":
      return IDNA_RESULT_V1_SCHEMA;
    case "uts46-options-v1":
      return UTS46_OPTIONS_V1_SCHEMA;
    case "docs-manifest-v1":
      return DOCS_MANIFEST_V1_SCHEMA;
    case "contradiction-register-v1":
      return CONTRADICTION_REGISTER_V1_SCHEMA;
    case "method-dossier-v1":
      return METHOD_DOSSIER_V1_SCHEMA;
    case "repo-inventory-v1":
      return REPO_INVENTORY_V1_SCHEMA;
    case "markdown-manifest-v1":
      return MARKDOWN_MANIFEST_V1_SCHEMA;
    case "duplication-report-v1":
      return DUPLICATION_REPORT_V1_SCHEMA;
    case "duplication-allowlist-v1":
      return DUPLICATION_ALLOWLIST_V1_SCHEMA;
    case "glossary-v1":
      return GLOSSARY_V1_SCHEMA;
    case "purpose-map-v1":
      return PURPOSE_MAP_V1_SCHEMA;
    default:
      return TEXT_ENVELOPE_V1_SCHEMA;
  }
}

export {
  PACK_V1_SCHEMA,
  TEXT_ENVELOPE_V1_SCHEMA,
  IDNA_RESULT_V1_SCHEMA,
  UTS46_OPTIONS_V1_SCHEMA,
  DOCS_MANIFEST_V1_SCHEMA,
  CONTRADICTION_REGISTER_V1_SCHEMA,
  METHOD_DOSSIER_V1_SCHEMA,
  REPO_INVENTORY_V1_SCHEMA,
  MARKDOWN_MANIFEST_V1_SCHEMA,
  DUPLICATION_REPORT_V1_SCHEMA,
  DUPLICATION_ALLOWLIST_V1_SCHEMA,
  GLOSSARY_V1_SCHEMA,
  PURPOSE_MAP_V1_SCHEMA,
  PackV1StandardJsonSchema,
  TextEnvelopeV1StandardJsonSchema,
  IdnaResultV1StandardJsonSchema,
  Uts46OptionsV1StandardJsonSchema,
};
