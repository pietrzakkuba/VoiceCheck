import type { Flag, PacerInfo, RawWord } from '@/types';
import type { NormToken } from './normalize';
import { countSyllables } from './syllables';
import { T } from './thresholds';
import { mkFlag } from './context';

/**
 * Pacer schedule (8.3): word highlight time ∝ syllables / target rate, plus a pause after commas and sentences.
 * Times are relative to the recording start; `startMs` is when the pacer was started (lead-in included).
 */
export function buildPacerSchedule(tokens: NormToken[], rate: number, startMs: number, leadInMs: number = T.pacerLeadInMs): PacerInfo {
  let t = startMs + leadInMs;
  const schedule: PacerInfo['schedule'] = [];
  tokens.forEach((tok, i) => {
    const syl = Math.max(1, countSyllables(tok.word));
    const dur = (1000 * syl) / rate;
    schedule.push({ wordIndex: i, startMs: Math.round(t), endMs: Math.round(t + dur) });
    t += dur;
    if (tok.boundary === 'comma') t += T.pacerCommaMs;
    if (tok.boundary === 'sentence') t += T.pacerSentenceMs;
  });
  return { targetRate: rate, startMs, schedule };
}

export interface PacerResult {
  flags: Flag[];
  meanAbsDevMs: number;
  matched: number;
}

export function comparePacer(words: RawWord[], pacer: PacerInfo): PacerResult {
  const byTarget = new Map(pacer.schedule.map((s) => [s.wordIndex, s]));
  const devs: { i: number; dev: number; w: RawWord }[] = [];
  words.forEach((w, i) => {
    if (w.targetIndex === undefined || w.timingApprox || (w.op !== 'match' && w.op !== 'sub')) return;
    const s = byTarget.get(w.targetIndex);
    if (s) devs.push({ i, dev: w.startMs - s.startMs, w });
  });
  const flags: Flag[] = [];
  let run: typeof devs = [];
  const flush = () => {
    if (!run.length) return;
    const ahead = run[0].dev < 0;
    const worst = run.reduce((m, d) => Math.max(m, Math.abs(d.dev)), 0);
    const words = run.map((d) => d.w.text);
    const label = words.length > 3 ? `„${words[0]} … ${words[words.length - 1]}”` : `„${words.join(' ')}”`;
    flags.push(mkFlag(ahead ? 'AHEAD_OF_PACER' : 'BEHIND_PACER', worst > 1000 ? 'red' : 'amber', 'high',
      run[0].w.startMs, run[run.length - 1].w.endMs,
      `${label}: ${ahead ? 'wyprzedzasz' : 'spóźniasz się za'} wskaźnik${ahead ? '' : 'iem'} o ${(worst / 1000).toFixed(1)} s`,
      { wordIndex: run[0].i, details: { maxDevMs: Math.round(worst), words: run.length } }));
    run = [];
  };
  for (const d of devs) {
    if (Math.abs(d.dev) <= T.pacerDeviationMs) { flush(); continue; }
    if (run.length && (run[0].dev < 0) !== (d.dev < 0)) flush();
    run.push(d);
  }
  flush();
  const mean = devs.length ? devs.reduce((s, d) => s + Math.abs(d.dev), 0) / devs.length : 0;
  return { flags, meanAbsDevMs: mean, matched: devs.length };
}
