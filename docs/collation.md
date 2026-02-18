# Collation (UCA + DUCET)

This module implements the Unicode Collation Algorithm (UTS #10) with the Default Unicode Collation Element Table (DUCET) pinned to Unicode 17.0.0.

It provides **deterministic ordering** for agent workflows without relying on platform ICU.

## What It Is

- Spec-driven collation using UCA + DUCET.
- Deterministic sort keys and comparison.
- Explicit behavior for ill‑formed Unicode.

## What It Is NOT

- Locale tailoring (CLDR).
- Cultural/linguistic “correctness” claims.
- Probabilistic or heuristic ordering.

## API

```ts
import { ucaCompare, ucaSortKeyHex, ucaStableSort } from "textfacts/collation";

const a = "café";
const b = "cafe\u0301";

console.log(ucaCompare(a, b));       // 0 (equal at tertiary by default)
console.log(ucaSortKeyHex(a));        // deterministic hex sort key
console.log(ucaStableSort([b, a]));   // stable, deterministic order
```

### Options

- `strength`: 1 | 2 | 3 | 4 (primary → quaternary)
- `alternate`: `"non-ignorable"` | `"shifted"`
- `normalization`: `"nfd"` | `"none"`
- `illFormed`: `"error"` | `"replace"` | `"implicit"`
- `includeIdenticalLevel`: boolean (default true)

## Ill‑Formed Unicode Policy

- `"replace"` (default): replace lone surrogates with U+FFFD.
- `"error"`: throw an error on ill‑formed sequences.
- `"implicit"`: treat lone surrogates as code points for implicit weights.

## Determinism Guarantees

All collation outputs are fully deterministic given:
- Unicode version (pinned 17.0.0)
- UCA specification version (tr10‑53)
- Explicit options

No runtime ICU behavior is used.
