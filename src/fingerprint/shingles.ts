import type { Token } from "../compare/tokens.ts";
import type { Span } from "../core/types.ts";
import { FNV1A64_MASK } from "../hash64/fnv1a64.ts";

const BASE = 0x9e3779b185ebca87n;

function mul64(leftOperand: bigint, rightOperand: bigint): bigint {
  return (leftOperand * rightOperand) & FNV1A64_MASK;
}

function add64(leftOperand: bigint, rightOperand: bigint): bigint {
  return (leftOperand + rightOperand) & FNV1A64_MASK;
}

export interface ShingleHash {
  hash: bigint;
  tokenIndex: number;
  span: Span;
}

export function shingleHashes(tokens: Token[], shingleSize: number): ShingleHash[] {
  const tokenCount = tokens.length;
  if (shingleSize <= 0 || shingleSize > tokenCount) return [];

  let basePow = 1n;
  for (let index = 0; index < shingleSize - 1; index += 1) {
    basePow = mul64(basePow, BASE);
  }

  const hashes: ShingleHash[] = [];
  let hash = 0n;
  for (let index = 0; index < shingleSize; index += 1) {
    const tokenHash = tokens[index]?.keyHash64 ?? 0n;
    hash = add64(mul64(hash, BASE), tokenHash);
  }

  for (let index = 0; index + shingleSize <= tokenCount; index += 1) {
    const startToken = tokens[index] as Token;
    const endToken = tokens[index + shingleSize - 1] as Token;
    hashes.push({
      hash,
      tokenIndex: index,
      span: { startCU: startToken.span.startCU, endCU: endToken.span.endCU },
    });

    if (index + shingleSize >= tokenCount) break;
    const outgoing = tokens[index]?.keyHash64 ?? 0n;
    const incoming = tokens[index + shingleSize]?.keyHash64 ?? 0n;
    const removed = mul64(outgoing, basePow);
    hash = (hash - removed) & FNV1A64_MASK;
    hash = add64(mul64(hash, BASE), incoming);
  }

  return hashes;
}
