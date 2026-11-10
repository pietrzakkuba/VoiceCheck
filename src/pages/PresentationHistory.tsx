import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, History, Loader2, Mic } from 'lucide-react';
import { SessionList } from '@/components/SessionList';
import { DeleteSessionsButton } from '@/components/DeleteSessionsButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/primitives';
import { getPresentation, listSessions } from '@/store/db';

export default function PresentationHistory() {
  const { id } = useParams();
  const data = useLiveQuery(async () => {
    if (!id) return null;
    const [presentation, sessions] = await Promise.all([getPresentation(id), listSessions(id)]);
    return presentation ? { presentation, sessions } : null;
  }, [id]);

  if (data === undefined) {
    return (
      <div className="flex justify-center py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-label="Ładowanie" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="space-y-4">
        <Alert variant="warn">Nie znaleziono tej prezentacji – mogła zostać usunięta.</Alert>
        <Button variant="outline" asChild><Link to="/presentations"><ArrowLeft className="size-4" aria-hidden /> Wróć do listy</Link></Button>
      </div>
    );
  }

  const { presentation, sessions } = data;
  return (
    <div className="space-y-5">
      <Link to="/presentations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-4" aria-hidden /> Prezentacje
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold flex items-center gap-2"><History className="size-6 shrink-0 text-primary" aria-hidden /> Historia prezentacji</h1>
          <p className="text-muted-foreground mt-1 break-words">{presentation.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DeleteSessionsButton scope={{ presentationId: presentation.id }} disabled={sessions.length === 0} />
          <Button asChild><Link to={`/presentations/${presentation.id}/rehearse?start=1`}><Mic className="size-4" aria-hidden /> Prezentuj</Link></Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Historia sesji</CardTitle>
          <CardDescription>{sessions.length} sesji · od najnowszej</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak sesji tej prezentacji. Kliknij „Prezentuj”, aby nagrać pierwszą sesję.</p>
          ) : (
            <SessionList key={presentation.id} sessions={sessions} titles={new Map([[presentation.id, presentation.title]])} variant="rehearsals" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
