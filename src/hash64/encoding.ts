const UTF8_ENCODER = new TextEncoder();

export function utf8Bytes(text: string): Uint8Array {
  return UTF8_ENCODER.encode(text);
}

export function utf8BytesFromSpan(text: string, startCU: number, endCU: number): Uint8Array {
  const maxBytes = Math.max(0, endCU - startCU) * 3;
  const buffer = new Uint8Array(maxBytes);
  let offset = 0;

  for (let codeUnitIndex = startCU; codeUnitIndex < endCU; ) {
    const codePoint = text.codePointAt(codeUnitIndex) ?? 0;
    const stepSize = codePoint > 0xffff ? 2 : 1;
    codeUnitIndex += stepSize;

    if (codePoint <= 0x7f) {
      buffer[offset++] = codePoint;
    } else if (codePoint <= 0x7ff) {
      buffer[offset++] = 0xc0 | (codePoint >> 6);
      buffer[offset++] = 0x80 | (codePoint & 0x3f);
    } else if (codePoint <= 0xffff) {
      buffer[offset++] = 0xe0 | (codePoint >> 12);
      buffer[offset++] = 0x80 | ((codePoint >> 6) & 0x3f);
      buffer[offset++] = 0x80 | (codePoint & 0x3f);
    } else {
      buffer[offset++] = 0xf0 | (codePoint >> 18);
      buffer[offset++] = 0x80 | ((codePoint >> 12) & 0x3f);
      buffer[offset++] = 0x80 | ((codePoint >> 6) & 0x3f);
      buffer[offset++] = 0x80 | (codePoint & 0x3f);
    }
  }

  return buffer.subarray(0, offset);
}
