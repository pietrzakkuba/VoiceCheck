import { describe, expect, it } from 'vitest';
import { formatDuration, textStats } from './presentation';

describe('presentation helpers', () => {
  it('counts words and syllables and includes pauses in reading time', () => {
    const s = textStats('Dzień dobry państwu', [4, 6]);
    expect(s.words).toBe(3);
    expect(s.syllables).toBe(5);
    expect(s.estimatedSeconds).toBe(1);
    expect(textStats('   ', [4, 6])).toEqual({ words: 0, syllables: 0, estimatedSeconds: 0 });
    expect(textStats('... !', [4, 6])).toEqual({ words: 0, syllables: 0, estimatedSeconds: 0 });
  });

  it('formats durations as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(95)).toBe('1:35');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('updates the estimate with the text length and target pace', () => {
    const text = 'Dzień dobry państwu. '.repeat(20);
    const stats = textStats(text, [4, 6]);
    expect(textStats(text.repeat(2), [4, 6]).estimatedSeconds).toBe(Math.round(stats.syllables * 2 / (5 * 0.7)));
    expect(textStats(text, [2, 3]).estimatedSeconds).toBe(Math.round(stats.syllables / (2.5 * 0.7)));
  });

  it('reserves 30% of total time for pauses without changing the syllable count', () => {
    const stats = textStats('ma '.repeat(350), [4, 6]);
    expect(stats).toEqual({ words: 350, syllables: 350, estimatedSeconds: 100 });
  });

  it.each([
    { previous: 210, actual: 313, expected: 300 },
    { previous: 237, actual: 336, expected: 339 },
    { previous: 223, actual: 290, expected: 319 },
  ])('reduces underestimation for $previous s predicted vs $actual s actual', ({ previous, actual, expected }) => {
    const stats = textStats('ma '.repeat(previous * 5), [4, 6]);
    expect(stats.estimatedSeconds).toBe(expected);
    expect(Math.abs(stats.estimatedSeconds - actual)).toBeLessThan(Math.abs(previous - actual));
    expect(Math.abs(stats.estimatedSeconds - actual)).toBeLessThanOrEqual(30);
  });
});
