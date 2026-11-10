import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectLanguage, enPlural, langOf, plPlural } from './lang';
import { messages } from './index';
import { migrateSettings, DEFAULT_CALIBRATION, calibrationFor } from '@/store/settings';
import { localizeTip, localizeWarning } from '@/lib/tips';
import type { Tip } from '@/types';
import { CALIBRATION_TEXTS } from '@/data/calibrationText';
import { normalizeWords } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';

afterEach(() => vi.unstubAllGlobals());

describe('language detection', () => {
  it.each([
    [['pl-PL', 'en-US'], 'pl'],
    [['PL'], 'pl'],
    [['en-US', 'pl-PL'], 'en'],
    [['de-DE'], 'en'],
  ] as const)('maps %j to %s', (languages, expected) => {
    vi.stubGlobal('navigator', { languages, language: languages[0] });
    expect(detectLanguage()).toBe(expected);
  });

  it('treats content without a language as Polish', () => {
    expect(langOf({})).toBe('pl');
    expect(langOf(undefined)).toBe('pl');
    expect(langOf({ language: 'en' })).toBe('en');
  });
});

describe('plural helpers', () => {
  it('picks Polish forms', () => {
    const f = (n: number) => plPlural(n, 'sesja', 'sesje', 'sesji');
    expect([1, 2, 4, 5, 12, 14, 22, 25, 0].map(f)).toEqual(
      ['sesja', 'sesje', 'sesje', 'sesji', 'sesji', 'sesji', 'sesje', 'sesji', 'sesji'],
    );
  });

  it('picks English forms', () => {
    expect(enPlural(1, 'session', 'sessions')).toBe('session');
    expect(enPlural(0, 'session', 'sessions')).toBe('sessions');
  });
});

describe('settings migration', () => {
  it('moves the old single calibration to Polish and keeps the app in Polish', () => {
    const out = migrateSettings({ liveSyllableCorrection: 1.3, syllablesPerWord: 2.6, maxContinuousSpeechSeconds: 9 });
    expect(out.appLanguage).toBe('pl');
    expect(out.maxContinuousSpeechSeconds).toBe(9);
    expect(out.calibration.pl).toEqual({ liveSyllableCorrection: 1.3, syllablesPerWord: 2.6 });
    expect(out.calibration.en).toEqual(DEFAULT_CALIBRATION.en);
    expect(out).not.toHaveProperty('liveSyllableCorrection');
  });

  it('keeps a stored language and per-language calibration', () => {
    const out = migrateSettings({
      appLanguage: 'en',
      calibration: { en: { liveSyllableCorrection: 0.9, syllablesPerWord: 1.5 } },
    });
    expect(out.appLanguage).toBe('en');
    expect(calibrationFor('en', out)).toEqual({ liveSyllableCorrection: 0.9, syllablesPerWord: 1.5 });
    expect(calibrationFor('pl', out)).toEqual(DEFAULT_CALIBRATION.pl);
  });
});

describe('dictionaries', () => {
  function shape(value: unknown): unknown {
    if (typeof value === 'function') return 'fn';
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]).sort(([a], [b]) => String(a).localeCompare(String(b))));
    }
    return typeof value;
  }

  it('have the same keys in every language', () => {
    expect(shape(messages('en'))).toEqual(shape(messages('pl')));
  });

  it('localize tips and warnings in both languages', () => {
    const tip: Tip = { key: 'breath_limit', severity: 'warn', params: { count: 2, longestMs: 12000, limitS: 8 } };
    const pl = localizeTip(tip, messages('pl'));
    const en = localizeTip(tip, messages('en'));
    expect(pl.title).not.toBe(en.title);
    expect(pl.detail).toMatch(/\d/);
    expect(en.detail).toMatch(/\d/);
    expect(localizeWarning('clipping', messages('en'))).not.toBe(localizeWarning('clipping', messages('pl')));
    expect(localizeWarning('Custom legacy text', messages('en'))).toBe('Custom legacy text');
  });
});

describe('calibration texts', () => {
  it.each(['pl', 'en'] as const)('%s text has a usable number of syllables', (lang) => {
    const syllables = countTextSyllables(normalizeWords(CALIBRATION_TEXTS[lang], lang), lang);
    expect(syllables).toBeGreaterThanOrEqual(200);
    expect(syllables).toBeLessThanOrEqual(330);
  });
});
