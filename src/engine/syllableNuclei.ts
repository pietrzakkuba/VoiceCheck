import { T } from './thresholds';
import { percentile } from './features';

/**
 * Syllable nuclei detector (adaptation of de Jong & Wempe, 4.3): peaks of the vowel-band (300–2500 Hz) intensity in
 * voiced frames that rise ≥2 dB above the preceding dip, lie ≥10 dB above the noise floor, are not much weaker than
 * recent loud vowels (echo/breath rejection) and are ≥100 ms apart.
 */
export class NucleusDetector {
  private band: number[] = [];
  private broad: number[] = [];
  private voiced: number[] = [];
  private frame = 0;
  private dip = Infinity;
  private lastPeakFrame = -1e9;
  private lastPeakDb = -Infinity;
  private levels: number[] = [];
  private refDb = -Infinity;
  noiseFloor: number;

  constructor(noiseFloor: number, private frameMs = 10) {
    this.noiseFloor = noiseFloor;
  }

  /** Push one 10 ms frame; returns the frame index of a newly accepted nucleus, or -1. */
  push(bandDb: number, db: number, voicing: number): number {
    // 3-frame moving average smoothing of the envelopes.
    this.band.push(bandDb);
    this.broad.push(db);
    this.voiced.push(voicing);
    if (this.band.length > 3) { this.band.shift(); this.broad.shift(); this.voiced.shift(); }
    const idx = this.frame++;
    if (this.band.length < 3) return -1;
    const s = (this.band[0] + this.band[1] + this.band[2]) / 3;
    const sDb = (this.broad[0] + this.broad[1] + this.broad[2]) / 3;
    const v = Math.max(...this.voiced);
    if (v > T.nucleusVoicing) this.trackLevel(s);
    return this.step(s, sDb, v, idx - 1);
  }

  /** Loud-vowel reference: 90th percentile of recent voiced band intensity. */
  private trackLevel(s: number) {
    this.levels.push(s);
    if (this.levels.length > 500) this.levels.shift();
    if (this.levels.length >= 20 && this.levels.length % 10 === 0) this.refDb = percentile(this.levels, 90);
  }

  private prev = -Infinity;
  private prev2 = -Infinity;
  private prevDb = -Infinity;
  private prevVoiced = 0;

  private step(s: number, sDb: number, voicing: number, idx: number): number {
    let accepted = -1;
    // prev is a local maximum if prev2 < prev >= s
    const candidate = this.prev2 < this.prev && this.prev >= s;
    const candIdx = idx - 1;
    if (candidate) {
      const peak = this.prev;
      const prominent = peak - this.dip >= T.nucleusProminenceDb;
      const loud = this.prevDb >= this.noiseFloor + T.nucleusAboveNoiseDb;
      const strong = peak >= this.refDb - T.nucleusBelowPeakDb;
      const voiced = this.prevVoiced > T.nucleusVoicing;
      if (prominent && loud && strong && voiced) {
        if (candIdx - this.lastPeakFrame >= T.nucleusMinGapMs / this.frameMs) {
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
    this.prevDb = sDb;
    this.prevVoiced = voicing;
    return accepted;
  }
}

export function detectNuclei(
  bandDb: ArrayLike<number>,
  db: ArrayLike<number>,
  voicing: ArrayLike<number>,
  noiseFloor: number,
): number[] {
  const det = new NucleusDetector(noiseFloor);
  const out: number[] = [];
  for (let i = 0; i < bandDb.length; i++) {
    const k = det.push(bandDb[i], db[i], voicing[i]);
    if (k >= 0) out.push(k);
  }
  return out;
}
