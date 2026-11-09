import { useMemo } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpenText, Crosshair, History, Loader2, Mic, X } from 'lucide-react';
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

      <h1 className="sr-only">VoiceCheck</h1>

      <section className="rounded-xl border bg-card p-4 flex flex-wrap items-center justify-between gap-3" aria-labelledby="free-speech-heading">
        <div>
          <h2 id="free-speech-heading" className="text-xl font-semibold flex items-center gap-2"><BookOpenText className="size-6 text-primary" aria-hidden /> Swobodne mówienie</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Czytasz tekst spoza aplikacji (kartka, inny ekran) lub mówisz z pamięci? Mierzę tylko tempo i oddech.
          </p>
        </div>
        <Button asChild><Link to="/speaking"><Mic className="size-4" aria-hidden /> Rozpocznij</Link></Button>
      </section>

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
            <p className="p-2 text-sm text-muted-foreground">Brak sesji. Dodaj prezentację lub rozpocznij swobodne mówienie, aby nagrać pierwszą próbę.</p>
          ) : (
            <div className="px-2">
              <SessionList sessions={sessions} titles={titles} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
