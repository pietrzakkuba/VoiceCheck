import { Link } from 'react-router';
import { Wind } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MODE_LABELS } from '@/lib/labels';
import { formatMs } from '@/lib/utils';
import type { TrainingSession } from '@/types';

function rateVariant(s: TrainingSession): 'ok' | 'warn' | 'bad' | 'info' {
  const r = s.metrics.articulationRate;
  const [lo, hi] = s.settings.targetArticulationRate;
  if (r > hi + 1) return 'bad';
  if (r > hi) return 'warn';
  if (r < lo - 1) return 'info';
  return 'ok';
}

export function SessionList({ sessions, titles }: { sessions: TrainingSession[]; titles: ReadonlyMap<string, string> }) {
  return (
    <ul className="divide-y">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link to={`/session/${s.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-accent rounded px-2 -mx-2">
            <div className="min-w-0">
              <div className="font-medium">
                {MODE_LABELS[s.mode]}{s.presentationId && titles.has(s.presentationId) ? `: ${titles.get(s.presentationId)}` : ''}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {new Date(s.timestamp).toLocaleString('pl-PL')} · {formatMs(s.durationSeconds * 1000)}
                {s.targetText && s.mode !== 'calibration' && !(s.presentationId && titles.has(s.presentationId))
                  ? ` · ${s.targetText.slice(0, 60)}${s.targetText.length > 60 ? '…' : ''}` : ''}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {s.metrics.overLimitPhrases > 0 && (
                <Badge variant="warn" title="Fragmenty za długo bez oddechu"><Wind className="size-3" aria-hidden /> {s.metrics.overLimitPhrases}</Badge>
              )}
              {s.metrics.syllables > 0 && (
                <Badge variant={rateVariant(s)}>{s.metrics.articulationRate.toFixed(1).replace('.', ',')} syl/s</Badge>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
