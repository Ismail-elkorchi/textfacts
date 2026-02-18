import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "docs", "manifest.v1.json");
const INDEX_PATH = path.join(ROOT, "docs", "INDEX.md");

const KIND_ORDER = ["tutorial", "howto", "reference", "explanation"];
const KIND_LABELS = {
  tutorial: "Tutorials",
  howto: "How-To Guides",
  reference: "Reference",
  explanation: "Explanations",
};

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function relToDocs(docPath) {
  const rel = path.relative(path.join(ROOT, "docs"), path.join(ROOT, docPath));
  return normalizePath(rel);
}

function groupByKind(docs) {
  const grouped = new Map();
  for (const kind of KIND_ORDER) grouped.set(kind, []);
  for (const doc of docs) {
    const arr = grouped.get(doc.kind);
    if (arr) arr.push(doc);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.title.localeCompare(b.title));
  }
  return grouped;
}

function renderTable(docs) {
  if (docs.length === 0) return "_No entries._";
  const rows = docs.map((doc) => {
    const relPath = relToDocs(doc.path);
    const titleLink = `[${doc.title}](${relPath})`;
    return `| ${titleLink} | ${relPath} | ${doc.status} | ${doc.summary} |`;
  });
  return ["| Title | Path | Status | Summary |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

async function main() {
  const text = await fs.readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(text);
  const docs = manifest.docs ?? [];
  const grouped = groupByKind(docs);

  const agentDoc = docs.find((doc) => doc.id === "agent-uses");
  const agentPath = agentDoc ? relToDocs(agentDoc.path) : "tools.md";
  const agentTitle = agentDoc?.title ?? "Repository Tooling";
  const importsDoc = docs.find((doc) => doc.id === "imports");
  const importsPath = importsDoc ? relToDocs(importsDoc.path) : "reference/imports.md";

  const content = [
    "# Documentation Index",
    "",
    "> Generated file. Do not edit by hand. Run `node tools/docs/build-index.mjs`.",
    "",
    "## Doc Kinds",
    "- **Tutorial:** guided learning paths for new users.",
    "- **How-To:** step-by-step tasks and procedures.",
    "- **Reference:** factual contracts, APIs, and specs.",
    "- **Explanation:** rationale, tradeoffs, and background context.",
    "",
    "## Agent Task Entrypoints",
    `- [${agentTitle}](${agentPath})`,
    `- [${importsDoc?.title ?? "Imports And Footprint"}](${importsPath})`,
    "",
  ];

  for (const kind of KIND_ORDER) {
    const label = KIND_LABELS[kind] ?? kind;
    const entries = grouped.get(kind) ?? [];
    content.push(`## ${label}`, "", renderTable(entries), "");
  }

  await fs.writeFile(INDEX_PATH, content.join("\n"), "utf8");
  console.log(`Docs index updated (${docs.length} entries).`);
}

await main();
