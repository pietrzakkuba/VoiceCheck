import { useState } from 'react';
import { Link } from 'react-router';
import { Trash2, Wind } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MODE_LABELS } from '@/lib/labels';
import { formatMs } from '@/lib/utils';
import { deleteSession } from '@/store/db';
import type { TrainingSession } from '@/types';

const PAGE_SIZE = 10;

function rateVariant(s: TrainingSession): 'ok' | 'warn' | 'bad' | 'info' {
  const r = s.metrics.articulationRate;
  const [lo, hi] = s.settings.targetArticulationRate;
  if (r > hi + 1) return 'bad';
  if (r > hi) return 'warn';
  if (r < lo - 1) return 'info';
  return 'ok';
}

export function SessionList({ sessions, titles, variant = 'default' }: {
  sessions: TrainingSession[];
  titles: ReadonlyMap<string, string>;
  variant?: 'default' | 'rehearsals';
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  if (page !== currentPage) setPage(currentPage);
  const visible = sessions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-3">
      <ul className="divide-y">
        {visible.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <Link to={`/session/${s.id}`} className="min-w-0 flex-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 hover:bg-accent rounded px-2 -mx-2">
              <div className="min-w-0">
                <div className="font-medium">
                  {variant === 'rehearsals' ? (
                    <time dateTime={new Date(s.timestamp).toISOString()}>{new Date(s.timestamp).toLocaleString('pl-PL')}</time>
                  ) : (
                    <>{MODE_LABELS[s.mode]}{s.presentationId && titles.has(s.presentationId) ? `: ${titles.get(s.presentationId)}` : ''}</>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {variant === 'rehearsals' ? 'Czas trwania: ' : `${new Date(s.timestamp).toLocaleString('pl-PL')} · `}{formatMs(s.durationSeconds * 1000)}
                  {variant === 'default' && s.targetText && s.mode !== 'calibration' && !(s.presentationId && titles.has(s.presentationId))
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
            <ConfirmDialog
              title="Usunąć sesję?"
              description="Ta sesja i jej nagranie zostaną usunięte. Tej operacji nie można cofnąć."
              confirmLabel="Usuń sesję"
              errorMessage="Nie udało się usunąć sesji. Spróbuj ponownie."
              destructive
              onConfirm={() => deleteSession(s.id)}
            >
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={`Usuń sesję: ${MODE_LABELS[s.mode]}, ${new Date(s.timestamp).toLocaleString('pl-PL')}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </ConfirmDialog>
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <nav aria-label="Stronicowanie historii sesji" className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
            Poprzednia
          </Button>
          <span className="text-sm text-muted-foreground" aria-live="polite">Strona {currentPage} z {pageCount}</span>
          <Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>
            Następna
          </Button>
        </nav>
      )}
    </div>
  );
}
