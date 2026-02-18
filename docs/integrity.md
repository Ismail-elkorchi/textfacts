# Unicode Integrity (Facts Only)

This module reports **deterministic, spec-defined facts** about Unicode text that can affect display or processing. It does **not** label intent or risk. All findings are derived from pinned Unicode 17.0.0 data tables.

## Finding Kinds

- `lone-surrogate`
  - A UTF-16 code unit in the surrogate range that does **not** form a valid pair.
  - Reported with `codePoint` set to the **code unit value** (0xD800–0xDFFF).

- `default-ignorable`
  - From `Default_Ignorable_Code_Point` (DerivedCoreProperties.txt).
  - These code points are typically ignored in rendering or processing by default.

- `bidi-control`
  - From `Bidi_Control` (PropList.txt).
  - Controls the Unicode Bidirectional Algorithm behavior.

- `join-control`
  - From `Join_Control` (PropList.txt).
  - Includes ZWJ/ZWNJ and related join controls.

- `variation-selector`
  - From `Variation_Selector` (PropList.txt).
  - Used to request alternate glyph presentations.

- `noncharacter`
  - From `Noncharacter_Code_Point` (PropList.txt).
  - Reserved code points that are not valid for open interchange.

## Why Hidden Unicode Matters In Agent Pipelines
- Hidden or format control code points can change display, cursor movement, or parsing without obvious visual cues.
- Agents performing comparison, indexing, or policy checks must **locate** these code points deterministically to explain differences, not infer intent.
- Deterministic detection keeps findings stable across Node, Bun, Deno, and browsers.

## APIs

- `isWellFormedUnicode(text)`
  - Returns `true` only when the string has no lone surrogates.

- `toWellFormedUnicode(text)`
  - Replaces each lone surrogate with U+FFFD, preserving all valid pairs.

- `scanLoneSurrogates(text)`
  - Returns spans for each unpaired surrogate code unit.

- `scanIntegrityFindings(text, opts)` / `iterIntegrityFindings(text, opts)`
  - Locates findings with explicit spans and code points.
  - `iterIntegrityFindings` is streaming-friendly and allocates zero extra objects per finding.

- `integrityProfile(text, opts)`
  - Returns stable counts and optional per-kind samples.

## What It Does NOT Mean

- A finding is **not** a judgment of intent, malice, or policy.
- This module does **not** apply heuristics or “risk scores.”
- It does **not** normalize or alter content except when explicitly calling `toWellFormedUnicode`.

## Example

```ts
import {
  integrityProfile,
  scanIntegrityFindings,
  toWellFormedUnicode,
} from "textfacts/integrity";

const text = "A\u200D\u2060\u202E\uFE0F\uFDD0B";

const profile = integrityProfile(text, { maxSamplesPerKind: 2 });
const findings = scanIntegrityFindings(text);
const repaired = toWellFormedUnicode(text);

console.log(profile.counts);
console.log(findings);
console.log(repaired);
```

All spans use UTF-16 code unit offsets (`Span`), consistent with JavaScript string indexing.
