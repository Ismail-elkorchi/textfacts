import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const GLOSSARY_PATH = path.join(ROOT, "docs", "terminology", "glossary.v1.json");
const OUT_PATH = path.join(ROOT, "docs", "terminology", "GLOSSARY.md");

function normalizeList(items) {
  if (!items || items.length === 0) return null;
  return items.slice().sort((a, b) => a.localeCompare(b));
}

function renderList(label, items, overrideNote) {
  if (!items || items.length === 0) return [];
  const suffix = overrideNote ? ` terminology-override: ${overrideNote}` : "";
  return [`- ${label}: ${items.join(", ")}${suffix}`];
}

async function main() {
  const glossary = JSON.parse(await fs.readFile(GLOSSARY_PATH, "utf8"));
  const anchors = (glossary.anchors ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
  const terms = (glossary.terms ?? []).slice().sort((a, b) => a.term.localeCompare(b.term));

  const lines = [
    "# Glossary",
    "",
    "> Generated file. Do not edit by hand. Run `node tools/terminology/render.mjs`.",
    "",
    `Generated at: ${glossary.generatedAt ?? ""}`,
    "",
    "## Anchors",
  ];

  if (anchors.length === 0) {
    lines.push("- _No anchors declared._");
  } else {
    for (const anchor of anchors) {
      lines.push(`- ${anchor.id}: ${anchor.specPath}`);
    }
  }

  lines.push("", "## Terms", "");

  for (const term of terms) {
    const needsOverride =
      Array.isArray(term.discouragedPhrases) && term.discouragedPhrases.length > 0;
    const overrideNote = needsOverride ? "glossary term includes discouraged phrase(s)" : null;
    const headingSuffix = overrideNote ? ` terminology-override: ${overrideNote}` : "";
    lines.push(`### ${term.term}${headingSuffix}`, "");

    lines.push(`- Kind: ${term.kind}`);
    lines.push(
      `- Definition: ${term.definition}${overrideNote ? ` terminology-override: ${overrideNote}` : ""}`,
    );

    const nonDefinition = normalizeList(term.nonDefinition);
    const preferred = normalizeList(term.preferredPhrases);
    const discouraged = normalizeList(term.discouragedPhrases);
    const aliases = normalizeList(term.aliases);
    const units = normalizeList(term.units);
    const anchoredBy = normalizeList(term.anchoredBy);

    lines.push(...renderList("Non-definition", nonDefinition, overrideNote));
    lines.push(...renderList("Preferred phrases", preferred, overrideNote));
    lines.push(...renderList("Discouraged phrases", discouraged, overrideNote));
    lines.push(...renderList("Aliases", aliases, overrideNote));
    lines.push(...renderList("Units", units, overrideNote));
    lines.push(...renderList("Anchored by", anchoredBy, overrideNote));

    if (term.examples && term.examples.length > 0) {
      lines.push(`- Examples:${overrideNote ? ` terminology-override: ${overrideNote}` : ""}`);
      for (const example of term.examples) {
        const good = example.good ?? "";
        const bad = example.bad;
        lines.push(
          `- Example good: ${good}${overrideNote ? ` terminology-override: ${overrideNote}` : ""}`,
        );
        if (bad) {
          lines.push(
            `- Example bad: ${bad}${overrideNote ? ` terminology-override: ${overrideNote}` : ""}`,
          );
        }
      }
    }

    lines.push("");
  }

  await fs.writeFile(OUT_PATH, lines.join("\n"), "utf8");
  console.log(`Glossary rendered (${terms.length} terms).`);
}

await main();
