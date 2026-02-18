# JCS (RFC 8785) JSON Canonicalization

This module implements the JSON Canonicalization Scheme (JCS) as defined in RFC 8785, constrained to **I-JSON** (RFC 7493). It produces deterministic JCS-canonicalized JSON strings suitable for hashing and signing.

## Key Properties

- **No whitespace** is emitted.
- **Object keys are sorted** lexicographically by UTF-16 code unit order.
- **Numbers/strings follow ECMAScript JSON serialization rules** with strict I-JSON validation.
- **Invalid values are rejected**, not coerced.

Key ordering is byte-for-byte on the UTF-16 code unit sequence of the key string (not locale collation, not code point order). This makes sorting deterministic across runtimes.

## I-JSON Constraints Enforced

The canonicalizer rejects:

- Non-finite numbers (`NaN`, `Infinity`, `-Infinity`).
- Strings or keys containing **lone surrogates**.
- Strings or keys containing **noncharacters**.
- Non-JSON types: `undefined`, `BigInt`, `Symbol`, `Function`, `Date`, `Map`, `Set`, `TypedArray`, `ArrayBuffer`, and cyclic structures.

RFC 8785 operates on JSON texts; I-JSON forbids unpaired surrogates in strings, so textfacts rejects any string or key containing them before canonicalization.

Errors are raised as `TextfactsError` with deterministic codes:

- `JCS_NON_FINITE_NUMBER`
- `JCS_LONE_SURROGATE`
- `JCS_NONCHARACTER`
- `JCS_UNSUPPORTED_TYPE`

## APIs

- `assertIJson(value)`
  - Validates a value as I-JSON, throwing `TextfactsError` if invalid.

- `jcsCanonicalize(value)`
  - Returns a canonical JSON string.

- `jcsSha256Hex(value)`
  - Returns a `sha256:` prefixed hex digest of the canonical JSON.
  - Uses WebCrypto; supported runtimes (Node 24+, Bun, Deno, modern browsers) provide it.

## Example

```ts
import { jcsCanonicalize, jcsSha256Hex } from "textfacts/jcs";

const value = { b: [true, false, null], a: 1 };

const canonical = jcsCanonicalize(value);
const digest = await jcsSha256Hex(value);

console.log(canonical); // {"a":1,"b":[true,false,null]}
console.log(digest);    // sha256:...
```

These outputs are stable across Node, Bun, Deno, and modern browsers.

## Internal Canonical Stringify

`canonicalModelStringify` exists for internal/debug models that are **not** strict JSON.
Determinism payloads and hashes must use JCS.
