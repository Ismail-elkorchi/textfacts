import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outDir = path.resolve("dist", "smoke");
const outFile = path.join(outDir, "browser-smoke.mjs");

await mkdir(outDir, { recursive: true });

await build({
  entryPoints: ["test/browser-smoke.ts"],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2024",
});

await import(pathToFileURL(outFile).href);
