import { useMemo } from 'react';
import type { Phrase, PhraseTempo, TrainingSession } from '@/types';
import { T } from '@/engine/thresholds';

const PX_PER_S = 60;
const WAVE_Y = 8;
const WAVE_H = 64;
const BREATH_Y = 82;
const BREATH_H = 14;
const TEMPO_Y = 108;
const TEMPO_H = 70;
const MAX_RATE = 8;
const H = TEMPO_Y + TEMPO_H + 26;

export const TEMPO_COLOR: Record<PhraseTempo, string> = {
  short: 'var(--color-muted-foreground)',
  slow: 'var(--color-info)',
  ok: 'var(--color-ok)',
  fast: 'var(--color-warn)',
  too_fast: 'var(--color-bad)',
};

export function breathColor(p: Phrase, maxMs: number): string {
  const len = p.endMs - p.startMs;
  if (len > maxMs) return 'var(--color-bad)';
  if (len >= maxMs * T.breathWarnRatio) return 'var(--color-warn)';
  return 'var(--color-ok)';
}

/** Waveform + breath lane (phrases between breaths) + per-phrase tempo with the target band. Click to seek. */
export function Timeline({ session, currentMs, onSeek, onSelectPhrase }: {
  session: TrainingSession;
  currentMs: number;
  onSeek: (ms: number) => void;
  onSelectPhrase: (i: number) => void;
}) {
  const durMs = Math.max(1, session.durationSeconds * 1000);
  const W = Math.max(640, (durMs / 1000) * PX_PER_S);
  const x = (ms: number) => (ms / durMs) * W;
  const rateY = (r: number) => TEMPO_Y + TEMPO_H - (Math.min(MAX_RATE, Math.max(0, r)) / MAX_RATE) * TEMPO_H;
  const tr = session.tracks;
  const [lo, hi] = session.settings.targetArticulationRate;
  const maxMs = session.settings.maxContinuousSpeechSeconds * 1000;

  const wave = useMemo(() => {
    const wf = tr.waveform;
    const peak = Math.max(1e-4, ...wf);
    const step = durMs / Math.max(1, wf.length);
    let d = '';
    for (let i = 0; i < wf.length; i++) {
      const h = (wf[i] / peak) * (WAVE_H / 2);
      const xx = ((i * step) / durMs) * W;
      d += `M${xx.toFixed(1)},${(WAVE_Y + WAVE_H / 2 - h).toFixed(1)}V${(WAVE_Y + WAVE_H / 2 + h).toFixed(1)}`;
    }
    return d;
  }, [tr, durMs, W]);

  const ticks: number[] = [];
  const tickEvery = durMs > 60000 ? 5000 : durMs > 20000 ? 2000 : 1000;
  for (let t = 0; t <= durMs; t += tickEvery) ticks.push(t);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border bg-card">
        <svg
          width={W}
          height={H}
          role="img"
          aria-label="Oś czasu nagrania: przebieg, frazy między oddechami i tempo każdej frazy"
          className="block cursor-pointer select-none"
          onClick={(e) => onSeek((e.nativeEvent.offsetX / W) * durMs)}
        >
          {tr.speechSegments.map((s, i) => (
            <rect key={`s${i}`} x={x(s.startMs)} y={WAVE_Y} width={Math.max(1, x(s.endMs) - x(s.startMs))} height={WAVE_H} fill="var(--color-primary)" opacity={0.07} />
          ))}
          <path d={wave} stroke="var(--color-foreground)" strokeOpacity={0.55} strokeWidth={1} />

          {session.pauses.map((p, i) => (
            <g key={`p${i}`}>
              <rect x={x(p.startMs)} y={BREATH_Y} width={Math.max(2, x(p.endMs) - x(p.startMs))} height={BREATH_H} rx={2} fill="var(--color-info)" opacity={p.kind === 'long' ? 0.35 : 0.8}>
                <title>{`${p.kind === 'long' ? 'Długa pauza' : 'Oddech'} ${((p.endMs - p.startMs) / 1000).toFixed(1)} s`}</title>
              </rect>
            </g>
          ))}
          {session.phrases.map((p, i) => (
            <rect
              key={`b${i}`}
              x={x(p.startMs)}
              y={BREATH_Y}
              width={Math.max(2, x(p.endMs) - x(p.startMs))}
              height={BREATH_H}
              rx={2}
              fill={breathColor(p, maxMs)}
              opacity={0.75}
              onClick={(e) => { e.stopPropagation(); onSelectPhrase(i); }}
            >
              <title>{`Fraza ${i + 1}: ${((p.endMs - p.startMs) / 1000).toFixed(1)} s bez oddechu${p.overLimit ? ' — za długo!' : ''}`}</title>
            </rect>
          ))}

          <rect x={0} y={rateY(hi)} width={W} height={rateY(lo) - rateY(hi)} fill="var(--color-ok)" opacity={0.1} />
          <line x1={0} x2={W} y1={rateY(hi)} y2={rateY(hi)} stroke="var(--color-ok)" strokeDasharray="4 4" opacity={0.6} />
          <line x1={0} x2={W} y1={rateY(lo)} y2={rateY(lo)} stroke="var(--color-ok)" strokeDasharray="4 4" opacity={0.6} />
          {session.phrases.map((p, i) => (
            <g key={`r${i}`} onClick={(e) => { e.stopPropagation(); onSelectPhrase(i); }}>
              <line
                x1={x(p.startMs)}
                x2={Math.max(x(p.startMs) + 3, x(p.endMs))}
                y1={rateY(p.rate)}
                y2={rateY(p.rate)}
                stroke={TEMPO_COLOR[p.tempo]}
                strokeWidth={5}
                strokeLinecap="round"
                strokeDasharray={p.tempo === 'short' ? '3 4' : undefined}
              >
                <title>{`Fraza ${i + 1}: ${p.rate.toFixed(1)} syl/s${p.tempo === 'short' ? ' (za krótka do pewnego pomiaru)' : ''}`}</title>
              </line>
              {p.tempo !== 'short' && x(p.endMs) - x(p.startMs) > 34 && (
                <text x={x(p.startMs)} y={rateY(p.rate) - 6} fontSize={10} fill="var(--color-muted-foreground)">{p.rate.toFixed(1)}</text>
              )}
            </g>
          ))}
          {[2, 4, 6].map((v) => (
            <text key={`y${v}`} x={2} y={rateY(v) + 3} fontSize={9} fill="var(--color-muted-foreground)" opacity={0.7}>{v}</text>
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
        <span><span className="inline-block w-3 h-1.5 rounded bg-ok mr-1" />fraza w limicie oddechu</span>
        <span><span className="inline-block w-3 h-1.5 rounded bg-warn mr-1" />blisko limitu</span>
        <span><span className="inline-block w-3 h-1.5 rounded bg-bad mr-1" />za długo bez oddechu / za szybko</span>
        <span><span className="inline-block w-3 h-1.5 rounded bg-info mr-1" />oddech (pauza)</span>
        <span><span className="inline-block w-3 h-1.5 rounded bg-ok/20 mr-1" />docelowe tempo {lo}–{hi} syl/s</span>
      </div>
    </div>
  );
}
