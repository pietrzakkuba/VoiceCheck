import type { TrainingMode } from '@/types';

export const MODE_LABELS: Record<TrainingMode, string> = {
  calibration: 'Kalibracja',
  presentation: 'Próba prezentacji',
  reading: 'Czytanie tekstu',
  free_speech: 'Swobodne mówienie',
};
