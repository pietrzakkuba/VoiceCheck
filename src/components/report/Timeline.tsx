import { useMemo } from 'react';
import type { TrainingSession } from '@/types';

const PX_PER_S = 70;
const H = 210;
const WAVE_Y = 28;
const WAVE_H = 80;
const LINE_Y = 122;
const LINE_H = 60;

const pauseColor = { normal: 'var(--color-muted-foreground)', breath: 'var(--color-info)', long: 'var(--color-bad)', hesitation: 'var(--color-warn)' } as const;

function path(values: number[], toX: (i: number) => number, toY: (v: number) => number | null) {
  let d = '';
  let pen = false;
  for (let i = 0; i < values.length; i++) {
    const y = toY(values[i]);
    if (y === null) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${toX(i).toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** Waveform + IPUs + pauses + F0 / intensity + flag markers (7.2). Click to seek. */
export function Timeline({ session, currentMs, onSeek, onSelectWord }: {
  session: TrainingSession;
  currentMs: number;
  onSeek: (ms: number) => void;
  onSelectWord: (i: number) => void;
}) {
  const durMs = session.durationSeconds * 1000;
  const W = Math.max(640, (durMs / 1000) * PX_PER_S);
  const x = (ms: number) => (ms / durMs) * W;
  const tr = session.tracks;

  const geo = useMemo(() => {
    if (!tr) return null;
    const wf = tr.waveform;
    const peak = Math.max(1e-4, ...wf);
    const wfStep = durMs / Math.max(1, wf.length);
    let wave = '';
    for (let i = 0; i < wf.length; i++) {
      const h = (wf[i] / peak) * (WAVE_H / 2);
      const xx = ((i * wfStep) / durMs) * W;
      wave += `M${xx.toFixed(1)},${(WAVE_Y + WAVE_H / 2 - h).toFixed(1)}V${(WAVE_Y + WAVE_H / 2 + h).toFixed(1)}`;
    }
    // 10 ms frames; decimate to ~one point per 2 px for performance.
    const step = Math.max(1, Math.round((2 / W) * tr.intensityDb.length));
    const dec = (a: number[]) => a.filter((_, i) => i % step === 0);
    const inten = dec(tr.intensityDb);
    const f0 = dec(tr.f0Hz);
    const fx = (i: number) => ((i * step * 10) / durMs) * W;
    const intensity = path(inten, fx, (v) => (v < -70 ? null : LINE_Y + LINE_H - ((Math.max(-60, Math.min(0, v)) + 60) / 60) * LINE_H));
    const lo = Math.log(60), hi = Math.log(400);
    const pitch = path(f0, fx, (v) => (v > 0 ? LINE_Y + LINE_H - ((Math.log(Math.max(60, Math.min(400, v))) - lo) / (hi - lo)) * LINE_H : null));
    return { wave, intensity, pitch };
  }, [tr, durMs, W]);

  const ticks: number[] = [];
  const tickEvery = durMs > 60000 ? 5000 : 1000;
  for (let t = 0; t <= durMs; t += tickEvery) ticks.push(t);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border bg-card">
        <svg
          width={W}
          height={H}
          role="img"
          aria-label="Oś czasu nagrania: przebieg, pauzy, intonacja i oznaczenia"
          className="block cursor-pointer select-none"
          onClick={(e) => onSeek((e.nativeEvent.offsetX / W) * durMs)}
        >
          {tr?.speechSegments.map((s, i) => (
            <rect key={`s${i}`} x={x(s.startMs)} y={WAVE_Y} width={Math.max(1, x(s.endMs) - x(s.startMs))} height={WAVE_H} fill="var(--color-primary)" opacity={0.07} />
          ))}
          {session.pauses.map((p, i) => (
            <rect key={`p${i}`} x={x(p.startMs)} y={WAVE_Y + WAVE_H - 6} width={Math.max(2, x(p.endMs) - x(p.startMs))} height={6} rx={2} fill={pauseColor[p.kind]} opacity={p.kind === 'normal' ? 0.35 : 0.85}>
              <title>{`Pauza ${((p.endMs - p.startMs) / 1000).toFixed(1)} s${p.kind === 'hesitation' ? ' (wahanie)' : p.kind === 'long' ? ' (długa)' : p.kind === 'breath' ? ' (oddech)' : ''}`}</title>
            </rect>
          ))}
          {geo && <path d={geo.wave} stroke="var(--color-foreground)" strokeOpacity={0.55} strokeWidth={1} />}
          {geo && <path d={geo.intensity} fill="none" stroke="var(--color-info)" strokeWidth={1.2} opacity={0.8} />}
          {geo && <path d={geo.pitch} fill="none" stroke="var(--color-warn)" strokeWidth={1.6} />}
          {session.flags.map((f, i) => (
            <rect
              key={`f${i}`}
              x={x(f.startMs)}
              y={6 + (i % 2) * 8}
              width={Math.max(4, x(f.endMs) - x(f.startMs))}
              height={6}
              rx={2}
              fill={f.severity === 'red' ? 'var(--color-bad)' : 'var(--color-warn)'}
              onClick={(e) => { e.stopPropagation(); if (f.wordIndex !== undefined) onSelectWord(f.wordIndex); else onSeek(f.startMs); }}
            >
              <title>{f.message}</title>
            </rect>
          ))}
          {session.words.filter((w) => w.status !== 'skipped').map((w) => (
            <text key={`w${w.index}`} x={x(w.startMs)} y={LINE_Y - 4} fontSize={10} fill="var(--color-muted-foreground)" onClick={(e) => { e.stopPropagation(); onSelectWord(w.index); }}>
              {w.text}
            </text>
          ))}
          {ticks.map((t) => (
            <g key={`t${t}`}>
              <line x1={x(t)} x2={x(t)} y1={H - 18} y2={H - 12} stroke="var(--color-border)" />
              <text x={x(t) + 2} y={H - 3} fontSize={10} fill="var(--color-muted-foreground)">{Math.round(t / 1000)} s</text>
            </g>
          ))}
          <line x1={x(currentMs)} x2={x(currentMs)} y1={0} y2={H - 18} stroke="var(--color-primary)" strokeWidth={2} />
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span><span className="inline-block w-3 h-1.5 rounded bg-primary/30 mr-1" />mowa (IPU)</span>
        <span><span className="inline-block w-3 h-1.5 rounded bg-info mr-1" />oddech</span>
        <span><span className="inline-block w-3 h-1.5 rounded bg-warn mr-1" />wahanie / intonacja (F0)</span>
        <span><span className="inline-block w-3 h-1.5 rounded bg-bad mr-1" />długa pauza / błąd</span>
        <span><span className="inline-block w-3 h-0.5 bg-info mr-1 align-middle" />głośność</span>
      </div>
    </div>
  );
}
