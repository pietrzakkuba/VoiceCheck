import { describe, expect, it } from 'vitest';
import { CALIBRATION_TEXT } from './calibrationText';
import { normalizeWords } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';

describe('content', () => {
  it('calibration text is ~60 s at 4.5 syl/s', () => {
    const syl = countTextSyllables(normalizeWords(CALIBRATION_TEXT));
    expect(syl).toBeGreaterThan(200);
    expect(syl).toBeLessThan(330);
  });
});
