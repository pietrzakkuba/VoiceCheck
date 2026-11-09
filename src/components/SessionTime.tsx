import { formatDuration } from '@/lib/presentation';

export function SessionTime({ seconds, targetSeconds, compact = false }: { seconds: number; targetSeconds?: number; compact?: boolean }) {
  const elapsed = Math.floor(Math.max(0, seconds));
  const over = targetSeconds !== undefined && seconds > targetSeconds;

  return (
    <div className={compact ? 'flex h-8 items-center justify-between gap-3' : 'space-y-1'}>
      <div className={compact ? 'sr-only' : 'text-xs font-medium uppercase tracking-wide text-muted-foreground'}>Czas sesji</div>
      <div role="timer" aria-label="Czas sesji" className={`${compact ? 'shrink-0 whitespace-nowrap text-lg' : 'text-2xl'} font-semibold tabular-nums ${over ? 'text-bad' : 'text-foreground'}`}>
        {formatDuration(elapsed)}
        {targetSeconds !== undefined && <span className="text-sm font-normal text-muted-foreground"> / {formatDuration(targetSeconds)}</span>}
      </div>
      {targetSeconds !== undefined && (
        <div className={`text-sm tabular-nums ${compact ? 'truncate' : ''} ${over ? 'text-bad' : 'text-muted-foreground'}`}>
          {over
            ? `Przekroczono o ${formatDuration(Math.floor(seconds - targetSeconds))}`
            : `Pozostało ${formatDuration(Math.ceil(targetSeconds - seconds))}`}
        </div>
      )}
      <div className={compact ? 'sr-only' : 'text-xs text-muted-foreground'}>Łącznie z pauzami i kalibracją mikrofonu</div>
    </div>
  );
}
