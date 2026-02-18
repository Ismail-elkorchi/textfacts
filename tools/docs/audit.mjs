import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, "docs");
const MANIFEST_PATH = path.join(DOCS_DIR, "manifest.v1.json");
const INDEX_PATH = path.join(DOCS_DIR, "INDEX.md");
const ISSUE_LIMIT = 20;

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function openRegularFile(filePath) {
  const handle = await fs.open(filePath, "r");
  const stat = await handle.stat();
  if (!stat.isFile()) {
    await handle.close();
    return null;
  }
  return handle;
}

async function collectMarkdownDocPathsRecursive(dirPath, markdownDocPathAccumulator) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownDocPathsRecursive(entryPath, markdownDocPathAccumulator);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      markdownDocPathAccumulator.push(entryPath);
    }
  }
}

function isExternalLink(link) {
  return /^(https?:|mailto:|tel:|data:)/i.test(link);
}

function stripTitle(link) {
  const trimmed = link.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.slice(1, -1);
  }
  const spaceIdx = trimmed.indexOf(" ");
  return spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
}

function parseFrontmatter(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = text.slice(3, end).trim();
  const lines = block.split(/\r?\n/);
  const data = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    data[key] = value;
  }
  return data;
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

function wantsFragmentCheck(text) {
  const frontmatter = parseFrontmatter(text);
  if (!frontmatter) return false;
  return frontmatter.fragmentCheck === "true";
}

async function main() {
  const manifestText = await fs.readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestText);
  const manifestDocs = manifest.docs ?? [];
  const manifestPaths = new Set(
    manifestDocs.map((doc) => normalizePath(path.join(ROOT, doc.path))),
  );

  const docFiles = [];
  await collectMarkdownDocPathsRecursive(DOCS_DIR, docFiles);
  const docFilesSet = new Set(docFiles.map((p) => normalizePath(p)));

  const issues = [];
  let orphanDocs = 0;
  let missingDocs = 0;
  let brokenLinks = 0;
  let badFragments = 0;

  for (const docPath of docFilesSet) {
    if (!manifestPaths.has(docPath)) {
      orphanDocs += 1;
      issues.push(`Orphan doc not in manifest: ${normalizePath(path.relative(ROOT, docPath))}`);
    }
  }

  for (const manifestPath of manifestPaths) {
    if (!docFilesSet.has(manifestPath)) {
      missingDocs += 1;
      issues.push(
        `Manifest entry missing file: ${normalizePath(path.relative(ROOT, manifestPath))}`,
      );
    }
  }

  const anchorCache = new Map();

  for (const docPath of docFilesSet) {
    const relPath = normalizePath(path.relative(ROOT, docPath));
    const text = await fs.readFile(docPath, "utf8");
    const fragmentCheck = docPath === INDEX_PATH || wantsFragmentCheck(text);

    const linkRegex = /!?\[[^\]]*?\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      const raw = match[1] ?? "";
      const dest = stripTitle(raw);
      if (!dest || dest.startsWith("#") || isExternalLink(dest)) continue;

      const [linkPath, fragment] = dest.split("#");
      if (!linkPath) continue;

      let target;
      if (linkPath.startsWith("/")) {
        target = path.join(ROOT, linkPath.slice(1));
      } else {
        target = path.resolve(path.dirname(docPath), linkPath);
      }
      const normalizedTarget = normalizePath(target);

      let fileHandle;
      try {
        fileHandle = await openRegularFile(target);
      } catch {
        brokenLinks += 1;
        issues.push(`Broken link in ${relPath}: ${dest}`);
        continue;
      }
      if (!fileHandle) {
        brokenLinks += 1;
        issues.push(`Link to directory in ${relPath}: ${dest}`);
        continue;
      }

      try {
        if (fragment && (normalizedTarget === normalizePath(INDEX_PATH) || fragmentCheck)) {
          let anchors = anchorCache.get(normalizedTarget);
          if (!anchors) {
            const targetText = await fileHandle.readFile("utf8");
            anchors = collectAnchors(targetText);
            anchorCache.set(normalizedTarget, anchors);
          }
          if (!anchors.has(fragment)) {
            badFragments += 1;
            issues.push(`Bad fragment in ${relPath}: ${dest}`);
          }
        }
      } finally {
        await fileHandle.close();
      }
    }
  }

  issues.sort();
  const head = issues.slice(0, ISSUE_LIMIT);
  for (const issue of head) {
    console.error(issue);
  }
  if (issues.length > ISSUE_LIMIT) {
    console.error(`...and ${issues.length - ISSUE_LIMIT} more issues`);
  }

  const summary = [
    `Docs audit summary:`,
    `docs=${docFilesSet.size}`,
    `manifest=${manifestDocs.length}`,
    `orphans=${orphanDocs}`,
    `missing=${missingDocs}`,
    `brokenLinks=${brokenLinks}`,
    `badFragments=${badFragments}`,
  ].join(" ");

  if (issues.length > 0) {
    console.error(summary);
    process.exit(1);
  }

  console.log(summary);
}

await main();
