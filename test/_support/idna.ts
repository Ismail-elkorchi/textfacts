import { getRepoRootUrl, readTextFile } from "./runtime.ts";

const UNICODE_VERSION = "17.0.0";
const cache = new Map<string, string>();

export interface IdnaTestCase {
  source: string;
  toUnicode: string;
  toUnicodeStatus: string[];
  toAsciiN: string;
  toAsciiNStatus: string[];
  toAsciiT: string;
  toAsciiTStatus: string[];
  raw: string;
}

export async function readIdnaTestFile(relativePath: string): Promise<string> {
  if (cache.has(relativePath)) return cache.get(relativePath) as string;
  const root = getRepoRootUrl();
  const fileUrl = new URL(`testdata/unicode/${UNICODE_VERSION}/${relativePath}`, root);
  const text = await readTextFile(fileUrl);
  cache.set(relativePath, text);
  return text;
}

function decodeEscapes(input: string): string {
  let out = "";
  for (let index = 0; index < input.length; index += 1) {
    const charValue = input[index];
    if (charValue !== "\\") {
      out += charValue;
      continue;
    }
    const next = input[index + 1];
    if (next === "u" && input[index + 2] === "{") {
      const end = input.indexOf("}", index + 3);
      if (end !== -1) {
        const hex = input.slice(index + 3, end);
        const cp = Number.parseInt(hex, 16);
        if (Number.isFinite(cp)) {
          out += String.fromCodePoint(cp);
          index = end;
          continue;
        }
      }
    }
    if (next === "x" && input[index + 2] === "{") {
      const end = input.indexOf("}", index + 3);
      if (end !== -1) {
        const hex = input.slice(index + 3, end);
        const cp = Number.parseInt(hex, 16);
        if (Number.isFinite(cp)) {
          out += String.fromCodePoint(cp);
          index = end;
          continue;
        }
      }
    }
    if (next === "u" && index + 5 < input.length) {
      const hex = input.slice(index + 2, index + 6);
      const cp = Number.parseInt(hex, 16);
      if (Number.isFinite(cp)) {
        out += String.fromCodePoint(cp);
        index += 5;
        continue;
      }
    }
    if (next === "x" && index + 3 < input.length) {
      const hex = input.slice(index + 2, index + 4);
      const cp = Number.parseInt(hex, 16);
      if (Number.isFinite(cp)) {
        out += String.fromCodePoint(cp);
        index += 3;
        continue;
      }
    }
    if (next) {
      out += next;
      index += 1;
      continue;
    }
    out += charValue;
  }
  return out;
}

function parseField(raw: string): { kind: "blank" | "value"; value: string } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { kind: "blank", value: "" };
  }
  if (trimmed === '""') {
    return { kind: "value", value: "" };
  }
  return { kind: "value", value: decodeEscapes(trimmed) };
}

function parseStatus(raw: string, fallback: string[]): string[] {
  const trimmed = raw.trim();
  if (trimmed === "") return fallback;
  if (trimmed === "[]") return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return fallback;
}

export function parseIdnaTestV2(text: string): IdnaTestCase[] {
  const cases: IdnaTestCase[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const data = (line.split("#")[0] ?? "").trim();
    if (!data) continue;

    const parts = data.split(";").map((part) => part.trim());
    while (parts.length < 7) parts.push("");

    const sourceField = parseField(parts[0] ?? "");
    const toUnicodeField = parseField(parts[1] ?? "");
    const toUnicodeStatusRaw = parts[2] ?? "";
    const toAsciiNField = parseField(parts[3] ?? "");
    const toAsciiNStatusRaw = parts[4] ?? "";
    const toAsciiTField = parseField(parts[5] ?? "");
    const toAsciiTStatusRaw = parts[6] ?? "";

    const source = sourceField.value;
    const toUnicode = toUnicodeField.kind === "blank" ? source : toUnicodeField.value;
    const toUnicodeStatus = parseStatus(toUnicodeStatusRaw, []);
    const toAsciiN = toAsciiNField.kind === "blank" ? toUnicode : toAsciiNField.value;
    const toAsciiNStatus = parseStatus(toAsciiNStatusRaw, toUnicodeStatus);
    const toAsciiT = toAsciiTField.kind === "blank" ? toAsciiN : toAsciiTField.value;
    const toAsciiTStatus = parseStatus(toAsciiTStatusRaw, toAsciiNStatus);

    cases.push({
      source,
      toUnicode,
      toUnicodeStatus,
      toAsciiN,
      toAsciiNStatus,
      toAsciiT,
      toAsciiTStatus,
      raw: line,
    });
  }
  return cases;
}
