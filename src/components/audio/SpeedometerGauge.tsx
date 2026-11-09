import { cn } from '@/lib/utils';

const MAX = 8;
const DEFAULT_TARGET: [number, number] = [4.5, 5.5];

function zones([lo, hi]: [number, number]): { from: number; to: number; color: string }[] {
  return [
    { from: 0, to: lo - 1, color: 'var(--info)' },
    { from: lo - 1, to: hi, color: 'var(--ok)' },
    { from: hi, to: hi + 1, color: 'var(--warn)' },
    { from: hi + 1, to: MAX, color: 'var(--bad)' },
  ];
}

/** Live tempo zone relative to the user's target range (same bands as the session report). */
export function rateZone(rate: number | null, [lo, hi]: [number, number] = DEFAULT_TARGET): { label: string; cls: string } {
  if (rate === null) return { label: 'Mów dalej…', cls: 'text-muted-foreground' };
  if (rate < lo - 1) return { label: 'Bardzo wolno', cls: 'text-info' };
  if (rate < lo - 0.5) return { label: 'Spokojnie', cls: 'text-ok' };
  if (rate <= hi) return { label: 'Dobre tempo', cls: 'text-ok' };
  if (rate <= hi + 1) return { label: 'Szybko', cls: 'text-warn' };
  return { label: 'Za szybko!', cls: 'text-bad' };
}

const R = 80;
const CX = 100;
const CY = 95;
const pt = (v: number, r = R) => {
  const a = Math.PI * (1 - Math.min(MAX, Math.max(0, v)) / MAX);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const;
};
const arc = (from: number, to: number) => {
  const [x1, y1] = pt(from);
  const [x2, y2] = pt(to);
  return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
};

/** Live articulation-rate speedometer (4.3). */
export function SpeedometerGauge({ rate, wpm, target, className }: { rate: number | null; wpm: number | null; target?: [number, number]; className?: string }) {
  const z = rateZone(rate, target);
  const [nx, ny] = pt(rate ?? 0, R - 18);
  return (
    <div className={cn('flex flex-col items-center', className)}>
      <svg viewBox="0 0 200 110" className="w-full max-w-64" role="img" aria-label={rate !== null ? `Tempo ${rate.toFixed(1)} sylaby na sekundę` : 'Tempo: za mało danych'}>
        {zones(target ?? DEFAULT_TARGET).map((zn) => (
          <path key={zn.from} d={arc(zn.from, zn.to)} stroke={zn.color} strokeWidth={14} fill="none" opacity={0.85} />
        ))}
        {target && <path d={arc(target[0], target[1])} stroke="var(--foreground)" strokeWidth={3} fill="none" transform="translate(0,0)" opacity={0.5} />}
        {[0, 2, 4, 6, 8].map((v) => {
          const [x, y] = pt(v, R + 12);
          return <text key={v} x={x} y={y} fontSize={9} textAnchor="middle" fill="var(--muted-foreground)">{v}</text>;
        })}
        {rate !== null && (
          <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="var(--foreground)" strokeWidth={3} strokeLinecap="round" style={{ transition: 'all 250ms ease-out' }} />
        )}
        <circle cx={CX} cy={CY} r={5} fill="var(--foreground)" />
      </svg>
      <div className="text-center -mt-1">
        <div className="text-3xl font-semibold tabular-nums">{rate !== null ? rate.toFixed(1) : '–'}<span className="text-sm font-normal text-muted-foreground"> syl/s</span></div>
        <div className={cn('text-sm font-medium', z.cls)}>{z.label}</div>
        <div className="text-xs text-muted-foreground tabular-nums">≈ {wpm !== null ? Math.round(wpm) : '–'} słów/min</div>
      </div>
    </div>
  );
}
