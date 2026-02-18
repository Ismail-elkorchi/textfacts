# Sources: Protocol + Contracts

This document consolidates sources for protocol, schema, ToolSpec, and interop design.

## I-JSON + JCS
- **RFC 7493 (I-JSON)** and errata
  - No surrogates or noncharacters in JSON strings.
- **RFC 8785 (JCS)**
  - Canonical JSON serialization for hashing/signing.
- **RFC 8259 / RFC 3629 / RFC 4648**
  - Baseline JSON, UTF-8, and Base64 rules for deterministic encoding.

## Standard Schema + JSON Schema
- **Standard Schema spec** and **Standard JSON Schema**
  - Dependency-free schema exposure for TS ecosystems.
- **JSR Standard Schema spec**
  - Referenced for completeness; the spec vault tracks it for availability.
- **JSON Schema 2020-12**
  - Canonical schema dialect for this repo.

## ToolSpec + Interop
- **MCP tool schemas**
  - Constrain how ToolSpec maps to MCP-compatible structures.
- **JSON Schema meta-schema**
  - Basis for dev-time schema validation.

## Design Constraints
- ToolSpec objects are I-JSON safe and JCS-canonicalizable.
- Interop fixtures are deterministic across runtimes.

## Out of Scope
- JSON Schema validation runtime.
- URL parsing or policy-specific tool schemas.
