import { cn } from '@/lib/utils';

const MAX = 8;
const ZONES: { from: number; to: number; color: string }[] = [
  { from: 0, to: 3.5, color: 'var(--info)' },
  { from: 3.5, to: 5.5, color: 'var(--ok)' },
  { from: 5.5, to: 6.5, color: 'var(--warn)' },
  { from: 6.5, to: MAX, color: 'var(--bad)' },
];

export function rateZone(rate: number | null): { label: string; cls: string } {
  if (rate === null) return { label: 'Mów dalej…', cls: 'text-muted-foreground' };
  if (rate < 3.5) return { label: 'Bardzo wolno', cls: 'text-info' };
  if (rate < 4) return { label: 'Spokojnie', cls: 'text-ok' };
  if (rate <= 5.5) return { label: 'Dobre tempo', cls: 'text-ok' };
  if (rate <= 6.5) return { label: 'Szybko', cls: 'text-warn' };
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
  const z = rateZone(rate);
  const [nx, ny] = pt(rate ?? 0, R - 18);
  return (
    <div className={cn('flex flex-col items-center', className)}>
      <svg viewBox="0 0 200 110" className="w-full max-w-64" role="img" aria-label={rate !== null ? `Tempo ${rate.toFixed(1)} sylaby na sekundę` : 'Tempo: za mało danych'}>
        {ZONES.map((zn) => (
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
