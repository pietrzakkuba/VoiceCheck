import { formatDuration } from '@/lib/presentation';

export function SessionTime({ seconds, compact = false }: { seconds: number; compact?: boolean }) {
  const elapsed = Math.floor(Math.max(0, seconds));

  return (
    <div className={compact ? 'flex h-8 items-center justify-between gap-3' : 'space-y-1'}>
      <div className={compact ? 'sr-only' : 'text-xs font-medium uppercase tracking-wide text-muted-foreground'}>Czas sesji</div>
      <div role="timer" aria-label="Czas sesji" className={`${compact ? 'shrink-0 whitespace-nowrap text-lg' : 'text-2xl'} font-semibold tabular-nums text-foreground`}>
        {formatDuration(elapsed)}
      </div>
      <div className={compact ? 'sr-only' : 'text-xs text-muted-foreground'}>Łącznie z pauzami i kalibracją mikrofonu</div>
    </div>
  );
}
