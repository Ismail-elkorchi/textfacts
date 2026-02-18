# AGENTS Runbook

## Repository Inventory
- `src/`: library implementation.
- `mod.ts`: primary entrypoint.
- `schemas/`: JSON Schema registry.
- `interop/`: interop fixtures and manifest.
- `scripts/`: utility scripts.
- `tools/`: verification and audit tools.
- `test/`, `testdata/`: automated tests and pinned vectors.
- `docs/`: usage and reference documentation.

## Pre-flight (MUST)
- Read this file.
- Capture baseline context:
  - `git rev-parse HEAD`
  - `git status --porcelain`
- Read `README.md`, `CONTRIBUTING.md`, and relevant `docs/` pages for the task.

## Verification (MUST)
- Run all required checks:
  - `npm run -s lint`
  - `npm run -s build`
  - `npm run -s schema:validate`
  - `npm run -s test:all`
- Run repository coherence check:
  - `node tools/repo/audit.mjs --write`

## Execution Rules
- Keep edits scoped to library behavior and verification.
- Avoid adding non-essential tooling.
- No background automation.
- Do not delete source files unless ownership and intent are explicit.

## Documentation Rule
- `docs/` is practical documentation for usage and reference.

## Quick Checklist
- [ ] Read this file.
- [ ] Capture baseline state.
- [ ] Apply minimal edits.
- [ ] Run required verification commands.
- [ ] Report changed files and command results.
