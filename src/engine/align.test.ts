import { describe, expect, it } from 'vitest';
import { alignWords, ctcViterbi, logSoftmax, stitchPosteriors, type CtcPosteriors } from './ctcAlign';
import { analyzeUnits, articulationFlag, tauTable } from './gop';

const VOCAB = ['<pad>', '|', 'a', 'k', 'o', 't', 's', 'ś', 'z', 'i', 'n', 'e', 'm', 'ł', 'c', 'y', 'p', 'r', 'ę', 'l'];

/** Builds posteriors from a frame-by-frame list of (symbol → probability) peaks; the rest goes to blank. */
function makePost(frames: (Record<string, number> | null)[]): CtcPosteriors {
  const V = VOCAB.length;
  const T = frames.length;
  const logits = new Float32Array(T * V).fill(-8);
  frames.forEach((f, t) => {
    const entries = f ? Object.entries(f) : [];
    let rest = 1;
    for (const [s, p] of entries) {
      logits[t * V + VOCAB.indexOf(s)] = Math.log(p);
      rest -= p;
    }
    logits[t * V + 0] = Math.log(Math.max(rest, 1e-3));
  });
  // Already log-probabilities (approx); renormalise to be safe.
  return { lp: logSoftmax(logits, T, V), T, V, frameMs: 20, vocab: VOCAB, blankId: 0 };
}

const spike = (s: string, p = 0.95) => ({ [s]: p });

describe('ctcViterbi', () => {
  it('finds token spans on spiky posteriors', () => {
    const post = makePost([null, spike('k'), null, spike('o'), null, null, spike('t'), null]);
    const ids = ['k', 'o', 't'].map((c) => VOCAB.indexOf(c));
    const res = ctcViterbi(post, ids)!;
    expect(res.spans).toEqual([[1, 1], [3, 3], [6, 6]]);
  });
  it('requires a blank between repeated tokens', () => {
    const post = makePost([spike('a'), null, spike('a')]);
    const id = VOCAB.indexOf('a');
    const res = ctcViterbi(post, [id, id])!;
    expect(res.spans).toEqual([[0, 0], [2, 2]]);
    expect(ctcViterbi(makePost([spike('a'), spike('a')]), [id, id])).toBeNull();
  });
  it('absorbs extra symbols (fillers) into blank', () => {
    const post = makePost([spike('k'), spike('y'), spike('y'), null, spike('o'), spike('t')]);
    const res = ctcViterbi(post, ['k', 'o', 't'].map((c) => VOCAB.indexOf(c)))!;
    expect(res.spans[1]).toEqual([4, 4]);
  });
});

describe('alignWords + GOP', () => {
  it('produces word timings with offset and good GOP for clear speech', () => {
    const post = makePost([null, spike('k'), null, spike('o'), spike('t'), null, spike('|'), null, spike('a'), null]);
    const words = alignWords(post, ['kot', 'a'], 1000)!;
    expect(words[0].startMs).toBe(1020);
    expect(words[0].endMs).toBe(1100);
    expect(words[1].startMs).toBe(1160);
    expect(words[0].chars!.every((c) => c.gop > 3)).toBe(true);
    const units = analyzeUnits('kot', words[0].chars, tauTable(null), false);
    expect(units.every((u) => u.status === 'ok')).toBe(true);
  });

  it('detects substitution s → ś', () => {
    // "sok" pronounced "śok"
    const post = makePost([null, { ś: 0.8, s: 0.1 }, null, spike('o'), null, spike('k'), null]);
    const w = alignWords(post, ['sok'], 0)!;
    const units = analyzeUnits('sok', w[0].chars, tauTable(null), false);
    expect(units[0].status).toBe('substituted');
    expect(units[0].heardAs).toBe('ś');
    expect(articulationFlag('sok', units)?.type).toBe('SUBSTITUTED_SOUND');
  });

  it('detects a deleted word ending', () => {
    // "zrobiłem" with "-em" swallowed → nothing emitted for e, m
    const frames: (Record<string, number> | null)[] = [null, spike('z'), spike('r'), spike('o'), null, spike('p'), spike('i'), spike('ł'), null, null, null];
    const vocabWord = 'zropiłem'; // letters available in the test vocab
    const post = makePost(frames);
    const w = alignWords(post, [vocabWord], 0)!;
    const units = analyzeUnits(vocabWord, w[0].chars, tauTable(null), false);
    expect(units[units.length - 1].status).toBe('deleted');
    expect(articulationFlag(vocabWord, units)?.type).toBe('SWALLOWED_WORD_ENDING');
  });

  it('does not penalise homophone-equivalent output (final ę ≡ e)', () => {
    const post = makePost([null, spike('i'), null, spike('t'), null, { e: 0.9 }, null]);
    const w = alignWords(post, ['itę'], 0)!;
    const units = analyzeUnits('itę', w[0].chars, tauTable(null), false);
    expect(units[2].status).not.toBe('substituted');
  });

  it('marks unscorable words without flags', () => {
    const post = makePost([null, spike('k'), null, spike('o'), spike('t'), null]);
    const w = alignWords(post, ['kot'], 0)!;
    const units = analyzeUnits('kot', w[0].chars, tauTable(null), true);
    expect(units.every((u) => u.status === 'unscorable')).toBe(true);
    expect(articulationFlag('kot', units)).toBeNull();
  });
});

describe('stitchPosteriors', () => {
  it('concatenates pieces dropping half the overlap from each side', () => {
    const V = 2;
    const a = { lp: new Float32Array(10 * V).map((_, i) => Math.floor(i / V)), T: 10 };
    const b = { lp: new Float32Array(10 * V).map((_, i) => 100 + Math.floor(i / V)), T: 10 };
    const s = stitchPosteriors([a, b], V, 4);
    expect(s.T).toBe(16);
    expect(s.lp[7 * V]).toBe(7);
    expect(s.lp[8 * V]).toBe(102);
  });
});
