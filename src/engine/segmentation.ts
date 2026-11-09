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
