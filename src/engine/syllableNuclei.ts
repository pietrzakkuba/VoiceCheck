import { T } from './thresholds';

/**
 * Syllable nuclei detector (adaptation of de Jong & Wempe, 4.3): intensity peaks in voiced frames that rise
 * ≥2 dB above the preceding dip, lie ≥10 dB above the noise floor and are ≥100 ms apart.
 */
export class NucleusDetector {
  private hist: number[] = [];
  private voiced: number[] = [];
  private frame = 0;
  private dip = Infinity;
  private lastPeakFrame = -1e9;
  private lastPeakDb = -Infinity;
  noiseFloor: number;

  constructor(noiseFloor: number, private frameMs = 10) {
    this.noiseFloor = noiseFloor;
  }

  /** Push one 10 ms frame; returns the frame index of a newly accepted nucleus, or -1. */
  push(db: number, voicing: number): number {
    // 3-frame moving average smoothing of the envelope.
    this.hist.push(db);
    this.voiced.push(voicing);
    if (this.hist.length > 3) { this.hist.shift(); this.voiced.shift(); }
    const idx = this.frame++;
    if (this.hist.length < 3) return -1;
    const smooth = (this.hist[0] + this.hist[1] + this.hist[2]) / 3;
    return this.step(smooth, Math.max(...this.voiced), idx - 1);
  }

  private prev = -Infinity;
  private prev2 = -Infinity;
  private prevVoiced = 0;

  private step(s: number, voicing: number, idx: number): number {
    let accepted = -1;
    // prev is a local maximum if prev2 < prev >= s
    const candidate = this.prev2 < this.prev && this.prev >= s;
    const candIdx = idx - 1;
    if (candidate) {
      const peak = this.prev;
      const prominent = peak - this.dip >= T.nucleusProminenceDb;
      const loud = peak >= this.noiseFloor + T.nucleusAboveNoiseDb;
      const voiced = this.prevVoiced > T.nucleusVoicing;
      const gapFrames = T.nucleusMinGapMs / this.frameMs;
      if (prominent && loud && voiced) {
        if (candIdx - this.lastPeakFrame >= gapFrames) {
          accepted = candIdx;
          this.lastPeakFrame = candIdx;
          this.lastPeakDb = peak;
          this.dip = peak;
        } else if (peak > this.lastPeakDb) {
          this.lastPeakFrame = candIdx;
          this.lastPeakDb = peak;
          this.dip = peak;
        }
      }
    }
    if (s < this.dip) this.dip = s;
    this.prev2 = this.prev;
    this.prev = s;
    this.prevVoiced = voicing;
    return accepted;
  }
}

export function detectNuclei(db: ArrayLike<number>, voicing: ArrayLike<number>, noiseFloor: number): number[] {
  const det = new NucleusDetector(noiseFloor);
  const out: number[] = [];
  for (let i = 0; i < db.length; i++) {
    const k = det.push(db[i], voicing[i]);
    if (k >= 0) out.push(k);
  }
  return out;
}
