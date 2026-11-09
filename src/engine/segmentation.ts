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

export interface Chunk {
  startMs: number;
  endMs: number;
  speechMs: number;
  skip: boolean;
}

/**
 * Incremental chunk planner (5.1): cut after a ≥700 ms pause that follows ≥1500 ms of speech, or at 25 s
 * (preferably in the longest pause). Chunks get 200 ms margins; chunks with <300 ms of speech are skipped.
 */
export class ChunkPlanner {
  private cursorMs = 0;
  private hardCut = false;

  constructor(private durationLimitMs = Infinity) {}

  update(closed: SpeechSegment[], openStartMs: number | null, nowMs: number, final: boolean): Chunk[] {
    const out: Chunk[] = [];
    for (;;) {
      const segs = this.speechAfterCursor(closed, openStartMs, nowMs);
      if (!segs.length) return out;
      const first = segs[0].startMs;
      let cut: { end: number; cursor: number; margin: boolean } | null = null;

      let speech = 0;
      for (let i = 0; i < segs.length; i++) {
        speech += segs[i].endMs - segs[i].startMs;
        const isOpenLast = i === segs.length - 1 && openStartMs !== null;
        const nextStart = i + 1 < segs.length ? segs[i + 1].startMs : isOpenLast ? null : nowMs;
        if (nextStart === null) break;
        const gap = nextStart - segs[i].endMs;
        if (gap >= T.chunkPauseMs && speech >= T.chunkMinSpeechMs) {
          cut = { end: segs[i].endMs, cursor: segs[i].endMs, margin: true };
          break;
        }
      }

      if (!cut && nowMs - first >= T.chunkMaxMs) {
        const limit = first + T.chunkMaxMs;
        let bestGap = 0;
        let bestEnd = -1;
        for (let i = 0; i + 1 < segs.length; i++) {
          if (segs[i + 1].startMs > limit) break;
          const g = segs[i + 1].startMs - segs[i].endMs;
          if (g >= bestGap) { bestGap = g; bestEnd = segs[i].endMs; }
        }
        cut = bestEnd > first && bestGap >= T.pauseMinMs
          ? { end: bestEnd, cursor: bestEnd, margin: true }
          : { end: limit, cursor: limit, margin: false };
      }

      if (!cut && final) {
        const last = segs[segs.length - 1];
        cut = { end: last.endMs, cursor: last.endMs, margin: true };
      }
      if (!cut) return out;

      const startMs = Math.max(0, this.hardCut ? first : first - T.chunkMarginMs);
      const endMs = Math.min(this.durationLimitMs, nowMs, cut.margin ? cut.end + T.chunkMarginMs : cut.end);
      const speechMs = segs.reduce((s, g) => s + Math.max(0, Math.min(g.endMs, cut!.end) - g.startMs), 0);
      out.push({ startMs, endMs, speechMs, skip: speechMs < T.chunkSkipSpeechMs });
      this.hardCut = !cut.margin;
      this.cursorMs = cut.cursor;
      if (final && cut.end >= segs[segs.length - 1].endMs) return out;
    }
  }

  private speechAfterCursor(closed: SpeechSegment[], openStartMs: number | null, nowMs: number): SpeechSegment[] {
    const all = openStartMs !== null ? [...closed, { startMs: openStartMs, endMs: nowMs }] : closed;
    return all
      .filter((s) => s.endMs > this.cursorMs)
      .map((s) => ({ startMs: Math.max(s.startMs, this.cursorMs), endMs: s.endMs }))
      .filter((s) => s.endMs - s.startMs > 0);
  }
}

export function planChunksOffline(segments: SpeechSegment[], durationMs: number): Chunk[] {
  const p = new ChunkPlanner(durationMs);
  return p.update(segments, null, durationMs, true);
}
