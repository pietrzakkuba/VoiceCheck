import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings } from '@/types';

export interface SettingsState extends AppSettings {
  onboardingDismissed: boolean;
  /** Multiplier for raw acoustic syllable counts, set by calibration. */
  liveSyllableCorrection: number;
  /** User's mean syllables per word (WPM conversion), set by calibration. */
  syllablesPerWord: number;
  micDeviceId: string | null;
  set: (patch: Partial<SettingsState>) => void;
  reset: () => void;
}

type PersistedSettings = Omit<SettingsState, 'set' | 'reset'>;

export const DEFAULT_SETTINGS: PersistedSettings = {
  theme: 'system',
  targetArticulationRate: [4.5, 5.5],
  maxContinuousSpeechSeconds: 8,
  breathAlert: true,
  onboardingDismissed: false,
  liveSyllableCorrection: 1,
  syllablesPerWord: 2.3,
  micDeviceId: null,
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof PersistedSettings)[];

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      // Calibration results and the chosen microphone survive "restore defaults".
      reset: () =>
        set((s) => ({
          ...DEFAULT_SETTINGS,
          liveSyllableCorrection: s.liveSyllableCorrection,
          syllablesPerWord: s.syllablesPerWord,
          micDeviceId: s.micDeviceId,
          onboardingDismissed: s.onboardingDismissed,
        })),
    }),
    {
      name: 'clearvoice_settings_v2',
      version: 3,
      partialize: (s) => Object.fromEntries(KEYS.map((k) => [k, s[k]])) as PersistedSettings,
      // v2 → v3: drop AI/model settings, keep everything still relevant.
      migrate: (persisted) => {
        const old = (persisted ?? {}) as Record<string, unknown>;
        const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
        for (const k of KEYS) if (old[k] !== undefined) out[k] = old[k];
        return out as unknown as SettingsState;
      },
    },
  ),
);

export function getSettings(): SettingsState {
  return useSettings.getState();
}
