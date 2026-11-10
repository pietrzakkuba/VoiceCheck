import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, History, Loader2, Mic } from 'lucide-react';
import { SessionList } from '@/components/SessionList';
import { DeleteSessionsButton } from '@/components/DeleteSessionsButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/primitives';
import { getPresentation, listSessions } from '@/store/db';
import { langOf, useT } from '@/i18n';

export default function PresentationHistory() {
  const { id } = useParams();
  const t = useT();
  const data = useLiveQuery(async () => {
    if (!id) return null;
    const [presentation, sessions] = await Promise.all([getPresentation(id), listSessions(id)]);
    return presentation ? { presentation, sessions } : null;
  }, [id]);

  if (data === undefined) {
    return (
      <div className="flex justify-center py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-label={t.common.loading} />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="space-y-4">
        <Alert variant="warn">{t.presentations.notFound}</Alert>
        <Button variant="outline" asChild><Link to="/presentations"><ArrowLeft className="size-4" aria-hidden /> {t.presentations.backToList}</Link></Button>
      </div>
    );
  }

  const { presentation, sessions } = data;
  return (
    <div className="space-y-5">
      <Link to="/presentations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-4" aria-hidden /> {t.presentations.title}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold flex items-center gap-2"><History className="size-6 shrink-0 text-primary" aria-hidden /> {t.presentations.historyPage.title}</h1>
          <p className="text-muted-foreground mt-1 break-words" lang={langOf(presentation)}>{presentation.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DeleteSessionsButton scope={{ presentationId: presentation.id }} disabled={sessions.length === 0} />
          <Button asChild><Link to={`/presentations/${presentation.id}/rehearse?start=1`}><Mic className="size-4" aria-hidden /> {t.presentations.present}</Link></Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t.presentations.historyPage.sessionsTitle}</CardTitle>
          <CardDescription>{t.presentations.historyPage.count(sessions.length)}</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.presentations.historyPage.empty}</p>
          ) : (
            <SessionList key={presentation.id} sessions={sessions} titles={new Map([[presentation.id, presentation.title]])} variant="rehearsals" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
