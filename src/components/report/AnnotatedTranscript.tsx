import type { Flag, TrainingSession, WordAnalysis } from '@/types';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/overlay';

export const WORD_STYLE: Record<WordAnalysis['status'], string> = {
  ok: '',
  rushed: 'text-warn underline decoration-wavy decoration-warn/70 underline-offset-4',
  mumbled: 'text-bad underline decoration-dotted decoration-2 decoration-bad underline-offset-4',
  filler: 'italic text-muted-foreground bg-muted rounded',
  skipped: 'line-through text-muted-foreground/70',
  inserted: 'italic text-info',
  unscorable: 'text-muted-foreground',
};

export const STATUS_LABEL: Record<WordAnalysis['status'], string> = {
  ok: 'wyraźne',
  rushed: 'za szybko',
  mumbled: 'niewyraźne',
  filler: 'wypełniacz',
  skipped: 'pominięte',
  inserted: 'wtrącone',
  unscorable: 'nie oceniono',
};

function wordTitle(w: WordAnalysis, flags: Flag[]) {
  const msgs = w.flagIndices.map((i) => flags[i]?.message).filter(Boolean);
  return [STATUS_LABEL[w.status], ...msgs].join(' · ');
}

/** Transcript coloured by word status; pauses shown as markers between words (7.1). */
export function AnnotatedTranscript({ session, selected, onSelect, currentMs }: {
  session: TrainingSession;
  selected: number | null;
  onSelect: (i: number) => void;
  currentMs?: number;
}) {
  const { words, pauses, flags } = session;
  const pauseAfter = (w: WordAnalysis, next?: WordAnalysis) => {
    if (!next || w.status === 'skipped') return null;
    return pauses.find((p) => p.startMs >= w.endMs - 60 && p.endMs <= next.startMs + 60 && p.kind !== 'normal') ?? null;
  };
  const noBreathAt = new Set(flags.filter((f) => f.type === 'NO_BREATH' || f.type === 'MISSING_PAUSE').map((f) => f.wordIndex).filter((x): x is number => x !== undefined));

  return (
    <div>
      <p className="text-lg leading-loose" aria-label="Transkrypcja z oznaczeniami">
        {words.map((w, i) => {
          let next: WordAnalysis | undefined;
          for (let j = i + 1; j < words.length; j++) if (words[j].status !== 'skipped') { next = words[j]; break; }
          const p = pauseAfter(w, next);
          const playingNow = currentMs !== undefined && w.status !== 'skipped' && currentMs >= w.startMs && currentMs < w.endMs;
          return (
            <span key={i}>
              <Tooltip content={wordTitle(w, flags)}>
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  className={cn(
                    'px-0.5 rounded hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                    WORD_STYLE[w.status],
                    selected === i && 'ring-2 ring-primary',
                    playingNow && 'bg-primary/20',
                  )}
                  aria-label={`${w.status === 'skipped' ? w.targetText ?? w.text : w.text} – ${STATUS_LABEL[w.status]}`}
                >
                  {w.status === 'skipped' ? `[${w.targetText ?? w.text}]` : w.text}
                </button>
              </Tooltip>
              {w.boundary === 'sentence' ? '.' : w.boundary === 'comma' ? ',' : ''}
              {noBreathAt.has(i) && <span className="text-bad text-xs align-super" title="Brak pauzy / oddechu"> ⚠</span>}
              {p && (
                <span
                  className={cn('mx-1 inline-block rounded px-1 text-xs align-middle', p.kind === 'hesitation' ? 'bg-warn/15 text-warn' : p.kind === 'long' ? 'bg-bad/10 text-bad' : 'bg-info/10 text-info')}
                  title={p.kind === 'hesitation' ? 'Pauza wahania' : p.kind === 'long' ? 'Długa pauza' : 'Oddech'}
                >
                  ‖ {((p.endMs - p.startMs) / 1000).toFixed(1)} s
                </span>
              )}{' '}
            </span>
          );
        })}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda">
        <span><span className={WORD_STYLE.rushed}>słowo</span> za szybko</span>
        <span><span className={WORD_STYLE.mumbled}>słowo</span> niewyraźne</span>
        <span><span className={WORD_STYLE.skipped}>[słowo]</span> pominięte</span>
        <span><span className={WORD_STYLE.filler}>yyy</span> wypełniacz</span>
        <span><span className={WORD_STYLE.inserted}>słowo</span> wtrącone</span>
        <span>‖ pauza · ⚠ brak oddechu</span>
      </div>
    </div>
  );
}
