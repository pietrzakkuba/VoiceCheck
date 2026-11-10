import type { AnalysisSettings, SpeechSegment, TrainingMode, TrainingSession } from '@/types';
import type { CaptureResult } from '@/audio/capture';
import { sharedVadInstance } from '@/audio/capture';
import { decodeToPcm16k, dbEnvelope, estimateOffsetMs } from '@/audio/decode';
import { vadProbabilities } from '@/audio/vad';
import { extractFeatures, median, peakWaveform, SR } from '@/engine/features';
import { detectNuclei } from '@/engine/syllableNuclei';
import { refineSpeech, vadSegments } from '@/engine/segmentation';
import { analyzeSession } from '@/engine/session';
import { db, saveSession } from '@/store/db';
import { getSettings } from '@/store/settings';
import { uid } from './utils';

export interface SessionMeta {
  mode: TrainingMode;
  targetText?: string;
  presentationId?: string;
}

/** Everything needed to (re)compute a session. */
interface Recording {
  durationMs: number;
  speech: SpeechSegment[];
  nucleiMs: number[];
  db: ArrayLike<number>;
  noiseFloorDb: number;
  waveform: number[];
  deviceLabel: string;
  clipping?: boolean;
}

const round = (v: number, f: number) => Math.round(v * f) / f;

export function currentAnalysisSettings(): AnalysisSettings {
  const s = getSettings();
  return {
    targetArticulationRate: [...s.targetArticulationRate] as [number, number],
    maxContinuousSpeechSeconds: s.maxContinuousSpeechSeconds,
    syllableCorrection: s.liveSyllableCorrection,
    syllablesPerWord: s.syllablesPerWord,
  };
}

function speechSnr(dbTrack: ArrayLike<number>, speech: SpeechSegment[], noiseFloorDb: number): number {
  const vals: number[] = [];
  let k = 0;
  for (let i = 0; i < dbTrack.length; i++) {
    const t = i * 10;
    while (k < speech.length && speech[k].endMs < t) k++;
    if (k < speech.length && t >= speech[k].startMs) vals.push(dbTrack[i]);
  }
  return vals.length ? median(vals) - noiseFloorDb : 0;
}

function analyse(
  rec: Pick<Recording, 'durationMs' | 'speech' | 'nucleiMs'>,
  snrDb: number,
  settings: AnalysisSettings,
) {
  return analyzeSession({
    durationMs: rec.durationMs,
    speech: rec.speech,
    nucleiMs: rec.nucleiMs,
    snrDb,
    correction: settings.syllableCorrection,
    syllablesPerWord: settings.syllablesPerWord,
    maxContinuousMs: settings.maxContinuousSpeechSeconds * 1000,
    targetRate: settings.targetArticulationRate,
  });
}

function buildSession(
  meta: SessionMeta,
  rec: Recording,
  base: { id?: string; timestamp?: number; audioKey?: string; audioOffsetMs?: number } = {},
): TrainingSession {
  const settings = currentAnalysisSettings();
  const snrDb = speechSnr(rec.db, rec.speech, rec.noiseFloorDb);
  const a = analyse(rec, snrDb, settings);
  const warnings: string[] = [];
  if (rec.clipping) warnings.push('Nagranie było przesterowane — odsuń się od mikrofonu lub zmniejsz jego czułość.');
  const id = base.id ?? uid();
  return {
    schema: 2,
    id,
    timestamp: base.timestamp ?? Date.now(),
    mode: meta.mode,
    targetText: meta.targetText,
    presentationId: meta.presentationId,
    deviceLabel: rec.deviceLabel,
    durationSeconds: rec.durationMs / 1000,
    audioKey: base.audioKey ?? `audio-${id}`,
    audioOffsetMs: base.audioOffsetMs,
    noiseFloorDb: rec.noiseFloorDb,
    settings,
    ...a,
    tracks: {
      waveform: rec.waveform,
      speechSegments: rec.speech.map((s) => ({ startMs: Math.round(s.startMs), endMs: Math.round(s.endMs) })),
      nucleiMs: rec.nucleiMs.map((t) => Math.round(t)),
    },
    warnings,
  };
}

/** Offset between the MediaRecorder track and the PCM time base (playback sync). */
async function measureAudioOffset(blob: Blob, liveDb: ArrayLike<number>): Promise<number> {
  try {
    const pcm = await decodeToPcm16k(blob);
    return estimateOffsetMs(liveDb, dbEnvelope(pcm));
  } catch {
    return 0;
  }
}

/** Analyses a finished live recording and stores it with its audio. */
export async function finalizeRecording(meta: SessionMeta, cap: CaptureResult): Promise<TrainingSession> {
  const offset = await measureAudioOffset(cap.blob, cap.db);
  const session = buildSession(
    meta,
    {
      durationMs: cap.durationMs,
      speech: cap.speech,
      nucleiMs: cap.nuclei,
      db: cap.db,
      noiseFloorDb: cap.noiseFloorDb,
      waveform: peakWaveform(cap.pcm).map((v) => round(v, 1000)),
      deviceLabel: cap.deviceLabel,
      clipping: cap.clipping,
    },
    { audioOffsetMs: offset },
  );
  await saveSession(session, cap.blob);
  return session;
}

/** Re-runs the analysis of a stored session with the current settings (e.g. after calibration). */
export async function recomputeSession(id: string): Promise<TrainingSession | null> {
  const s = await db.sessions.get(id);
  if (!s || s.schema !== 2) return null;
  const settings = currentAnalysisSettings();
  const a = analyse(
    { durationMs: s.durationSeconds * 1000, speech: s.tracks.speechSegments, nucleiMs: s.tracks.nucleiMs },
    s.metrics.snrDb,
    settings,
  );
  const updated: TrainingSession = { ...s, settings, ...a };
  await db.sessions.put(updated);
  return updated;
}

/** Decodes a stored recording and re-detects speech and syllable nuclei offline. */
async function analyseStoredAudio(blob: Blob, fallbackNoiseFloor: number) {
  const pcm = await decodeToPcm16k(blob);
  const { db: dbTrack, bandDb, voicing } = extractFeatures(pcm);
  const vad = await sharedVadInstance();
  vad.reset();
  const probs = await vadProbabilities(pcm, vad);
  const vadSpeech = vadSegments(probs);
  const silent: number[] = [];
  for (let i = 0; i < dbTrack.length; i++) {
    const t = i * 10;
    if (!vadSpeech.some((s) => t >= s.startMs - 100 && t <= s.endMs + 100)) silent.push(dbTrack[i]);
  }
  const noiseFloorDb = silent.length > 50 ? median(silent) : fallbackNoiseFloor;
  return {
    durationMs: (pcm.length / SR) * 1000,
    speech: refineSpeech(vadSpeech, dbTrack, voicing, noiseFloorDb),
    nucleiMs: detectNuclei(bandDb, dbTrack, voicing, noiseFloorDb).map((k) => k * 10),
    db: dbTrack,
    noiseFloorDb,
    waveform: peakWaveform(pcm).map((v) => round(v, 1000)),
  };
}

interface LegacySession {
  id: string;
  timestamp: number;
  mode: string;
  targetText?: string;
  deviceLabel?: string;
  audioKey: string;
  noiseFloorDb?: number;
  schema?: number;
}

let migration: Promise<number> | null = null;

/**
 * Sessions from the previous app version (with transcripts and scores) are re-analysed
 * acoustically from their stored audio. Returns the number of migrated sessions.
 */
export function migrateLegacySessions(): Promise<number> {
  migration ??= (async () => {
    const legacy = (await db.sessions.toArray()) as unknown as LegacySession[];
    let done = 0;
    for (const old of legacy) {
      if (old.schema === 2) continue;
      const audio = await db.audio.get(old.audioKey);
      if (!audio) {
        await db.sessions.delete(old.id);
        continue;
      }
      try {
        const rec = await analyseStoredAudio(audio.blob, old.noiseFloorDb ?? -60);
        const mode: TrainingMode = old.mode === 'calibration' ? 'calibration' : old.targetText ? 'reading' : 'free_speech';
        const session = buildSession(
          { mode, targetText: old.targetText },
          { ...rec, deviceLabel: old.deviceLabel ?? '' },
          { id: old.id, timestamp: old.timestamp, audioKey: old.audioKey, audioOffsetMs: 0 },
        );
        await db.sessions.put(session);
        done++;
      } catch (e) {
        // Keep the old record; it will be retried on the next start.
        console.warn('Nie udało się przeliczyć starej sesji', old.id, e);
      }
    }
    return done;
  })().finally(() => {
    migration = null;
  });
  return migration;
}
