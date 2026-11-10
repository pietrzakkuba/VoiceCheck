import type { SpeechSegment } from '@/types';
import { T } from './thresholds';

export const VAD_FRAME_MS = 32;

/** Silero VAD hysteresis (4.1): speech starts at p > 0.5, ends at p < 0.35. */
export class VadHysteresis {
  speaking = false;
  speechStartMs = 0;
  readonly segments: SpeechSegment[] = [];

  push(p: number, frameStartMs: number, frameMs = VAD_FRAME_MS): { started?: number; ended?: SpeechSegment } {
    if (!this.speaking && p > T.vadStart) {
      this.speaking = true;
      this.speechStartMs = frameStartMs;
      return { started: frameStartMs };
    }
    if (this.speaking && p < T.vadEnd) {
      this.speaking = false;
      const seg = { startMs: this.speechStartMs, endMs: frameStartMs };
      this.segments.push(seg);
      return { ended: seg };
    }
    void frameMs;
    return {};
  }

  /** Closes an open segment at the end of the recording. */
  close(endMs: number) {
    if (this.speaking) {
      this.speaking = false;
      this.segments.push({ startMs: this.speechStartMs, endMs });
    }
    return this.segments;
  }
}

export function vadSegments(probs: ArrayLike<number>, frameMs = VAD_FRAME_MS): SpeechSegment[] {
  const h = new VadHysteresis();
  for (let i = 0; i < probs.length; i++) h.push(probs[i], i * frameMs, frameMs);
  return h.close(probs.length * frameMs);
}

/** Merges segments separated by gaps shorter than `minGapMs`. */
export function mergeSegments(segs: SpeechSegment[], minGapMs: number): SpeechSegment[] {
  const out: SpeechSegment[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && s.startMs - last.endMs < minGapMs) last.endMs = Math.max(last.endMs, s.endMs);
    else out.push({ ...s });
  }
  return out;
}

/** dB level below which an unvoiced 10 ms frame counts as a pause (see `T.pauseBelowSpeechDb`). */
export function quietThresholdDb(noiseFloorDb: number, speechLevelDb: number): number {
  if (!Number.isFinite(speechLevelDb)) return noiseFloorDb + T.pauseAboveNoiseDb;
  return Math.min(
    speechLevelDb - T.pauseBelowSpeechMinDb,
    Math.max(noiseFloorDb + T.pauseAboveNoiseDb, speechLevelDb - T.pauseBelowSpeechDb),
  );
}

/** Median intensity of voiced 10 ms frames inside speech segments. */
export function speechLevelDb(db: ArrayLike<number>, voicing: ArrayLike<number>, segs: SpeechSegment[]): number {
  const vals: number[] = [];
  let k = 0;
  for (let i = 0; i < db.length; i++) {
    const t = i * 10;
    while (k < segs.length && segs[k].endMs < t) k++;
    if (k < segs.length && t >= segs[k].startMs && voicing[i] > T.nucleusVoicing) vals.push(db[i]);
  }
  if (!vals.length) return NaN;
  vals.sort((a, b) => a - b);
  return vals[vals.length >> 1];
}

/**
 * Refines VAD segments with the intensity track: trims quiet edges (VAD reacts late, so short breaths looked shorter
 * than they were), splits segments at quiet runs ≥ `minPauseMs` and drops segments that are quiet throughout
 * (e.g. an audible inhale classified as speech). `quiet(i)` tells whether 10 ms frame `i` is a pause frame.
 */
export function refineSegments(
  segs: SpeechSegment[],
  quiet: (frame: number) => boolean,
  frameCount: number,
  minPauseMs = T.breathPauseMs,
  frameMs = 10,
): SpeechSegment[] {
  const out: SpeechSegment[] = [];
  const minRun = Math.ceil(minPauseMs / frameMs);
  for (const s of segs) {
    const a = Math.max(0, Math.ceil(s.startMs / frameMs));
    const end = Math.floor(s.endMs / frameMs);
    const b = Math.min(frameCount, end);
    if (s.endMs <= s.startMs) continue;
    // Frames not analysed yet (live) are treated as speech.
    const pending = end > frameCount;
    let start = -1;
    let quietRun = 0;
    for (let i = a; i < b; i++) {
      if (quiet(i)) {
        quietRun++;
        if (start >= 0 && quietRun === minRun) {
          out.push({ startMs: start === a ? s.startMs : start * frameMs, endMs: (i - minRun + 1) * frameMs });
          start = -1;
        }
        continue;
      }
      if (start < 0) start = i;
      quietRun = 0;
    }
    if (pending) {
      out.push({ startMs: start < 0 ? Math.max(s.startMs, frameCount * frameMs) : start === a ? s.startMs : start * frameMs, endMs: s.endMs });
    } else if (start >= 0) {
      const endMs = quietRun === 0 ? s.endMs : (b - quietRun) * frameMs;
      out.push({ startMs: start === a ? s.startMs : start * frameMs, endMs });
    }
  }
  return out;
}

/** Quiet-frame predicate over intensity/voicing tracks. */
export function quietFrames(db: ArrayLike<number>, voicing: ArrayLike<number>, thresholdDb: number) {
  return (i: number) => voicing[i] <= T.nucleusVoicing && db[i] < thresholdDb;
}

/** Final speech segments of a recording: VAD segments refined by the intensity track. */
export function refineSpeech(
  segs: SpeechSegment[],
  db: ArrayLike<number>,
  voicing: ArrayLike<number>,
  noiseFloorDb: number,
): SpeechSegment[] {
  const thr = quietThresholdDb(noiseFloorDb, speechLevelDb(db, voicing, segs));
  return refineSegments(segs, quietFrames(db, voicing, thr), db.length);
}
