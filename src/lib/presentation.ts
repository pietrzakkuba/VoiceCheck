import { normalizeText } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';

export const MAX_PRESENTATION_CHARS = 20000;
export const MAX_TITLE_CHARS = 120;

export interface TextStats {
  words: number;
  syllables: number;
  /** Speaking time at the middle of the target articulation rate (pauses excluded). */
  estimatedSeconds: number;
}

export function textStats(text: string, target: [number, number]): TextStats {
  const words = normalizeText(text).map((t) => t.word);
  const syllables = countTextSyllables(words);
  return { words: words.length, syllables, estimatedSeconds: Math.round(syllables / ((target[0] + target[1]) / 2)) };
}

/** "m:ss" for durations, e.g. 95 → "1:35". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Parses minutes typed by the user ("5", "2,5", "2.5"); empty input = no limit. */
export function parseMinutes(input: string): number | undefined | null {
  const v = input.trim().replace(',', '.');
  if (v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 600) return null;
  return Math.round(n * 60);
}

export function minutesInput(seconds?: number): string {
  if (!seconds) return '';
  return String(+(seconds / 60).toFixed(2)).replace('.', ',');
}
