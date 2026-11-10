import { useMemo } from 'react';
import type { NormToken } from '@/engine/normalize';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

export interface DisplayGroup {
  raw: string;
  tokenIdx: number[];
}

/** Groups normalized tokens back into surface words (numbers/abbreviations expand into several tokens). */
export function displayGroups(tokens: NormToken[]): DisplayGroup[] {
  const out: DisplayGroup[] = [];
  tokens.forEach((t, i) => {
    const prev = out[out.length - 1];
    const plain = t.raw.toLowerCase().replace(/[^\p{L}]/gu, '');
    if (prev && i > 0 && tokens[i - 1].raw === t.raw && (t.fromNumber || plain !== t.word)) prev.tokenIdx.push(i);
    else out.push({ raw: t.raw, tokenIdx: [i] });
  });
  return out;
}

/** Large reading text with optional karaoke highlight. */
export function TargetText({ tokens, activeToken = -1, doneUntil = -1, className, breathe }: {
  tokens: NormToken[];
  activeToken?: number;
  doneUntil?: number;
  className?: string;
  breathe?: boolean;
}) {
  const t = useT();
  const groups = useMemo(() => displayGroups(tokens), [tokens]);
  return (
    <p className={cn('text-xl md:text-2xl leading-relaxed md:leading-relaxed', className)}>
      {groups.map((g, i) => {
        const active = g.tokenIdx.includes(activeToken);
        const done = g.tokenIdx[g.tokenIdx.length - 1] <= doneUntil && !active;
        return (
          <span key={i}>
            <span
              className={cn(
                'rounded px-0.5 transition-colors duration-100',
                active && 'bg-primary text-primary-foreground',
                done && 'text-muted-foreground',
              )}
            >
              {g.raw}
            </span>{' '}
          </span>
        );
      })}
      {breathe && <span className="ml-2 inline-block rounded-md bg-info/15 px-2 py-0.5 text-base text-info align-middle">{t.audio.breath.takeBreath}</span>}
    </p>
  );
}
