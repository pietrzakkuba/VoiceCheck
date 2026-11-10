import { useRef } from 'react';
import { Gauge } from 'lucide-react';
import type { LiveStats } from '@/audio/liveAnalyzer';
import type { SessionPhase } from '@/hooks/useTrainingSession';
import { rateZone, type RateZoneKey } from '@/components/audio/SpeedometerGauge';
import { BreathBar } from '@/components/audio/BreathBar';
import { SessionTime } from '@/components/SessionTime';
import { T } from '@/engine/thresholds';
import { cn } from '@/lib/utils';

/** Live pace + breath state derived from the current recording phase and stats. Pass `prevZone` for hysteresis. */
export function liveIndicators(phase: SessionPhase, stats: LiveStats | null, target: [number, number], prevZone?: RateZoneKey) {
  const live = phase === 'recording' && !stats?.calibrating;
  const rate = live ? stats?.syllableRate ?? null : null;
  const pace = rateZone(rate, target, prevZone, T.liveZoneHysteresis);
  const breathState = live ? stats?.breathState ?? 'ok' : 'ok';
  const frameColor = breathState === 'critical' || pace.cls === 'text-bad' ? 'text-bad'
    : breathState === 'warn' ? 'text-warn'
    : pace.cls;
  return { rate, pace, frameColor };
}

/** `liveIndicators` with a sticky tempo zone, so the label does not flicker at zone boundaries. */
export function useLiveIndicators(phase: SessionPhase, stats: LiveStats | null, target: [number, number]) {
  const prev = useRef<RateZoneKey>('none');
  const out = liveIndicators(phase, stats, target, prev.current);
  prev.current = out.pace.key;
  return out;
}

/** Pace panel, breath bar and session timer shown during a recording. */
export function LivePacePanel({ phase, stats, target, maxBreathSeconds }: {
  phase: SessionPhase;
  stats: LiveStats | null;
  target: [number, number];
  maxBreathSeconds: number;
}) {
  const { rate, pace } = useLiveIndicators(phase, stats, target);
  const breathInactiveLabel = phase === 'starting' ? 'Uruchamianie…'
    : phase === 'processing' ? 'Analizowanie…'
    : stats?.calibrating ? 'Kalibracja…'
    : !stats ? 'Oczekiwanie…'
    : undefined;
  const paceLabel = phase === 'starting' ? 'Uruchamiam mikrofon…'
    : phase === 'processing' ? 'Analizuję nagranie…'
    : stats?.calibrating ? 'Zachowaj ciszę – kalibracja'
    : rate === null ? 'Czytaj – mierzę tempo…'
    : pace.label;

  return (
    <div className="grid w-full grid-cols-2 gap-3">
      <div className={cn('min-w-0 rounded-lg border-2 border-current bg-current/10 p-3 transition-colors duration-300', pace.cls)}>
        <div className="flex h-6 items-center gap-2 text-sm font-semibold uppercase tracking-wide">
          <Gauge className="size-5 shrink-0" aria-hidden /> <span className="truncate">Tempo czytania</span>
        </div>
        <div className="h-12 whitespace-nowrap text-4xl font-bold leading-[3rem] tabular-nums sm:text-5xl">
          {rate !== null ? rate.toFixed(1) : '–'} <span className="text-sm font-normal text-muted-foreground">syl/s</span>
        </div>
        <div className="my-1 flex h-4 items-center gap-2" aria-hidden>
          <span className="h-2 w-full rounded-full bg-current" />
        </div>
        <div className="h-7 truncate text-lg font-bold leading-7" title={paceLabel}>
          <span role="status">{paceLabel}</span>
        </div>
      </div>
      <BreathBar
        runMs={stats?.breathRunMs ?? 0}
        maxMs={maxBreathSeconds * 1000}
        state={stats?.breathState ?? 'ok'}
        inactiveLabel={breathInactiveLabel}
      />
      <div className="col-span-2 min-w-0">
        <SessionTime seconds={(stats?.elapsedMs ?? 0) / 1000} compact />
      </div>
    </div>
  );
}
