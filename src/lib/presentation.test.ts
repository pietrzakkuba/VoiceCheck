import { describe, expect, it } from 'vitest';
import { formatDuration, textStats } from './presentation';

describe('presentation helpers', () => {
  it('counts words and estimates speaking time at the target rate', () => {
    const s = textStats('Dzień dobry państwu', [4, 6]);
    expect(s.words).toBe(3);
    expect(s.syllables).toBeGreaterThan(0);
    expect(s.estimatedSeconds).toBe(Math.round(s.syllables / 5));
    expect(textStats('   ', [4, 6])).toEqual({ words: 0, syllables: 0, estimatedSeconds: 0 });
  });

  it('formats durations as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(95)).toBe('1:35');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('updates the estimate with the text length and target pace', () => {
    const text = 'Dzień dobry państwu. '.repeat(20);
    const stats = textStats(text, [4, 6]);
    expect(textStats(text.repeat(2), [4, 6]).estimatedSeconds).toBe(Math.round(stats.syllables * 2 / 5));
    expect(textStats(text, [2, 3]).estimatedSeconds).toBe(Math.round(stats.syllables / 2.5));
  });
});
