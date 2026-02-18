# Hashing (Facts-Only)

This module provides deterministic, non-cryptographic hashes for comparison and indexing. It is not a signature system.

**Algorithms**
- `fnv1a64-utf16le`: fast, JS-native code-unit hashing.
- `fnv1a64-utf8`: byte-level FNV-1a on UTF-8.
- `xxh64-utf8`: stronger mixing for UTF-8 text (default for comparison tokens).

**Composite 128-bit**
- `hash128Text` combines two independent 64-bit hashes.
- This reduces collision risk but is still **not** cryptographic.

**Encoding Choices**
- UTF-8 is the cross-language default for reproducibility.
- UTF-16LE remains available for JS-native speed and span hashing.

**Collision Reality**
- FNV-1a is fast and deterministic but has known collisions.
- Prefer `xxh64-utf8` or composite `hash128` for large-scale corpus work.

**Span Hashing**
- `hash64SpanUtf16` hashes a span without slicing substrings.

For JCS/I-JSON sources used by digest workflows, see `docs/sources-protocol-contracts.md`.
