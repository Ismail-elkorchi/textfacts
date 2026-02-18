import { createProvenance } from "../core/provenance.ts";
import { IMPLEMENTATION_ID } from "../core/version.ts";
import type { Edit, EditScript } from "./types.ts";

/**
 * DiffOptions defines an exported structural contract.
 */
export interface DiffOptions {
  maxD?: number;
  prefer?: "delete" | "insert";
}

const DIFF_SPEC = "https://www.xmailserver.org/diff2.pdf";
const DIFF_REVISION = "Myers 1986";

function chooseDown(
  vPrev: Int32Array,
  k: number,
  d: number,
  prefer: "delete" | "insert",
  offset: number,
): boolean {
  if (k === -d) return true;
  if (k === d) return false;
  const left = vPrev[offset + k - 1] ?? -1;
  const right = vPrev[offset + k + 1] ?? -1;
  if (left === right) return prefer === "insert";
  return left < right;
}

function coalesceEdits(edits: Edit[]): Edit[] {
  if (edits.length === 0) return edits;
  const merged: Edit[] = [];
  for (const edit of edits) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(edit);
      continue;
    }
    if (edit.op === "equal" && last.op === "equal") {
      if (last.a1 === edit.a0 && last.b1 === edit.b0) {
        last.a1 = edit.a1;
        last.b1 = edit.b1;
        continue;
      }
    }
    if (edit.op === "delete" && last.op === "delete") {
      if (last.a1 === edit.a0) {
        last.a1 = edit.a1;
        continue;
      }
    }
    if (edit.op === "insert" && last.op === "insert") {
      if (last.b1 === edit.b0) {
        last.b1 = edit.b1;
        continue;
      }
    }
    merged.push(edit);
  }
  return merged;
}

/**
 * diffSequence executes a deterministic operation in this module.
 */
export function diffSequence<T>(
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean,
  options: DiffOptions = {},
): EditScript {
  const n = a.length;
  const m = b.length;
  const maxD = options.maxD ?? n + m;
  const prefer = options.prefer ?? "delete";
  const offset = maxD;
  const size = offset * 2 + 1;
  let v = new Int32Array(size);
  v.fill(-1);
  v[offset + 1] = 0;
  const trace: Int32Array[] = [];

  let found = false;
  let foundD = 0;

  for (let d = 0; d <= maxD; d += 1) {
    const vNext = new Int32Array(v);
    for (let k = -d; k <= d; k += 2) {
      const useDown = chooseDown(v, k, d, prefer, offset);
      let x = useDown ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && eq(a[x] as T, b[y] as T)) {
        x += 1;
        y += 1;
      }
      vNext[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        foundD = d;
        break;
      }
    }
    trace.push(vNext);
    v = vNext;
    if (found) break;
  }

  const algo = createProvenance(
    {
      name: "Diff.Myers",
      spec: DIFF_SPEC,
      revisionOrDate: DIFF_REVISION,
      implementationId: IMPLEMENTATION_ID,
    },
    { maxD, prefer },
    { text: "utf16-code-unit", token: "comparison-token" },
  );

  if (!found) {
    const edits: Edit[] = [];
    if (n > 0) edits.push({ op: "delete", a0: 0, a1: n });
    if (m > 0) edits.push({ op: "insert", b0: 0, b1: m });
    return { edits, aLen: n, bLen: m, algo, truncated: true };
  }

  let x = n;
  let y = m;
  const editsRev: Edit[] = [];
  for (let d = foundD; d > 0; d -= 1) {
    const vPrev = trace[d - 1] as Int32Array;
    const k = x - y;
    const useDown = chooseDown(vPrev, k, d, prefer, offset);
    const prevK = useDown ? k + 1 : k - 1;
    const prevX = vPrev[offset + prevK] ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      editsRev.push({ op: "equal", a0: x - 1, a1: x, b0: y - 1, b1: y });
      x -= 1;
      y -= 1;
    }

    if (useDown) {
      editsRev.push({ op: "insert", b0: prevY, b1: prevY + 1 });
    } else {
      editsRev.push({ op: "delete", a0: prevX, a1: prevX + 1 });
    }

    x = prevX;
    y = prevY;
  }

  while (x > 0 && y > 0) {
    editsRev.push({ op: "equal", a0: x - 1, a1: x, b0: y - 1, b1: y });
    x -= 1;
    y -= 1;
  }
  while (x > 0) {
    editsRev.push({ op: "delete", a0: x - 1, a1: x });
    x -= 1;
  }
  while (y > 0) {
    editsRev.push({ op: "insert", b0: y - 1, b1: y });
    y -= 1;
  }

  const edits = coalesceEdits(editsRev.reverse());
  return { edits, aLen: n, bLen: m, algo };
}
