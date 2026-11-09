import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { History, Mic, Pencil, Plus, Presentation as PresentationIcon } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { listPresentations } from '@/store/db';
import { useSettings } from '@/store/settings';
import { formatDuration, textStats } from '@/lib/presentation';

export function PresentationList() {
  const items = useLiveQuery(() => listPresentations(), [], undefined);
  const target = useSettings((s) => s.targetArticulationRate);

  return (
    <section className="space-y-5" aria-labelledby="presentations-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="presentations-heading" className="text-xl font-semibold flex items-center gap-2"><PresentationIcon className="size-6 text-primary" aria-hidden /> Prezentacje</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Zapisz tekst, sprawdź szacowany czas czytania i prezentuj z podglądem tempa i oddechu — podczas próby lub wystąpienia.
          </p>
        </div>
        <Button asChild><Link to="/presentations/new"><Plus className="size-4" aria-hidden /> Nowa prezentacja</Link></Button>
      </div>

      {items === undefined ? null : items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Brak prezentacji</CardTitle>
            <CardDescription>Dodaj pierwszą prezentację – wklej jej tekst, a aplikacja oszacuje czas czytania.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((p) => {
            const st = textStats(p.text, target);
            return (
              <li key={p.id} className="min-w-0">
                <div className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4">
                  <Link to={`/presentations/${p.id}/rehearse`} className="font-medium hover:text-primary truncate">{p.title}</Link>
                  <p className="text-sm text-muted-foreground line-clamp-2 wrap-anywhere">{p.text}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{st.words} słów</span>
                    <span title="W Twoim tempie docelowym, bez pauz">
                      Szacowany czas czytania: ok. {formatDuration(st.estimatedSeconds)}
                    </span>
                    <span className="ml-auto">{new Date(p.updatedAt).toLocaleDateString('pl-PL')}</span>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button size="sm" asChild>
                      <Link to={`/presentations/${p.id}/rehearse`}><Mic className="size-4" aria-hidden /> Prezentuj</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/presentations/${p.id}`} aria-label={`Edytuj prezentację ${p.title}`}><Pencil className="size-4" aria-hidden /> Edytuj</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/presentations/${p.id}/history`} aria-label={`Historia prezentacji ${p.title}`}><History className="size-4" aria-hidden /> Historia</Link>
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
