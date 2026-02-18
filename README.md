# textfacts

Deterministic, Unicode-pinned “text facts” for large-scale text analysis. No ML, no heuristics, no guesses.

**Facts only**
“Facts” here means outputs are algorithm-defined properties of the input string under explicitly declared rules. If the rule doesn’t define it, we don’t infer it. No POS tags, no NER, no sentiment, no embeddings, and no probabilistic scoring.

**Determinism & provenance**
Every result object includes a provenance block that pins the exact Unicode version, algorithm name/version, normalized config hash, and unit definitions. Same input + same options => identical output (including ordering).

**Runtime support**
- Node.js 24.x (ESM only)
- Bun 1.3.x
- Deno 2.6.x (JSR)
- Modern browsers via native ESM bundlers

**Examples**
Node (npm):
```ts
import { segmentWordsUAX29 } from "textfacts/segment";
import { wordFrequencies } from "textfacts/facts";

const text = "Hello, world!";
const segments = [...segmentWordsUAX29(text)];
const freq = wordFrequencies(text);

console.log(segments);
console.log(freq.provenance);
```

Bun (npm):
```ts
import { segmentGraphemes } from "textfacts/segment";

for (const span of segmentGraphemes("Cafe\u0301")) {
  console.log(span);
}
```

Deno (JSR):
```ts
import { segmentSentencesUAX29 } from "jsr:@textfacts/textfacts/segment";

const text = "One. Two? Three!";
const spans = [...segmentSentencesUAX29(text)];
console.log(spans);
```

Browser (ESM bundler):
```ts
import { wordNgrams } from "textfacts/facts";

const text = "to be or not to be";
const result = wordNgrams(text, { n: 2 });
console.log(result.items);
```

Normalization (UAX #15):
```ts
import { normalize } from "textfacts/normalize";

const normalized = normalize("Cafe\u0301", "NFC");
console.log(normalized); // "Café"
```

Agent-first pack:
```ts
import { analyzeText } from "textfacts/pack";

const pack = analyzeText("a a b", { topK: 2 });
console.log(pack.frequencies.words);
console.log(pack.provenance);
```

**Provenance fields**
```ts
{
  unicodeVersion: "17.0.0",
  algorithm: {
    name: "UAX29.Word",
    spec: "https://unicode.org/reports/tr29/",
    revisionOrDate: "Unicode 17.0.0",
    implementationId: "textfacts@0.1.0"
  },
  configHash: "fnv1a32:...",
  units: {
    text: "utf16-code-unit",
    token: "uax29-word",
    word: "uax29-word"
  }
}
```

**Key guarantees**
- No runtime ICU dependency: Unicode data tables are embedded and version-pinned.
- Normalization is implemented in pure TS (no `String.prototype.normalize()` in core).
- All ordering is stable and explicitly defined.
- Canonical JSON helpers enable reproducible hashing in agent pipelines.
- Streaming-friendly iterables for segmentation (no token arrays unless you materialize them).

**Project status**
v0.1.0 (alpha): UAX #29 segmentation, UAX #15 normalization, and deterministic word facts + starter agent packs.

## Docs and Project Records
- [Documentation index](docs/INDEX.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
