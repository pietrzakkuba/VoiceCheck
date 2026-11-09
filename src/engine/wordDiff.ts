// Word-level Levenshtein alignment between the reference text and the Whisper transcript (5.2).

export type DiffOp =
  | { op: 'match'; ref: number; hyp: number; exact: boolean }
  | { op: 'sub'; ref: number; hyp: number }
  | { op: 'ins'; hyp: number }
  | { op: 'del'; ref: number };

export function charSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** Words that differ only by ASR noise (e.g. a missing diacritic) are treated as matches. */
const SIMILAR = 0.6;

/**
 * Aligns `hyp` (all words) to `ref`. With `freeRefEnd`, trailing reference words are not penalised
 * (they belong to later chunks) – a semi-global alignment. Returns the ops and the number of reference words consumed.
 */
export function alignWordSeq(ref: string[], hyp: string[], freeRefEnd = false): { ops: DiffOp[]; refConsumed: number } {
  const m = ref.length;
  const n = hyp.length;
  const cost: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  const back: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) { cost[i][0] = i; back[i][0] = 2; }
  for (let j = 1; j <= n; j++) { cost[0][j] = j; back[0][j] = 3; }
  const subCost = (i: number, j: number) => {
    const s = charSimilarity(ref[i], hyp[j]);
    // Dissimilar words cost slightly more than 1 so that skip + insert wins over a chain of substitutions.
    return s === 1 ? 0 : s >= SIMILAR ? 0.3 : 1.1;
  };
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const d = cost[i - 1][j - 1] + subCost(i - 1, j - 1);
      const del = cost[i - 1][j] + 1;
      const ins = cost[i][j - 1] + 1;
      if (d <= del && d <= ins) { cost[i][j] = d; back[i][j] = 1; }
      else if (del <= ins) { cost[i][j] = del; back[i][j] = 2; }
      else { cost[i][j] = ins; back[i][j] = 3; }
    }
  }
  let endI = m;
  if (freeRefEnd) {
    let best = Infinity;
    for (let i = 0; i <= m; i++) {
      // Prefer consuming more reference words on ties.
      if (cost[i][n] <= best) { best = cost[i][n]; endI = i; }
    }
  }
  const ops: DiffOp[] = [];
  let i = endI;
  let j = n;
  while (i > 0 || j > 0) {
    const b = back[i][j];
    if (i > 0 && j > 0 && b === 1) {
      const s = charSimilarity(ref[i - 1], hyp[j - 1]);
      if (s >= SIMILAR) ops.push({ op: 'match', ref: i - 1, hyp: j - 1, exact: s === 1 });
      else ops.push({ op: 'sub', ref: i - 1, hyp: j - 1 });
      i--; j--;
    } else if (i > 0 && (b === 2 || j === 0)) {
      ops.push({ op: 'del', ref: i - 1 });
      i--;
    } else {
      ops.push({ op: 'ins', hyp: j - 1 });
      j--;
    }
  }
  ops.reverse();
  return { ops, refConsumed: endI };
}
