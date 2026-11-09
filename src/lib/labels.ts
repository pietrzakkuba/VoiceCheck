import type { TrainingMode } from '@/types';

export const MODE_LABELS: Record<TrainingMode, string> = {
  calibration: 'Kalibracja',
  bot_conversation: 'Rozmowa z botem',
  pacer_karaoke: 'Pacer Karaoke',
  free_reading: 'Czytanie tekstu',
  tongue_twisters: 'Laboratorium dykcji',
};

export const SCORE_LABELS = {
  tempo: 'Tempo',
  articulation: 'Artykulacja',
  fluency: 'Płynność',
  prosody: 'Intonacja',
} as const;

export function scoreColor(v: number) {
  return v >= 75 ? 'ok' : v >= 55 ? 'warn' : 'bad';
}
