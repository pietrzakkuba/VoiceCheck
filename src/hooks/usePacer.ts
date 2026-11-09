import { useEffect, useState, type RefObject } from 'react';
import type { PacerInfo } from '@/types';
import type { MicCapture } from '@/audio/capture';

/** Current pacer position from the recording clock (sample count – same time base as analysis). */
export function usePacerPosition(pacer: PacerInfo | null, capRef: RefObject<MicCapture | null>, running: boolean, onFinished?: () => void) {
  const [pos, setPos] = useState({ active: -1, done: -1, countdown: 0, breathe: false, finished: false });
  useEffect(() => {
    if (!running || !pacer) {
      setPos({ active: -1, done: -1, countdown: 0, breathe: false, finished: false });
      return;
    }
    let raf = 0;
    let fired = false;
    const sched = pacer.schedule;
    const firstStart = sched[0]?.startMs ?? 0;
    const lastEnd = sched[sched.length - 1]?.endMs ?? 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = capRef.current?.durationMs ?? 0;
      let active = -1;
      let done = -1;
      for (let i = 0; i < sched.length; i++) {
        if (t >= sched[i].endMs) done = sched[i].wordIndex;
        if (t >= sched[i].startMs && t < sched[i].endMs) active = sched[i].wordIndex;
      }
      const countdown = t >= pacer.startMs && t < firstStart ? Math.ceil((firstStart - t) / 1000) : 0;
      const breathe = active === -1 && done >= 0 && t < lastEnd;
      const finished = t >= lastEnd + 1500;
      setPos((p) => (p.active === active && p.done === done && p.countdown === countdown && p.breathe === breathe && p.finished === finished ? p : { active, done, countdown, breathe, finished }));
      if (finished && !fired) {
        fired = true;
        onFinished?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pacer, capRef, running, onFinished]);
  return pos;
}
