import { Wind } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Continuous speech run vs. breath limit (4.2). */
export function BreathBar({ runMs, maxMs, state }: { runMs: number; maxMs: number; state: 'ok' | 'warn' | 'critical' }) {
  const pct = Math.min(100, (runMs / maxMs) * 100);
  const color = state === 'critical' ? 'bg-bad' : state === 'warn' ? 'bg-warn' : 'bg-ok';
  return (
    <div className={cn('rounded-lg border p-3', state === 'critical' && 'cv-pulse-red border-bad')}>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="flex items-center gap-1.5 font-medium"><Wind className="size-4" aria-hidden /> Oddech</span>
        <span className="tabular-nums text-muted-foreground">{(runMs / 1000).toFixed(1)} / {(maxMs / 1000).toFixed(0)} s</span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={maxMs / 1000} aria-valuenow={+(runMs / 1000).toFixed(1)} aria-label="Czas mówienia bez pauzy">
        <div className={cn('h-full transition-[width] duration-100', color)} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn('text-xs mt-1.5 min-h-4', state === 'critical' ? 'text-bad font-semibold' : state === 'warn' ? 'text-warn' : 'text-muted-foreground')} aria-live="polite">
        {state === 'critical' ? '⛔ Zatrzymaj się i weź oddech!' : state === 'warn' ? '⚠ Zbliżasz się do limitu tchu – zaplanuj kropkę' : 'Pauza ≥ 0,35 s resetuje licznik'}
      </p>
    </div>
  );
}
