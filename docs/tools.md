# Repository Tooling

This page lists operational commands that are expected for normal repository use.

## Build
- `npm run build` — TypeScript declarations + ESM output.
- `npm run build:test` — build test bundle used by Node runtime tests.

## Validation
- `npm run schema:validate` — validate JSON Schema contracts.
- `npm run lint` — Biome checks.
- `npm run format` — Biome formatting.

## Tests
- `npm run test:node`
- `npm run test:deno`
- `npm run test:bun`
- `npm run test:browser`
- `npm run test:all`

## Data/Table Regeneration
- `npm run gen:unicode` — regenerate pinned Unicode/DUCET data tables.
- `specs/unicode/**` — minimal text fixtures used directly by tests (kept intentionally small).

## Reports
- `npm run size:report` — generate the size report under repository-local verification output.

## Scope Boundary
- Maintenance tooling lives in `tools/`; verification outputs are local to the command’s workspace.
- Scheduled/background automation is intentionally excluded from this repository.
