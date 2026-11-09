import { useMemo } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Crosshair, History, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SessionList } from '@/components/SessionList';
import { PresentationList } from '@/components/PresentationList';
import { Alert } from '@/components/ui/primitives';
import { db, getBaseline } from '@/store/db';
import { useSettings } from '@/store/settings';

export default function Dashboard() {
  const all = useLiveQuery(() => db.sessions.orderBy('timestamp').reverse().toArray(), [], []);
  const presentations = useLiveQuery(() => db.presentations.toArray(), [], []);
  const titles = useMemo(() => new Map(presentations.map((p) => [p.id, p.title])), [presentations]);
  const baseline = useLiveQuery(() => getBaseline(), [], undefined);
  const { onboardingDismissed, set } = useSettings();

  const sessions = useMemo(() => all.filter((s) => s.schema === 2), [all]);
  const migrating = all.length - sessions.length;

  const showOnboarding = baseline === null && !onboardingDismissed;

  return (
    <div className="space-y-10">
      {showOnboarding && (
        <Alert variant="info">
          <Crosshair className="size-4 mt-0.5" aria-hidden />
          <div className="flex-1">
            <p className="font-medium">Zacznij od kalibracji</p>
            <p className="text-sm">Minuta czytania pozwoli dokładniej mierzyć tempo Twojej mowy na Twoim mikrofonie.</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" asChild><Link to="/calibration">Przejdź do kalibracji</Link></Button>
              <Button size="sm" variant="ghost" onClick={() => set({ onboardingDismissed: true })}>Później</Button>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => set({ onboardingDismissed: true })} aria-label="Zamknij"><X className="size-4" /></Button>
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pulpit</h1>
          <p className="text-sm text-muted-foreground">
            Mierz tempo mówienia i pamiętaj o oddechu. Wszystko działa lokalnie – nagrania nie opuszczają Twojego komputera.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/calibration"><Crosshair className="size-4" aria-hidden /> Kalibracja</Link>
        </Button>
      </div>

      <PresentationList />

      {migrating > 0 && (
        <Alert variant="info">
          <Loader2 className="size-4 mt-0.5 animate-spin" aria-hidden /> Przeliczam {migrating} {migrating === 1 ? 'sesję' : 'sesji'} z poprzedniej wersji aplikacji…
        </Alert>
      )}

      <section className="space-y-5" aria-labelledby="history-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="history-heading" className="text-xl font-semibold flex items-center gap-2"><History className="size-6 text-primary" aria-hidden /> Historia sesji</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Wszystkie Twoje nagrane próby z wynikami tempa i oddechu – otwórz sesję, by zobaczyć szczegóły i porównać postępy.
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              {sessions.length} sesji{baseline ? ` · kalibracja z ${new Date(baseline.createdAt).toLocaleDateString('pl-PL')}` : ''}
            </p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-2">
          {sessions.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">Brak sesji. Dodaj prezentację i nagraj pierwszą próbę.</p>
          ) : (
            <div className="max-h-60 overflow-y-auto px-2" tabIndex={0} aria-label="Lista sesji">
              <SessionList sessions={sessions.slice(0, 50)} titles={titles} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
