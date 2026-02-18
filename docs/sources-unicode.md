# Sources: Unicode Algorithms

This document consolidates Unicode algorithm sources for IDNA and collation.

## IDNA (UTS #46)
- **UTS #46 (Unicode IDNA Compatibility Processing)**
  - Normative processing for ToASCII / ToUnicode and mapping behavior.
- **Unicode 17.0.0 IDNA data**
  - `IdnaMappingTable.txt` for status + mappings.
  - `IdnaTestV2.txt` for conformance vectors (both processing modes).
  - `ReadMe.txt` for table/test notes.
  - `Idna2008.txt` as a reference property list (used only where explicitly needed).
- **RFC 3492 (Punycode)**
  - Core encode/decode algorithm only.
- **RFC 5890–5893 (IDNA2008, Bidi, Context Rules)**
  - Bidi and contextual rule definitions referenced by UTS #46 where required.
- **WHATWG URL: IDNA note**
  - Awareness of browser behavior; not used for URL parsing.

## Collation (UCA + DUCET)
- **UTS #10 UCA (tr10-53)**
  - Normative algorithm and definitions for UCA.
- **UCA 17.0.0 data files**
  - `allkeys.txt`, `decomps.txt`, `ctt.txt`, `ReadMe.txt`
  - Provide DUCET tables and supporting data.
- **CollationTest.zip**
  - Official conformance vectors.
- **TR35 Collation**
  - CLDR tailoring framework (reference only; not implemented).
- **ICU Collation Architecture**
  - Reference design insights only.
- **Contraction Processing (L2/12-131r)**
  - Notes on contraction handling.
- **UTS #10 Update Note (L2/2025)**
  - Awareness of newer revisions (not implemented; pinned to 17.0.0).

## Out of Scope (Explicit)
- Full URL parsing or URL Standard compliance.
- Locale-specific tailorings or heuristic ordering.
- Security labeling or threat classification.

All outputs remain facts-only and deterministic under Unicode 17.0.0 data.
