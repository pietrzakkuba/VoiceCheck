import type { Scores } from '@/types';
import { SCORE_LABELS, scoreColor } from '@/lib/labels';
import { cn } from '@/lib/utils';

const BG = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad' } as const;

export function ScoreRing({ value, label, muted, size = 132 }: { value: number; label: string; muted?: boolean; size?: number }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const color = muted ? 'var(--color-muted-foreground)' : `var(--color-${scoreColor(v)})`;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(v)} na 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={10} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums">{muted ? '–' : Math.round(v)}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

export function ScoreBars({ scores, pending }: { scores: Scores; pending?: boolean }) {
  return (
    <div className="space-y-2.5">
      {(Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[]).map((k) => {
        const v = Math.round(scores[k]);
        const na = pending && k === 'articulation';
        return (
          <div key={k}>
            <div className="flex justify-between text-sm">
              <span>{SCORE_LABELS[k]}</span>
              <span className="tabular-nums font-medium">{na ? '–' : v}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden>
              <div className={cn('h-full rounded-full', na ? 'bg-muted-foreground/30' : BG[scoreColor(v)])} style={{ width: `${na ? 0 : v}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
