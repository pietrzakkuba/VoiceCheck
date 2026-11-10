import { formatDuration } from '@/lib/presentation';
import { useT } from '@/i18n';

export function SessionTime({ seconds, compact = false }: { seconds: number; compact?: boolean }) {
  const t = useT().audio.sessionTime;
  const elapsed = Math.floor(Math.max(0, seconds));

  return (
    <div className={compact ? 'flex h-8 items-center justify-between gap-3' : 'space-y-1'}>
      <div className={compact ? 'sr-only' : 'text-xs font-medium uppercase tracking-wide text-muted-foreground'}>{t.label}</div>
      <div role="timer" aria-label={t.label} className={`${compact ? 'shrink-0 whitespace-nowrap text-lg' : 'text-2xl'} font-semibold tabular-nums text-foreground`}>
        {formatDuration(elapsed)}
      </div>
      <div className={compact ? 'sr-only' : 'text-xs text-muted-foreground'}>{t.hint}</div>
    </div>
  );
}
