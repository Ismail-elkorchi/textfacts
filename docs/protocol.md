# Protocol: I-JSON Conformant Output

textfacts runs on raw JS strings, which can legally contain lone surrogates and noncharacters. I‑JSON forbids these in JSON strings. To produce JCS-canonicalized JSON that can be hashed with JCS, we use a **text envelope**.

## TextEnvelopeV1
`TextEnvelopeV1` is a tagged union that **always** produces I‑JSON‑conformant JSON:

- `kind: "string"` — only when the string is I‑JSON conformant
- `kind: "utf8-base64"` — UTF‑8 bytes, encoded as RFC 4648 base64
- `kind: "utf16le-base64"` — UTF‑16LE bytes (exact code units), encoded as RFC 4648 base64
- `kind: "utf16-code-units"` — exact JS code units (can represent any JS string)

This makes it reliable to serialize text without guessing whether it is I‑JSON compatible.

## Pack V1
`packTextV1` returns a deterministic, schema’d bundle of facts that are **always I‑JSON conformant** and therefore JCS‑hashable.

```ts
import { packTextV1, packTextV1Sha256 } from "textfacts/protocol";

const pack = packTextV1("A\uD800B", { includeInputText: true });
const digest = await packTextV1Sha256("A\uD800B", { includeInputText: true });
```

## Guarantees
- **I‑JSON conformant** by construction
- **Deterministic** output ordering
- **No heuristics**: facts only

## Non‑Goals
- This is **not** a security verdict system.
- This is **not** a schema validator.

## ToolSpec (Framework‑Neutral)
ToolSpec objects provide **machine‑readable contracts** for agent tools without tying textfacts to any specific framework.

### What It Is
- A JSON object with version, name, description, input schema, and output schema.
- Always I‑JSON‑conformant and JCS‑canonicalizable.

### What It Is Not
- It is **not** a server protocol.
- It is **not** a runtime validator.

### Usage
```ts
import { listToolSpecs, getToolSpec } from "textfacts/toolspec";

const specs = listToolSpecs();
const packSpec = getToolSpec("packTextV1");
```

### Schemas
ToolSpec schemas are draft‑2020‑12 JSON Schema with explicit `$schema`.
When possible, they reuse the JSON Schemas from `textfacts/schema`.

### Interop Coverage
Every ToolSpec entry must have at least one interop case. If not, the tool must be
explicitly marked with `interopPending` including a short justification so the gap stays visible.

Example:
```json
{
  "name": "exampleTool",
  "interopPending": {
    "justification": "Waiting on test vectors."
  }
}
```

## MCP Adapter
textfacts does **not** implement an MCP server, but it provides a small adapter that maps ToolSpec objects into MCP‑style tool definitions.

```ts
import { getToolSpec, toMcpTool } from "textfacts/toolspec";

const spec = getToolSpec("packTextV1");
const mcpTool = toMcpTool(spec);
```

The adapter simply maps fields and preserves the JSON Schema input/output.
