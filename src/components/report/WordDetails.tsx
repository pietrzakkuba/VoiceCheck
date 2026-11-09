import { Link } from 'react-router';
import { Play, Repeat, X } from 'lucide-react';
import type { TrainingSession, WordAnalysis } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CATEGORY_LABELS } from '@/engine/units';
import { describeUnit } from '@/engine/gop';
import { STATUS_LABEL } from './AnnotatedTranscript';
import { formatMs } from '@/lib/utils';

/** Indices of words forming the sentence that contains word i (sentence = up to a 'sentence' boundary). */
export function sentenceRange(words: WordAnalysis[], i: number): [number, number] {
  let a = i;
  while (a > 0 && words[a - 1].boundary !== 'sentence') a--;
  let b = i;
  while (b < words.length - 1 && words[b].boundary !== 'sentence') b++;
  return [a, b];
}

export function sentenceText(words: WordAnalysis[], [a, b]: [number, number]) {
  return words
    .slice(a, b + 1)
    .filter((w) => w.status !== 'filler' && w.status !== 'inserted')
    .map((w, k, arr) => (w.targetText ?? w.text) + (w.boundary === 'comma' && k < arr.length - 1 ? ',' : ''))
    .join(' ') + '.';
}

const unitVariant = (s: string) => (s === 'ok' ? 'ok' : s === 'weak' ? 'warn' : s === 'unscorable' ? 'secondary' : 'bad') as 'ok' | 'warn' | 'bad' | 'secondary';

export function WordDetails({ session, index, onPlay, onClose, canPlay }: {
  session: TrainingSession;
  index: number;
  onPlay: (startMs: number, endMs: number) => void;
  onClose: () => void;
  canPlay: boolean;
}) {
  const w = session.words[index];
  if (!w) return null;
  const range = sentenceRange(session.words, index);
  const sentence = sentenceText(session.words, range);
  const sw = session.words.slice(range[0], range[1] + 1).filter((x) => x.status !== 'skipped');
  const flags = w.flagIndices.map((i) => session.flags[i]).filter(Boolean);
  const durMs = w.endMs - w.startMs;
  const localRate = w.status !== 'skipped' && durMs > 0 ? w.syllables / (durMs / 1000) : null;
  const isReadingMode = session.mode !== 'bot_conversation';

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-xl">{w.status === 'skipped' ? w.targetText ?? w.text : w.text}</CardTitle>
          <div className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant={w.status === 'ok' ? 'ok' : w.status === 'rushed' ? 'warn' : w.status === 'mumbled' ? 'bad' : 'secondary'}>{STATUS_LABEL[w.status]}</Badge>
            {w.targetText && w.targetText !== w.text && w.status !== 'skipped' && <span>w tekście: „{w.targetText}”</span>}
            {w.status !== 'skipped' && <span>{formatMs(w.startMs)}</span>}
            <span>{w.syllables} syl.</span>
            {localRate !== null && <span>{localRate.toFixed(1)} syl/s</span>}
            {w.clarity !== null && <span>wyrazistość {Math.round(w.clarity * 100)}%</span>}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Zamknij szczegóły"><X className="size-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {w.units.length > 0 && (
          <div>
            <div className="text-sm font-medium mb-1">Głoski</div>
            <div className="flex flex-wrap gap-1.5">
              {w.units.map((u, k) => (
                <Badge key={k} variant={unitVariant(u.status)} title={`${describeUnit(u)} · ${CATEGORY_LABELS[u.category]} · GOP ${u.gop.toFixed(2)}`}>
                  {u.text}{u.heardAs ? ` → ${u.heardAs}` : ''}
                </Badge>
              ))}
            </div>
            <ul className="mt-2 text-sm text-muted-foreground list-disc pl-5">
              {w.units.filter((u) => u.status !== 'ok' && u.status !== 'unscorable').map((u, k) => <li key={k}>{describeUnit(u)}</li>)}
            </ul>
          </div>
        )}
        {flags.length > 0 && (
          <ul className="space-y-1 text-sm">
            {flags.map((f, k) => (
              <li key={k} className="flex gap-2">
                <Badge variant={f.severity === 'red' ? 'bad' : 'warn'}>{f.confidence === 'high' ? 'pewne' : 'możliwe'}</Badge>
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {w.status !== 'skipped' && (
            <Button size="sm" variant="outline" disabled={!canPlay} onClick={() => onPlay(Math.max(0, w.startMs - 300), w.endMs + 300)}>
              <Play className="size-4" aria-hidden /> Odsłuchaj słowo
            </Button>
          )}
          {sw.length > 0 && (
            <Button size="sm" variant="outline" disabled={!canPlay} onClick={() => onPlay(Math.max(0, sw[0].startMs - 300), sw[sw.length - 1].endMs + 300)}>
              <Play className="size-4" aria-hidden /> Odsłuchaj zdanie
            </Button>
          )}
          {isReadingMode && (
            <Button size="sm" asChild>
              <Link to={`/reading?repeat=${session.id}&text=${encodeURIComponent(sentence)}`}><Repeat className="size-4" aria-hidden /> Powtórz to zdanie</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
