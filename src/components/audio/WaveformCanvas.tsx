import { useEffect, useRef } from 'react';

/** Scrolling intensity envelope of the last `windowMs` (live). Reads data through a ref callback – no React re-renders. */
export function WaveformCanvas({ getDb, getSpeaking, windowMs = 8000, height = 72 }: {
  getDb: () => ArrayLike<number> | null;
  getSpeaking?: () => boolean;
  windowMs?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(height * dpr);
      }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, height);
      const db = getDb();
      if (!db) return;
      const n = Math.round(windowMs / 10);
      const start = Math.max(0, db.length - n);
      const styles = getComputedStyle(c);
      g.fillStyle = getSpeaking?.() ? styles.getPropertyValue('--primary') : styles.getPropertyValue('--muted-foreground');
      const mid = height / 2;
      const step = w / n;
      for (let i = start; i < db.length; i++) {
        const v = Math.max(0, Math.min(1, (db[i] + 70) / 65));
        const h = Math.max(1, v * (height - 4));
        g.fillRect((i - start + (n - (db.length - start))) * step, mid - h / 2, Math.max(1, step), h);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getDb, getSpeaking, windowMs, height]);
  return <canvas ref={ref} className="w-full rounded-md bg-muted/50" style={{ height }} aria-hidden />;
}
