import { useCallback, useEffect, useRef, useState } from 'react';
import { MicCapture, MicError } from '@/audio/capture';
import type { LiveStats } from '@/audio/liveAnalyzer';
import { finalizeRecording, transcriberForRecording, type ChunkTranscriber, type SessionMeta } from '@/lib/analysisPipeline';
import { getSettings } from '@/store/settings';
import { getBaseline } from '@/store/db';
import { liveCaptionsSupported } from '@/audio/liveCaptions';
import type { TrainingSession } from '@/types';

export type SessionPhase = 'idle' | 'starting' | 'recording' | 'processing' | 'error';

export interface StartOptions {
  /** Silent noise-floor calibration at the start (ms); 0 to skip. */
  calibrateMs?: number;
  noiseFloorDb?: number;
  /** Auto-stop after ≥3 s silence following speech (bot mode). */
  stopOnSilence?: boolean;
  onStarted?: (startedAtPerf: number) => void;
}

/** Orchestrates one recording: mic capture → live HUD → incremental analysis → saved session. */
export function useTrainingSession() {
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [captions, setCaptions] = useState<{ final: string; interim: string }>({ final: '', interim: '' });
  const [error, setError] = useState<string | null>(null);
  const [deviceWarning, setDeviceWarning] = useState<string | null>(null);
  const cap = useRef<MicCapture | null>(null);
  const tr = useRef<ChunkTranscriber | null>(null);
  const meta = useRef<SessionMeta | null>(null);
  const stopping = useRef<Promise<TrainingSession | null> | null>(null);
  const autoStop = useRef<(() => void) | null>(null);

  const start = useCallback(async (m: SessionMeta, o: StartOptions = {}) => {
    if (cap.current) return;
    setError(null);
    setDeviceWarning(null);
    setStats(null);
    setCaptions({ final: '', interim: '' });
    setPhase('starting');
    meta.current = m;
    stopping.current = null;
    const s = getSettings();
    try {
      let capture: MicCapture | null = null;
      const transcriber = transcriberForRecording(
        m,
        (a, b) => capture!.pcm(a, b),
        () => capture!.live.nuclei,
        () => capture!.live.speechSegments(),
      );
      tr.current = transcriber;
      capture = await MicCapture.start({
        deviceId: s.micDeviceId ?? undefined,
        calibrateMs: o.calibrateMs ?? 2000,
        noiseFloorDb: o.noiseFloorDb,
        correction: s.liveSyllableCorrection,
        syllablesPerWord: s.syllablesPerWord,
        maxContinuousMs: s.maxContinuousSpeechSeconds * 1000,
        captions: s.liveCaptions && liveCaptionsSupported(),
        onStats: setStats,
        onChunk: (c) => transcriber.add(c),
        onCaption: (final, interim) => setCaptions({ final, interim }),
        onLongSilence: o.stopOnSilence ? () => autoStop.current?.() : undefined,
        silenceStopMs: 3000,
      });
      cap.current = capture;
      o.onStarted?.(performance.now());
      setPhase('recording');
      const baseline = await getBaseline();
      if (baseline && baseline.deviceLabel && capture.deviceLabel && baseline.deviceLabel !== capture.deviceLabel) {
        setDeviceWarning(`Używasz innego mikrofonu („${capture.deviceLabel}”) niż podczas kalibracji („${baseline.deviceLabel}”). Zalecana ponowna kalibracja.`);
      }
    } catch (e) {
      cap.current = null;
      setError(e instanceof MicError ? e.message : `Nie udało się rozpocząć nagrania: ${(e as Error).message}`);
      setPhase('error');
    }
  }, []);

  const stop = useCallback(async (): Promise<TrainingSession | null> => {
    if (stopping.current) return stopping.current;
    const c = cap.current;
    if (!c || !tr.current || !meta.current) return null;
    stopping.current = (async () => {
      setPhase('processing');
      try {
        const r = await c.stop();
        cap.current = null;
        if (r.durationMs < 1000 || !r.speech.length) {
          setError('Nie wykryto mowy. Sprawdź mikrofon i spróbuj ponownie.');
          setPhase('error');
          return null;
        }
        const session = await finalizeRecording(meta.current!, r, tr.current!, r.blob);
        setPhase('idle');
        return session;
      } catch (e) {
        cap.current = null;
        setError(`Błąd analizy: ${(e as Error).message}`);
        setPhase('error');
        return null;
      }
    })();
    return stopping.current;
  }, []);

  const cancel = useCallback(async () => {
    const c = cap.current;
    cap.current = null;
    await c?.cancel();
    setPhase('idle');
    setStats(null);
  }, []);

  // Device unplugged / changed during recording (12.4).
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const onChange = () => {
      if (cap.current) setDeviceWarning('Zmieniono urządzenie audio w trakcie nagrania. Jeśli mikrofon został odłączony, zatrzymaj i rozpocznij ponownie.');
    };
    md.addEventListener('devicechange', onChange);
    return () => md.removeEventListener('devicechange', onChange);
  }, []);

  useEffect(() => () => { void cap.current?.cancel(); }, []);

  const getDb = useCallback(() => cap.current?.live.db ?? null, []);
  const getSpeaking = useCallback(() => cap.current?.live.vad.speaking ?? false, []);

  return { phase, stats, captions, error, deviceWarning, start, stop, cancel, getDb, getSpeaking, autoStop, captureRef: cap };
}
