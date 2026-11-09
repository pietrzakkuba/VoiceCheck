import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight } from 'lucide-react';
import type { TrainingSession, WordAnalysis } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/store/db';
import { normalizeWords } from '@/engine/normalize';
import { cn } from '@/lib/utils';

interface Stats { rate: number | null; clarity: number | null; problems: number; n: number }

export function wordsStats(words: WordAnalysis[]): Stats {
  const spoken = words.filter((w) => w.status !== 'skipped' && w.status !== 'filler' && w.status !== 'inserted');
  const clar = spoken.map((w) => w.clarity).filter((c): c is number => c !== null);
  const dur = spoken.reduce((s, w) => s + (w.endMs - w.startMs), 0) / 1000;
  const syl = spoken.reduce((s, w) => s + w.syllables, 0);
  return {
    rate: dur > 0.3 ? syl / dur : null,
    clarity: clar.length ? clar.reduce((a, b) => a + b, 0) / clar.length : null,
    problems: words.filter((w) => w.status === 'skipped' || w.status === 'mumbled' || w.status === 'rushed').length,
    n: words.length,
  };
}

/** Finds the words of `sentence` inside an earlier session (best-matching window over reference words). */
export function findSentenceWords(words: WordAnalysis[], sentence: string): WordAnalysis[] {
  const target = normalizeWords(sentence);
  if (!target.length) return [];
  const ref = words.filter((w) => w.status !== 'inserted' && w.status !== 'filler');
  const keys = ref.map((w) => w.targetText ?? w.text);
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i + target.length <= keys.length; i++) {
    let s = 0;
    for (let k = 0; k < target.length; k++) if (keys[i + k] === target[k]) s++;
    if (s > bestScore) { bestScore = s; best = i; }
  }
  if (best < 0 || bestScore < target.length * 0.6) return [];
  return ref.slice(best, best + target.length);
}

function Row({ label, before, after, fmt, higherBetter }: { label: string; before: number | null; after: number | null; fmt: (v: number) => string; higherBetter: boolean | null }) {
  const better = before !== null && after !== null && higherBetter !== null ? (higherBetter ? after > before : after < before) : null;
  return (
    <tr>
      <td className="py-1 text-muted-foreground">{label}</td>
      <td className="py-1 tabular-nums text-right">{before === null ? '–' : fmt(before)}</td>
      <td className="px-2 text-muted-foreground"><ArrowRight className="size-3.5" aria-label="po" /></td>
      <td className={cn('py-1 tabular-nums font-medium', better === true && 'text-ok', better === false && 'text-bad')}>{after === null ? '–' : fmt(after)}</td>
    </tr>
  );
}

/** "Before / after" comparison for a repeated sentence (7.3). */
export function RepeatComparison({ session }: { session: TrainingSession }) {
  const orig = useLiveQuery(() => db.sessions.get(session.repeatOf!.sessionId), [session.repeatOf?.sessionId]);
  if (!session.repeatOf) return null;
  const beforeWords = orig ? findSentenceWords(orig.words, session.repeatOf.sentence) : [];
  const before = beforeWords.length ? wordsStats(beforeWords) : null;
  const after = wordsStats(session.words);
  const ideal = (r: number | null) => (r === null ? null : Math.abs(r - 5));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Przed i po</CardTitle>
        <CardDescription>
          „{session.repeatOf.sentence}” – porównanie z <Link className="underline" to={`/session/${session.repeatOf.sessionId}`}>poprzednią sesją</Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!orig || !before ? (
          <p className="text-sm text-muted-foreground">Nie udało się odnaleźć tego zdania w oryginalnej sesji.</p>
        ) : (
          <table className="text-sm">
            <tbody>
              <Row label="Tempo artykulacji (syl/s)" before={before.rate} after={after.rate} fmt={(v) => v.toFixed(1)} higherBetter={null} />
              <Row label="Odległość od 5 syl/s" before={ideal(before.rate)} after={ideal(after.rate)} fmt={(v) => v.toFixed(1)} higherBetter={false} />
              <Row label="Wyrazistość" before={before.clarity} after={after.clarity} fmt={(v) => `${Math.round(v * 100)}%`} higherBetter />
              <Row label="Słowa z problemami" before={before.problems} after={after.problems} fmt={(v) => String(v)} higherBetter={false} />
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
