import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "markdown");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "markdown-manifest.v1.json");
const HASH_PATH = path.join(OUTPUT_DIR, "markdown-manifest.v1.jcs.sha256.txt");
const DOCS_MANIFEST_PATH = path.join(ROOT, "docs", "manifest.v1.json");
const README_PATH = normalizePath(path.join(ROOT, "README.md"));
const INDEX_PATH = normalizePath(path.join(ROOT, "docs", "INDEX.md"));

const EXCLUDE_DIRS = new Set(["node_modules", "dist", "dist-test", ".git"]);

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function collectMarkdownPathsRecursive(dirPath, markdownPathAccumulator) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownPathsRecursive(entryPath, markdownPathAccumulator);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      markdownPathAccumulator.push(entryPath);
    }
  }
}

function stripFrontmatter(text) {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return text;
  return text.slice(end + 4);
}

function extractTitle(text, fallback) {
  const cleaned = stripFrontmatter(text);
  const lines = cleaned.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim();
    }
  }
  return fallback;
}

function extractOutboundLinks(text) {
  const links = new Set();
  const linkRegex = /!?\[[^\]]*?\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(text)) !== null) {
    const raw = match[1] ?? "";
    const dest = raw.trim().replace(/^<|>$/g, "");
    if (!dest || /^(https?:|mailto:|tel:|data:)/i.test(dest)) continue;
    links.add(dest.split(" ")[0]);
  }
  return Array.from(links).sort();
}

function stripTitle(link) {
  const trimmed = link.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.slice(1, -1);
  }
  const spaceIdx = trimmed.indexOf(" ");
  return spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
}

function isExternalLink(link) {
  return /^(https?:|mailto:|tel:|data:)/i.test(link);
}

function collectAnchors(text) {
  const anchors = new Map();
  const slugs = new Set();
  let inFence = false;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!match) continue;
    const raw = match[2].replace(/#+\s*$/, "").trim();
    if (!raw) continue;
    let slug = raw
      .toLowerCase()
      .replace(/[`*_~]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    if (!slug) continue;
    if (slugs.has(slug)) {
      let duplicateSuffix = 1;
      while (slugs.has(`${slug}-${duplicateSuffix}`)) duplicateSuffix += 1;
      slug = `${slug}-${duplicateSuffix}`;
    }
    slugs.add(slug);
    anchors.set(slug, true);
  }
  return anchors;
}

async function runAudit(manifest) {
  const entries = manifest.files ?? [];
  const entryByPath = new Map(entries.map((entry) => [normalizePath(entry.path), entry]));

  const inboundMap = new Map();
  let brokenLinks = 0;
  let badFragments = 0;
  const issues = [];
  const anchorCache = new Map();

  for (const entry of entries) {
    for (const link of entry.outboundLinks ?? []) {
      const dest = stripTitle(link);
      if (!dest || isExternalLink(dest)) continue;
      const [linkPath, fragment] = dest.split("#");
      if (!linkPath) continue;
      const resolved = normalizePath(
        path.resolve(path.dirname(path.join(ROOT, entry.path)), linkPath),
      );
      const relTarget = normalizePath(path.relative(ROOT, resolved));

      let stat;
      try {
        stat = await fs.stat(resolved);
      } catch {
        brokenLinks += 1;
        issues.push(`Broken link in ${entry.path}: ${dest}`);
        continue;
      }
      if (stat.isDirectory()) {
        brokenLinks += 1;
        issues.push(`Link to directory in ${entry.path}: ${dest}`);
        continue;
      }

      if (!inboundMap.has(relTarget)) inboundMap.set(relTarget, new Set());
      inboundMap.get(relTarget).add(entry.path);

      const targetPath = normalizePath(resolved);
      const needsFragmentCheck =
        targetPath === README_PATH ||
        targetPath === INDEX_PATH ||
        entryByPath.get(relTarget)?.fragmentCheck === true;

      if (fragment && needsFragmentCheck) {
        let anchors = anchorCache.get(targetPath);
        if (!anchors) {
          const targetText = await fs.readFile(resolved, "utf8");
          anchors = collectAnchors(targetText);
          anchorCache.set(targetPath, anchors);
        }
        if (!anchors.has(fragment)) {
          badFragments += 1;
          issues.push(`Bad fragment in ${entry.path}: ${dest}`);
        }
      }
    }
  }

  let orphanCount = 0;
  for (const entry of entries) {
    const inbound = inboundMap.get(entry.path);
    const inboundList = inbound ? Array.from(inbound).sort() : [];
    const isEntry = entry.entrypoint === true;
    const isPrimary = entry.path === "README.md" || entry.path === "docs/INDEX.md" || isEntry;
    const status = entry.status;
    const isGovernance = entry.kind === "governance";
    const isMeta = entry.kind === "meta";
    const needsJustification = status === "generated" || isGovernance || isMeta;
    const allowsOrphan = isPrimary || (needsJustification && Boolean(entry.orphanJustification));

    if (inboundList.length === 0 && !allowsOrphan) {
      orphanCount += 1;
      issues.push(`Orphan markdown file: ${entry.path}`);
    }
  }

  const titleMap = new Map();
  for (const entry of entries) {
    const list = titleMap.get(entry.title) ?? [];
    list.push(entry.path);
    titleMap.set(entry.title, list);
  }
  const dupTitles = Array.from(titleMap.entries())
    .filter(([, paths]) => paths.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]));

  for (const issue of issues.sort()) {
    console.error(issue);
  }
  if (dupTitles.length > 0) {
    console.warn(`Duplicate titles: ${dupTitles.length}`);
    for (const [title, paths] of dupTitles.slice(0, 20)) {
      console.warn(`- ${title}: ${paths.join(", ")}`);
    }
  }

  const summary = [
    "Markdown audit summary:",
    `files=${entries.length}`,
    `orphans=${orphanCount}`,
    `brokenLinks=${brokenLinks}`,
    `badFragments=${badFragments}`,
    `duplicateTitles=${dupTitles.length}`,
  ].join(" ");

  if (issues.length > 0) {
    console.error(summary);
    process.exit(1);
  }
  console.log(summary);
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
  return `{${entries.join(",")}}`;
}

function hashSha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function parseSourceDate(value) {
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const date = new Date(Number(value) * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  return null;
}

function getStableGeneratedAt() {
  const env =
    parseSourceDate(process.env.SOURCE_DATE_EPOCH) ||
    parseSourceDate(process.env.TEXTFACTS_GENERATED_AT);
  if (env) return env;
  try {
    return execSync("git log -1 --format=%cI", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return new Date().toISOString();
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const auditMode = args.has("--audit");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const docsManifest = JSON.parse(await fs.readFile(DOCS_MANIFEST_PATH, "utf8"));
  const docsMap = new Map((docsManifest.docs ?? []).map((doc) => [normalizePath(doc.path), doc]));

  const files = [];
  await collectMarkdownPathsRecursive(ROOT, files);

  const entries = [];
  for (const filePath of files) {
    const rel = normalizePath(path.relative(ROOT, filePath));
    const text = await fs.readFile(filePath, "utf8");
    const title = extractTitle(text, path.basename(filePath));

    let kind = "other";
    let status = "active";
    let entrypoint = false;
    let supersededBy;
    let canonicalFor;
    let orphanJustification;

    const docsEntry = docsMap.get(rel);
    if (docsEntry) {
      kind = docsEntry.kind;
      status = docsEntry.status;
      canonicalFor = docsEntry.canonicalFor;
      supersededBy = docsEntry.supersededBy;
    } else if (rel === "README.md") {
      kind = "meta";
      status = "active";
      entrypoint = true;
      orphanJustification = "Primary repository entrypoint.";
    } else if (rel === ".github/pull_request_template.md") {
      kind = "meta";
      status = "active";
      orphanJustification = "GitHub pull request template.";
    } else if (rel === "CONTRIBUTING.md") {
      kind = "howto";
      status = "active";
    } else if (rel === "CHANGELOG.md") {
      kind = "meta";
      status = "active";
      orphanJustification = "Project-level changelog.";
    } else if (rel === "SECURITY.md") {
      kind = "reference";
      status = "active";
    } else if (rel.startsWith("specs/")) {
      kind = "meta";
      status = "active";
      orphanJustification = "Spec vault material; not part of user-facing docs.";
    } else if (rel.startsWith("testdata/")) {
      kind = "meta";
      status = "active";
      orphanJustification = "Test data documentation.";
    }

    if (rel === "docs/INDEX.md") {
      entrypoint = true;
      orphanJustification = "Docs entrypoint generated from manifest.";
    }
    if (!orphanJustification && status === "generated") {
      orphanJustification = "Generated artifact.";
    }

    const outboundLinks = extractOutboundLinks(text);

    entries.push({
      path: rel,
      title,
      kind,
      status,
      entrypoint,
      supersededBy,
      canonicalFor,
      orphanJustification,
      outboundLinks,
      inboundLinks: [],
    });
  }

  const inboundMap = new Map();
  for (const entry of entries) {
    for (const link of entry.outboundLinks) {
      const [linkPath] = link.split("#");
      if (!linkPath) continue;
      const resolved = normalizePath(
        path.resolve(path.dirname(path.join(ROOT, entry.path)), linkPath),
      );
      const normalizedRel = normalizePath(path.relative(ROOT, resolved));
      if (!inboundMap.has(normalizedRel)) inboundMap.set(normalizedRel, new Set());
      inboundMap.get(normalizedRel).add(entry.path);
    }
  }

  for (const entry of entries) {
    const inbound = inboundMap.get(entry.path);
    entry.inboundLinks = inbound ? Array.from(inbound).sort() : [];
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));

  const manifest = {
    v: 1,
    generatedAt: getStableGeneratedAt(),
    files: entries,
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  await fs.writeFile(MANIFEST_PATH, manifestText, "utf8");

  const canonical = canonicalize(manifest);
  const digest = hashSha256(canonical);
  await fs.writeFile(HASH_PATH, `sha256:${digest}\n`, "utf8");

  console.log(`Markdown manifest updated (${entries.length} files).`);
  if (auditMode) {
    await runAudit(manifest);
  }
}

await main();
