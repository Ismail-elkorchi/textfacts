# Compare: Diff + Fingerprints

This module groups deterministic token diffing and winnowing fingerprints. It is **facts-only**: no semantic interpretation or plagiarism claims.

## Token Diff (Myers O(ND))

- **Exact shortest edit script** (Myers O(ND)).
- **Deterministic tie-breaks**: stable output under identical inputs and options.
- **Span mapping** for token-based diffs.

### API
- `diffSequence(a, b, eq, opts)`
  - Low-level diff over arrays.
  - Options:
    - `maxD`: budget for search depth (returns a truncated replacement script if exceeded).
    - `prefer`: tie-break policy (`"delete"` or `"insert"`).
- `diffText(a, b, opts)`
  - Tokenizes text, then diffs tokens using canonical keys.
- `compareTextsDetailed(a, b, opts)`
  - Combines winnowing fingerprints + resemblance metrics, and optionally includes `diffText`.

### Tie-break rule
When multiple shortest edit scripts exist, we choose consistently based on `prefer`:
- `prefer: "delete"` selects deletions before insertions in ambiguous steps.
- `prefer: "insert"` selects insertions before deletions.

## Winnowing Fingerprints

- **k**: shingle size in tokens.
- **window**: number of consecutive shingles used to select a minimum hash.
- **Tie-break**: when multiple minimum hashes exist in a window, we select the **rightmost** minimum.
- **Dedupe**: `dedupe: "by-hash"` reduces density on low-distinct streams while preserving the winnowing guarantee.
- **Hash**: defaults to `xxh64-utf8`; override via `hash` option when needed.

### Density Control
Winnowing selects fingerprints by taking the minimum hash in each window of k-gram hashes. On low-distinct inputs (e.g., repeated tokens), naive selection can emit O(n) fingerprints.

textfacts adds a deterministic density control option:
- `dedupe: "by-hash"` (default) emits a new fingerprint only when the selected minimum hash changes or when the earlier fingerprint falls outside the current window.
- `dedupe: "by-position"` emits every selected minimum (higher density).

**Guarantee**
Every window still contains at least one fingerprint under `by-hash`. This preserves the standard winnowing match guarantee for substrings of length `window + k - 1`.

### Output
`winnowingFingerprints(text, opts)` returns:
- `fingerprints`: array of `{ hash64Hex, tokenIndex, span }`
- `algo`: provenance

Fingerprints are sorted deterministically by `(tokenIndex, hash64Hex)`.

### Resemblance Metrics
- `jaccard(a, b)`: intersection / union
- `containment(a, b)`: intersection / |a|
- `overlapCount(a, b)`: exact overlap count

All ratios are returned as `{ num, den }` with integer strings (no floats).

## Collision-Aware Indexing
`buildFingerprintIndex(..., { verifyKgramOnMatch: true })` tracks distinct k-gram hash sequences per fingerprint bucket and reports how many buckets contain more than one distinct sequence.

## Foundations And Scope
### Papers and contributions
- **Myers (1986)** — O(ND) shortest edit scripts for deterministic token diffing.
- **Schleimer et al. (2003)** — winnowing fingerprints and match guarantees.
- **Broder et al.** — set-based resemblance metrics (Jaccard/containment).
- **Charikar (2002)** — sketching context for similarity estimation.

### What We Implement
- Exact token diff based on Myers O(ND) with deterministic tie-breaks.
- Winnowing fingerprints over token k-grams with deterministic window minima.
- Resemblance metrics (Jaccard / containment / overlap) on fingerprint sets.
- Deterministic hashing (64-bit, BigInt-based) for token keys and shingles.

### What We Do NOT Claim
- No plagiarism or authorship judgments.
- No semantic similarity claims.
- No probabilistic scoring or heuristics.
- No “suspicious” or “malicious” labels.

## Notes
- All spans are UTF-16 code unit offsets.
- All canonicalizations are explicit and deterministic.
