import type { Rng } from "./prng.ts";

const ASCII = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PUNCT = "-_.:,;!?/\\|@#$%^&*()[]{}<>";

const COMBINING_MARKS = [0x0300, 0x0301, 0x0302, 0x0306, 0x0308, 0x0323, 0x0334, 0x034f];
const BIDI_CONTROLS = [
  0x200e, 0x200f, 0x202a, 0x202b, 0x202d, 0x202e, 0x202c, 0x2066, 0x2067, 0x2068, 0x2069,
];
const JOIN_CONTROLS = [0x200c, 0x200d];
const VARIATION_SELECTORS = [0xfe0e, 0xfe0f, 0xe0100, 0xe0101];
const COMMON_INVISIBLES = [0x00ad, 0x200b, 0x2060];

const LATIN = [0x0041, 0x0061, 0x0042, 0x0062, 0x0043, 0x0063];
const GREEK = [0x0391, 0x03b1, 0x0392, 0x03b2, 0x039f, 0x03bf];
const CYRILLIC = [0x0410, 0x0430, 0x0412, 0x0432, 0x041e, 0x043e];

const EMOJI = [0x1f600, 0x1f680, 0x1f4bb, 0x1f468, 0x1f3fd];

const TIBETAN_BASE = [0x0fb2, 0x0f76, 0x0f77];
const TIBETAN_MARKS = [0x0f71, 0x0f80, 0x0f81, 0x0334];

function pickAscii(rng: Rng): string {
  if (rng.int(0, 1) === 0) return ASCII[rng.int(0, ASCII.length - 1)] ?? "a";
  return PUNCT[rng.int(0, PUNCT.length - 1)] ?? "-";
}

function pickFrom(rng: Rng, list: readonly number[]): number {
  return list[rng.int(0, list.length - 1)] ?? 0x61;
}

function pushCodePoint(out: string[], cp: number): void {
  out.push(String.fromCodePoint(cp));
}

export function genWellFormed(rng: Rng, size: number): string {
  const out: string[] = [];
  const outputLength = rng.int(0, size);
  for (let index = 0; index < outputLength; index += 1) {
    const roll = rng.int(0, 6);
    if (roll <= 2) {
      out.push(pickAscii(rng));
    } else if (roll === 3) {
      pushCodePoint(out, pickFrom(rng, EMOJI));
    } else if (roll === 4) {
      pushCodePoint(out, pickFrom(rng, LATIN));
    } else {
      pushCodePoint(out, pickFrom(rng, COMMON_INVISIBLES));
    }
  }
  return out.join("");
}

export function genWithLoneSurrogates(rng: Rng, size: number): string {
  const out: string[] = [];
  const outputLength = rng.int(1, size + 4);
  for (let index = 0; index < outputLength; index += 1) {
    const roll = rng.int(0, 4);
    if (roll === 0) {
      out.push(String.fromCharCode(rng.int(0xd800, 0xdbff)));
    } else if (roll === 1) {
      out.push(String.fromCharCode(rng.int(0xdc00, 0xdfff)));
    } else {
      out.push(pickAscii(rng));
    }
  }
  return out.join("");
}

export function genCombiningHeavy(rng: Rng, size: number): string {
  const out: string[] = [];
  const clusterCount = rng.int(1, Math.max(1, Math.floor(size / 2)));
  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
    out.push(pickAscii(rng));
    const markCount = rng.int(1, 4);
    for (let markIndex = 0; markIndex < markCount; markIndex += 1) {
      pushCodePoint(out, pickFrom(rng, COMBINING_MARKS));
    }
  }
  return out.join("");
}

export function genBidiControls(rng: Rng, size: number): string {
  const out: string[] = [];
  const outputLength = rng.int(1, size + 2);
  for (let index = 0; index < outputLength; index += 1) {
    if (rng.int(0, 3) === 0) {
      pushCodePoint(out, pickFrom(rng, BIDI_CONTROLS));
    } else {
      out.push(pickAscii(rng));
    }
  }
  return out.join("");
}

export function genJoinAndVariation(rng: Rng, size: number): string {
  const out: string[] = [];
  const outputLength = rng.int(1, size + 2);
  for (let index = 0; index < outputLength; index += 1) {
    const roll = rng.int(0, 4);
    if (roll === 0) pushCodePoint(out, pickFrom(rng, JOIN_CONTROLS));
    else if (roll === 1) pushCodePoint(out, pickFrom(rng, VARIATION_SELECTORS));
    else if (roll === 2) pushCodePoint(out, pickFrom(rng, EMOJI));
    else out.push(pickAscii(rng));
  }
  return out.join("");
}

export function genMixedScripts(rng: Rng, size: number): string {
  const out: string[] = [];
  const outputLength = rng.int(1, size + 2);
  for (let index = 0; index < outputLength; index += 1) {
    const roll = rng.int(0, 2);
    if (roll === 0) pushCodePoint(out, pickFrom(rng, LATIN));
    if (roll === 1) pushCodePoint(out, pickFrom(rng, GREEK));
    if (roll === 2) pushCodePoint(out, pickFrom(rng, CYRILLIC));
  }
  return out.join("");
}

export function genRepeatHeavy(rng: Rng, size: number): string {
  const token = rng.int(0, 1) === 0 ? "a" : "word";
  const count = rng.int(1, size + 4);
  return Array.from({ length: count }, () => token).join(" ");
}

export function genCollationPathological(rng: Rng, size: number): string {
  const out: string[] = [];
  const clusterCount = rng.int(1, Math.max(1, Math.floor(size / 3)));
  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
    pushCodePoint(out, pickFrom(rng, TIBETAN_BASE));
    const markCount = rng.int(1, 3);
    for (let markIndex = 0; markIndex < markCount; markIndex += 1) {
      pushCodePoint(out, pickFrom(rng, TIBETAN_MARKS));
    }
  }
  return out.join("");
}

export function genFuzzString(rng: Rng, size: number): string {
  const roll = rng.int(0, 6);
  switch (roll) {
    case 0:
      return genWellFormed(rng, size);
    case 1:
      return genWithLoneSurrogates(rng, size);
    case 2:
      return genCombiningHeavy(rng, size);
    case 3:
      return genBidiControls(rng, size);
    case 4:
      return genJoinAndVariation(rng, size);
    case 5:
      return genMixedScripts(rng, size);
    default:
      return rng.int(0, 1) === 0 ? genRepeatHeavy(rng, size) : genCollationPathological(rng, size);
  }
}
