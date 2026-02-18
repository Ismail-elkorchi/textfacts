# Unicode Versioning Playbook

textfacts is pinned to a **single Unicode version** to guarantee determinism. There is no multi-version runtime mode. Upgrades are deliberate, documented, and reproducible.

## Current Pin
- Source of truth: `src/unicode/version.ts` (`UNICODE_VERSION`)
- Test data: `testdata/unicode/<version>/...`
- Test-coupled fixture set:
  - `specs/unicode/Unicode<version>.txt`
  - `specs/unicode/<version>/ucd/CaseFolding.txt`
  - `specs/unicode/<version>/ucd/Scripts.txt`
  - `specs/unicode/<version>/ucd/ScriptExtensions.txt`
  - `specs/unicode/<version>/ucd/PropertyValueAliases.txt`
  - `specs/unicode/<version>/security/confusables.txt`
  - `specs/unicode/<version>/security/IdentifierStatus.txt`
  - `specs/unicode/<version>/security/IdentifierType.txt`

## Upgrade Philosophy
- **Single version at a time:** do not support runtime selection.
- **Test-coupled fixtures only:** keep only fixtures directly read by tests.
- **Reproducibility:** all generated tables and test fixtures are committed.
- **No silent changes:** updates must run through conformance tests and determinism harness.

## Update Checklist
1. **Plan the update**
   - Record the target version and confirm required UCD + test file URLs.
2. **Fixture refresh**
   - Update the minimal fixture set under `specs/unicode/<version>/...` and `specs/unicode/Unicode<version>.txt`.
3. **Test data refresh (offline)**
   - Download UCD + test files into `testdata/unicode/<version>/...`
   - Keep the folder layout consistent with earlier versions.
4. **Regenerate tables**
   - Run: `npm run gen:unicode`
   - This rebuilds segmentation, normalization, scripts, security, and collation tables.
5. **Run full test matrix**
   - `npm run test:node`
   - `npm run test:bun`
   - `npm run test:deno`
   - `npm run test:browser`
6. **Update docs**
   - Record any spec changes in `docs/sources-*.md` as needed.
   - Note any behavior changes in `CHANGELOG.md`.

## Guardrails (CI)
- A test asserts `UNICODE_VERSION` matches the testdata directory and the Unicode fixture file.
- The fixture set under `specs/unicode/**` stays minimal and test-coupled.

## Optional Automation
- Keep the update manual and reviewable; no single-command automation is required.
