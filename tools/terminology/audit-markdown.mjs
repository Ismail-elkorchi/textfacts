import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const GLOSSARY_PATH = path.join(ROOT, "docs", "terminology", "glossary.v1.json");
const EXCLUDE_DIRS = new Set(["node_modules", "dist", "dist-test", "specs", ".git"]);
const ISSUE_LIMIT = 50;

function runGitCommand(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

function resolveRef(ref) {
  try {
    return runGitCommand(["rev-parse", ref]);
  } catch {
    return null;
  }
}

function determineDiffRange() {
  const baseOverride = process.env.TERMINOLOGY_BASE;
  const headOverride = process.env.TERMINOLOGY_HEAD;
  if (baseOverride && headOverride) {
    return `${baseOverride}..${headOverride}`;
  }
  const event = process.env.GITHUB_EVENT_NAME;
  if (event && event.startsWith("pull_request")) {
    const baseRef = process.env.GITHUB_BASE_REF;
    const headSha = process.env.GITHUB_SHA ?? resolveRef("HEAD");
    if (baseRef) {
      const candidates = [`origin/${baseRef}`, `refs/remotes/origin/${baseRef}`, baseRef];
      for (const candidate of candidates) {
        const baseSha = resolveRef(candidate);
        if (baseSha && headSha) {
          try {
            const mergeBase = runGitCommand(["merge-base", headSha, baseSha]);
            return `${mergeBase}..${headSha}`;
          } catch {
            return `${baseSha}..${headSha}`;
          }
        }
      }
    }
  }
  const head = resolveRef("HEAD") ?? "HEAD";
  const base = resolveRef("HEAD~1") ?? "HEAD~1";
  return `${base}..${head}`;
}

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

function isWordChar(ch) {
  if (!ch) return false;
  return /[\p{L}\p{N}_]/u.test(ch);
}

function findDiscouraged(line, phrases) {
  const hits = [];
  const lower = line.toLowerCase();
  for (const phrase of phrases) {
    const needle = phrase.toLowerCase();
    let idx = lower.indexOf(needle);
    while (idx !== -1) {
      const before = idx === 0 ? "" : lower[idx - 1];
      const after = idx + needle.length >= lower.length ? "" : lower[idx + needle.length];
      const okBefore = !isWordChar(before);
      const okAfter = !isWordChar(after);
      if (okBefore && okAfter) {
        hits.push({ phrase, index: idx });
        break;
      }
      idx = lower.indexOf(needle, idx + needle.length);
    }
  }
  return hits;
}

function buildDiscouragedList(glossary) {
  const list = [];
  for (const term of glossary.terms ?? []) {
    for (const phrase of term.discouragedPhrases ?? []) {
      list.push(String(phrase));
    }
  }
  return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
}

function buildFenceMap(lines) {
  const fence = new Array(lines.length).fill(false);
  let inFence = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const trimmed = lines[lineIndex].trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      fence[lineIndex] = inFence;
      continue;
    }
    fence[lineIndex] = inFence;
  }
  return fence;
}

function shouldSkipLine(line, inFence) {
  if (inFence) return true;
  const trimmed = line.trimStart();
  if (trimmed.startsWith(">")) return true;
  if (line.includes("terminology-override:")) return true;
  return false;
}

function parseDiff(diffText) {
  const files = new Map();
  let currentFile = null;
  let newLine = 0;

  const lines = diffText.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("@@")) {
      const match = /\+([0-9]+)(?:,([0-9]+))?/.exec(line);
      if (match) {
        newLine = parseInt(match[1], 10);
      }
      continue;
    }
    if (!currentFile) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      const content = line.slice(1);
      if (!files.has(currentFile)) files.set(currentFile, []);
      files.get(currentFile).push({ line: newLine, text: content });
      newLine += 1;
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      continue;
    }
    if (line.startsWith(" ")) {
      newLine += 1;
    }
  }
  return files;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const diffOnly = args.has("--diff");
  const glossary = JSON.parse(await fs.readFile(GLOSSARY_PATH, "utf8"));
  const discouraged = buildDiscouragedList(glossary);

  if (diffOnly) {
    const range = determineDiffRange();
    let diffText = "";
    try {
      diffText = runGitCommand(["diff", "--unified=0", range, "--", "*.md"]);
    } catch {
      diffText = "";
    }
    const changed = parseDiff(diffText);
    let flagged = 0;
    const issues = [];
    for (const [filePath, additions] of changed.entries()) {
      const fullPath = path.join(ROOT, filePath);
      let text;
      try {
        text = await fs.readFile(fullPath, "utf8");
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      const fence = buildFenceMap(lines);
      for (const add of additions) {
        const lineIndex = add.line - 1;
        if (lineIndex < 0 || lineIndex >= lines.length) continue;
        const line = lines[lineIndex];
        if (!line.trim()) continue;
        if (shouldSkipLine(line, fence[lineIndex])) continue;
        const hits = findDiscouraged(line, discouraged);
        if (hits.length > 0) {
          flagged += 1;
          issues.push(`${filePath}:${add.line}: ${hits.map((h) => h.phrase).join(", ")}`);
        }
      }
    }

    if (issues.length > 0) {
      for (const issue of issues) {
        console.error(issue);
      }
    }
    console.log(
      `terminology:audit:diff summary: files=${changed.size} flaggedLines=${flagged} discouraged=${discouraged.length}`,
    );
    if (flagged > 0) {
      process.exit(1);
    }
    return;
  }

  const files = [];
  await collectMarkdownPathsRecursive(ROOT, files);

  let flagged = 0;
  const issues = [];

  for (const filePath of files) {
    const rel = normalizePath(path.relative(ROOT, filePath));
    const text = await fs.readFile(filePath, "utf8");
    const lines = text.split(/\r?\n/);
    const fence = buildFenceMap(lines);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (!line.trim()) continue;
      if (shouldSkipLine(line, fence[lineIndex])) continue;
      const hits = findDiscouraged(line, discouraged);
      if (hits.length > 0) {
        flagged += 1;
        issues.push(`${rel}:${lineIndex + 1}: ${hits.map((h) => h.phrase).join(", ")}`);
      }
    }
  }

  if (issues.length > 0) {
    for (const issue of issues.slice(0, ISSUE_LIMIT)) {
      console.warn(issue);
    }
    if (issues.length > ISSUE_LIMIT) {
      console.warn(`...and ${issues.length - ISSUE_LIMIT} more`);
    }
  }

  console.log(
    `terminology:audit summary: files=${files.length} flaggedLines=${flagged} discouraged=${discouraged.length}`,
  );
}

await main();
