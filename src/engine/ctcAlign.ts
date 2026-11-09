import type { AlignedChar, AlignedWord } from '@/types';
import { splitUnits, charEquivalents } from './units';

/** Log-posteriors from a CTC model: row-major T × V, 20 ms frames. */
export interface CtcPosteriors {
  lp: Float32Array;
  T: number;
  V: number;
  frameMs: number;
  vocab: string[];
  blankId: number;
}

const EPS = 1e-4;

/** In-place log-softmax over the last dimension. */
export function logSoftmax(logits: Float32Array, T: number, V: number): Float32Array {
  const out = new Float32Array(logits.length);
  for (let t = 0; t < T; t++) {
    let max = -Infinity;
    const o = t * V;
    for (let v = 0; v < V; v++) if (logits[o + v] > max) max = logits[o + v];
    let sum = 0;
    for (let v = 0; v < V; v++) sum += Math.exp(logits[o + v] - max);
    const lse = max + Math.log(sum);
    for (let v = 0; v < V; v++) out[o + v] = logits[o + v] - lse;
  }
  return out;
}

/** Ids of non-letter tokens (pad/blank, word delimiter, specials) — merged into one "blank-like" symbol. */
export function blankLikeIds(vocab: string[], blankId: number): number[] {
  return vocab.map((s, i) => (i === blankId || s.length !== 1 || s === '|' || s === '-' ? i : -1)).filter((i) => i >= 0);
}

function logAddExp(a: number, b: number) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

export interface ViterbiResult {
  /** For each target token: first and last frame (inclusive) it occupies. */
  spans: [number, number][];
  /** Log-probability of the chosen label at every frame. */
  frameLp: Float32Array;
  score: number;
}

/**
 * CTC forced alignment (Viterbi), equivalent to torchaudio.functional.forced_align.
 * Arbitrarily long blank runs are allowed between tokens, which absorbs pauses, fillers and noise.
 */
export function ctcViterbi(post: CtcPosteriors, targets: number[], blankLp?: Float32Array): ViterbiResult | null {
  const { lp, T, V } = post;
  const L = targets.length;
  if (!L) return null;
  let repeats = 0;
  for (let i = 1; i < L; i++) if (targets[i] === targets[i - 1]) repeats++;
  if (T < L + repeats) return null;

  const bl = blankLp ?? computeBlankLp(post);
  const S = 2 * L + 1;
  const NEG = -1e30;
  let prev = new Float64Array(S).fill(NEG);
  let cur = new Float64Array(S);
  const back = new Uint8Array(T * S);

  const emit = (t: number, s: number) => (s % 2 === 0 ? bl[t] : lp[t * V + targets[(s - 1) >> 1]]);

  prev[0] = emit(0, 0);
  prev[1] = emit(0, 1);
  for (let t = 1; t < T; t++) {
    // Only states reachable given remaining frames matter, but a full sweep keeps the code simple: O(T·S).
    for (let s = 0; s < S; s++) {
      let best = prev[s];
      let arg = 0;
      if (s >= 1 && prev[s - 1] > best) { best = prev[s - 1]; arg = 1; }
      if (s >= 2 && s % 2 === 1 && targets[(s - 1) >> 1] !== targets[(s - 3) >> 1] && prev[s - 2] > best) {
        best = prev[s - 2];
        arg = 2;
      }
      cur[s] = best <= NEG / 2 ? NEG : best + emit(t, s);
      back[t * S + s] = arg;
    }
    [prev, cur] = [cur, prev];
  }

  let s = prev[S - 1] >= prev[S - 2] ? S - 1 : S - 2;
  const score = prev[s];
  if (score <= NEG / 2) return null;

  const spans: [number, number][] = Array.from({ length: L }, () => [-1, -1]);
  const frameLp = new Float32Array(T);
  for (let t = T - 1; t >= 0; t--) {
    frameLp[t] = emit(t, s);
    if (s % 2 === 1) {
      const k = (s - 1) >> 1;
      if (spans[k][1] < 0) spans[k][1] = t;
      spans[k][0] = t;
    }
    if (t > 0) s -= back[t * S + s];
  }
  return { spans, frameLp, score };
}

export function computeBlankLp(post: CtcPosteriors): Float32Array {
  const ids = blankLikeIds(post.vocab, post.blankId);
  const out = new Float32Array(post.T);
  for (let t = 0; t < post.T; t++) {
    let acc = -Infinity;
    for (const id of ids) acc = logAddExp(acc, post.lp[t * post.V + id]);
    out[t] = acc;
  }
  return out;
}

/** Per-character evidence for GOP (5.7): peak posterior inside the segment ±1 frame and the strongest competitor. */
export function charEvidence(
  post: CtcPosteriors,
  targetId: number,
  span: [number, number],
  eq: Set<string>,
  excluded: Set<number>,
  offsetMs: number,
): AlignedChar {
  const { lp, V, T, vocab, frameMs } = post;
  const f0 = Math.max(0, span[0] - 1);
  const f1 = Math.min(T - 1, span[1] + 1);
  let peak = f0;
  let peakLp = -Infinity;
  for (let f = f0; f <= f1; f++) {
    if (lp[f * V + targetId] > peakLp) {
      peakLp = lp[f * V + targetId];
      peak = f;
    }
  }
  const isCompetitor = (v: number) => v !== targetId && !excluded.has(v) && !eq.has(vocab[v]);

  let compLp = -Infinity;
  let comp = '';
  for (let v = 0; v < V; v++) {
    if (!isCompetitor(v)) continue;
    const x = lp[peak * V + v];
    if (x > compLp) { compLp = x; comp = vocab[v]; }
  }
  let segBestLp = -Infinity;
  let segBest = '';
  for (let f = span[0]; f <= span[1]; f++) {
    for (let v = 0; v < V; v++) {
      if (!isCompetitor(v)) continue;
      const x = lp[f * V + v];
      if (x > segBestLp) { segBestLp = x; segBest = vocab[v]; }
    }
  }
  const pTarget = Math.exp(peakLp);
  const pComp = Math.exp(compLp);
  return {
    char: vocab[targetId],
    startMs: offsetMs + span[0] * frameMs,
    endMs: offsetMs + (span[1] + 1) * frameMs,
    pTarget,
    competitor: comp,
    pComp,
    gop: Math.log(Math.max(pTarget, EPS)) - Math.log(Math.max(pComp, EPS)),
    segBest,
    segBestP: Math.exp(segBestLp),
  };
}

/**
 * Aligns the given words to CTC posteriors and returns absolute word/character timings with GOP evidence.
 * Words containing no alignable letters are returned with `chars: null` and interpolated timing.
 */
export function alignWords(post: CtcPosteriors, words: string[], offsetMs: number): AlignedWord[] | null {
  const idOf = new Map<string, number>();
  post.vocab.forEach((s, i) => idOf.set(s, i));
  const excluded = new Set(blankLikeIds(post.vocab, post.blankId));

  const targets: number[] = [];
  const wordTok: { first: number; ids: number[]; chars: number[] }[] = [];
  for (const w of words) {
    const chars = [...w];
    const ids: number[] = [];
    const charIdx: number[] = [];
    chars.forEach((c, i) => {
      const id = idOf.get(c);
      if (id !== undefined && !excluded.has(id)) {
        ids.push(id);
        charIdx.push(i);
      }
    });
    wordTok.push({ first: targets.length, ids, chars: charIdx });
    targets.push(...ids);
  }
  const blankLp = computeBlankLp(post);
  const vit = ctcViterbi(post, targets, blankLp);
  if (!vit) return null;

  const result: AlignedWord[] = words.map((w, wi) => {
    const tok = wordTok[wi];
    if (!tok.ids.length) return { text: w, startMs: NaN, endMs: NaN, alignScore: 0, chars: null };
    const units = splitUnits(w);
    const chars: AlignedChar[] = tok.ids.map((id, k) =>
      charEvidence(post, id, vit.spans[tok.first + k], charEquivalents(w, units, tok.chars[k]), excluded, offsetMs),
    );
    const fStart = vit.spans[tok.first][0];
    const fEnd = vit.spans[tok.first + tok.ids.length - 1][1];
    let sum = 0;
    for (let f = fStart; f <= fEnd; f++) sum += vit.frameLp[f];
    // Characters that could not be aligned (e.g. digits) still need a slot: pad the character list.
    const fullChars: AlignedChar[] = tok.chars.length === w.length ? chars : padChars(w, tok.chars, chars);
    return {
      text: w,
      startMs: offsetMs + fStart * post.frameMs,
      endMs: offsetMs + (fEnd + 1) * post.frameMs,
      alignScore: sum / (fEnd - fStart + 1),
      chars: fullChars,
    };
  });
  interpolateMissing(result);
  return result;
}

function padChars(word: string, idx: number[], chars: AlignedChar[]): AlignedChar[] {
  const out: AlignedChar[] = [];
  let k = 0;
  [...word].forEach((c, i) => {
    if (idx[k] === i) out.push(chars[k++]);
    else {
      const ref = chars[Math.min(k, chars.length - 1)];
      out.push({ char: c, startMs: ref.startMs, endMs: ref.startMs, pTarget: 1, competitor: '', pComp: 0, gop: 10, segBest: '', segBestP: 0 });
    }
  });
  return out;
}

function interpolateMissing(words: AlignedWord[]) {
  for (let i = 0; i < words.length; i++) {
    if (!Number.isNaN(words[i].startMs)) continue;
    const prev = words.slice(0, i).reverse().find((w) => !Number.isNaN(w.endMs));
    const next = words.slice(i + 1).find((w) => !Number.isNaN(w.startMs));
    const a = prev?.endMs ?? next?.startMs ?? 0;
    const b = next?.startMs ?? a;
    words[i].startMs = a;
    words[i].endMs = Math.max(a, b);
  }
}

/** Joins overlapping posterior pieces (5.4: >20 s processed in pieces with 1 s overlap). */
export function stitchPosteriors(pieces: { lp: Float32Array; T: number }[], V: number, overlapFrames: number): { lp: Float32Array; T: number } {
  if (pieces.length === 1) return pieces[0];
  const half = Math.floor(overlapFrames / 2);
  const kept: { lp: Float32Array; from: number; to: number }[] = pieces.map((p, i) => ({
    lp: p.lp,
    from: i === 0 ? 0 : half,
    to: i === pieces.length - 1 ? p.T : p.T - (overlapFrames - half),
  }));
  const T = kept.reduce((s, k) => s + Math.max(0, k.to - k.from), 0);
  const lp = new Float32Array(T * V);
  let o = 0;
  for (const k of kept) {
    const n = Math.max(0, k.to - k.from);
    lp.set(k.lp.subarray(k.from * V, (k.from + n) * V), o * V);
    o += n;
  }
  return { lp, T };
}
