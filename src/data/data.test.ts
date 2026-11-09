import { describe, expect, it } from 'vitest';
import { READING_TEXTS } from './readingTexts';
import { CALIBRATION_TEXT } from './calibrationText';
import { normalizeText, normalizeWords } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';

describe('content', () => {
  it('calibration text is ~60 s at 4.5 syl/s', () => {
    const syl = countTextSyllables(normalizeWords(CALIBRATION_TEXT));
    expect(syl).toBeGreaterThan(200);
    expect(syl).toBeLessThan(330);
  });

  it('has 15 unique reading texts that normalize cleanly', () => {
    expect(READING_TEXTS).toHaveLength(15);
    expect(new Set(READING_TEXTS.map((t) => t.id)).size).toBe(READING_TEXTS.length);
    expect(new Set(READING_TEXTS.map((t) => t.title)).size).toBe(READING_TEXTS.length);
    expect(new Set(READING_TEXTS.map((t) => t.text)).size).toBe(READING_TEXTS.length);
    for (const t of READING_TEXTS) {
      expect(t.id.trim().length).toBeGreaterThan(0);
      expect(t.title.trim().length).toBeGreaterThan(0);
      expect(t.text.length).toBeLessThanOrEqual(3000);
      const tokens = normalizeText(t.text);
      expect(tokens.length).toBeGreaterThan(40);
      expect(tokens.every((token) => !token.unscorable)).toBe(true);
    }
  });
});
