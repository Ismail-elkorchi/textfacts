import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = process.cwd();
const testDistRootDir = path.join(workspaceRoot, "dist-test", "test");

async function listRewriteTargetPathsRecursive(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const rewriteTargetPaths = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      rewriteTargetPaths.push(...(await listRewriteTargetPathsRecursive(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      rewriteTargetPaths.push(entryPath);
    }
  }
  return rewriteTargetPaths;
}

function addJsExtension(spec) {
  if (!spec.startsWith(".")) return spec;
  if (spec.endsWith(".ts") || spec.endsWith(".tsx")) {
    return spec.replace(/\.tsx?$/, ".js");
  }
  if (spec.match(/\.[a-zA-Z0-9]+$/)) return spec;
  return `${spec}.js`;
}

function rewriteImports(source) {
  return source
    .replace(/(from\s+["'])([^"']+)(["'])/g, (match, prefix, spec, suffix) => {
      const updated = addJsExtension(spec);
      return `${prefix}${updated}${suffix}`;
    })
    .replace(/(import\s+["'])([^"']+)(["'])/g, (match, prefix, spec, suffix) => {
      const updated = addJsExtension(spec);
      return `${prefix}${updated}${suffix}`;
    });
}

async function main() {
  try {
    const rewriteTargetPaths = await listRewriteTargetPathsRecursive(testDistRootDir);
    await Promise.all(
      rewriteTargetPaths.map(async (filePath) => {
        const content = await fs.readFile(filePath, "utf8");
        const updated = rewriteImports(content);
        if (updated !== content) {
          await fs.writeFile(filePath, updated, "utf8");
        }
      }),
    );
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
}

main();
