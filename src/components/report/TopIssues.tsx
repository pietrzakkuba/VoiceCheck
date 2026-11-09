import { Link } from 'react-router';
import { ArrowRight, Lightbulb } from 'lucide-react';
import type { TrainingSession } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Three issues that cost the most points, with examples and a recommended exercise (7.3). */
export function TopIssues({ session, onSelectWord }: { session: TrainingSession; onSelectWord: (i: number) => void }) {
  const issues = session.topIssues.slice(0, 3);
  if (!issues.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lightbulb className="size-5 text-ok" aria-hidden /> Bez istotnych problemów</CardTitle>
          <CardDescription>Nie wykryliśmy problemów, które obniżałyby wynik. Spróbuj trudniejszego tekstu lub szybszego tempa.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {issues.map((iss, n) => {
        const examples = Array.from(new Set(iss.flagIndices.map((fi) => session.flags[fi]?.wordIndex).filter((x): x is number => x !== undefined))).slice(0, 4);
        return (
          <Card key={iss.key}>
            <CardHeader>
              <CardDescription>#{n + 1} · −{iss.pointsLost.toFixed(1)} pkt</CardDescription>
              <CardTitle className="text-base">{iss.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {iss.why && <p className="text-muted-foreground">{iss.why}</p>}
              {examples.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-muted-foreground">Przykłady:</span>
                  {examples.map((wi) => {
                    const w = session.words[wi];
                    return w ? (
                      <button key={wi} type="button" className="underline underline-offset-2 hover:text-primary" onClick={() => onSelectWord(wi)}>
                        {w.status === 'skipped' ? w.targetText ?? w.text : w.text}
                      </button>
                    ) : null;
                  })}
                </div>
              )}
              {iss.exercise && <p><strong>Ćwiczenie:</strong> {iss.exercise}</p>}
              {iss.exerciseLink && (
                <Button asChild size="sm" variant="outline">
                  <Link to={iss.exerciseLink}>Przejdź do ćwiczenia <ArrowRight className="size-4" aria-hidden /></Link>
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
