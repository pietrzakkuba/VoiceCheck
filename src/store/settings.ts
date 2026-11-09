import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings } from '@/types';
import { DEFAULT_SCORE_WEIGHTS } from '@/engine/thresholds';

export interface SettingsState extends AppSettings {
  /** User agreed to download the selected model tier. */
  modelConsent: boolean;
  onboardingDismissed: boolean;
  /** Ratio aligned syllables / live nuclei, updated after each session (4.3). */
  liveSyllableCorrection: number;
  /** User's mean syllables per word (4.3 WPM conversion). */
  syllablesPerWord: number;
  micDeviceId: string | null;
  set: (patch: Partial<SettingsState>) => void;
  reset: () => void;
}

export const DEFAULT_SETTINGS: AppSettings & {
  modelConsent: boolean;
  onboardingDismissed: boolean;
  liveSyllableCorrection: number;
  syllablesPerWord: number;
  micDeviceId: string | null;
} = {
  theme: 'system',
  targetArticulationRate: [4.5, 5.5],
  maxContinuousSpeechSeconds: 8,
  modelTier: 'auto',
  liveCaptions: false,
  selectedVoiceURI: null,
  scoreWeights: { ...DEFAULT_SCORE_WEIGHTS },
  modelConsent: false,
  onboardingDismissed: false,
  liveSyllableCorrection: 1,
  syllablesPerWord: 2.3,
  micDeviceId: null,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      reset: () => set({ ...DEFAULT_SETTINGS, modelConsent: false }),
    }),
    { name: 'clearvoice_settings_v2', version: 2 },
  ),
);

export function getSettings(): SettingsState {
  return useSettings.getState();
}
