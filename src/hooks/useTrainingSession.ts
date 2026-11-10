import { useCallback, useEffect, useRef, useState } from 'react';
import { MicCapture, MicError } from '@/audio/capture';
import type { LiveStats } from '@/audio/liveAnalyzer';
import { finalizeRecording, type SessionMeta } from '@/lib/sessionPipeline';
import { playBreathAlert, primeAlertAudio } from '@/lib/alert';
import { calibrationFor, getSettings } from '@/store/settings';
import { getT } from '@/i18n';
import { getBaseline } from '@/store/db';
import type { TrainingSession } from '@/types';

export type SessionPhase = 'idle' | 'starting' | 'recording' | 'processing' | 'error';

export interface StartOptions {
  /** Silent noise-floor calibration at the start (ms); 0 to skip. */
  calibrateMs?: number;
  noiseFloorDb?: number;
}

/** Orchestrates one recording: mic capture → live HUD + breath alert → saved session. */
export function useTrainingSession() {
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceWarning, setDeviceWarning] = useState<string | null>(null);
  const cap = useRef<MicCapture | null>(null);
  const meta = useRef<SessionMeta | null>(null);
  const stopping = useRef<Promise<TrainingSession | null> | null>(null);
  const lastBreath = useRef<LiveStats['breathState']>('ok');

  const onStats = useCallback((s: LiveStats) => {
    if (s.breathState === 'critical' && lastBreath.current !== 'critical' && getSettings().breathAlert) playBreathAlert();
    lastBreath.current = s.breathState;
    setStats(s);
  }, []);

  const start = useCallback(async (m: SessionMeta, o: StartOptions = {}) => {
    if (cap.current) return;
    primeAlertAudio();
    setError(null);
    setDeviceWarning(null);
    setStats(null);
    setPhase('starting');
    meta.current = m;
    stopping.current = null;
    lastBreath.current = 'ok';
    const s = getSettings();
    const calibration = calibrationFor(m.language, s);
    try {
      const capture = await MicCapture.start({
        deviceId: s.micDeviceId ?? undefined,
        calibrateMs: o.calibrateMs ?? 2000,
        noiseFloorDb: o.noiseFloorDb,
        correction: calibration.liveSyllableCorrection,
        syllablesPerWord: calibration.syllablesPerWord,
        maxContinuousMs: s.maxContinuousSpeechSeconds * 1000,
        onStats,
      });
      cap.current = capture;
      setPhase('recording');
      const baseline = await getBaseline(m.language);
      if (baseline && baseline.deviceLabel && capture.deviceLabel && baseline.deviceLabel !== capture.deviceLabel) {
        setDeviceWarning(getT().audio.session.otherMicrophone(capture.deviceLabel, baseline.deviceLabel));
      }
    } catch (e) {
      cap.current = null;
      setError(e instanceof MicError ? e.message : getT().audio.session.startFailed((e as Error).message));
      setPhase('error');
    }
  }, [onStats]);

  const stop = useCallback(async (): Promise<TrainingSession | null> => {
    if (stopping.current) return stopping.current;
    const c = cap.current;
    if (!c || !meta.current) return null;
    stopping.current = (async () => {
      setPhase('processing');
      try {
        const r = await c.stop();
        cap.current = null;
        if (r.durationMs < 1000 || !r.speech.length) {
          setError(getT().audio.session.noSpeech);
          setPhase('error');
          return null;
        }
        const session = await finalizeRecording(meta.current!, r);
        setPhase('idle');
        return session;
      } catch (e) {
        cap.current = null;
        setError(getT().audio.session.analysisFailed((e as Error).message));
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

  // Device unplugged / changed during recording.
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const onChange = () => {
      if (cap.current) setDeviceWarning(getT().audio.session.deviceChanged);
    };
    md.addEventListener('devicechange', onChange);
    return () => md.removeEventListener('devicechange', onChange);
  }, []);

  useEffect(() => () => { void cap.current?.cancel(); }, []);

  const getDb = useCallback(() => cap.current?.live.db ?? null, []);
  const getSpeaking = useCallback(() => cap.current?.live.vad.speaking ?? false, []);

  return { phase, stats, error, deviceWarning, start, stop, cancel, getDb, getSpeaking, captureRef: cap };
}
