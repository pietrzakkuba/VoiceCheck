import { normalizeText } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';
import type { Lang } from '@/i18n/lang';

export const MAX_PRESENTATION_CHARS = 20000;
export const MAX_TITLE_CHARS = 120;

// Target pace excludes pauses; reserve 30% of total reading time for them.
const READING_SPEECH_FRACTION = 0.7;

export interface TextStats {
  words: number;
  syllables: number;
  /** Reading time at the middle of the target articulation rate, including estimated pauses. */
  estimatedSeconds: number;
}

export function textStats(text: string, target: [number, number], lang: Lang = 'pl'): TextStats {
  const words = normalizeText(text, lang).map((t) => t.word);
  const syllables = countTextSyllables(words, lang);
  const articulationRate = (target[0] + target[1]) / 2;
  const estimatedSeconds = Math.round(syllables / (articulationRate * READING_SPEECH_FRACTION));
  return { words: words.length, syllables, estimatedSeconds };
}

/** "m:ss" for durations, e.g. 95 → "1:35". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
