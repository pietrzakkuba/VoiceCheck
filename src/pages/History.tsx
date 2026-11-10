import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { History as HistoryIcon, Loader2 } from 'lucide-react';
import { CalibrationPrompt } from '@/components/CalibrationPrompt';
import { DeleteSessionsButton } from '@/components/DeleteSessionsButton';
import { SessionList } from '@/components/SessionList';
import { Alert } from '@/components/ui/primitives';
import { db, getBaseline } from '@/store/db';

export default function History() {
  const all = useLiveQuery(() => db.sessions.orderBy('timestamp').reverse().toArray(), [], []);
  const presentations = useLiveQuery(() => db.presentations.toArray(), [], []);
  const titles = useMemo(() => new Map(presentations.map((p) => [p.id, p.title])), [presentations]);
  const baseline = useLiveQuery(() => getBaseline(), [], undefined);

  const sessions = useMemo(() => all.filter((s) => s.schema === 2), [all]);
  const migrating = all.length - sessions.length;

  return (
    <div className="space-y-6">
      <CalibrationPrompt />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><HistoryIcon className="size-6 text-primary" aria-hidden /> Historia sesji</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Wszystkie Twoje nagrane próby z wynikami tempa i oddechu – otwórz sesję, by zobaczyć szczegóły i porównać postępy.
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            {sessions.length} sesji{baseline ? ` · kalibracja z ${new Date(baseline.createdAt).toLocaleDateString('pl-PL')}` : ''}
          </p>
        </div>
        <DeleteSessionsButton disabled={all.length === 0} />
      </div>

      {migrating > 0 && (
        <Alert variant="info">
          <Loader2 className="size-4 mt-0.5 animate-spin" aria-hidden /> Przeliczam {migrating} {migrating === 1 ? 'sesję' : 'sesji'} z poprzedniej wersji aplikacji…
        </Alert>
      )}

      <div className="rounded-xl border bg-card p-2">
        {sessions.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">Brak sesji. Dodaj prezentację lub rozpocznij swobodne mówienie, aby nagrać pierwszą próbę.</p>
        ) : (
          <div className="px-2">
            <SessionList sessions={sessions} titles={titles} />
          </div>
        )}
      </div>
    </div>
  );
}
