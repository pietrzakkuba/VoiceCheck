import { Wind } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

/** Continuous speech run vs. breath limit (4.2). */
export function BreathBar({ runMs, maxMs, state, className, inactiveLabel }: { runMs: number; maxMs: number; state: 'ok' | 'warn' | 'critical'; className?: string; inactiveLabel?: string }) {
  const t = useT().audio.breath;
  const seconds = inactiveLabel ? 0 : runMs / 1000;
  const pct = Math.min(100, (seconds / (maxMs / 1000)) * 100);
  const color = state === 'critical' ? 'bg-bad' : state === 'warn' ? 'bg-warn' : 'bg-ok';
  const tone = inactiveLabel ? 'border-border bg-muted/30 text-muted-foreground'
    : state === 'critical' ? 'border-bad bg-bad/10 text-bad'
    : state === 'warn' ? 'border-warn bg-warn/10 text-warn'
    : 'border-ok bg-ok/10 text-ok';
  const label = inactiveLabel ?? (state === 'critical' ? t.critical : state === 'warn' ? t.warn : t.ok);
  return (
    <div className={cn('min-w-0 rounded-lg border-2 p-3 transition-colors duration-300', tone, className)}>
      <div className="flex h-6 items-center gap-2 text-sm font-semibold uppercase tracking-wide">
        <Wind className="size-5 shrink-0" aria-hidden /> {t.title}
      </div>
      <div className="h-12 whitespace-nowrap text-3xl font-bold leading-[3rem] tabular-nums">
        {inactiveLabel ? '–' : seconds.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">/ {(maxMs / 1000).toFixed(0)} s</span>
      </div>
      <div className="my-1 h-4 rounded-full bg-muted overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={maxMs / 1000} aria-valuenow={Math.min(maxMs / 1000, +seconds.toFixed(1))} aria-valuetext={inactiveLabel ?? t.valueText(seconds.toFixed(1), (maxMs / 1000).toFixed(0))} aria-label={t.meter}>
        <div className={cn('h-full transition-[width] duration-100', color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="h-7 truncate text-base font-semibold leading-7" role="status" title={label}>
        {label}
      </p>
    </div>
  );
}
