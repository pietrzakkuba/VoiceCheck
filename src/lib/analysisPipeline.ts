import { create } from 'zustand';
import type {
  PacerInfo, RawWord, SkippedWord, SpeechSegment, TrainingMode, TrainingSession, UnitCategory,
} from '@/types';
import type { Chunk } from '@/engine/segmentation';
import { planChunksOffline, vadSegments } from '@/engine/segmentation';
import { normalizeText, type NormToken } from '@/engine/normalize';
import { alignWordSeq } from '@/engine/wordDiff';
import { checkHallucination } from '@/engine/hallucinations';
import { countSyllables } from '@/engine/syllables';
import { isFillerToken, type AnalysisInput } from '@/engine/context';
import { analyzeSession } from '@/engine/report';
import { extractFeatures, median, peakWaveform, SR } from '@/engine/features';
import { detectNuclei } from '@/engine/syllableNuclei';
import { analysisClient, modelsReady, useModelStore } from '@/workers/client';
import { db, getBaseline, saveSession } from '@/store/db';
import { getSettings } from '@/store/settings';
import { decodeToPcm16k, dbEnvelope, estimateOffsetMs } from '@/audio/decode';
import { vadProbabilities } from '@/audio/vad';
import { sharedVadInstance } from '@/audio/capture';
import { uid } from './utils';

/** Exercise context saved with the session. */
export interface SessionMeta {
  mode: TrainingMode;
  targetText?: string;
  exerciseId?: string;
  dictionCategory?: UnitCategory | 'zbitki' | 'rl';
  conversationId?: string;
  question?: string;
  repeatOf?: { sessionId: string; sentence: string };
  pacer?: PacerInfo;
}

export interface RecordingData {
  pcm: Float32Array;
  db: ArrayLike<number>;
  voicing: ArrayLike<number>;
  speech: SpeechSegment[];
  /** Nucleus times in ms. */
  nuclei: number[];
  noiseFloorDb: number;
  durationMs: number;
  deviceLabel: string;
  chunks: Chunk[];
}

const isReading = (m: SessionMeta) => !!m.targetText && m.mode !== 'bot_conversation';

/**
 * Incremental ASR → word diff → CTC alignment (5.1–5.4). Chunks are processed sequentially in the background
 * while the user keeps speaking, so the report is ready a moment after "Stop".
 */
export class ChunkTranscriber {
  words: RawWord[] = [];
  skipped: SkippedWord[] = [];
  texts: string[] = [];
  rejected: string[] = [];
  private target: NormToken[] | null;
  private cursor = 0;
  private queue: Promise<void> = Promise.resolve();
  private missed = false;
  private processed: Chunk[] = [];
  private lastEndMs = 0;

  constructor(
    meta: SessionMeta,
    private getPcm: (startMs: number, endMs: number) => Float32Array,
    private nucleiIn: (startMs: number, endMs: number) => number,
    private speechIn: (startMs: number, endMs: number) => SpeechSegment[],
  ) {
    this.target = isReading(meta) ? normalizeText(meta.targetText!) : null;
  }

  add(chunk: Chunk) {
    this.processed.push(chunk);
    if (!modelsReady()) {
      this.missed = true;
      return;
    }
    this.queue = this.queue.then(() => this.process(chunk)).catch((e) => {
      console.warn('[ClearVoice] chunk analysis failed', e);
      this.missed = true;
    });
  }

  /** Waits for queued chunks. Returns false if ASR could not run. */
  async finish(): Promise<boolean> {
    await this.queue;
    if (this.missed) {
      if (!modelsReady()) return false;
      // Models became ready mid-session (or a chunk failed) → redo everything in order.
      const chunks = this.processed;
      this.reset();
      try {
        for (const c of chunks) await this.process(c);
      } catch (e) {
        console.warn('[ClearVoice] analysis failed', e);
        return false;
      }
    }
    if (this.target) {
      for (let i = this.cursor; i < this.target.length; i++) {
        this.skipped.push({ targetText: this.target[i].word, targetIndex: i, atMs: this.lastEndMs });
      }
      this.cursor = this.target.length;
    }
    return true;
  }

  private reset() {
    this.words = [];
    this.skipped = [];
    this.texts = [];
    this.rejected = [];
    this.cursor = 0;
    this.missed = false;
    this.lastEndMs = 0;
  }

  private async process(c: Chunk) {
    if (c.skip || c.endMs - c.startMs < 200) return;
    const pcm = this.getPcm(c.startMs, c.endMs);
    const text = await analysisClient.transcribe(pcm);
    const nuclei = this.nucleiIn(c.startMs, c.endMs) * getSettings().liveSyllableCorrection;
    const h = checkHallucination(text, nuclei);
    if (h.rejected) {
      if (text.trim()) this.rejected.push(`${text.trim()} (${h.reason})`);
      return;
    }
    this.texts.push(text);
    const hypTokens = normalizeText(text);
    const pending: { align: string; word: Omit<RawWord, 'startMs' | 'endMs' | 'alignScore' | 'chars'> }[] = [];
    const chunkSkipped: { targetIndex: number; afterPending: number }[] = [];

    if (this.target) {
      const ref = this.target.slice(this.cursor).map((t) => t.word);
      const { ops, refConsumed } = alignWordSeq(ref, hypTokens.map((t) => t.word), true);
      for (const op of ops) {
        if (op.op === 'match') {
          const t = this.target[this.cursor + op.ref];
          pending.push({ align: t.word, word: { text: t.word, op: 'match', targetIndex: this.cursor + op.ref, boundary: t.boundary, unscorable: t.unscorable } });
        } else if (op.op === 'sub') {
          const t = this.target[this.cursor + op.ref];
          const hw = hypTokens[op.hyp];
          pending.push({ align: hw.word, word: { text: hw.word, targetText: t.word, op: 'sub', targetIndex: this.cursor + op.ref, boundary: t.boundary, unscorable: t.unscorable || hw.unscorable } });
        } else if (op.op === 'ins') {
          const hw = hypTokens[op.hyp];
          pending.push({ align: hw.word, word: { text: hw.word, op: 'ins', boundary: hw.boundary, unscorable: hw.unscorable } });
        } else {
          chunkSkipped.push({ targetIndex: this.cursor + op.ref, afterPending: pending.length });
        }
      }
      this.cursor += refConsumed;
    } else {
      for (const t of hypTokens) {
        pending.push({ align: t.word, word: { text: t.word, op: 'free', boundary: t.boundary, unscorable: t.unscorable || isFillerToken(t.word) } });
      }
    }
    if (!pending.length) {
      for (const s of chunkSkipped) this.skipped.push({ targetText: this.target![s.targetIndex].word, targetIndex: s.targetIndex, atMs: this.lastEndMs });
      return;
    }

    let aligned = await analysisClient.align(pcm, pending.map((p) => p.align), c.startMs);
    if (aligned && aligned.length !== pending.length) aligned = null;
    const timed: RawWord[] = aligned
      ? pending.map((p, i) => ({ ...p.word, startMs: aligned![i].startMs, endMs: aligned![i].endMs, alignScore: aligned![i].alignScore, chars: aligned![i].chars }))
      : this.spread(pending.map((p) => p.word), c);

    for (const s of chunkSkipped) {
      const prev = s.afterPending > 0 ? timed[s.afterPending - 1].endMs : this.lastEndMs || c.startMs;
      this.skipped.push({ targetText: this.target![s.targetIndex].word, targetIndex: s.targetIndex, atMs: prev });
    }
    this.words.push(...timed);
    this.lastEndMs = timed[timed.length - 1].endMs;
  }

  /** Lite tier / alignment failure: spread words over VAD speech proportionally to syllable counts. */
  private spread(words: Omit<RawWord, 'startMs' | 'endMs' | 'alignScore' | 'chars'>[], c: Chunk): RawWord[] {
    let segs = this.speechIn(c.startMs, c.endMs);
    if (!segs.length) segs = [{ startMs: c.startMs, endMs: c.endMs }];
    const total = segs.reduce((s, g) => s + g.endMs - g.startMs, 0);
    const weights = words.map((w) => Math.max(1, countSyllables(w.text)));
    const wsum = weights.reduce((a, b) => a + b, 0);
    const at = (pos: number) => {
      let rest = pos;
      for (const g of segs) {
        const len = g.endMs - g.startMs;
        if (rest <= len) return g.startMs + rest;
        rest -= len;
      }
      return segs[segs.length - 1].endMs;
    };
    let acc = 0;
    return words.map((w, i) => {
      const a = (acc / wsum) * total;
      acc += weights[i];
      const b = (acc / wsum) * total;
      return { ...w, startMs: at(a), endMs: at(b), alignScore: 0, chars: null, timingApprox: true };
    });
  }
}

export function transcriberForRecording(meta: SessionMeta, getPcm: (s: number, e: number) => Float32Array, nuclei: () => number[], speech: () => SpeechSegment[]) {
  return new ChunkTranscriber(
    meta,
    getPcm,
    (s, e) => nuclei().filter((t) => t >= s && t < e).length,
    (s, e) => speech()
      .map((g) => ({ startMs: Math.max(s, g.startMs), endMs: Math.min(e, g.endMs) }))
      .filter((g) => g.endMs - g.startMs > 0),
  );
}

const round = (v: number, k: number) => Math.round(v * k) / k;

/** Collects everything the scoring engine needs (also used by the debug export for scripts/evaluate-corpus.ts). */
export async function prepareAnalysisInput(meta: SessionMeta, rec: RecordingData, tr: ChunkTranscriber): Promise<AnalysisInput> {
  const asrAvailable = await tr.finish();
  const settings = getSettings();
  const baseline = await getBaseline();
  const minDb = Math.max(-70, rec.noiseFloorDb + 6);
  const { f0, mfccDelta } = await analysisClient.acoustics(rec.pcm.slice(), minDb);
  const ms = useModelStore.getState();
  const speechNuclei = rec.nuclei.filter((t) => rec.speech.some((s) => t >= s.startMs && t <= s.endMs)).length;

  return {
    mode: meta.mode,
    reading: isReading(meta),
    targetText: meta.targetText,
    durationMs: rec.durationMs,
    speech: rec.speech,
    db: rec.db,
    voicing: rec.voicing,
    f0,
    mfccDelta,
    noiseFloorDb: rec.noiseFloorDb,
    words: asrAvailable ? tr.words : [],
    skipped: asrAvailable ? tr.skipped : [],
    asrAvailable,
    gopAvailable: asrAvailable && ms.ctc,
    liveNuclei: speechNuclei,
    settings: {
      targetArticulationRate: settings.targetArticulationRate,
      maxContinuousSpeechSeconds: settings.maxContinuousSpeechSeconds,
      scoreWeights: settings.scoreWeights,
      liveSyllableCorrection: settings.liveSyllableCorrection,
    },
    baseline,
    pacer: meta.pacer,
    dictionCategory: meta.dictionCategory,
  };
}

/** Runs the scoring engine on a finished recording and builds the session record. */
export async function buildSession(
  meta: SessionMeta,
  rec: RecordingData,
  tr: ChunkTranscriber,
  base: { id?: string; timestamp?: number; audioKey?: string; audioOffsetMs?: number } = {},
): Promise<TrainingSession> {
  const input = await prepareAnalysisInput(meta, rec, tr);
  const { asrAvailable, f0 } = input;
  const ms = useModelStore.getState();
  const out = analyzeSession(input);
  if (tr.rejected.length) out.warnings.push(`Odrzucono ${tr.rejected.length} fragment(y) transkrypcji jako prawdopodobne halucynacje modelu.`);
  if (asrAvailable && !ms.ctc) out.warnings.push('Tryb Lite: brak oceny artykulacji (GOP), czasy słów są przybliżone.');

  const id = base.id ?? uid();
  const session: TrainingSession = {
    id,
    timestamp: base.timestamp ?? Date.now(),
    mode: meta.mode,
    targetText: meta.targetText,
    deviceLabel: rec.deviceLabel,
    modelTier: ms.tier ?? 'lite',
    durationSeconds: round(rec.durationMs / 1000, 10),
    audioKey: base.audioKey ?? id,
    ...out,
    tracks: {
      intensityDb: Array.from(rec.db, (v) => round(v, 10)),
      f0Hz: Array.from(f0, (v) => Math.round(v)),
      waveform: peakWaveform(rec.pcm).map((v) => round(v, 1000)),
      speechSegments: rec.speech.map((s) => ({ startMs: Math.round(s.startMs), endMs: Math.round(s.endMs) })),
    },
    audioOffsetMs: base.audioOffsetMs,
    pacer: meta.pacer,
    exerciseId: meta.exerciseId,
    dictionCategory: meta.dictionCategory,
    conversationId: meta.conversationId,
    question: meta.question,
    repeatOf: meta.repeatOf,
  };

  // 4.3: refine the live syllable correction factor with aligned syllable counts.
  if (asrAvailable && out.liveSyllableRatio && rec.durationMs > 8000) {
    const r = out.liveSyllableRatio;
    if (r > 0.5 && r < 2) {
      const settings = getSettings();
      const next = Math.min(1.6, Math.max(0.6, 0.8 * settings.liveSyllableCorrection + 0.2 * r));
      settings.set({ liveSyllableCorrection: +next.toFixed(3) });
    }
  }
  return session;
}

/** Offset between the MediaRecorder track and the PCM time base (7.1 playback sync). */
export async function measureAudioOffset(blob: Blob, liveDb: ArrayLike<number>): Promise<number> {
  try {
    const pcm = await decodeToPcm16k(blob);
    return estimateOffsetMs(liveDb, dbEnvelope(pcm));
  } catch {
    return 0;
  }
}

/** Finalises a live recording: analysis + IndexedDB. */
export async function finalizeRecording(meta: SessionMeta, rec: RecordingData, tr: ChunkTranscriber, blob: Blob): Promise<TrainingSession> {
  const offset = await measureAudioOffset(blob, rec.db);
  const session = await buildSession(meta, rec, tr, { audioOffsetMs: offset });
  await saveSession(session, blob);
  return session;
}

/** Decodes a stored recording and replays VAD/feature extraction/ASR offline. */
async function loadStoredRecording(id: string) {
  const old = await db.sessions.get(id);
  if (!old) throw new Error('Nie znaleziono sesji');
  const audio = await db.audio.get(old.audioKey);
  if (!audio) throw new Error('Brak nagrania tej sesji');
  const pcm = await decodeToPcm16k(audio.blob);
  const { db: dbTrack, voicing } = extractFeatures(pcm);
  const vad = await sharedVadInstance();
  vad.reset();
  const probs = await vadProbabilities(pcm, vad);
  const durationMs = (pcm.length / SR) * 1000;
  const speech = vadSegments(probs);
  const silent: number[] = [];
  for (let i = 0; i < dbTrack.length; i++) {
    const t = i * 10;
    if (!speech.some((s) => t >= s.startMs - 100 && t <= s.endMs + 100)) silent.push(dbTrack[i]);
  }
  const noiseFloorDb = silent.length > 50 ? median(silent) : old.noiseFloorDb;
  const nuclei = detectNuclei(dbTrack, voicing, noiseFloorDb).map((k) => k * 10);
  const chunks = planChunksOffline(speech, durationMs);
  const meta: SessionMeta = {
    mode: old.mode, targetText: old.targetText, exerciseId: old.exerciseId, dictionCategory: old.dictionCategory,
    conversationId: old.conversationId, question: old.question, repeatOf: old.repeatOf, pacer: old.pacer,
  };
  const slice = (s: number, e: number) => pcm.slice(Math.max(0, Math.floor((s / 1000) * SR)), Math.min(pcm.length, Math.ceil((e / 1000) * SR)));
  const tr = transcriberForRecording(meta, slice, () => nuclei, () => speech);
  for (const c of chunks) tr.add(c);
  const rec: RecordingData = {
    pcm, db: dbTrack, voicing, speech, nuclei, noiseFloorDb, durationMs, deviceLabel: old.deviceLabel, chunks,
  };
  return { old, meta, rec, tr };
}

/** Offline analysis of a stored recording (re-analysis 7.6 and pending sessions). */
export async function reanalyzeSession(id: string): Promise<TrainingSession> {
  const { old, meta, rec, tr } = await loadStoredRecording(id);
  // Decoded audio is the playback time base → offset 0.
  const session = await buildSession(meta, rec, tr, { id: old.id, timestamp: old.timestamp, audioKey: old.audioKey, audioOffsetMs: 0 });
  await saveSession(session);
  return session;
}

/**
 * Debug export (9): full engine input of a session, so scripts/evaluate-corpus.ts can re-run
 * `analyzeSession` in Node with different thresholds. Typed arrays are converted to plain arrays.
 */
export async function exportAnalysisInput(id: string): Promise<{ sessionId: string; targetText?: string; input: AnalysisInput }> {
  const { old, meta, rec, tr } = await loadStoredRecording(id);
  const input = await prepareAnalysisInput(meta, rec, tr);
  const plain = (a: ArrayLike<number>) => Array.from(a, (v) => Math.round(v * 1000) / 1000);
  return {
    sessionId: old.id,
    targetText: old.targetText,
    input: { ...input, db: plain(input.db), voicing: plain(input.voicing), f0: plain(input.f0), mfccDelta: plain(input.mfccDelta) },
  };
}

interface ReanalysisState {
  running: string | null;
  done: number;
  total: number;
}
export const useReanalysis = create<ReanalysisState>(() => ({ running: null, done: 0, total: 0 }));

let pendingRun: Promise<void> | null = null;
/** Analyses sessions recorded before the models were downloaded. */
export function reanalyzePending(): Promise<void> {
  if (pendingRun) return pendingRun;
  pendingRun = (async () => {
    if (!modelsReady()) return;
    const list = await db.sessions.where('analysisStatus').equals('pending').toArray();
    useReanalysis.setState({ done: 0, total: list.length });
    for (const s of list) {
      useReanalysis.setState({ running: s.id });
      try {
        await reanalyzeSession(s.id);
      } catch (e) {
        console.warn('[ClearVoice] re-analysis failed', s.id, e);
      }
      useReanalysis.setState((st) => ({ done: st.done + 1 }));
    }
    useReanalysis.setState({ running: null });
  })().finally(() => {
    pendingRun = null;
  });
  return pendingRun;
}
