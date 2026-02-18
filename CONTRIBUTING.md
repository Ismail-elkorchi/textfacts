# Contributing

Thanks for helping improve textfacts. This repo is TypeScript-first and intentionally zero-runtime-deps.

**Prerequisites**
- Node.js 24+
- Bun 1.3+
- Deno 2.6+

**Install**
```sh
npm ci
```

**Build**
```sh
npm run build
```

Build emits `.d.ts` via TypeScript and ESM JS via esbuild.

**Tests**
```sh
npm run test:node
npm run test:bun
npm run test:deno
npm run test:browser
```

All tests run offline. Unicode conformance test files are vendored under `testdata/unicode/17.0.0`.

**Schema validation**
```sh
npm run schema:validate
```

Validates JSON Schemas against the 2020-12 meta-schema and enforces I-JSON safety.

**Documentation boundaries**
- `docs/` contains usage and reference documentation.
- `src/`, `schemas/`, `interop/`, `scripts/`, `tools/`, `test/`, and `testdata/` contain implementation and verification.

**Interop suite**
```sh
node tools/interop/verify.mjs
```

Regenerating fixtures (dev-time):
```sh
npm run build
node tools/interop/verify.mjs --write
```

**Formatting and linting (Biome)**
```sh
npm run lint
npm run format
```

**Updating Unicode tables**
```sh
npm run gen:unicode
```

That script downloads the pinned Unicode data files (17.0.0) and regenerates compact tables under:
- `src/unicode/generated` (UAX #29 + emoji + Indic)
- `src/normalize/generated` (UAX #15 normalization data)

**Code style**
- ESM only
- Strict TypeScript
- No Node-only runtime APIs in shipped code
- Deterministic outputs: always define ordering and tie-breaks

**Tests and conformance**
The UAX #29 conformance tests are derived from the official Unicode test files and must pass in Node, Bun, and Deno.
Normalization conformance tests use `NormalizationTest.txt` and must pass 100%.

**Pull request template**
- Use [`.github/pull_request_template.md`](.github/pull_request_template.md) for PR structure and required fields.
