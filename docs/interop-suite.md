# Interop Suite

The interop suite provides **small, deterministic fixtures** for verifying protocol output across implementations and languages.

## What It Is
- A set of JSON cases in `interop/cases/*.json`
- Each case includes:
  - Operation name (op)
  - Input envelopes + options
  - Expected JCS SHA‑256 digest of the output object

## How to Update Cases

1. Edit or add cases in `interop/cases/*.json`.
2. Recompute expected digests:

```bash
npm run build
node tools/interop/verify.mjs --write
```

## How to Verify

```bash
node tools/interop/verify.mjs
```

## Case Coverage
- Pack V1 (multiple inputs)
- TextEnvelope round‑trip
- Integrity profile
- Confusable skeleton
- UCA sort keys
- Winnowing fingerprints
- Diff text
