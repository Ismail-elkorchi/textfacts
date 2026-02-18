import { promises as fs } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const workspaceRoot = process.cwd();
const testRootDir = path.join(workspaceRoot, "test");
const buildEntryPaths = [
  path.join(testRootDir, "node.test.ts"),
  path.join(testRootDir, "suite.ts"),
];

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

await collectTypeScriptEntryPathsRecursive(path.join(testRootDir, "_support"));
await collectTypeScriptEntryPathsRecursive(path.join(testRootDir, "metamorphic"));

await build({
  entryPoints: buildEntryPaths,
  outdir: path.join(workspaceRoot, "dist-test"),
  outbase: workspaceRoot,
  platform: "neutral",
  format: "esm",
  target: "es2024",
  sourcemap: true,
  bundle: false,
});
