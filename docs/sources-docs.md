# Sources: Documentation System

This document consolidates sources for documentation structure, terminology, duplication, and footprint discipline.

## Documentation IA Frameworks
- **Diátaxis (overview + start-guide)**: tutorial/howto/reference/explanation taxonomy.
- **Read the Docs documentation structure**: explicit structure and navigation.
- **Write the Docs: Docs-as-Code**: repo-first deterministic tooling.
- **Good Docs Project**: template-driven clarity and explicit ownership.

## Markdown Parsing + Link Semantics
- **CommonMark (current)**: baseline Markdown parsing.
- **GitHub Flavored Markdown (GFM)**: practical heading/anchor conventions.

## Terminology Anchors
- Unicode glossary: https://www.unicode.org/glossary/
- Unicode principles: https://www.unicode.org/standard/principles.html
- W3C character definition: https://www.w3.org/TR/charmod-norm/#dfn-character
- W3C i18n glossary: https://www.w3.org/TR/i18n-glossary/
- MDN code point glossary: https://developer.mozilla.org/en-US/docs/Glossary/Code_point

## Footprint + Bundling
- **Esbuild API and issue threads**: tree-shaking behavior and pitfalls.
- **Webpack tree-shaking guidance + Web.dev guide**: bundling principles.
- **Ecosystem signals**: unicode-segmenter and e18e notes on size/perf.

## Constraints Derived
- Doc taxonomy uses a stable four-kind classification with explicit status.
- Internal link validation is conservative and deterministic.
- Duplication reduction uses evidence-based fingerprint similarity.
- Entry-point size budgets are tracked and enforced.

## Out of Scope
- External documentation hosting policies.
- Renderer-specific anchor behavior beyond CommonMark/GFM.
- Heuristic security labeling or threat classification.
