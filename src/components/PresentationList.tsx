import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { History, Mic, Pencil, Plus, Presentation as PresentationIcon } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { listPresentations } from '@/store/db';
import { useSettings } from '@/store/settings';
import { formatDuration, textStats } from '@/lib/presentation';
import { formatDate, langOf, LANGUAGE_NAMES, useLang, useT } from '@/i18n';

export function PresentationList() {
  const items = useLiveQuery(() => listPresentations(), [], undefined);
  const target = useSettings((s) => s.targetArticulationRate);
  const t = useT();
  const appLang = useLang();

  return (
    <section className="space-y-5" aria-labelledby="presentations-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="presentations-heading" className="text-2xl font-semibold flex items-center gap-2"><PresentationIcon className="size-6 text-primary" aria-hidden /> {t.presentations.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t.presentations.list.intro}
          </p>
        </div>
        <Button asChild><Link to="/presentations/new"><Plus className="size-4" aria-hidden /> {t.presentations.list.newPresentation}</Link></Button>
      </div>

      {items === undefined ? null : items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.presentations.list.emptyTitle}</CardTitle>
            <CardDescription>{t.presentations.list.emptyDescription}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((p) => {
            const lang = langOf(p);
            const st = textStats(p.text, target, lang);
            return (
              <li key={p.id} className="min-w-0">
                <div className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4">
                  <Link to={`/presentations/${p.id}/rehearse`} className="font-medium hover:text-primary truncate" lang={lang}>{p.title}</Link>
                  <p className="text-sm text-muted-foreground line-clamp-2 wrap-anywhere" lang={lang}>{p.text}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <abbr
                      className="rounded border px-1.5 py-0.5 font-medium leading-none no-underline"
                      title={t.presentations.list.languageLabel(LANGUAGE_NAMES[lang])}
                    >
                      {t.common.language.short[lang]}
                    </abbr>
                    <span>{t.presentations.words(st.words)}</span>
                    <span title={t.presentations.estimateTitle}>
                      {t.presentations.estimate(formatDuration(st.estimatedSeconds))}
                    </span>
                    <span className="ml-auto">{formatDate(p.updatedAt, appLang)}</span>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button size="sm" asChild>
                      <Link to={`/presentations/${p.id}/rehearse?start=1`}><Mic className="size-4" aria-hidden /> {t.presentations.present}</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/presentations/${p.id}`} aria-label={t.presentations.list.editLabel(p.title)}><Pencil className="size-4" aria-hidden /> {t.presentations.edit}</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/presentations/${p.id}/history`} aria-label={t.presentations.list.historyLabel(p.title)}><History className="size-4" aria-hidden /> {t.presentations.history}</Link>
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
