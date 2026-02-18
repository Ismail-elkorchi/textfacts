import type * as Textfacts from "../../src/all/mod.ts";

export type Runtime = "node" | "deno" | "bun";
export type TextfactsModule = typeof Textfacts;

export function detectRuntime(): Runtime {
  if (typeof (globalThis as { Deno?: unknown }).Deno !== "undefined") return "deno";
  if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") return "bun";
  return "node";
}

export function getRepoRootUrl(): URL {
  const moduleUrl = new URL(import.meta.url);
  const isCompiled = moduleUrl.pathname.includes("/dist-test/");
  return isCompiled ? new URL("../../../", moduleUrl) : new URL("../../", moduleUrl);
}

function fileUrlToPath(url: URL): string {
  let path = url.pathname;
  if (path.startsWith("/") && path.length > 3 && path[2] === ":") {
    path = path.slice(1);
  }
  return decodeURIComponent(path);
}

export async function readTextFile(pathOrUrl: string | URL): Promise<string> {
  const runtime = detectRuntime();
  const path = typeof pathOrUrl === "string" ? pathOrUrl : fileUrlToPath(pathOrUrl);
  if (runtime === "deno") {
    return await Deno.readTextFile(path);
  }
  if (runtime === "bun") {
    const bun = (
      globalThis as { Bun?: { file: (path: string) => { text: () => Promise<string> } } }
    ).Bun;
    if (!bun) throw new Error("Bun runtime not available");
    return await bun.file(path).text();
  }
  const nodeFsPromises = await import("node:fs/promises");
  return await nodeFsPromises.readFile(path, "utf8");
}

export async function importTextfacts(): Promise<TextfactsModule> {
  const runtime = detectRuntime();
  const rootUrl = getRepoRootUrl();
  const moduleUrl =
    runtime === "node"
      ? new URL("dist/src/all/mod.js", rootUrl)
      : new URL("src/all/mod.ts", rootUrl);
  return import(moduleUrl.href) as Promise<TextfactsModule>;
}
