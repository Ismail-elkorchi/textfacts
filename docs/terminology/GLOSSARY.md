# Glossary

> Generated file. Do not edit by hand. Run `node tools/terminology/render.mjs`.

Generated at: 2026-02-05T00:00:00Z

## Anchors
- mdn-code-point: https://developer.mozilla.org/en-US/docs/Glossary/Code_point
- unicode-glossary: https://www.unicode.org/glossary/
- unicode-principles: https://www.unicode.org/standard/principles.html
- w3c-characters: https://www.w3.org/TR/charmod-norm/#dfn-character
- w3c-i18n-glossary: https://www.w3.org/TR/i18n-glossary/

## Terms

### A-label

- Kind: protocol
- Definition: An ASCII label with the ACE prefix (xn--), produced by Punycode.
- Preferred phrases: A-label (ACE)
- Anchored by: unicode-glossary

### aggregation

- Kind: docs
- Definition: Collecting or bundling without reducing the number of artifacts or entrypoints; may increase surface area.
- Non-definition: consolidation

### barrel export

- Kind: docs
- Definition: A module that re-exports many submodules via `export *`, often reducing tree-shaking precision.
- Preferred phrases: barrel re-export

### bundle

- Kind: docs
- Definition: Bundler output for a set of modules, measured in bytes or gzip bytes.
- Preferred phrases: bundle output

### canonical (unqualified) terminology-override: glossary term includes discouraged phrase(s)

- Kind: docs
- Definition: Ambiguous term; specify JCS canonicalization or Unicode normalization explicitly. terminology-override: glossary term includes discouraged phrase(s)
- Preferred phrases: JCS canonicalization, Unicode normalization terminology-override: glossary term includes discouraged phrase(s)
- Discouraged phrases: canonical, canonically terminology-override: glossary term includes discouraged phrase(s)

### canonicalization

- Kind: protocol
- Definition: JSON Canonicalization Scheme (JCS) as used for deterministic hashes.
- Non-definition: Unicode normalization
- Preferred phrases: JCS canonicalization
- Anchored by: unicode-principles

### character (unqualified) terminology-override: glossary term includes discouraged phrase(s)

- Kind: docs
- Definition: Ambiguous term; in this repo you must qualify as code point, grapheme cluster, or UTF-16 code unit. terminology-override: glossary term includes discouraged phrase(s)
- Preferred phrases: code point, grapheme cluster, UTF-16 code unit terminology-override: glossary term includes discouraged phrase(s)
- Discouraged phrases: character, characters terminology-override: glossary term includes discouraged phrase(s)
- Anchored by: unicode-glossary, w3c-characters terminology-override: glossary term includes discouraged phrase(s)

### closed system

- Kind: docs
- Definition: A repo where every artifact has an explicit place, relationship, and audit path.
- Preferred phrases: closed-system repo

### code point terminology-override: glossary term includes discouraged phrase(s)

- Kind: unicode
- Definition: A Unicode code point value; in this repo the term refers to Unicode scalar values. terminology-override: glossary term includes discouraged phrase(s)
- Preferred phrases: Unicode scalar value terminology-override: glossary term includes discouraged phrase(s)
- Discouraged phrases: character terminology-override: glossary term includes discouraged phrase(s)
- Units: Unicode scalar values terminology-override: glossary term includes discouraged phrase(s)
- Anchored by: mdn-code-point, unicode-glossary terminology-override: glossary term includes discouraged phrase(s)

### code unit terminology-override: glossary term includes discouraged phrase(s)

- Kind: unicode
- Definition: A single UTF-16 code unit within a JavaScript string. terminology-override: glossary term includes discouraged phrase(s)
- Preferred phrases: UTF-16 code unit terminology-override: glossary term includes discouraged phrase(s)
- Discouraged phrases: character terminology-override: glossary term includes discouraged phrase(s)
- Units: UTF-16 code units terminology-override: glossary term includes discouraged phrase(s)
- Anchored by: unicode-glossary, w3c-characters terminology-override: glossary term includes discouraged phrase(s)

### cognitive load

- Kind: docs
- Definition: Effort required to locate, interpret, and trust sources of truth inside the repo.
- Preferred phrases: maintainer cognitive load
- Aliases: cognitive load (repo)

### conformance test

- Kind: protocol
- Definition: A test derived from official spec test vectors and expected outputs.
- Preferred phrases: spec conformance test

### consolidation

- Kind: docs
- Definition: Reducing surface area by merging overlapping artifacts or entrypoints without removing capability.
- Non-definition: aggregation
- Preferred phrases: surface consolidation

### containment

- Kind: docs
- Definition: Overlap ratio of fingerprints from one document contained in another.
- Preferred phrases: containment ratio

### contradiction register

- Kind: repo
- Definition: A tracked list of unresolved tradeoffs with evidence requirements.
- Preferred phrases: contradictions.v1.json

### deterministic

- Kind: protocol
- Definition: Same input and options produce identical outputs, including ordering.
- Anchored by: unicode-principles

### domain

- Kind: protocol
- Definition: A sequence of labels separated by dot equivalents under UTS #46.
- Preferred phrases: domain name

### dossier

- Kind: repo
- Definition: A machine-readable method dossier documenting claims, falsifiers, and evidence.
- Preferred phrases: method dossier

### duplication

- Kind: docs
- Definition: Measured similarity between documents using deterministic fingerprint metrics.
- Non-definition: semantic equivalence
- Preferred phrases: similarity report
- Anchored by: unicode-principles

### entropy

- Kind: docs
- Definition: Shorthand for repo sprawl; use the explicit entropy (repo) tuple for metrics.
- Preferred phrases: entropy (repo)

### entropy (repo)

- Kind: repo
- Definition: The repository entropy tuple measured by `entropy-report.v1.json`: totalTrackedFiles, totalMarkdownFiles, totalNpmScripts, totalEntrypoints, totalJsrExports, totalSrcModules, totalToolScripts, totalSchemas, totalInteropCases, totalGeneratedTables.
- Preferred phrases: entropy metrics, entropy tuple

### entrypoint

- Kind: docs
- Definition: An exported module path declared in `package.json`/`deno.json` that resolves to a `mod.ts` entry.
- Preferred phrases: module entrypoint, public entrypoint

### grapheme cluster terminology-override: glossary term includes discouraged phrase(s)

- Kind: unicode
- Definition: A user-perceived character cluster as defined by UAX #29 segmentation rules. terminology-override: glossary term includes discouraged phrase(s)
- Preferred phrases: grapheme cluster (UAX #29) terminology-override: glossary term includes discouraged phrase(s)
- Discouraged phrases: character terminology-override: glossary term includes discouraged phrase(s)
- Anchored by: unicode-glossary terminology-override: glossary term includes discouraged phrase(s)

### holdout test

- Kind: protocol
- Definition: A test run with fixed seeds or inputs held aside from routine suites.
- Aliases: holdout PBT

### I-JSON safe

- Kind: protocol
- Definition: JSON content without non-characters, lone surrogates, or non-finite numbers.
- Preferred phrases: I-JSON safe

### IDNA

- Kind: protocol
- Definition: Internationalized Domain Names in Applications processing; in this repo, UTS #46.
- Preferred phrases: UTS #46 IDNA
- Anchored by: unicode-glossary

### internal complexity

- Kind: repo
- Definition: Implementation and tooling complexity (tools, internal docs, schemas) that is not part of the public API surface.
- Non-definition: surface area

### interop case

- Kind: protocol
- Definition: A deterministic input/output fixture used for cross-runtime verification.
- Preferred phrases: interop fixture

### jaccard

- Kind: docs
- Definition: Jaccard similarity over fingerprint sets: intersection divided by union.
- Preferred phrases: Jaccard similarity

### JCS

- Kind: protocol
- Definition: JSON Canonicalization Scheme (RFC 8785) used for deterministic hashing.
- Preferred phrases: JCS canonical JSON

### label

- Kind: protocol
- Definition: A single dot-separated component of a domain name.
- Preferred phrases: domain label

### lone surrogate

- Kind: unicode
- Definition: A surrogate code unit that is not part of a valid surrogate pair.
- Anchored by: unicode-glossary, w3c-characters

### metamorphic test

- Kind: protocol
- Definition: A test that checks invariant relationships between transformed inputs.
- Aliases: metamorphic testing

### normalization

- Kind: unicode
- Definition: Unicode normalization of text to NFC, NFD, NFKC, or NFKD.
- Preferred phrases: Unicode normalization
- Anchored by: unicode-glossary

### orphan

- Kind: docs
- Definition: An artifact not reachable via declared manifests or required entrypoints.
- Preferred phrases: orphan artifact

### overlapCount

- Kind: docs
- Definition: Count of matching fingerprints between two documents.
- Preferred phrases: fingerprint overlap count

### property-based test

- Kind: protocol
- Definition: A test that checks invariants across generated inputs rather than fixed examples.
- Aliases: PBT

### pruning

- Kind: docs
- Definition: Removing redundant or low-signal artifacts while preserving canonical references.
- Preferred phrases: artifact pruning

### safe (unqualified) terminology-override: glossary term includes discouraged phrase(s)

- Kind: security
- Definition: Ambiguous term; this repo does not label text as safe or unsafe. terminology-override: glossary term includes discouraged phrase(s)
- Preferred phrases: I-JSON safe, well-formed terminology-override: glossary term includes discouraged phrase(s)
- Discouraged phrases: safe, unsafe terminology-override: glossary term includes discouraged phrase(s)

### sentence boundary

- Kind: unicode
- Definition: A boundary produced by UAX #29 sentence segmentation.
- Preferred phrases: sentence boundary (UAX #29)
- Anchored by: unicode-glossary

### size budget

- Kind: docs
- Definition: A per-entrypoint gzip byte limit used to prevent regressions.
- Preferred phrases: entrypoint size budget

### span

- Kind: protocol
- Definition: A half-open range in UTF-16 code unit indices: {startCU, endCU}.
- Units: UTF-16 code units
- Examples:
- Example good: {"startCU":0,"endCU":5}
- Example bad: {"start":0,"end":5}

### string

- Kind: docs
- Definition: A JavaScript string interpreted as UTF-16 code units.
- Preferred phrases: JavaScript string
- Units: UTF-16 code units
- Anchored by: mdn-code-point

### surface area

- Kind: docs
- Definition: Total public API exposed through entrypoints and root exports.
- Non-definition: internal complexity
- Preferred phrases: API surface area
- Aliases: surface area (repo)

### surrogate

- Kind: unicode
- Definition: A UTF-16 code unit in the surrogate range (D800–DFFF).
- Preferred phrases: surrogate code unit
- Units: UTF-16 code units
- Anchored by: unicode-glossary, w3c-characters

### text

- Kind: docs
- Definition: Input treated as Unicode text in this repo, either as a JavaScript string or UTF-8 bytes.
- Non-definition: natural-language meaning
- Preferred phrases: Unicode text
- Anchored by: unicode-principles, w3c-i18n-glossary

### ToolSpec

- Kind: protocol
- Definition: A JSON contract for tool input/output schemas, independent of any runtime.
- Preferred phrases: ToolSpec registry

### tree-shaking

- Kind: docs
- Definition: Bundler optimization that removes unused exports from a bundle.
- Preferred phrases: tree-shaking

### U-label

- Kind: protocol
- Definition: A Unicode label after IDNA processing (non-ASCII form).
- Preferred phrases: U-label
- Anchored by: unicode-glossary

### Unicode scalar value

- Kind: unicode
- Definition: A Unicode code point excluding surrogate code points.
- Aliases: scalar value
- Units: Unicode scalar values
- Anchored by: unicode-glossary, unicode-principles

### UTS #46

- Kind: protocol
- Definition: Unicode Technical Standard #46, the compatibility processing for IDNA.
- Anchored by: unicode-glossary

### valid (unqualified) terminology-override: glossary term includes discouraged phrase(s)

- Kind: docs
- Definition: Ambiguous term; specify the exact rule such as well-formed, conformance, or schema validation. terminology-override: glossary term includes discouraged phrase(s)
- Preferred phrases: conformant, schema-valid, well-formed terminology-override: glossary term includes discouraged phrase(s)
- Discouraged phrases: invalid, valid terminology-override: glossary term includes discouraged phrase(s)

### well-formed terminology-override: glossary term includes discouraged phrase(s)

- Kind: unicode
- Definition: Unicode text without lone surrogates; equivalent to well-formed UTF-16 in this repo. terminology-override: glossary term includes discouraged phrase(s)
- Discouraged phrases: valid terminology-override: glossary term includes discouraged phrase(s)
- Anchored by: unicode-glossary, w3c-characters terminology-override: glossary term includes discouraged phrase(s)

### word (unqualified) terminology-override: glossary term includes discouraged phrase(s)

- Kind: docs
- Definition: Ambiguous term; use UAX #29 word boundary token unless you explicitly mean a lexical word. terminology-override: glossary term includes discouraged phrase(s)
- Preferred phrases: word boundary token (UAX #29) terminology-override: glossary term includes discouraged phrase(s)
- Discouraged phrases: word, words terminology-override: glossary term includes discouraged phrase(s)

### word boundary token terminology-override: glossary term includes discouraged phrase(s)

- Kind: unicode
- Definition: A token produced by UAX #29 word boundary segmentation, not a lexical word. terminology-override: glossary term includes discouraged phrase(s)
- Non-definition: language token, lexical word terminology-override: glossary term includes discouraged phrase(s)
- Preferred phrases: word boundary token (UAX #29) terminology-override: glossary term includes discouraged phrase(s)
- Discouraged phrases: word, words terminology-override: glossary term includes discouraged phrase(s)
- Anchored by: unicode-glossary terminology-override: glossary term includes discouraged phrase(s)
