import { promises as fs } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const workspaceRoot = process.cwd();
const sourceRootDir = path.join(workspaceRoot, "src");
const buildEntryPaths = [path.join(workspaceRoot, "mod.ts")];

async function collectTypeScriptEntryPathsRecursive(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectTypeScriptEntryPathsRecursive(entryPath);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      buildEntryPaths.push(entryPath);
    }
  }
}

await collectTypeScriptEntryPathsRecursive(sourceRootDir);

await build({
  entryPoints: buildEntryPaths,
  outdir: path.join(workspaceRoot, "dist"),
  outbase: workspaceRoot,
  platform: "neutral",
  format: "esm",
  target: "es2024",
  sourcemap: true,
  bundle: false,
});
