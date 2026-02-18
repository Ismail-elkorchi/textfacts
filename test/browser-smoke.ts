import { wordFrequencies } from "../src/facts/mod.ts";
import { uts46ToAscii } from "../src/idna/mod.ts";
import { normalize } from "../src/normalize/mod.ts";
import { analyzeText } from "../src/pack/mod.ts";
import { segmentGraphemes } from "../src/segment/mod.ts";

const spans = [...segmentGraphemes("Cafe\u0301")];
if (spans.length !== 4) {
  throw new Error(`Expected 4 graphemes, got ${spans.length}`);
}

const freq = wordFrequencies("a a b", { filter: "word-like" });
if (freq.items[0]?.token !== "a" || freq.items[0]?.count !== 2) {
  throw new Error("Word frequency result mismatch");
}

const normalized = normalize("Cafe\u0301", "NFC");
if (normalized !== "Café") {
  throw new Error(`Normalization mismatch: ${normalized}`);
}

const pack = analyzeText("a a b", { topK: 2 });
if (pack.frequencies.words.representation !== "json") {
  throw new Error("Pack representation mismatch");
}

const idna = uts46ToAscii("example.com");
if (!idna.ok || idna.value !== "example.com") {
  throw new Error(`IDNA mismatch: ${JSON.stringify(idna)}`);
}
