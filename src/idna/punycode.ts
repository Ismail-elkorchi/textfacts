import type { IdnaError } from "./types.ts";

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const DELIMITER = "-";
const MAX_INT = 0x7fffffff;

function makeError(message: string, codePoint?: number): IdnaError {
  const error: IdnaError = {
    code: "PUNYCODE_ERROR",
    message,
  };
  if (codePoint !== undefined) {
    error.codePoint = codePoint;
  }
  return error;
}

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let adjusted = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  adjusted += Math.floor(adjusted / numPoints);
  let k = 0;
  while (adjusted > ((BASE - TMIN) * TMAX) >> 1) {
    adjusted = Math.floor(adjusted / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * adjusted) / (adjusted + SKEW));
}

function encodeDigit(digit: number): string {
  const codePoint = digit + 22 + (digit < 26 ? 75 : 0);
  return String.fromCharCode(codePoint);
}

function decodeDigit(codePoint: number): number {
  if (codePoint >= 0x30 && codePoint <= 0x39) return codePoint - 22; // 0-9 -> 26-35
  if (codePoint >= 0x41 && codePoint <= 0x5a) return codePoint - 0x41; // A-Z -> 0-25
  if (codePoint >= 0x61 && codePoint <= 0x7a) return codePoint - 0x61; // a-z -> 0-25
  return BASE;
}

function stringToCodePoints(input: string): { codePoints: number[]; error?: IdnaError } {
  const codePoints: number[] = [];
  for (let i = 0; i < input.length; ) {
    const cu = input.charCodeAt(i);
    if (cu >= 0xd800 && cu <= 0xdbff) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const cp = ((cu - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        codePoints.push(cp);
        i += 2;
        continue;
      }
      return { codePoints, error: makeError("Ill-formed Unicode in punycode input", cu) };
    }
    if (cu >= 0xdc00 && cu <= 0xdfff) {
      return { codePoints, error: makeError("Ill-formed Unicode in punycode input", cu) };
    }
    codePoints.push(cu);
    i += 1;
  }
  return { codePoints };
}

/**
 * Encode a Unicode label to Punycode.
 * Units: UTF-16 code units.
 */
export function punycodeEncode(labelUnicode: string): {
  ok: boolean;
  value?: string;
  error?: IdnaError;
} {
  const { codePoints, error } = stringToCodePoints(labelUnicode);
  if (error) return { ok: false, error };

  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;
  let output = "";

  for (const cp of codePoints) {
    if (cp < 0x80) {
      output += String.fromCharCode(cp);
    }
  }

  const b = output.length;
  let h = b;
  if (b > 0) output += DELIMITER;

  while (h < codePoints.length) {
    let m = MAX_INT;
    for (const cp of codePoints) {
      if (cp >= n && cp < m) m = cp;
    }
    if (m === MAX_INT) {
      return { ok: false, error: makeError("Punycode overflow") };
    }
    const diff = m - n;
    if (diff > Math.floor((MAX_INT - delta) / (h + 1))) {
      return { ok: false, error: makeError("Punycode overflow") };
    }
    delta += diff * (h + 1);
    n = m;

    for (const cp of codePoints) {
      if (cp < n) {
        delta += 1;
        if (delta > MAX_INT) return { ok: false, error: makeError("Punycode overflow") };
      } else if (cp === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
          if (q < t) break;
          const code = t + ((q - t) % (BASE - t));
          output += encodeDigit(code);
          q = Math.floor((q - t) / (BASE - t));
        }
        output += encodeDigit(q);
        bias = adapt(delta, h + 1, h === b);
        delta = 0;
        h += 1;
      }
    }
    delta += 1;
    n += 1;
  }

  return { ok: true, value: output };
}

/**
 * Decode a Punycode label to Unicode.
 * Units: UTF-16 code units.
 */
export function punycodeDecode(labelAscii: string): {
  ok: boolean;
  value?: string;
  error?: IdnaError;
} {
  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  const output: number[] = [];

  for (let idx = 0; idx < labelAscii.length; idx += 1) {
    if (labelAscii.charCodeAt(idx) > 0x7f) {
      return { ok: false, error: makeError("Non-ASCII in punycode input") };
    }
  }

  const lastDelimiter = labelAscii.lastIndexOf(DELIMITER);
  if (lastDelimiter === 0) {
    return { ok: false, error: makeError("Invalid punycode delimiter placement") };
  }
  if (lastDelimiter !== -1) {
    for (let idx = 0; idx < lastDelimiter; idx += 1) {
      const cp = labelAscii.charCodeAt(idx);
      if (cp >= 0x80) {
        return { ok: false, error: makeError("Non-ASCII in punycode input") };
      }
      output.push(cp);
    }
  }

  let index = lastDelimiter === -1 ? 0 : lastDelimiter + 1;

  while (index < labelAscii.length) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= labelAscii.length) {
        return { ok: false, error: makeError("Unexpected end of punycode input") };
      }
      const digit = decodeDigit(labelAscii.charCodeAt(index));
      index += 1;
      if (digit >= BASE) {
        return { ok: false, error: makeError("Invalid punycode digit") };
      }
      if (digit > Math.floor((MAX_INT - i) / w)) {
        return { ok: false, error: makeError("Punycode overflow") };
      }
      i += digit * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < t) break;
      if (w > Math.floor(MAX_INT / (BASE - t))) {
        return { ok: false, error: makeError("Punycode overflow") };
      }
      w *= BASE - t;
    }
    const outLen = output.length + 1;
    bias = adapt(i - oldi, outLen, oldi === 0);
    const increment = Math.floor(i / outLen);
    if (increment > MAX_INT - n) {
      return { ok: false, error: makeError("Punycode overflow") };
    }
    n += increment;
    i %= outLen;
    if (n > 0x10ffff) {
      return { ok: false, error: makeError("Code point overflow", n) };
    }
    output.splice(i, 0, n);
    i += 1;
  }

  try {
    return { ok: true, value: String.fromCodePoint(...output) };
  } catch {
    return { ok: false, error: makeError("Invalid code point in punycode output") };
  }
}
