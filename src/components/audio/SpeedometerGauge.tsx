import { cn } from '@/lib/utils';
import { getT, useT } from '@/i18n';

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

export type RateZoneKey = 'none' | 'very_slow' | 'calm' | 'ok' | 'fast' | 'too_fast';

const ZONE_ORDER: RateZoneKey[] = ['very_slow', 'calm', 'ok', 'fast', 'too_fast'];
const ZONE_CLS: Record<RateZoneKey, string> = {
  none: 'text-muted-foreground',
  very_slow: 'text-info',
  calm: 'text-ok',
  ok: 'text-ok',
  fast: 'text-warn',
  too_fast: 'text-bad',
};

const zoneInfo = (key: RateZoneKey) => ({ key, label: getT().audio.zones[key], cls: ZONE_CLS[key] });

function zoneKey(rate: number, [lo, hi]: [number, number]): RateZoneKey {
  if (rate < lo - 1) return 'very_slow';
  if (rate < lo - 0.5) return 'calm';
  if (rate <= hi) return 'ok';
  if (rate <= hi + 1) return 'fast';
  return 'too_fast';
}

/**
 * Live tempo zone relative to the user's target range (same bands as the session report).
 * With `prev`, the zone changes only once the rate crosses the boundary by `hysteresis` (no flicker at the edges).
 */
export function rateZone(
  rate: number | null,
  target: [number, number] = DEFAULT_TARGET,
  prev?: RateZoneKey,
  hysteresis = 0,
): { key: RateZoneKey; label: string; cls: string } {
  if (rate === null) return zoneInfo('none');
  let key = zoneKey(rate, target);
  if (prev && prev !== 'none' && prev !== key && hysteresis > 0) {
    const up = ZONE_ORDER.indexOf(key) > ZONE_ORDER.indexOf(prev);
    const nudged = zoneKey(up ? rate - hysteresis : rate + hysteresis, target);
    if (nudged === prev) key = prev;
  }
  return zoneInfo(key);
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
  const t = useT().audio;
  const z = rateZone(rate, target);
  const [nx, ny] = pt(rate ?? 0, R - 18);
  return (
    <div className={cn('flex flex-col items-center', className)}>
      <svg viewBox="0 0 200 110" className="w-full max-w-64" role="img" aria-label={rate !== null ? t.gauge.label(rate.toFixed(1)) : t.gauge.noData}>
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
        <div className="text-xs text-muted-foreground tabular-nums">{t.gauge.wpm(wpm !== null ? String(Math.round(wpm)) : '–')}</div>
      </div>
    </div>
  );
}
