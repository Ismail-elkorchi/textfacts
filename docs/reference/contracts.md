# Contracts: Schema Registry

This registry separates runtime/public contracts from tooling contracts used by internal tools and documentation generation.

## Runtime/Public Contracts

| Schema ID | File | Purpose |
| --- | --- | --- |
| `text-envelope-v1` | [schemas/text-envelope-v1.schema.json](../../schemas/text-envelope-v1.schema.json) | I-JSON-safe text envelope for deterministic inputs. |
| `pack-v1` | [schemas/pack-v1.schema.json](../../schemas/pack-v1.schema.json) | Pack V1 deterministic output contract. |
| `idna-result-v1` | [schemas/idna-result-v1.schema.json](../../schemas/idna-result-v1.schema.json) | UTS #46 result envelope for IDNA processing. |
| `uts46-options-v1` | [schemas/uts46-options-v1.schema.json](../../schemas/uts46-options-v1.schema.json) | Options for UTS #46 IDNA processing. |
| `glossary-v1` | [schemas/glossary-v1.schema.json](../../schemas/glossary-v1.schema.json) | Terminology contract schema for `docs/terminology/glossary.v1.json`. |

## Tooling Contracts (Artifact-Backed)

Tooling-contract schemas live in `schemas/` and are used to validate generated artifacts and internal reports.

| Schema ID | File | Artifact Location |
| --- | --- | --- |
| `docs-manifest-v1` | [schemas/docs-manifest-v1.schema.json](../../schemas/docs-manifest-v1.schema.json) | `docs/manifest.v1.json` |
| `markdown-manifest-v1` | [schemas/markdown-manifest-v1.schema.json](../../schemas/markdown-manifest-v1.schema.json) | `docs/markdown/markdown-manifest.v1.json` |
| `repo-inventory-v1` | [schemas/repo-inventory-v1.schema.json](../../schemas/repo-inventory-v1.schema.json) | `docs/inventory/inventory.v1.json` |
| `duplication-report-v1` | [schemas/duplication-report-v1.schema.json](../../schemas/duplication-report-v1.schema.json) | `docs/duplication/duplication-report.v1.json` |
| `duplication-allowlist-v1` | [schemas/duplication-allowlist-v1.schema.json](../../schemas/duplication-allowlist-v1.schema.json) | `docs/duplication/allowlist.v1.json` |
| `purpose-map-v1` | [schemas/purpose-map-v1.schema.json](../../schemas/purpose-map-v1.schema.json) | `docs/ia/purpose-map.v1.json` |
| `method-dossier-v1` | [schemas/method-dossier-v1.schema.json](../../schemas/method-dossier-v1.schema.json) | Tool-defined (no default committed path) |
| `contradiction-register-v1` | [schemas/contradiction-register-v1.schema.json](../../schemas/contradiction-register-v1.schema.json) | Tool-defined (no default committed path) |
