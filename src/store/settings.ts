import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings } from '@/types';
import { detectLanguage, isLang, LANGS, type Lang } from '@/i18n/lang';

/** Per-language calibration results. */
export interface LanguageCalibration {
  /** Multiplier for raw acoustic syllable counts. */
  liveSyllableCorrection: number;
  /** Mean syllables per word (WPM conversion). */
  syllablesPerWord: number;
}

export const DEFAULT_CALIBRATION: Record<Lang, LanguageCalibration> = {
  pl: { liveSyllableCorrection: 1, syllablesPerWord: 2.3 },
  en: { liveSyllableCorrection: 1, syllablesPerWord: 1.4 },
};

export interface SettingsState extends AppSettings {
  /** Interface language; also the default language of new presentations and free speaking. */
  appLanguage: Lang;
  onboardingDismissed: boolean;
  /** Calibration results, set separately for each speech language. */
  calibration: Record<Lang, LanguageCalibration>;
  micDeviceId: string | null;
  readingAutoScroll: boolean;
  /** Keep the screen on (Screen Wake Lock) while presenting. */
  keepScreenAwake: boolean;
  set: (patch: Partial<SettingsState>) => void;
  reset: () => void;
}

type PersistedSettings = Omit<SettingsState, 'set' | 'reset'>;

export const DEFAULT_SETTINGS: PersistedSettings = {
  appLanguage: detectLanguage(),
  theme: 'system',
  targetArticulationRate: [4.5, 5.5],
  maxContinuousSpeechSeconds: 8,
  breathAlert: true,
  onboardingDismissed: false,
  calibration: DEFAULT_CALIBRATION,
  micDeviceId: null,
  readingAutoScroll: true,
  keepScreenAwake: true,
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof PersistedSettings)[];

function migrateCalibration(old: Record<string, unknown>): Record<Lang, LanguageCalibration> {
  const stored = (old.calibration ?? {}) as Partial<Record<Lang, Partial<LanguageCalibration>>>;
  const out = {} as Record<Lang, LanguageCalibration>;
  for (const lang of LANGS) out[lang] = { ...DEFAULT_CALIBRATION[lang], ...stored[lang] };
  // ≤ v3 stored a single (Polish) calibration at the top level.
  if (typeof old.liveSyllableCorrection === 'number') out.pl.liveSyllableCorrection = old.liveSyllableCorrection;
  if (typeof old.syllablesPerWord === 'number') out.pl.syllablesPerWord = old.syllablesPerWord;
  return out;
}

/** Upgrades settings persisted by an older version (exported for tests). */
export function migrateSettings(persisted: unknown): PersistedSettings {
  const old = (persisted ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const k of KEYS) if (old[k] !== undefined) out[k] = old[k];
  // Settings saved before languages existed belong to Polish users.
  out.appLanguage = isLang(old.appLanguage) ? old.appLanguage : 'pl';
  out.calibration = migrateCalibration(old);
  return out as unknown as PersistedSettings;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      // Language, calibration results and the chosen microphone survive "restore defaults".
      reset: () =>
        set((s) => ({
          ...DEFAULT_SETTINGS,
          appLanguage: s.appLanguage,
          calibration: s.calibration,
          micDeviceId: s.micDeviceId,
          onboardingDismissed: s.onboardingDismissed,
        })),
    }),
    {
      name: 'clearvoice_settings_v2',
      // v3: AI/model settings dropped. v4: app language and per-language calibration.
      version: 4,
      partialize: (s) => Object.fromEntries(KEYS.map((k) => [k, s[k]])) as PersistedSettings,
      migrate: (persisted) => migrateSettings(persisted) as SettingsState,
    },
  ),
);

export function getSettings(): SettingsState {
  return useSettings.getState();
}

export function calibrationFor(lang: Lang, s: Pick<SettingsState, 'calibration'> = getSettings()): LanguageCalibration {
  return s.calibration?.[lang] ?? DEFAULT_CALIBRATION[lang];
}
