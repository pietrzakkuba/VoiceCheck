import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/store/db';

/** Loads the session recording and plays analysis-time ranges (applies the measured audio offset). */
export function useSessionAudio(audioKey: string | undefined, offsetMs = 0) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopAt = useRef<number | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);

  useEffect(() => {
    if (!audioKey) return;
    let url: string | null = null;
    let cancelled = false;
    void db.audio.get(audioKey).then((rec) => {
      if (cancelled) return;
      if (!rec) { setAvailable(false); return; }
      url = URL.createObjectURL(rec.blob);
      const a = new Audio(url);
      a.preload = 'auto';
      a.onplay = () => setPlaying(true);
      a.onpause = () => setPlaying(false);
      a.onended = () => setPlaying(false);
      audio.current = a;
      setAvailable(true);
    });
    return () => {
      cancelled = true;
      audio.current?.pause();
      audio.current = null;
      if (url) URL.revokeObjectURL(url);
    };
  }, [audioKey]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const a = audio.current;
      if (a) {
        const t = a.currentTime * 1000 - offsetMs;
        setTimeMs(t);
        if (stopAt.current !== null && t >= stopAt.current) {
          a.pause();
          stopAt.current = null;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, offsetMs]);

  const playRange = useCallback((startMs: number, endMs?: number) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = Math.max(0, (startMs + offsetMs) / 1000);
    stopAt.current = endMs ?? null;
    void a.play();
  }, [offsetMs]);

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { stopAt.current = null; void a.play(); } else a.pause();
  }, []);

  const seek = useCallback((ms: number) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = Math.max(0, (ms + offsetMs) / 1000);
    setTimeMs(ms);
  }, [offsetMs]);

  return { available, playing, timeMs, playRange, toggle, seek };
}

export type SessionAudio = ReturnType<typeof useSessionAudio>;
